'use strict';
const crypto=require('node:crypto');
const webpush=require('web-push');
function validSubscription(s) {
  try {
    const u=new URL(s.endpoint);
    const allowed=u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com')||u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.notify.windows.com');
    return u.protocol==='https:' && allowed && !u.username && !u.password && (!u.port||u.port==='443') && u.href.length<2048 && Buffer.from(s.keys.p256dh,'base64url').length===65 && Buffer.from(s.keys.auth,'base64url').length===16;
  }catch{return false;}
}
function createPush(db,setting,setSetting,view,{send}={}) {
  if(!setting('vapidPublic','')){const keys=webpush.generateVAPIDKeys();setSetting('vapidPublic',keys.publicKey);setSetting('vapidPrivate',keys.privateKey);}
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL,endpoint TEXT NOT NULL,subscription TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(ticket_id,endpoint));
  CREATE TABLE IF NOT EXISTS push_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,subscription_id TEXT NOT NULL,stage TEXT NOT NULL,payload TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,sent_at INTEGER,UNIQUE(subscription_id,stage));`);
  let busy=false,stopped=false;
  function enqueue(s,t,stage,message) {
    const payload={title:`${t.public_number} · ${t.department_name}`,body:message,tag:`eliminacode-${t.id}`,url:`/claim?ticket=${encodeURIComponent(t.id)}&token=${encodeURIComponent(t.claim_token)}`};
    db.prepare('DELETE FROM push_outbox WHERE subscription_id=? AND sent_at IS NULL AND stage<>?').run(s.id,stage);
    db.prepare('INSERT OR IGNORE INTO push_outbox(subscription_id,stage,payload,next_at,expires_at) VALUES(?,?,?,?,?)').run(s.id,stage,JSON.stringify(payload),Date.now(),Date.now()+300000);
  }
  function sweep() {
    db.prepare("DELETE FROM push_subscriptions WHERE ticket_id IN (SELECT id FROM tickets WHERE status NOT IN ('waiting','called') AND COALESCE(served_at,skipped_at,created_at)<?)").run(new Date(Date.now()-86400000).toISOString());
    const subscriptions=db.prepare("SELECT s.*,t.*,s.id subscription_id,d.name department_name FROM push_subscriptions s JOIN tickets t ON t.id=s.ticket_id JOIN departments d ON d.id=t.department_id WHERE t.status IN ('waiting','called') OR (t.status IN ('served','cancelled','skipped') AND COALESCE(t.served_at,t.skipped_at,t.created_at)>?)").all(new Date(Date.now()-300000).toISOString());
    for(const t of subscriptions){const s={id:t.subscription_id};const v=view({...t,id:t.ticket_id});let stage=t.status,message;
      if(t.status==='waiting'){if(v.peopleAhead>2)continue;stage='ahead-'+v.peopleAhead;message=v.peopleAhead===1?`Manca un numero al tuo turno in ${t.department_name}.`:v.peopleAhead?`Mancano ${v.peopleAhead===2?'due':v.peopleAhead} numeri al tuo turno in ${t.department_name}.`:'Sei il prossimo. Avvicinati al reparto.';}
      else if(t.status==='called'){stage='called-'+t.called_at;message='È il tuo turno! Recati al banco.';}
      else if(t.status==='served')message='Servizio completato. Tocca per lasciare una valutazione.';
      else message='Il ticket è '+(t.status==='skipped'?'stato segnato come assente.':'stato annullato.');
      enqueue(s,{...t,id:t.ticket_id},stage,message);
    }
    void flush();
  }
  async function flush(){if(busy||stopped)return;busy=true;try{
    db.prepare('DELETE FROM push_outbox WHERE subscription_id NOT IN (SELECT id FROM push_subscriptions)').run();
    const pending=db.prepare('SELECT o.*,s.subscription FROM push_outbox o JOIN push_subscriptions s ON s.id=o.subscription_id WHERE sent_at IS NULL AND next_at<=? AND expires_at>? ORDER BY o.id LIMIT 50').all(Date.now(),Date.now());
    for(const o of pending){if(stopped)break;try{
      await (send||webpush.sendNotification)(JSON.parse(o.subscription),o.payload,{TTL:120,urgency:'high',timeout:10000,vapidDetails:{subject:'https://eliminacode.invalid',publicKey:setting('vapidPublic',''),privateKey:setting('vapidPrivate','')}});
      db.prepare('UPDATE push_outbox SET sent_at=? WHERE id=?').run(Date.now(),o.id);
    }catch(e){if([404,410].includes(e.statusCode)){db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(o.subscription_id);}else db.prepare('UPDATE push_outbox SET attempts=attempts+1,next_at=? WHERE id=?').run(Date.now()+Math.min(60000,1000*2**Math.min(o.attempts,6)),o.id);}}
    db.prepare('DELETE FROM push_outbox WHERE expires_at<?').run(Date.now()-86400000);
  }finally{busy=false;}}
  const timer=setInterval(sweep,3000);timer.unref();
  return {publicKey:setting('vapidPublic',''),sweep,
    subscribe(t,s){if(db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE ticket_id=? AND endpoint<>?').get(t.id,s?.endpoint||'').n>=5){const e=new Error('Limite dispositivi notifiche raggiunto per questo ticket');e.status=429;throw e;}if(!validSubscription(s)){const e=new Error('Sottoscrizione notifiche non valida');e.status=400;throw e;}const id=crypto.randomUUID();db.prepare('INSERT INTO push_subscriptions(id,ticket_id,endpoint,subscription,created_at) VALUES(?,?,?,?,?) ON CONFLICT(ticket_id,endpoint) DO UPDATE SET subscription=excluded.subscription').run(id,t.id,s.endpoint,JSON.stringify(s),new Date().toISOString());sweep();return {ok:true};},
    async test(t,endpoint){const s=db.prepare('SELECT * FROM push_subscriptions WHERE ticket_id=? AND endpoint=?').get(t.id,endpoint);if(!s){const e=new Error('Attiva prima le notifiche');e.status=409;throw e;}await (send||webpush.sendNotification)(JSON.parse(s.subscription),JSON.stringify({title:'Eliminacode · prova',body:'La notifica di prova è arrivata.',tag:'ec-test',url:`/claim?ticket=${t.id}&token=${t.claim_token}`}),{TTL:60,timeout:10000,vapidDetails:{subject:'https://eliminacode.invalid',publicKey:setting('vapidPublic',''),privateKey:setting('vapidPrivate','')}});return {ok:true,message:'Notifica accettata dal servizio push. Verifica sul telefono.'};},
    remove(t,endpoint){db.prepare('DELETE FROM push_subscriptions WHERE ticket_id=? AND endpoint=?').run(t.id,endpoint);},
    async close(){stopped=true;clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,25));}
  };
}
module.exports={createPush,validSubscription};
