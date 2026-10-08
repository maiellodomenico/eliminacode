const fs = require('fs');
const express=require('express');
const http=require('http');
const path=require('path');
const crypto=require('crypto');
const Database=require('better-sqlite3');
const QRCode=require('qrcode');
const {WebSocketServer}=require('ws');

const PORT=Number(process.env.ELIMINACODE_PORT||8787);
const HOST=process.env.ELIMINACODE_HOST||'0.0.0.0';
const PUBLIC_BASE=(process.env.ELIMINACODE_PUBLIC_BASE||'http://127.0.0.1:8787').replace(/\/$/,'');
const DATA_DIR =
  process.env.ELIMINACODE_DATA_DIR ||
  path.join(process.env.LOCALAPPDATA || process.cwd(), 'Eliminacode Server');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(
  path.join(DATA_DIR, 'eliminacode.sqlite')
);
db.pragma('journal_mode = WAL');

db.exec(`
create table if not exists departments(id text primary key,name text not null,prefix text not null,sort_order integer not null default 0,active integer not null default 1);
create table if not exists devices(id text primary key,type text not null,name text not null,department_id text,device_key_hash text not null,active integer not null default 1,created_at text not null);
create table if not exists counters(department_id text not null,business_date text not null,next_seq integer not null default 1,primary key(department_id,business_date));
create table if not exists tickets(id text primary key,department_id text not null,sequence_no integer not null,public_number text not null,status text not null default 'waiting',claim_token_hash text not null,digital_claimed integer not null default 0,push_token text,created_at text not null,called_at text,served_at text,skipped_at text,feedback_sent integer not null default 0);
create table if not exists events(id integer primary key autoincrement,ticket_id text not null,event_type text not null,created_at text not null,payload text);
`);

const depCount=db.prepare('select count(*) c from departments').get().c;
if(!depCount){
 const ins=db.prepare('insert into departments(id,name,prefix,sort_order) values(?,?,?,?)');
 [['salumeria','Salumeria','S',1],['macelleria','Macelleria','M',2],['panetteria','Panetteria','P',3],['pescheria','Pescheria','F',4],['pasticceria','Pasticceria','C',5]].forEach(x=>ins.run(...x));
}
function now(){return new Date().toISOString()}
function day(){return new Date().toISOString().slice(0,10)}
function sha(v){return crypto.createHash('sha256').update(String(v)).digest('hex')}
function token(){return crypto.randomBytes(24).toString('hex')}
function uuid(){return crypto.randomUUID()}
function event(ticketId,type,payload={}){db.prepare('insert into events(ticket_id,event_type,created_at,payload) values(?,?,?,?)').run(ticketId,type,now(),JSON.stringify(payload));broadcast({type,eventType:type,ticketId,payload})}
let wss;
function broadcast(obj){if(!wss)return;const s=JSON.stringify(obj);for(const c of wss.clients){if(c.readyState===1)c.send(s)}}
function validateDevice(id,key,type){const d=db.prepare('select * from devices where id=? and active=1').get(id);if(!d||d.type!==type||d.device_key_hash!==sha(key))return null;return d}
async function pushExpo(pushToken,title,body,data={}){if(!pushToken||!String(pushToken).startsWith('ExponentPushToken'))return false;try{const r=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({to:pushToken,title,body,sound:'default',data})});return r.ok}catch{return false}}

