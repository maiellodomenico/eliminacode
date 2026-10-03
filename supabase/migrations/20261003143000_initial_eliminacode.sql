-- Eliminacode universal queue platform - initial schema
-- PostgreSQL / Supabase

create extension if not exists pgcrypto;

create type public.membership_role as enum ('owner','admin','manager','operator','viewer');
create type public.device_type as enum ('totem','operator_tablet','display','admin_terminal');
create type public.device_status as enum ('pending','active','disabled');
create type public.ticket_channel as enum ('paper','qr','nfc','app','web');
create type public.ticket_status as enum ('waiting','called','serving','served','skipped','cancelled','expired');
create type public.feedback_rating as enum ('poor','average','good');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address_text text,
  timezone text not null default 'Europe/Rome',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  code text not null,
  ticket_prefix text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  notify_ahead_count integer not null default 2 check (notify_ahead_count >= 0),
  feedback_delay_minutes integer not null default 60 check (feedback_delay_minutes >= 0),
  created_at timestamptz not null default now(),
  unique(location_id, code)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  type public.device_type not null,
  name text not null,
  status public.device_status not null default 'pending',
  device_key_hash text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.queue_sessions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  business_date date not null default current_date,
  next_sequence bigint not null default 1 check (next_sequence > 0),
  current_called_sequence bigint not null default 0 check (current_called_sequence >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique(department_id, business_date)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  queue_session_id uuid not null references public.queue_sessions(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  sequence_no bigint not null check (sequence_no > 0),
  public_number text not null,
  channel public.ticket_channel not null,
  status public.ticket_status not null default 'waiting',
  client_installation_id uuid,
  issued_by_device_id uuid references public.devices(id) on delete set null,
  issued_at timestamptz not null default now(),
  called_at timestamptz,
  serving_at timestamptz,
  served_at timestamptz,
  cancelled_at timestamptz,
  estimated_wait_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  unique(queue_session_id, sequence_no),
  unique(queue_session_id, public_number)
);

create table public.ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_device_id uuid references public.devices(id) on delete set null,
  event_time timestamptz not null default now(),
  event_id uuid not null default gen_random_uuid(),
  causation_event_id uuid,
  payload jsonb not null default '{}'::jsonb,
  unique(event_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  status text not null default 'submitted',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_name text not null,
  quantity numeric,
  unit text,
  notes text,
  sort_order integer not null default 0
);

create table public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  token_hash text not null unique,
  eligible_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  feedback_request_id uuid not null unique references public.feedback_requests(id) on delete cascade,
  rating public.feedback_rating not null,
  reason text,
  comment text,
  created_at timestamptz not null default now()
);

create index tickets_department_status_idx on public.tickets(department_id, status, sequence_no);
create index ticket_events_ticket_time_idx on public.ticket_events(ticket_id, event_time);
create index locations_org_idx on public.locations(organization_id);
create index departments_location_idx on public.departments(location_id);

-- Membership helper is SECURITY INVOKER by default.
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.membership_role[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.role = any(p_roles)
  );
$$;

-- Atomic ticket issuance for authenticated dashboard/testing use.
-- Device/public issuance will later be moved behind an authenticated Edge Function.
create or replace function public.issue_ticket_authenticated(
  p_department_id uuid,
  p_channel public.ticket_channel default 'app',
  p_client_installation_id uuid default null
)
returns public.tickets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.queue_sessions;
  v_department public.departments;
  v_location public.locations;
  v_ticket public.tickets;
  v_seq bigint;
begin
  select d.* into v_department from public.departments d where d.id = p_department_id and d.is_active;
  if not found then raise exception 'department_not_found'; end if;
  select l.* into v_location from public.locations l where l.id = v_department.location_id;
  if not public.is_org_member(v_location.organization_id) then raise exception 'forbidden'; end if;

  insert into public.queue_sessions(department_id, business_date)
  values (p_department_id, current_date)
  on conflict (department_id, business_date) do nothing;

  select * into v_session
  from public.queue_sessions
  where department_id = p_department_id and business_date = current_date
  for update;

  v_seq := v_session.next_sequence;
  update public.queue_sessions
  set next_sequence = next_sequence + 1
  where id = v_session.id;

  insert into public.tickets(queue_session_id, department_id, sequence_no, public_number, channel, client_installation_id)
  values (v_session.id, p_department_id, v_seq, v_department.ticket_prefix || lpad(v_seq::text, 3, '0'), p_channel, p_client_installation_id)
  returning * into v_ticket;

  insert into public.ticket_events(ticket_id, event_type, payload)
  values (v_ticket.id, 'ticket_created', jsonb_build_object('channel', p_channel));

  return v_ticket;
end;
$$;

-- Trigger: create profile record on auth user creation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Enable RLS everywhere in public schema.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.locations enable row level security;
alter table public.departments enable row level security;
alter table public.devices enable row level security;
alter table public.queue_sessions enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.feedback_requests enable row level security;
alter table public.feedback_responses enable row level security;

