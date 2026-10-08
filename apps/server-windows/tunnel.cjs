'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
function createTunnel({dataDir,executable,safeStorage,spawnProcess=spawn}){
 const file=path.join(dataDir,'customer-tunnel.secret');let child,retry,stopped=false,status='Non configurato';
 function configured(){return fs.existsSync(file);}
 function read(){return safeStorage.decryptString(fs.readFileSync(file));}
 function start(){if(stopped||child||!configured())return;if(!safeStorage.isEncryptionAvailable()){status='Protezione credenziali Windows non disponibile';return;}status='Collegamento in corso';
  try{child=spawnProcess(executable,['tunnel','--no-autoupdate','run'],{windowsHide:true,env:{...process.env,TUNNEL_TOKEN:read()},stdio:['ignore','ignore','pipe']});
   const processChild=child;
   child.stderr.on('data',chunk=>{const s=chunk.toString();if(s.includes('Registered tunnel connection'))status='Connesso';if(s.includes('Unregistered tunnel connection'))status='Riconnessione in corso';});
   child.on('error',()=>{status='Avvio tunnel non riuscito';});
   child.on('close',()=>{if(child!==processChild)return;child=null;if(!stopped){status='Disconnesso · nuovo tentativo tra 10 secondi';retry=setTimeout(start,10000);retry.unref();}});
  }catch{child=null;status='Avvio tunnel non riuscito';}
 }
 function stop(){stopped=true;clearTimeout(retry);child?.kill();child=null;status='Arrestato';}
 return {state:()=>({configured:configured(),status}),start,stop,
  async save(value){const raw=String(value||'').trim();if(raw.length<50||raw.length>4096||! /^[A-Za-z0-9_+=/.-]+$/.test(raw))throw new Error('Incolla solo il token del tunnel Cloudflare');if(!safeStorage.isEncryptionAvailable())throw new Error('Protezione credenziali Windows non disponibile');stop();fs.writeFileSync(file,safeStorage.encryptString(raw),{mode:0o600});stopped=false;start();return this.state();},
  remove(){stop();if(configured())fs.unlinkSync(file);return this.state();}
 };
}
module.exports={createTunnel};
