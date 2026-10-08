'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {waiting:'In attesa',called:'Chiamato',served:'Servito',skipped:'Assente',cancelled:'Annullato'};
const icons = name => /macell/i.test(name)?'🥩':/salum/i.test(name)?'🧀':/pane/i.test(name)?'🥖':/pesc/i.test(name)?'🐟':/pastic/i.test(name)?'🍰':'🎫';
function notice(message, error = false) { const box = $('notice'); if (!box) return; box.textContent = message; box.className = 'notice ' + (error?'error':'success'); box.hidden = !message; }
async function api(url, method = 'GET', body, auth) {
  const headers = {'Content-Type':'application/json'};
  if (auth) { headers.Authorization = 'Bearer ' + auth.deviceKey; headers['X-Device-Id'] = auth.deviceId; }
  const r = await fetch(url, {method, headers, body:body===undefined?undefined:JSON.stringify(body), signal:AbortSignal.timeout(15000)});
  let data; try {data = await r.json();} catch {throw new Error('Risposta server non valida');}
  if (!r.ok) throw new Error(data.error || 'Operazione non riuscita');
  return data;
}
function requestId() { return window.crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2); }
function live(refresh, onCall) {
  let ws, timer, stopped = false, busy = false;
  const update = async () => { if (busy || stopped) return; busy = true; try { await refresh(); } catch(e) {notice(e.message, true);} finally {busy=false;} };
  function connect() {
    if (stopped) return;
    ws = new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
    ws.onmessage = e => { try { const m=JSON.parse(e.data); if(onCall)onCall(m); } catch {} update(); };
    ws.onclose = () => { if(!stopped)timer=setTimeout(connect,3000); };
    ws.onerror = () => ws.close();
  }
  connect(); const poll=setInterval(update,3000); update();
  return () => {stopped=true;clearInterval(poll);clearTimeout(timer);ws?.close();};
}
async function pair(role) {
  const key='ec-device-'+role;
  const code=new URLSearchParams(location.search).get('code');
  let auth;
  if(code) {
    try {auth=await api('/api/pair','POST',{code,role});localStorage.setItem(key,JSON.stringify(auth));history.replaceState(null,'',location.pathname);} catch(e) {notice(e.message,true);}
  } else {try {auth=JSON.parse(localStorage.getItem(key)||'null');}catch{}}
  if(auth) {try{await api('/api/device','GET',undefined,auth);return auth;}catch{localStorage.removeItem(key);}}
  $('app').innerHTML=`<section class="login card"><span class="eyebrow">ASSOCIA POSTAZIONE</span><h1>${role==='operator'?'Operatore':role==='totem'?'Totem':'Display'}</h1><p>Inserisci il codice di 8 cifre creato dall’amministratore. Il dispositivo deve essere sulla stessa rete del server.</p><form id="pairForm"><label>Codice associazione<input id="pairCode" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required autofocus autocomplete="off"></label><button class="primary">Collega dispositivo</button></form></section>`;
  return new Promise(resolve=>{$('pairForm').onsubmit=async e=>{e.preventDefault();try{const a=await api('/api/pair','POST',{code:$('pairCode').value,role});localStorage.setItem(key,JSON.stringify(a));notice('');resolve(a);}catch(err){notice(err.message,true);}};});
}
function detach(role) {localStorage.removeItem('ec-device-'+role);location.reload();}
async function fullscreen() {try {if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){notice(e.message,true);}}
function time(value) {return value?new Date(value).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'—';}
