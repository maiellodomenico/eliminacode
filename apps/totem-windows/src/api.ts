export type Department={id:string;name:string;icon:string;prefix:string};
export type Ticket={ticketId:string;displayNumber:string;departmentName:string;peopleAhead:number;estimatedMinutes:number;claimUrl:string};

const URL=import.meta.env.VITE_SUPABASE_URL||'';
const KEY=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'';
const LOCATION_ID=import.meta.env.VITE_LOCATION_ID||'';
const DEVICE_ID=import.meta.env.VITE_TOTEM_DEVICE_ID||'';
const DEVICE_KEY=import.meta.env.VITE_TOTEM_DEVICE_KEY||'';
const PUBLIC_URL=(import.meta.env.VITE_PUBLIC_CLAIM_BASE_URL||'').replace(/\/$/,'');

function iconFor(name:string){
  const n=name.toLowerCase();
  if(n.includes('maceller'))return '🥩';
  if(n.includes('salumer'))return '🧀';
  if(n.includes('panett')||n.includes('pane'))return '🥖';
  if(n.includes('pescher'))return '🐟';
  if(n.includes('pasticc'))return '🍰';
  return '🎫';
}

async function rpc<T>(fn:string,body:any):Promise<T>{
  if(!URL||!KEY) throw new Error('Supabase non configurato nel Totem');
  const r=await fetch(`${URL}/rest/v1/rpc/${fn}`,{
    method:'POST',
    headers:{apikey:KEY,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const txt=await r.text();
  if(!r.ok) throw new Error(txt||`Errore Supabase ${r.status}`);
  return (txt?JSON.parse(txt):null) as T;
}

export async function departments():Promise<Department[]>{
  if(!LOCATION_ID) throw new Error('ELIMINACODE_LOCATION_ID non configurato');
  const rows:any[]=await rpc('get_departments_public',{p_location_id:LOCATION_ID});
  return (rows||[]).map(x=>({
    id:x.id,
    name:x.name,
    icon:iconFor(x.name||''),
    prefix:x.ticket_prefix||''
  }));
}

export async function createTicket(d:Department,channel:'paper'|'qr'):Promise<Ticket>{
  if(!DEVICE_ID||!DEVICE_KEY) throw new Error('Credenziali Totem non configurate');
  if(!PUBLIC_URL) throw new Error('ELIMINACODE_PUBLIC_URL non configurata');
  const rows:any[]=await rpc('issue_ticket_device',{
    p_department_id:d.id,
    p_channel:channel,
    p_device_id:DEVICE_ID,
    p_device_key:DEVICE_KEY
  });
  const x=rows?.[0];
  if(!x?.ticket_id||!x?.claim_token) throw new Error('Risposta ticket non valida dal backend');
  const claimUrl=`${PUBLIC_URL}/claim?ticket=${encodeURIComponent(x.ticket_id)}&token=${encodeURIComponent(x.claim_token)}`;
  return {
    ticketId:x.ticket_id,
    displayNumber:x.public_number,
    departmentName:x.department_name||d.name,
    peopleAhead:Number(x.people_ahead||0),
    estimatedMinutes:Number(x.estimated_minutes||0),
    claimUrl
  };
}

export async function createTapSession(d:Department){
  if(!DEVICE_ID||!DEVICE_KEY) throw new Error('Credenziali Totem non configurate');
  const rows:any[]=await rpc('open_tap_session_device',{
    p_department_id:d.id,
    p_device_id:DEVICE_ID,
    p_device_key:DEVICE_KEY
  });
  const x=rows?.[0];
  if(!x) throw new Error('Impossibile aprire sessione NFC');
  return {
    tapSessionId:x.tap_session_id,
    expiresAt:x.expires_at,
    stationTapUrl:`${PUBLIC_URL}/tap?device=${encodeURIComponent(DEVICE_ID)}`
  };
}
