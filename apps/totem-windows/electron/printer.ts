import {spawn} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
function sanitize(s:string){return String(s||'').replace(/[^A-Za-z0-9 .:_-]/g,' ')}
export async function printTicket(ticket:any):Promise<{ok:boolean;message?:string}>{
 if(process.env.PRINTER_ENABLED!=='1') return {ok:true,message:'DEMO: stampa simulata'};
 const printer=process.env.WINDOWS_PRINTER_NAME;if(!printer)return {ok:false,message:'WINDOWS_PRINTER_NAME non configurata'};
 const body=`\n\nELIMINACODE\n${sanitize(ticket.departmentName)}\n\n${sanitize(ticket.displayNumber)}\n\nConserva il ticket\n\n\n`;
 const tmp=path.join(os.tmpdir(),`ticket-${Date.now()}.txt`);fs.writeFileSync(tmp,body,'ascii');
 // Usa il sottosistema di stampa Windows. Per ESC/POS raw dedicato vedere PRINTER_SETUP.md.
 return await new Promise(resolve=>{const ps=spawn('powershell.exe',['-NoProfile','-Command',`Get-Content -Raw -LiteralPath '${tmp.replaceAll("'","''")}' | Out-Printer -Name '${printer.replaceAll("'","''")}'`]);let err='';ps.stderr.on('data',d=>err+=d);ps.on('close',code=>{try{fs.unlinkSync(tmp)}catch{};resolve(code===0?{ok:true}:{ok:false,message:err||`PowerShell exit ${code}`})})});
}
