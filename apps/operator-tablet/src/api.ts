export type QueueItem={ticketId:string;number:string;hasOrder:boolean;order?:string;status:'WAITING'|'CALLED'|'SERVING'};
const URL=process.env.EXPO_PUBLIC_SUPABASE_URL||'';
const KEY=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'';
const DEPARTMENT=process.env.EXPO_PUBLIC_DEPARTMENT_ID||'';
const DEVICE=process.env.EXPO_PUBLIC_OPERATOR_DEVICE_ID||'';
const DEVICE_KEY=process.env.EXPO_PUBLIC_OPERATOR_DEVICE_KEY||'';

function assertConfig(){
 if(!URL||!KEY)throw new Error('Supabase non configurato');
 if(!DEPARTMENT)throw new Error('Reparto operatore non configurato');
 if(!DEVICE||!DEVICE_KEY)throw new Error('Dispositivo operatore non configurato');
}

async function rpc<T>(fn:string,body:any):Promise<T>{
 assertConfig();
 const r=await fetch(`${URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw new Error(await r.text());
 return r.json();
}

export async function queue(){
 const rows:any[]=await rpc('queue_device',{p_department_id:DEPARTMENT,p_device_id:DEVICE,p_device_key:DEVICE_KEY});
 return rows.map(x=>({ticketId:x.ticket_id,number:x.number,hasOrder:x.has_order,order:x.order_notes||undefined,status:(x.status==='called'?'CALLED':x.status==='serving'?'SERVING':'WAITING') as QueueItem['status']}));
}

export async function action(id:string,a:'call'|'serve'|'skip'|'recall'){
 await rpc('ticket_action_device',{p_ticket_id:id,p_action:a,p_device_id:DEVICE,p_device_key:DEVICE_KEY});
 return queue();
}
