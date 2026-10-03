-- Demo-only seed. Create the first authenticated user in Supabase Auth first,
-- then replace DEMO_USER_UUID before executing this file manually.

insert into public.organizations (id, name, slug)
values ('11111111-1111-1111-1111-111111111111', 'Supermercato Demo', 'supermercato-demo')
on conflict do nothing;

insert into public.locations (id, organization_id, name, address_text)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Sede Demo', 'Napoli')
on conflict do nothing;

insert into public.departments (location_id, name, code, ticket_prefix, sort_order)
values
('22222222-2222-2222-2222-222222222222', 'Salumeria', 'SAL', 'S', 10),
('22222222-2222-2222-2222-222222222222', 'Macelleria', 'MAC', 'M', 20),
('22222222-2222-2222-2222-222222222222', 'Panetteria', 'PAN', 'P', 30),
('22222222-2222-2222-2222-222222222222', 'Pescheria', 'PES', 'F', 40),
('22222222-2222-2222-2222-222222222222', 'Pasticceria', 'PAS', 'C', 50)
on conflict do nothing;