function startServer(){return new Promise(resolve=>{
 const api=express();api.use(express.json({limit:'1mb'}));api.use(express.static(path.join(__dirname,'public')));
 api.get('/api/health',(q,r)=>r.json({ok:true,mode:'local-first',time:now()}));
 api.get('/api/departments',(q,r)=>r.json(db.prepare('select id,name,prefix from departments where active=1 order by sort_order,name').all()));
 api.post('/api/devices',(q,r)=>{const {type,name,departmentId}=q.body||{};if(!['operator','totem','display'].includes(type))return r.status(400).json({error:'invalid_type'});const id=uuid(),raw=token();db.prepare('insert into devices(id,type,name,department_id,device_key_hash,created_at) values(?,?,?,?,?,?)').run(id,type,name||type,departmentId||null,sha(raw),now());r.json({deviceId:id,deviceKey:raw,type,departmentId:departmentId||null})});
 api.get('/api/devices',(q,r)=>r.json(db.prepare('select id,type,name,department_id,active,created_at from devices order by created_at desc').all()));
 api.post('/api/tickets',async(q,r)=>{const departmentId=q.body?.departmentId;const d=db.prepare('select * from departments where id=? and active=1').get(departmentId);if(!d)return r.status(404).json({error:'department_not_found'});const tx=db.transaction(()=>{db.prepare('insert into counters(department_id,business_date,next_seq) values(?,?,1) on conflict(department_id,business_date) do nothing').run(departmentId,day());const c=db.prepare('select next_seq from counters where department_id=? and business_date=?').get(departmentId,day());const seq=c.next_seq;db.prepare('update counters set next_seq=next_seq+1 where department_id=? and business_date=?').run(departmentId,day());const id=uuid(),raw=token(),num=d.prefix+String(seq).padStart(3,'0');db.prepare('insert into tickets(id,department_id,sequence_no,public_number,claim_token_hash,created_at) values(?,?,?,?,?,?)').run(id,departmentId,seq,num,sha(raw),now());event(id,'ticket_created',{departmentId,number:num});return{id,raw,num,seq}});const x=tx();const claimUrl=`${PUBLIC_BASE}/claim?ticket=${encodeURIComponent(x.id)}&token=${encodeURIComponent(x.raw)}`;const qrDataUrl=await QRCode.toDataURL(claimUrl,{width:420,margin:1});const ahead=db.prepare("select count(*) c from tickets where department_id=? and status in ('waiting','called') and sequence_no<?").get(departmentId,x.seq).c;r.json({ticketId:x.id,number:x.num,departmentId,departmentName:d.name,peopleAhead:ahead,claimUrl,qrDataUrl})});
 api.get('/claim',(q,r)=>r.sendFile(path.join(__dirname,'public','claim.html')));
 api.post('/api/claim',(q,r)=>{const {ticketId,token:raw,pushToken}=q.body||{};const t=db.prepare('select * from tickets where id=?').get(ticketId);if(!t||t.claim_token_hash!==sha(raw||''))return r.status(403).json({error:'invalid_claim'});db.prepare('update tickets set digital_claimed=1,push_token=coalesce(?,push_token) where id=?').run(pushToken||null,ticketId);event(ticketId,'digital_claimed',{});r.json(ticketView(ticketId))});
 api.get('/api/tickets/:id',(q,r)=>{const v=ticketView(q.params.id);if(!v)return r.status(404).json({error:'not_found'});r.json(v)});
 api.get('/api/operator/queue',(q,r)=>{const d=validateDevice(q.query.deviceId,q.query.deviceKey,'operator');if(!d)return r.status(403).json({error:'invalid_device'});const rows=db.prepare(`select t.*,d.name department_name from tickets t join departments d on d.id=t.department_id where t.department_id=? and t.status in ('waiting','called') order by t.sequence_no`).all(d.department_id);r.json(rows.map(x=>({ticketId:x.id,number:x.public_number,status:x.status,digital:!!x.digital_claimed,departmentName:x.department_name})))});
 api.post('/api/operator/action',async(q,r)=>{const {deviceId,deviceKey,ticketId,action}=q.body||{};const d=validateDevice(deviceId,deviceKey,'operator');if(!d)return r.status(403).json({error:'invalid_device'});const t=db.prepare('select t.*,d.name department_name from tickets t join departments d on d.id=t.department_id where t.id=?').get(ticketId);if(!t||t.department_id!==d.department_id)return r.status(403).json({error:'wrong_department'});if(action==='call'||action==='recall'){db.prepare("update tickets set status='called',called_at=? where id=?").run(now(),ticketId);event(ticketId,action,{number:t.public_number,departmentName:t.department_name});if(t.digital_claimed)await pushExpo(t.push_token,'E il tuo turno',`Numero ${t.public_number}, recati a ${t.department_name}.`,{ticketId,stage:'turn'})}else if(action==='serve'){db.prepare("update tickets set status='served',served_at=? where id=?").run(now(),ticketId);event(ticketId,'served',{number:t.public_number});if(t.digital_claimed)await pushExpo(t.push_token,'Come e andata?',`Valuta il servizio ${t.department_name}.`,{ticketId,stage:'feedback'})}else if(action==='skip'){db.prepare("update tickets set status='skipped',skipped_at=? where id=?").run(now(),ticketId);event(ticketId,'skipped',{number:t.public_number})}else return r.status(400).json({error:'invalid_action'});r.json({ok:true})});
 api.get('/api/display',(q,r)=>{const rows=db.prepare(`select t.public_number number,d.name department,t.called_at from tickets t join departments d on d.id=t.department_id where t.status='called' order by t.called_at desc limit 5`).all();r.json(rows)});
 api.post('/api/feedback',(q,r)=>{const {ticketId,rating}=q.body||{};const t=db.prepare('select * from tickets where id=? and digital_claimed=1').get(ticketId);if(!t)return r.status(404).json({error:'not_eligible'});event(ticketId,'feedback',{rating});r.json({ok:true})});
 api.get('/admin',(q,r)=>r.sendFile(path.join(__dirname,'public','admin.html')));
 function ticketView(id){const t=db.prepare(`select t.*,d.name department_name from tickets t join departments d on d.id=t.department_id where t.id=?`).get(id);if(!t)return null;const ahead=db.prepare("select count(*) c from tickets where department_id=? and status in ('waiting','called') and sequence_no<?").get(t.department_id,t.sequence_no).c;const current=db.prepare("select public_number from tickets where department_id=? and status='called' order by called_at desc limit 1").get(t.department_id);return{ticketId:t.id,number:t.public_number,departmentName:t.department_name,status:t.status,peopleAhead:ahead,currentNumber:current?.public_number||'—',digital:!!t.digital_claimed}}
 const server=http.createServer(api);wss=new WebSocketServer({server,path:'/ws'});server.listen(PORT,HOST,()=>resolve({port:PORT}));
 })}
module.exports={startServer};
