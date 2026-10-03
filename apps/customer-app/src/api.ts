import AsyncStorage from '@react-native-async-storage/async-storage';

export type TicketStatus='waiting'|'called'|'serving'|'served'|'skipped'|'cancelled'|'expired'|'pending_sync';
export type Ticket={ticketId:string;displayNumber:string;departmentName:string;currentNumber:string;peopleAhead:number;estimatedMinutes:number;status:TicketStatus;pendingSync?:boolean};
type ClaimRecord={ticketId:string;token:string;installationId:string;claimedAt:string};

const URL=process.env.EXPO_PUBLIC_SUPABASE_URL||'';
const KEY=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'';
const STORAGE='eliminacode.claims.v2';
const INSTALL='eliminacode.installation.v1';

function uuid(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)})}
async function rpc<T>(fn:string,body:any):Promise<T>{
  if(!URL||!KEY) throw new Error('Supabase non configurato');
  const r=await fetch(`${URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(await r.text());
  const txt=await r.text(); return (txt?JSON.parse(txt):null) as T;
}
function parse(u:string){
  const q=u.includes('?')?u.split('?')[1]:''; const p=new URLSearchParams(q);
  return {ticket:p.get('ticket'),token:p.get('token'),device:p.get('device')};
}
async function installationId(){
  let id=await AsyncStorage.getItem(INSTALL); if(!id){id=uuid();await AsyncStorage.setItem(INSTALL,id)} return id;
}
async function claims():Promise<ClaimRecord[]>{try{return JSON.parse(await AsyncStorage.getItem(STORAGE)||'[]')}catch{return []}}
async function saveClaims(rows:ClaimRecord[]){await AsyncStorage.setItem(STORAGE,JSON.stringify(rows))}
async function upsertClaim(rec:ClaimRecord){const all=await claims();const i=all.findIndex(x=>x.ticketId===rec.ticketId);if(i>=0)all[i]=rec;else all.unshift(rec);await saveClaims(all)}

async function refreshOne(rec:ClaimRecord):Promise<Ticket>{
  try{
    const rows:any[]=await rpc('claim_ticket_public',{p_ticket_id:rec.ticketId,p_claim_token:rec.token,p_installation_id:rec.installationId});
    const x=rows?.[0]; if(!x) throw new Error('ticket_not_found');
    return {ticketId:x.ticket_id,displayNumber:x.display_number,departmentName:x.department_name,currentNumber:x.current_number,peopleAhead:Number(x.people_ahead),estimatedMinutes:Number(x.estimated_minutes),status:x.status};
  }catch(e:any){
    const msg=String(e?.message||e);
    if(msg.includes('ticket_not_found')||msg.includes('Failed to fetch')||msg.includes('Network request failed')){
      return {ticketId:rec.ticketId,displayNumber:'IN ATTESA',departmentName:'Ticket creato offline',currentNumber:'—',peopleAhead:-1,estimatedMinutes:0,status:'pending_sync',pendingSync:true};
    }
    throw e;
  }
}

export async function claimFromUrl(url:string){
  const p=parse(url); const install=await installationId();
  if(p.device){
    const rows:any[]=await rpc('claim_tap_public',{p_device_id:p.device,p_installation_id:install});
    if(!rows?.[0]) throw new Error('Nessuna sessione NFC attiva');
    const rec={ticketId:rows[0].ticket_id,token:rows[0].claim_token,installationId:install,claimedAt:new Date().toISOString()};
    await upsertClaim(rec); return refreshOne(rec);
  }
  if(!p.ticket||!p.token) throw new Error('QR non valido');
  const rec={ticketId:p.ticket,token:p.token,installationId:install,claimedAt:new Date().toISOString()};
  await upsertClaim(rec); return refreshOne(rec);
}

export async function getActiveTickets(){
  const rows=await claims(); const out:Ticket[]=[];
  for(const r of rows){try{out.push(await refreshOne(r))}catch{}}
  return out.filter(t=>!['served','cancelled','expired'].includes(t.status));
}
export async function getAllTickets(){const rows=await claims();return Promise.all(rows.map(refreshOne))}
export async function removeTicket(ticketId:string){await saveClaims((await claims()).filter(x=>x.ticketId!==ticketId))}

async function tokenFor(ticketId:string){const rec=(await claims()).find(x=>x.ticketId===ticketId);if(!rec)throw new Error('Ticket non attivo');return rec.token}
export async function saveOrder(ticketId:string,items:string){await rpc('save_order_public',{p_ticket_id:ticketId,p_claim_token:await tokenFor(ticketId),p_notes:items});return {ok:true,items}}
export async function sendFeedback(ticketId:string,rating:'poor'|'average'|'good'){await rpc('send_feedback_public',{p_ticket_id:ticketId,p_claim_token:await tokenFor(ticketId),p_rating:rating});return {ok:true,rating}}
export async function registerPushToken(pushToken:string,platform:string){
  if(!pushToken) return false; const install=await installationId();
  await rpc('register_installation_public',{p_installation_id:install,p_push_token:pushToken,p_platform:platform}); return true;
}
export async function getInstallationId(){return installationId()}
