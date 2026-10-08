const express = require('express');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');
const VERSION = '1.2.0';
const {estimateInterval}=require('./wait-times.cjs');
const {createPush}=require('./push.cjs');
const hash = x => crypto.createHash('sha256').update(String(x || '')).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const now = () => new Date().toISOString();
const local = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function clean(value, max = 100) { return String(value || '').trim().slice(0, max); }
function lanAddresses() { try { return [...new Set(Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address))]; } catch { return []; } }
function passwordHash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }

async function startServer(options = {}) {
  const dataDir = options.dataDir || process.env.ELIMINACODE_DATA_DIR || path.join(process.env.LOCALAPPDATA || os.homedir(), 'Eliminacode Server');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'eliminacode.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments(id TEXT PRIMARY KEY,name TEXT NOT NULL,prefix TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,department_id TEXT,device_key_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS counters(department_id TEXT NOT NULL,business_date TEXT NOT NULL,next_seq INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(department_id,business_date));
    CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,department_id TEXT NOT NULL,sequence_no INTEGER NOT NULL,public_number TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'waiting',claim_token_hash TEXT NOT NULL,digital_claimed INTEGER NOT NULL DEFAULT 0,push_token TEXT,created_at TEXT NOT NULL,called_at TEXT,served_at TEXT,skipped_at TEXT,feedback_sent INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT NOT NULL,event_type TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY CHECK(id=1),username TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pairings(code_hash TEXT PRIMARY KEY,device_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tap_sessions(device_id TEXT PRIMARY KEY,department_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS ticket_queue ON tickets(department_id,status,created_at);
  `);
  const columns = db.prepare('PRAGMA table_info(tickets)').all().map(x => x.name);
  for (const [name, type] of [['device_id', 'TEXT'], ['request_id', 'TEXT'], ['claim_token', 'TEXT'], ['order_notes', "TEXT NOT NULL DEFAULT ''"], ['rating', 'TEXT']]) {
    if (!columns.includes(name)) db.exec(`ALTER TABLE tickets ADD COLUMN ${name} ${type}`);
  }
  const depColumns=db.prepare('PRAGMA table_info(departments)').all().map(x=>x.name);
  for(const [name,type] of [['wait_mode',"TEXT NOT NULL DEFAULT 'auto'"],['manual_minutes','REAL NOT NULL DEFAULT 3'],['sample_size','INTEGER NOT NULL DEFAULT 20'],['max_gap_minutes','REAL NOT NULL DEFAULT 30']]) if(!depColumns.includes(name))db.exec(`ALTER TABLE departments ADD COLUMN ${name} ${type}`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ticket_request ON tickets(device_id,request_id) WHERE request_id IS NOT NULL');
  if (!db.prepare('SELECT COUNT(*) AS n FROM departments').get().n) {
    const insert = db.prepare('INSERT INTO departments(id,name,prefix,sort_order) VALUES(?,?,?,?)');
    db.transaction(() => [['salumeria', 'Salumeria', 'S', 1], ['macelleria', 'Macelleria', 'M', 2], ['panetteria', 'Panetteria', 'P', 3], ['pescheria', 'Pescheria', 'F', 4], ['pasticceria', 'Pasticceria', 'C', 5]].forEach(x => insert.run(...x)))();
  }
  function setting(key, fallback) { return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback; }
  function setSetting(key, value) { db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value)); }
  const api = express();
  api.disable('x-powered-by');
  let port = options.port ?? Number(process.env.ELIMINACODE_PORT || 8787);
  let wss;
  const sessions = new Map();
  function base() {
    return (process.env.ELIMINACODE_PUBLIC_BASE || setting('publicBase', '') || `http://${lanAddresses()[0] || '127.0.0.1'}:${port}`).replace(/\/$/, '');
  }
  function customerBase(){return (process.env.ELIMINACODE_CUSTOMER_BASE || setting('customerBase','')).replace(/\/$/,'');}
  function waitFor(id){const d=db.prepare('SELECT * FROM departments WHERE id=?').get(id);const times=db.prepare("SELECT served_at FROM tickets WHERE department_id=? AND status='served' AND served_at IS NOT NULL ORDER BY served_at DESC LIMIT 1000").all(id).map(x=>x.served_at);return estimateInterval(times,d);}
  function adminSession(sid) {
    if (!sid) return false;
    return !!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(sid), Date.now());
  }
  function cookie(req) { return /(?:^|;\s*)ec_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]; }
  function isAdmin(req) { return adminSession(cookie(req)); }
  function admin(req, res, next) { if (!isAdmin(req)) return res.status(401).json({ error: 'Accedi come amministratore' }); next(); }
  function deviceFor(id, key, role) {
    if (!id || !key) return null;
    const d = db.prepare('SELECT * FROM devices WHERE id=? AND active=1').get(String(id));
    return d && (!role || d.type === role) && d.device_key_hash === hash(key) ? d : null;
  }
  function device(req, role) { return deviceFor(req.headers['x-device-id'], String(req.headers.authorization || '').replace(/^Bearer /, ''), role); }
  function requireDevice(role) { return (req, res, next) => { req.device = device(req, role); if (!req.device) return res.status(401).json({ error: 'Dispositivo non associato o revocato' }); next(); }; }
  function event(id, type, payload = {}) {
    db.prepare('INSERT INTO events(ticket_id,event_type,created_at,payload) VALUES(?,?,?,?)').run(id, type, now(), JSON.stringify(payload));
  }
  function notify(type = 'update', payload = {}) { for (const c of wss?.clients || []) if (c.readyState === 1) c.send(JSON.stringify({ type, ...payload })); }
  function claimTicket(id, raw) {
    const t = db.prepare('SELECT t.*,d.name department_name FROM tickets t JOIN departments d ON d.id=t.department_id WHERE t.id=?').get(clean(id));
    if (!t || t.claim_token_hash !== hash(raw)) fail(403, 'Ticket o codice non valido');
    return t;
  }
  function view(t) {
    const ahead = db.prepare("SELECT COUNT(*) n FROM tickets WHERE department_id=? AND status IN ('waiting','called') AND (created_at<? OR (created_at=? AND rowid<(SELECT rowid FROM tickets WHERE id=?)))").get(t.department_id, t.created_at, t.created_at, t.id).n;
    const current = db.prepare("SELECT public_number FROM tickets WHERE department_id=? AND status='called' ORDER BY called_at DESC LIMIT 1").get(t.department_id);
    const estimate=waitFor(t.department_id);
    return { ...estimate, estimatedMinutes:t.status==='waiting'?Math.ceil(ahead*estimate.minutesPerCustomer):0, calledAt:t.called_at, ticketId: t.id, number: t.public_number, departmentId: t.department_id, departmentName: t.department_name, status: t.status, peopleAhead: ['waiting', 'called'].includes(t.status) ? ahead : 0, currentNumber: current?.public_number || '—', digital: !!t.digital_claimed, order: t.order_notes, rating: t.rating };
  }
  async function issuedView(t) {
    const claimUrl = `${customerBase() || base()}/claim?ticket=${encodeURIComponent(t.id)}&token=${encodeURIComponent(t.claim_token)}`;
    return { ...view(t), publicConfigured:!!customerBase(), claimUrl, qrDataUrl: await QRCode.toDataURL(claimUrl, { width: 360, margin: 2 }), shopName: setting('shopName', 'Eliminacode'), createdAt: t.created_at };
  }
  const issue = db.transaction((departmentId, deviceId, requestId) => {
    if (requestId) {
      const old = db.prepare('SELECT t.*,d.name department_name FROM tickets t JOIN departments d ON d.id=t.department_id WHERE device_id=? AND request_id=?').get(deviceId, requestId);
      if (old) { if (old.department_id !== departmentId) fail(409, 'Richiesta già utilizzata per un altro reparto'); return old; }
    }
    const d = db.prepare('SELECT * FROM departments WHERE id=? AND active=1').get(departmentId);
    if (!d) fail(404, 'Reparto non disponibile');
    const initial = db.prepare('SELECT COALESCE(MAX(sequence_no),0)+1 n FROM tickets WHERE department_id=?').get(departmentId).n;
    db.prepare("INSERT INTO counters(department_id,business_date,next_seq) VALUES(?,'continuous',?) ON CONFLICT DO NOTHING").run(departmentId, initial);
    const seq = db.prepare("SELECT next_seq FROM counters WHERE department_id=? AND business_date='continuous'").get(departmentId).next_seq;
    db.prepare("UPDATE counters SET next_seq=next_seq+1 WHERE department_id=? AND business_date='continuous'").run(departmentId);
    const id = crypto.randomUUID(), raw = token(), number = d.prefix + String(seq).padStart(3, '0');
    db.prepare('INSERT INTO tickets(id,department_id,sequence_no,public_number,claim_token_hash,claim_token,device_id,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, departmentId, seq, number, hash(raw), raw, deviceId, requestId || null, now());
    event(id, 'ticket_created', { departmentId, number });
    return db.prepare('SELECT t.*,d.name department_name FROM tickets t JOIN departments d ON d.id=t.department_id WHERE t.id=?').get(id);
  });
  api.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const allowedHosts = ['localhost', '127.0.0.1', '[::1]', ...lanAddresses()];
    try { allowedHosts.push(new URL(base()).hostname); } catch {}
    try { allowedHosts.push(new URL(customerBase()).hostname); } catch {}
    if (!allowedHosts.includes(req.hostname)) return res.status(403).json({ error: 'Indirizzo server non autorizzato' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== (req.customerGateway && !options.allowInsecureCustomerTesting ? customerBase() : `${req.protocol}://${req.headers.host}`)) return res.status(403).json({ error: 'Origine richiesta non autorizzata' });
    const key = req.customerGateway ? String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress;
    const bucket = sessions.get(key) || { count: 0, expires: Date.now() + 60000 };
    if (bucket.expires < Date.now()) { bucket.count = 0; bucket.expires = Date.now() + 60000; }
    bucket.count++; sessions.set(key, bucket);
    if (sessions.size > 1000) for (const [k, b] of sessions) if (b.expires < Date.now()) sessions.delete(k);
    if (bucket.count > 600) return res.status(429).json({ error: 'Troppe richieste. Attendi un minuto.' });
    next();
  });
  api.use(express.json({ limit: '64kb' }));
  api.use((q,r,next)=>{if(!['GET','HEAD','OPTIONS'].includes(q.method)){if(q.body===undefined)q.body={};if(!q.body||typeof q.body!=='object'||Array.isArray(q.body))return r.status(400).json({error:'Richiesta non valida'});}next();});
  const push=createPush(db,setting,setSetting,view,{send:options.pushSend});
  const loginAttempts = new Map();
  api.get('/api/health', (q, r) => r.json({ ok: true, version: VERSION, mode: 'local-first', time: now(), configured: !!db.prepare('SELECT 1 FROM admins').get() }));
  api.get('/api/auth', (q, r) => r.json({ configured: !!db.prepare('SELECT 1 FROM admins').get(), authenticated: isAdmin(q), local: local(q.socket.remoteAddress) }));
  function signIn(res) { const sid = token(); db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now()); db.prepare('INSERT INTO sessions VALUES(?,?)').run(hash(sid), Date.now() + 12 * 3600000); res.setHeader('Set-Cookie', `ec_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`); res.json({ ok: true }); }
  api.post('/api/setup', (q, r) => {
    if (!local(q.socket.remoteAddress)) fail(403, 'Configura il primo accesso dal PC server');
    if (db.prepare('SELECT 1 FROM admins').get()) fail(409, 'Amministratore già configurato');
    const username = clean(q.body.username, 60), password = String(q.body.password || '');
    if (!username || password.length < 10 || password.length > 200) fail(400, 'Scegli un nome utente e una password di almeno 10 caratteri');
    const salt = token(); db.prepare('INSERT INTO admins VALUES(1,?,?,?)').run(username, salt, passwordHash(password, salt));
    setSetting('shopName', clean(q.body.shopName) || 'Eliminacode'); signIn(r);
  });
  api.post('/api/login', (q, r) => {
    const key = q.socket.remoteAddress, attempt = loginAttempts.get(key);
    if (attempt && attempt.until > Date.now() && attempt.count >= 5) fail(429, 'Troppi tentativi. Riprova tra 5 minuti.');
    const user = db.prepare('SELECT * FROM admins').get();
    const password = String(q.body.password || '').slice(0, 200);
    const valid = user && crypto.timingSafeEqual(Buffer.from(passwordHash(password, user.salt), 'hex'), Buffer.from(user.password_hash, 'hex')) && clean(q.body.username, 60) === user.username;
    if (!valid) { const a = attempt && attempt.until > Date.now() ? attempt : { count: 0, until: Date.now() + 300000 }; a.count++; loginAttempts.set(key, a); fail(401, 'Nome utente o password errati'); }
    loginAttempts.delete(key); signIn(r);
  });
  api.put('/api/admin/password', admin, (q,r)=>{
    const user=db.prepare('SELECT * FROM admins').get();
    if(passwordHash(String(q.body.oldPassword||'').slice(0,200),user.salt)!==user.password_hash)fail(403,'Password attuale errata');
    const next=String(q.body.newPassword||'');if(next.length<10||next.length>200)fail(400,'La nuova password deve avere almeno 10 caratteri');
    const salt=token();db.prepare('UPDATE admins SET salt=?,password_hash=? WHERE id=1').run(salt,passwordHash(next,salt));
    db.prepare('DELETE FROM sessions').run();signIn(r);
  });
  api.post('/api/admin/departments/:id/close-queue',admin,(q,r)=>{
    db.transaction(()=>{const rows=db.prepare("SELECT id FROM tickets WHERE department_id=? AND status IN ('waiting','called')").all(q.params.id);for(const t of rows){db.prepare("UPDATE tickets SET status='cancelled' WHERE id=?").run(t.id);event(t.id,'cancelled');}})();notify();r.json({ok:true});
  });
  api.post('/api/logout', (q, r) => { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(cookie(q))); r.setHeader('Set-Cookie', 'ec_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); r.json({ ok: true }); });
  api.get('/api/departments', (q, r) => r.json(db.prepare('SELECT id,name,prefix FROM departments WHERE active=1 ORDER BY sort_order,name').all()));
  api.get('/api/admin/overview', admin, (q, r) => r.json({
    shopName: setting('shopName', 'Eliminacode'), publicBase: base(), customerBase:customerBase(), publicPort:gatewayPort, dataDir, addresses: lanAddresses().map(x => `http://${x}:${port}`),
    departments: db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM tickets WHERE department_id=d.id AND status='waiting') waiting,(SELECT COUNT(*) FROM tickets WHERE department_id=d.id AND status='called') called,(SELECT COUNT(*) FROM tickets WHERE department_id=d.id AND status='served' AND served_at >= '${new Date(new Date().setHours(0,0,0,0)).toISOString()}') served FROM departments d ORDER BY sort_order,name`).all().map(d=>({...d,waitEstimate:waitFor(d.id)})),
    devices: db.prepare('SELECT id,type,name,department_id,active,created_at FROM devices ORDER BY created_at DESC').all(),
    tickets: db.prepare("SELECT t.id ticketId,t.public_number number,t.status,t.created_at,t.digital_claimed digital,d.name departmentName FROM tickets t JOIN departments d ON d.id=t.department_id ORDER BY t.created_at DESC,t.rowid DESC LIMIT 100").all(),
    printer: { name: setting('printerName', ''), width: Number(setting('paperWidth', 80)), enabled: setting('printerEnabled', 'false') === 'true' }
  }));
  api.post('/api/admin/customer-check',admin,async(q,r)=>{
    const address=customerBase();if(!address)fail(409,'Salva prima il dominio HTTPS pubblico dei clienti');
    try{const health=await fetch(address+'/api/customer/health',{redirect:'error',signal:AbortSignal.timeout(10000)});const data=await health.json();if(!health.ok||!data.ok||data.instance!==setting('instanceId',''))throw new Error('Il dominio non raggiunge questo server');
      const blocked=await fetch(address+'/api/admin/overview',{redirect:'error',signal:AbortSignal.timeout(10000)});if(blocked.status!==403)throw new Error('Il dominio espone la porta interna: correggi la destinazione del tunnel');
      r.json({ok:true,message:'HTTPS verificato: questo server è raggiungibile e l’amministrazione è esclusa. Prova ora il QR sul telefono con Wi-Fi disattivato.'});
    }catch(e){fail(502,'Accesso pubblico non verificato: '+e.message);}
  });
  api.put('/api/admin/settings', admin, (q, r) => {
    const b = q.body;
    if (b.publicBase) { let u; try { u = new URL(b.publicBase); } catch { fail(400, 'Indirizzo rete non valido'); } if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== '/') fail(400, 'Inserisci solo indirizzo e porta del server'); }
    if(b.customerBase){let u;try{u=new URL(b.customerBase);}catch{fail(400,'Indirizzo cliente non valido');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||['localhost','127.0.0.1'].includes(u.hostname))fail(400,'Per i clienti serve un dominio pubblico HTTPS');}
    if(b.customerBase!==undefined)setSetting('customerBase',clean(b.customerBase,200).replace(/\/$/,''));
    if (b.shopName !== undefined) setSetting('shopName', clean(b.shopName) || 'Eliminacode');
    if (b.publicBase !== undefined) setSetting('publicBase', clean(b.publicBase, 200).replace(/\/$/, ''));
    if (b.printerName !== undefined) setSetting('printerName', clean(b.printerName, 200));
    if (b.paperWidth !== undefined) { if (![58, 80].includes(Number(b.paperWidth))) fail(400, 'Formato carta non valido'); setSetting('paperWidth', Number(b.paperWidth)); }
    if (b.printerEnabled !== undefined) setSetting('printerEnabled', !!b.printerEnabled);
    r.json({ ok: true });
  });
  api.post('/api/admin/departments', admin, (q, r) => {
    const name = clean(q.body.name), prefix = clean(q.body.prefix, 3).toUpperCase();
    if (!name || !/^[A-Z0-9]{1,3}$/.test(prefix)) fail(400, 'Nome reparto e prefisso (1–3 lettere/numeri) obbligatori');
    if (db.prepare('SELECT 1 FROM departments WHERE prefix=? AND id<>?').get(prefix, clean(q.body.id))) fail(409, 'Prefisso già utilizzato');
    const id = clean(q.body.id) || crypto.randomUUID();
    const prior=db.prepare('SELECT * FROM departments WHERE id=?').get(id)||{wait_mode:'auto',manual_minutes:3,sample_size:20,max_gap_minutes:30};
    const mode=q.body.waitMode ?? prior.wait_mode, minutes=Number(q.body.manualMinutes ?? prior.manual_minutes), samples=Number(q.body.sampleSize ?? prior.sample_size), gap=Number(q.body.maxGapMinutes ?? prior.max_gap_minutes);
    if(!['manual','auto'].includes(mode)||!Number.isFinite(minutes)||minutes<0.1||minutes>120||!Number.isInteger(samples)||samples<1||samples>100||!Number.isFinite(gap)||gap<1||gap>240)fail(400,'Configurazione tempi non valida');
    db.prepare('INSERT INTO departments(id,name,prefix,sort_order,active) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,prefix=excluded.prefix,active=excluded.active').run(id, name, prefix, 10, q.body.active === false ? 0 : 1);
    db.prepare('UPDATE departments SET wait_mode=?,manual_minutes=?,sample_size=?,max_gap_minutes=? WHERE id=?').run(mode,minutes,samples,gap,id);notify(); r.json({ ok: true, id });
  });
  api.post('/api/devices', admin, (q, r) => {
    const { type, departmentId } = q.body;
    if (!['operator', 'totem', 'display'].includes(type)) fail(400, 'Tipo dispositivo non valido');
    if (type === 'operator' && !db.prepare('SELECT 1 FROM departments WHERE id=? AND active=1').get(clean(departmentId))) fail(400, 'Scegli un reparto attivo');
    const id = crypto.randomUUID(), code = String(crypto.randomInt(10000000, 100000000));
    db.prepare('INSERT INTO devices(id,type,name,department_id,device_key_hash,created_at) VALUES(?,?,?,?,?,?)').run(id, type, clean(q.body.name) || type, type === 'operator' ? departmentId : null, hash(token()), now());
    db.prepare('INSERT INTO pairings VALUES(?,?,?)').run(hash(code), id, Date.now() + 600000);
    r.json({ deviceId: id, pairingCode: code, expiresIn: 600, pairingUrl: `${base()}/${type}?code=${code}`, qrDataUrl: null });
  });
  api.get('/api/devices', admin, (q, r) => r.json(db.prepare('SELECT id,type,name,department_id,active FROM devices').all()));
  api.post('/api/admin/devices/:id/revoke', admin, (q, r) => { db.prepare('UPDATE devices SET active=0 WHERE id=?').run(q.params.id); db.prepare('DELETE FROM pairings WHERE device_id=?').run(q.params.id); notify(); r.json({ ok: true }); });
  api.post('/api/admin/devices/:id/pair', admin, (q, r) => {
    const d = db.prepare('SELECT * FROM devices WHERE id=? AND active=1').get(q.params.id); if (!d) fail(404, 'Dispositivo non disponibile');
    const code = String(crypto.randomInt(10000000, 100000000));
    db.prepare('DELETE FROM pairings WHERE device_id=?').run(d.id); db.prepare('INSERT INTO pairings VALUES(?,?,?)').run(hash(code), d.id, Date.now() + 600000);
    r.json({ deviceId: d.id, pairingCode: code, pairingUrl: `${base()}/${d.type}?code=${code}`, expiresIn: 600 });
  });
  const pairingAttempts = new Map();
  api.post('/api/pair', (q, r) => {
    const ip = q.socket.remoteAddress, count = pairingAttempts.get(ip) || { count: 0, until: Date.now() + 60000 };
    if (count.until < Date.now()) { count.count = 0; count.until = Date.now() + 60000; } count.count++; pairingAttempts.set(ip, count);
    if (count.count > 10) fail(429, 'Troppi tentativi di associazione. Attendi un minuto.');
    const p = db.prepare('SELECT * FROM pairings WHERE code_hash=? AND expires_at>?').get(hash(q.body.code), Date.now());
    const d = p && db.prepare('SELECT * FROM devices WHERE id=? AND active=1').get(p.device_id);
    if (!d || d.type !== q.body.role) fail(403, 'Codice scaduto, già usato o non valido per questa postazione');
    const key = token(); db.transaction(() => { db.prepare('UPDATE devices SET device_key_hash=? WHERE id=?').run(hash(key), d.id); db.prepare('DELETE FROM pairings WHERE device_id=?').run(d.id); })();
    r.json({ deviceId: d.id, deviceKey: key, role: d.type, name: d.name, departmentId: d.department_id });
  });
  api.get('/api/device', requireDevice(), (q, r) => r.json({ role: q.device.type, name: q.device.name, departmentId: q.device.department_id }));
  api.post('/api/tickets', requireDevice('totem'), async (q, r) => {
    const requestId = clean(q.body.requestId, 80); if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) fail(400, 'Identificativo richiesta non valido');
    const t = issue(clean(q.body.departmentId), q.device.id, requestId); const out = await issuedView(t); notify(); r.json(out);
  });
  api.post('/api/tap', requireDevice('totem'), (q, r) => {
    const departmentId = clean(q.body.departmentId); if (!db.prepare('SELECT 1 FROM departments WHERE id=? AND active=1').get(departmentId)) fail(404, 'Reparto non disponibile');
    db.prepare('INSERT INTO tap_sessions VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET department_id=excluded.department_id,expires_at=excluded.expires_at').run(q.device.id, departmentId, Date.now() + 45000);
    r.json({ tapUrl: `${customerBase() || base()}/tap?device=${q.device.id}`, expiresIn: 45 });
  });
  api.get('/api/tap', requireDevice('totem'), (q,r)=>r.json({active:!!db.prepare('SELECT 1 FROM tap_sessions WHERE device_id=? AND expires_at>?').get(q.device.id,Date.now())}));
  api.delete('/api/tap', requireDevice('totem'), (q,r)=>{db.prepare('DELETE FROM tap_sessions WHERE device_id=?').run(q.device.id);r.json({ok:true});});
  api.post('/api/tap/claim', async (q, r) => {
    const t = db.transaction(() => { const id = clean(q.body.deviceId); const s = db.prepare('SELECT t.* FROM tap_sessions t JOIN devices d ON d.id=t.device_id WHERE device_id=? AND expires_at>? AND d.active=1').get(id, Date.now()); if (!s) fail(410, 'Nessuna sessione NFC attiva. Seleziona il reparto sul totem.'); const result = issue(s.department_id, id, crypto.randomUUID()); db.prepare('DELETE FROM tap_sessions WHERE device_id=?').run(id); return result; })();
    notify(); r.json(await issuedView(t));
  });
  api.post('/api/claim', (q, r) => { const t = claimTicket(q.body.ticketId, q.body.token); db.prepare('UPDATE tickets SET digital_claimed=1 WHERE id=?').run(t.id); event(t.id, 'digital_claimed'); notify(); r.json({ ...view(t), digital: true }); });
  api.get('/api/tickets/:id', (q, r) => r.json(view(claimTicket(q.params.id, String(q.headers.authorization || '').replace(/^Bearer /, '')))));
  api.post('/api/order', (q, r) => { const t = claimTicket(q.body.ticketId, q.body.token); if (t.status !== 'waiting') fail(409, 'Ordine modificabile solo durante l’attesa'); const notes = clean(q.body.notes, 1000); db.prepare('UPDATE tickets SET order_notes=? WHERE id=?').run(notes, t.id); notify(); r.json({ ok: true }); });
  api.get('/api/push/config',(q,r)=>r.json({publicKey:push.publicKey}));
  api.post('/api/push/subscribe',(q,r)=>r.json(push.subscribe(claimTicket(q.body.ticketId,q.body.token),q.body.subscription)));
  api.post('/api/push/test',async(q,r)=>{const t=claimTicket(q.body.ticketId,q.body.token);try{r.json(await push.test(t,q.body.endpoint));}catch(e){fail(e.status||502,'Invio push non riuscito. Controlla connessione e permesso notifiche.');}});
  api.post('/api/push/unsubscribe',(q,r)=>{push.remove(claimTicket(q.body.ticketId,q.body.token),q.body.endpoint);r.json({ok:true});});
  api.get('/manifest.webmanifest',(q,r)=>{let start='/client';if(q.query.ticket&&q.query.token){const t=claimTicket(q.query.ticket,q.query.token);start='/claim?ticket='+encodeURIComponent(t.id)+'&token='+encodeURIComponent(q.query.token);}r.type('application/manifest+json').json({id:'/client',name:setting('shopName','Eliminacode')+' · Il tuo turno',short_name:'Il tuo turno',start_url:start,scope:'/',display:'standalone',background_color:'#f4f7f5',theme_color:'#164b38',icons:[{src:'/client-icon.png',sizes:'192x192',type:'image/png'},{src:'/client-icon-512.png',sizes:'512x512',type:'image/png'}]});});
  api.get('/api/operator/queue', requireDevice('operator'), (q, r) => r.json(db.prepare("SELECT t.*,d.name department_name FROM tickets t JOIN departments d ON d.id=t.department_id WHERE t.department_id=? AND t.status IN ('waiting','called') ORDER BY t.created_at,t.rowid").all(q.device.department_id).map(view)));
  const transition = db.transaction((d, ticketId, action) => {
    if (action === 'next') {
      if (db.prepare("SELECT 1 FROM tickets WHERE department_id=? AND status='called'").get(d.department_id)) fail(409, 'Completa o salta il numero già chiamato');
      ticketId = db.prepare("SELECT id FROM tickets WHERE department_id=? AND status='waiting' ORDER BY created_at,rowid LIMIT 1").get(d.department_id)?.id;
      if (!ticketId) fail(409, 'Nessun cliente in attesa'); action = 'call';
    }
    const t = db.prepare('SELECT t.*,d.name department_name FROM tickets t JOIN departments d ON d.id=t.department_id WHERE t.id=?').get(clean(ticketId));
    if (!t || t.department_id !== d.department_id) fail(403, 'Ticket non appartenente al reparto');
    if (!['call', 'recall', 'serve', 'skip'].includes(action)) fail(400, 'Azione non valida');
    if (action === 'call' && db.prepare("SELECT id FROM tickets WHERE department_id=? AND status='waiting' ORDER BY created_at,rowid LIMIT 1").get(d.department_id)?.id!==t.id) fail(409,'Chiama il primo cliente in attesa');
    if (action === 'call' && t.status !== 'waiting') fail(409, 'Ticket non in attesa');
    if (['recall', 'serve', 'skip'].includes(action) && t.status !== 'called') fail(409, 'Il ticket deve essere chiamato prima');
    if (action === 'call' && db.prepare("SELECT 1 FROM tickets WHERE department_id=? AND status='called' AND id<>?").get(d.department_id, t.id)) fail(409, 'Un altro cliente è già chiamato');
    if (['call', 'recall'].includes(action)) db.prepare("UPDATE tickets SET status='called',called_at=? WHERE id=?").run(now(), t.id);
    if (action === 'serve') db.prepare("UPDATE tickets SET status='served',served_at=? WHERE id=?").run(now(), t.id);
    if (action === 'skip') db.prepare("UPDATE tickets SET status='skipped',skipped_at=? WHERE id=?").run(now(), t.id);
    event(t.id, action, { number: t.public_number, departmentName: t.department_name });
    return { ok: true, action, number: t.public_number, department: t.department_name };
  });
  api.post('/api/operator/action', requireDevice('operator'), (q, r) => { const result = transition(q.device, q.body.ticketId, q.body.action); notify(result.action, { number: result.number, department: result.department }); push.sweep(); r.json(result); });
  api.get('/api/display', (q, r) => r.json(db.prepare("SELECT t.public_number number,d.name department,t.called_at FROM tickets t JOIN departments d ON d.id=t.department_id WHERE t.status='called' ORDER BY t.called_at DESC LIMIT 20").all()));
  api.post('/api/feedback', (q, r) => { const t = claimTicket(q.body.ticketId, q.body.token); if (t.status !== 'served') fail(409, 'Puoi valutare dopo essere stato servito'); if (!['poor', 'average', 'good'].includes(q.body.rating)) fail(400, 'Valutazione non valida'); if (t.rating) fail(409, 'Valutazione già inviata'); db.prepare('UPDATE tickets SET rating=?,feedback_sent=1 WHERE id=?').run(q.body.rating, t.id); event(t.id, 'feedback', { rating: q.body.rating }); r.json({ ok: true }); });
  api.get('/api/admin/report', admin, (q, r) => r.json(db.prepare('SELECT d.name department,t.status,COUNT(*) count FROM tickets t JOIN departments d ON d.id=t.department_id GROUP BY d.id,t.status').all()));
  api.get('/api/admin/backup', admin, async (q, r) => {
    const file = path.join(dataDir, `backup-${crypto.randomUUID()}.sqlite`); await db.backup(file);
    r.download(file, `eliminacode-backup-${now().slice(0, 10)}.sqlite`, () => { try { fs.unlinkSync(file); } catch {} });
  });
  api.get('/api/admin/qr', admin, async (q, r) => { const u = clean(q.query.url, 300); if (!u.startsWith(base() + '/')) fail(400, 'Collegamento non valido'); r.json({ qrDataUrl: await QRCode.toDataURL(u, { width: 300, margin: 2 }) }); });
  api.use(express.static(path.join(__dirname, 'public'), { index: false, dotfiles: 'deny' }));
  for (const route of ['/', '/admin', '/totem', '/operator', '/display', '/claim', '/tap', '/client']) api.get(route, (q, r) => r.sendFile(path.join(__dirname, 'public', route === '/' ? 'admin.html' : route.slice(1) + '.html')));
  api.use((err, q, r, next) => { if (r.headersSent) return next(err); if (!err.status) console.error(err); r.status(err.status || 500).json({ error: err.status ? err.message : 'Errore interno. Controlla il log del server.' }); });
  let gatewayPort=options.publicPort ?? Number(process.env.ELIMINACODE_PUBLIC_PORT || (options.port===0?0:8788));
  const gateway=http.createServer((req,res)=>{
    req.customerGateway=true;
    const pathname=new URL(req.url,'http://localhost').pathname;
    const read=['/claim','/tap','/client','/claim.html','/tap.html','/client.html','/claim.js','/tap.js','/client.js','/common.js','/style.css','/sw.js','/manifest.webmanifest','/client-icon.png','/client-icon-512.png','/api/push/config','/api/customer/health'];
    const write=['/api/claim','/api/order','/api/feedback','/api/tap/claim','/api/push/subscribe','/api/push/test','/api/push/unsubscribe'];
    const allowed=(['GET','HEAD'].includes(req.method)&&(read.includes(pathname)||/^\/api\/tickets\/[a-zA-Z0-9-]+$/.test(pathname)))||(req.method==='POST'&&write.includes(pathname));
    if(!allowed){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Accesso riservato alla rete interna'}));}
    api(req,res);
  });
  api.get('/api/customer/health',(q,r)=>r.json({ok:true,version:VERSION,instance:setting('instanceId','')}));
  if(!setting('instanceId',''))setSetting('instanceId',crypto.randomUUID());
  const server = http.createServer(api);
  server.requestTimeout = 30000;
  wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) return socket.destroy();
    wss.handleUpgrade(req, socket, head, ws => { ws.on('error', () => {}); ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });
  });
  const heartbeat = setInterval(() => { for (const c of wss.clients) { if (!c.isAlive) c.terminate(); else { c.isAlive = false; c.ping(); } } }, 30000);
  heartbeat.unref();
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, options.host || process.env.ELIMINACODE_HOST || '0.0.0.0', resolve); }); } catch (err) { clearInterval(heartbeat); wss.close(); await push.close(); db.close(); throw err; }
  port = server.address().port;
  try{await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(gatewayPort,'127.0.0.1',resolve);});gatewayPort=gateway.address().port;}catch(e){clearInterval(heartbeat);wss.close();await push.close();await new Promise(r=>server.close(r));db.close();throw e;}
  return {
    port, publicPort:gatewayPort, dataDir, adminSession, deviceFor,
    printer: () => ({ name: setting('printerName', ''), width: Number(setting('paperWidth', 80)), enabled: setting('printerEnabled', 'false') === 'true' }),
    printable: async (id,deviceId) => { const t = db.prepare('SELECT t.*,d.name department_name FROM tickets t JOIN departments d ON d.id=t.department_id WHERE t.id=?').get(id); if (!t || !t.claim_token || t.device_id!==deviceId) throw new Error('Ticket non stampabile'); return issuedView(t); },
    close: async () => { await push.close(); await new Promise(resolve=>gateway.close(resolve)); clearInterval(heartbeat); for (const c of wss.clients) c.terminate(); await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); db.close(); }
  };
}
module.exports = { startServer };
if (require.main === module) startServer().then(info => console.log(`Eliminacode ${VERSION} http://127.0.0.1:${info.port}`)).catch(err => { console.error(err); process.exitCode = 1; });
