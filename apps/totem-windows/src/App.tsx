import React,{useEffect,useState} from 'react';
import QRCode from 'qrcode';
import {createTapSession,createTicket,departments,Department,Ticket} from './api';

type Mode='print'|'qr'|'nfc';
export default function App(){
 const [deps,setDeps]=useState<Department[]>([]);const [dep,setDep]=useState<Department|null>(null);const [mode,setMode]=useState<Mode|null>(null);const [ticket,setTicket]=useState<Ticket|null>(null);const [qr,setQr]=useState('');const [tap,setTap]=useState<any>(null);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');
 useEffect(()=>{departments().then(setDeps)},[]);
 const reset=()=>{setDep(null);setMode(null);setTicket(null);setQr('');setTap(null);setMsg('')};
 async function choose(m:Mode){if(!dep)return;setBusy(true);setMode(m);setMsg('');try{
   if(m==='nfc'){const s=await createTapSession(dep);setTap(s);setTimeout(()=>{reset()},25000);return;}
   const t=await createTicket(dep,m==='print'?'paper':'qr');setTicket(t);
   if(m==='print'){const r=await window.kiosk.printTicket(t);setMsg(r.ok?'Biglietto stampato. Ritiralo sotto lo schermo.':`Errore stampa: ${r.message||'verifica stampante'}`);}
   else setQr(await QRCode.toDataURL(t.claimUrl,{width:440,margin:2}));
 }finally{setBusy(false)}}
 return <main className="shell">
   <header><div className="brand">ELIMINACODE</div><div className="sub">Scegli il reparto e prendi il tuo turno</div></header>
   {!dep && <section className="grid">{deps.map(d=><button className="dept" key={d.id} onClick={()=>setDep(d)}><span>{d.icon}</span><b>{d.name}</b></button>)}</section>}
   {dep && !mode && <section className="panel"><button className="back" onClick={reset}>← Cambia reparto</button><h1>{dep.icon} {dep.name}</h1><p>Come vuoi prendere il numero?</p><div className="choices"><button onClick={()=>choose('print')}>🧾<b>Stampa ticket</b><small>Numero cartaceo</small></button><button onClick={()=>choose('qr')}>▦<b>QR code</b><small>Scansiona con l'app</small></button><button onClick={()=>choose('nfc')}>◉<b>NFC</b><small>Avvicina il telefono</small></button></div></section>}
   {busy&&<div className="overlay">Preparazione del turno…</div>}
   {mode==='print'&&ticket&&<section className="result"><h2>{ticket.departmentName}</h2><div className="number">{ticket.displayNumber}</div><p>{msg}</p><button onClick={reset}>Fine</button></section>}
   {mode==='qr'&&ticket&&<section className="result"><h2>{ticket.departmentName}</h2><div className="number">{ticket.displayNumber}</div>{qr&&<img className="qr" src={qr}/>}<p>Apri l'app e inquadra il QR code.</p><button onClick={reset}>Annulla</button></section>}
   {mode==='nfc'&&tap&&<section className="result nfc"><div className="waves">)))</div><h2>Avvicina il telefono</h2><p>Il reparto <b>{dep?.name}</b> e pronto per l'acquisizione NFC.</p><small>Sessione temporanea monouso • scade automaticamente</small><button onClick={reset}>Annulla</button></section>}
 </main>
}