-- Policies: authenticated staff can read rows belonging to organizations they are members of.
create policy org_read on public.organizations for select to authenticated
using (public.is_org_member(id));

create policy profile_self on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy membership_read on public.organization_members for select to authenticated
using (user_id = (select auth.uid()));

create policy location_read on public.locations for select to authenticated
using (public.is_org_member(organization_id));

create policy department_read on public.departments for select to authenticated
using (exists (
  select 1 from public.locations l
  where l.id = location_id and public.is_org_member(l.organization_id)
));

create policy device_read on public.devices for select to authenticated
using (exists (
  select 1 from public.locations l
  where l.id = location_id and public.is_org_member(l.organization_id)
));

create policy queue_session_read on public.queue_sessions for select to authenticated
using (exists (
  select 1 from public.departments d join public.locations l on l.id = d.location_id
  where d.id = department_id and public.is_org_member(l.organization_id)
));

create policy ticket_read on public.tickets for select to authenticated
using (exists (
  select 1 from public.departments d join public.locations l on l.id = d.location_id
  where d.id = department_id and public.is_org_member(l.organization_id)
));

create policy event_read on public.ticket_events for select to authenticated
using (exists (
  select 1 from public.tickets t
  join public.departments d on d.id = t.department_id
  join public.locations l on l.id = d.location_id
  where t.id = ticket_id and public.is_org_member(l.organization_id)
));

create policy order_read on public.orders for select to authenticated
using (exists (
  select 1 from public.tickets t join public.departments d on d.id=t.department_id join public.locations l on l.id=d.location_id
  where t.id=ticket_id and public.is_org_member(l.organization_id)
));

create policy order_item_read on public.order_items for select to authenticated
using (exists (
  select 1 from public.orders o join public.tickets t on t.id=o.ticket_id join public.departments d on d.id=t.department_id join public.locations l on l.id=d.location_id
  where o.id=order_id and public.is_org_member(l.organization_id)
));

create policy feedback_request_read on public.feedback_requests for select to authenticated
using (exists (
  select 1 from public.tickets t join public.departments d on d.id=t.department_id join public.locations l on l.id=d.location_id
  where t.id=ticket_id and public.is_org_member(l.organization_id)
));

create policy feedback_response_read on public.feedback_responses for select to authenticated
using (exists (
  select 1 from public.feedback_requests fr join public.tickets t on t.id=fr.ticket_id join public.departments d on d.id=t.department_id join public.locations l on l.id=d.location_id
  where fr.id=feedback_request_id and public.is_org_member(l.organization_id)
));

-- Admin write policies for initial dashboard management.
create policy org_admin_update on public.organizations for update to authenticated
using (public.has_org_role(id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(id, array['owner','admin']::public.membership_role[]));

create policy location_admin_all on public.locations for all to authenticated
using (public.has_org_role(organization_id, array['owner','admin','manager']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','admin','manager']::public.membership_role[]));

create policy department_admin_all on public.departments for all to authenticated
using (exists (
  select 1 from public.locations l where l.id=location_id and public.has_org_role(l.organization_id, array['owner','admin','manager']::public.membership_role[])
))
with check (exists (
  select 1 from public.locations l where l.id=location_id and public.has_org_role(l.organization_id, array['owner','admin','manager']::public.membership_role[])
));

-- Operational write policies for authenticated staff.
create policy queue_session_staff_insert on public.queue_sessions for insert to authenticated
with check (exists (
  select 1 from public.departments d join public.locations l on l.id=d.location_id
  where d.id=department_id and public.has_org_role(l.organization_id, array['owner','admin','manager','operator']::public.membership_role[])
));

create policy queue_session_staff_update on public.queue_sessions for update to authenticated
using (exists (
  select 1 from public.departments d join public.locations l on l.id=d.location_id
  where d.id=department_id and public.has_org_role(l.organization_id, array['owner','admin','manager','operator']::public.membership_role[])
))
with check (exists (
  select 1 from public.departments d join public.locations l on l.id=d.location_id
  where d.id=department_id and public.has_org_role(l.organization_id, array['owner','admin','manager','operator']::public.membership_role[])
));

create policy ticket_staff_insert on public.tickets for insert to authenticated
with check (exists (
  select 1 from public.departments d join public.locations l on l.id=d.location_id
  where d.id=department_id and public.has_org_role(l.organization_id, array['owner','admin','manager','operator']::public.membership_role[])
));

create policy event_staff_insert on public.ticket_events for insert to authenticated
with check (exists (
  select 1 from public.tickets t join public.departments d on d.id=t.department_id join public.locations l on l.id=d.location_id
  where t.id=ticket_id and public.has_org_role(l.organization_id, array['owner','admin','manager','operator']::public.membership_role[])
));

-- Realtime publication for operational tables.
alter publication supabase_realtime add table public.queue_sessions;
alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.ticket_events;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.feedback_responses;
