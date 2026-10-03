import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadConfig} from './config.js';

function esc(s:string){ return String(s??'').replace(/[\x00-\x1F\x7F]/g,' ').trim(); }
function line(char='-'){ return char.repeat(32); }

export async function printTicket(ticket:any):Promise<{ok:boolean;message?:string}>{
  const cfg=loadConfig();
  if(!cfg.printerEnabled) return {ok:true,message:'Stampa disattivata: simulazione completata'};
  if(!cfg.printerName) return {ok:false,message:'Nessuna stampante configurata'};

  const now=new Date().toLocaleString('it-IT');
  const body=[
    '',
    cfg.showLogo ? esc(cfg.title) : '',
    esc(cfg.subtitle),
    line('='),
    esc(ticket.departmentName||''),
    '',
    `*** ${esc(ticket.displayNumber||'')} ***`,
    '',
    cfg.showPeopleAhead && Number.isFinite(ticket.peopleAhead) ? `Persone prima di te: ${ticket.peopleAhead}` : '',
    cfg.showDateTime ? now : '',
    line(),
    esc(cfg.footer),
    cfg.showQrOnPaper && ticket.claimUrl ? `QR: ${esc(ticket.claimUrl)}` : '',
    '', '', ''
  ].filter(Boolean).join('\r\n');

  const tmp=path.join(os.tmpdir(),`eliminacode-${Date.now()}.txt`);
  fs.writeFileSync(tmp,body,'utf8');
  const copies=Math.max(1,Math.min(5,Number(cfg.ticketCopies||1)));
  try{
    for(let i=0;i<copies;i++){
      const ok=await new Promise<boolean>((resolve)=>{
        const script=`Get-Content -Raw -LiteralPath '${tmp.replaceAll("'","''")}' | Out-Printer -Name '${cfg.printerName.replaceAll("'","''")}'`;
        const ps=spawn('powershell.exe',['-NoProfile','-Command',script]);
        ps.on('close',code=>resolve(code===0));
      });
      if(!ok) return {ok:false,message:'Errore durante la stampa Windows'};
    }
    return {ok:true};
  } finally { try{fs.unlinkSync(tmp)}catch{} }
}
