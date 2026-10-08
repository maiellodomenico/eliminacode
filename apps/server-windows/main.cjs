const { app, BrowserWindow, dialog, ipcMain, shell, Menu, Tray, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
let win, tray, info, quitting=false, logFile, printing=false;
const roleWindows = new Set();
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
function log(...parts){try{if(logFile)fs.appendFileSync(logFile,`[${new Date().toISOString()}] ${parts.map(x=>x instanceof Error?x.stack:String(x)).join(' ')}\n`);}catch{}}
function showAdmin(){if(!info)return;if(win){win.show();win.focus();}else createAdmin();}
app.on('second-instance',showAdmin);
process.on('uncaughtException',err=>{log('UNCAUGHT',err);dialog.showErrorBox('Eliminacode · errore',`${err.message}\nLog: ${logFile||''}`);});
process.on('unhandledRejection',err=>log('REJECTION',err));
const escape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function trusted(event){const u=new URL(event.sender.getURL());return u.origin===`http://127.0.0.1:${info.port}`;}
async function requireAdmin(event){if(!trusted(event)||event.sender!==win?.webContents)throw new Error('Operazione amministratore non autorizzata');const cookies=await event.sender.session.cookies.get({url:`http://127.0.0.1:${info.port}`,name:'ec_session'});if(!cookies.some(c=>info.adminSession(c.value)))throw new Error('Accedi come amministratore');}
function guardWindow(window){window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==`http://127.0.0.1:${info.port}`)event.preventDefault();});window.webContents.on('did-fail-load',(_e,code,desc,url)=>log('LOAD ERROR',code,desc,url));}
function createAdmin(){
 win=new BrowserWindow({width:1360,height:900,minWidth:760,minHeight:560,backgroundColor:'#f4f7f5',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setMenu(null);guardWindow(win);win.loadURL(`http://127.0.0.1:${info.port}/admin`).catch(err=>log(err));
 win.on('close',event=>{if(!quitting){event.preventDefault();win.hide();}});win.on('closed',()=>{win=null;});
}
async function print(data){
 if(printing)return {ok:false,message:'Una stampa è già in corso. Attendi.'};
 const config=info.printer();
 if(!config.enabled||!config.name)return {ok:false,message:'Stampa non configurata. Il ticket è valido: usa il QR oppure chiedi al personale di configurare la stampante.'};
 printing=true;let printWindow;
 try{
  printWindow=new BrowserWindow({show:false,width:400,height:800,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  const printers=await printWindow.webContents.getPrintersAsync();if(!printers.some(p=>p.name===config.name))throw new Error('La stampante configurata non è disponibile');
  const html=`<!doctype html><meta charset="utf-8"><style>@page{margin:2mm}*{box-sizing:border-box}body{margin:0;width:${config.width-4}mm;text-align:center;font:14px Arial;color:#000}h1{font-size:18px;margin:8px 0}h2{font-size:18px;margin:8px 0}.number{font-size:${config.width===58?54:72}px;font-weight:900;margin:12px 0}img{width:${config.width===58?38:45}mm;height:auto}p{font-size:12px;margin:8px 0}.line{border-top:1px dashed #000;margin:10px 0}</style><h1>${escape(data.shopName)}</h1><h2>${escape(data.departmentName)}</h2><div class="number">${escape(data.number)}</div><p>${data.peopleAhead} persone prima di te</p><div class="line"></div><img src="${data.qrDataUrl}" alt="QR"><p>Scansiona per seguire il tuo turno</p><p>${escape(new Date(data.createdAt).toLocaleString('it-IT'))}</p><div class="line"></div><p>Conserva il ticket e attendi la chiamata</p>`;
  await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  const height=await printWindow.webContents.executeJavaScript(`Promise.all(Array.from(document.images).map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r;}))).then(()=>Math.ceil(document.body.scrollHeight*25.4/96)+8)`);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Stampante senza risposta entro 20 secondi')),20000);printWindow.webContents.print({silent:true,printBackground:true,deviceName:config.name,pageSize:{width:config.width*1000,height:Math.max(100000,height*1000)},margins:{marginType:'none'}},(ok,reason)=>{clearTimeout(timer);ok?resolve():reject(new Error(reason||'Il driver non ha accettato la stampa'));});});
  return {ok:true,message:'Ticket inviato alla stampante. Ritiralo sotto lo schermo.'};
 }catch(err){log('PRINT ERROR',err);return {ok:false,message:err.message};}finally{printWindow?.destroy();printing=false;}
}
function registerIPC(){
 ipcMain.handle('open-role',async(event,url)=>{await requireAdmin(event);const parsed=new URL(url);if(!['/totem','/operator','/display'].includes(parsed.pathname)||!/^[0-9]{8}$/.test(parsed.searchParams.get('code')||''))throw new Error('Collegamento postazione non valido');const role=parsed.pathname.slice(1),code=parsed.searchParams.get('code');const child=new BrowserWindow({width:1280,height:900,autoHideMenuBar:true,fullscreen:role!=='operator',webPreferences:{partition:'persist:ec-'+role+'-'+code,preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});roleWindows.add(child);child.setMenu(null);guardWindow(child);child.on('closed',()=>roleWindows.delete(child));await child.loadURL(`http://127.0.0.1:${info.port}${parsed.pathname}?code=${code}`);return true;});
 ipcMain.handle('list-printers',async event=>{await requireAdmin(event);return event.sender.getPrintersAsync();});
 ipcMain.handle('printer-settings',async event=>{await requireAdmin(event);await shell.openExternal('ms-settings:printers');return true;});
 ipcMain.handle('print-ticket',async(event,{ticketId,auth})=>{if(!trusted(event)||!info.deviceFor(auth?.deviceId,auth?.deviceKey,'totem'))throw new Error('Postazione non autorizzata');return print(await info.printable(ticketId,auth.deviceId));});
 ipcMain.handle('test-print',async event=>{await requireAdmin(event);const qr=await require('qrcode').toDataURL(`http://127.0.0.1:${info.port}/admin`);return print({shopName:'ELIMINACODE · PROVA STAMPA',departmentName:'Test configurazione',number:'TEST',peopleAhead:0,createdAt:new Date().toISOString(),qrDataUrl:qr});});
 ipcMain.handle('login-settings',async event=>{await requireAdmin(event);return app.getLoginItemSettings().openAtLogin;});
 ipcMain.handle('set-auto-start',async(event,value)=>{await requireAdmin(event);if(process.env.PORTABLE_EXECUTABLE_FILE)throw new Error('Installa la versione Setup per l’avvio automatico con Windows');app.setLoginItemSettings({openAtLogin:!!value,args:['--hidden']});return true;});
}
if(primaryInstance)app.whenReady().then(async()=>{
 const smoke=process.argv.includes('--smoke-test');
 const dataDir=process.env.ELIMINACODE_DATA_DIR||app.getPath('userData');fs.mkdirSync(dataDir,{recursive:true});logFile=path.join(dataDir,'bootstrap.log');
 try{
  info=await require('./server.cjs').startServer({dataDir,port:smoke?0:undefined,host:smoke?'127.0.0.1':undefined});log('SERVER READY',info.port);
  if(smoke){
    const health=await (await fetch(`http://127.0.0.1:${info.port}/api/health`)).json();if(!health.ok)throw new Error('Health check failed');
    const probe=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await probe.loadURL(`http://127.0.0.1:${info.port}/admin`);
    let rendered=false;for(let attempt=0;attempt<40;attempt++){if(await probe.webContents.executeJavaScript("document.body.innerText.includes('Configura il tuo negozio')")){rendered=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}
    probe.destroy();if(!rendered)throw new Error('Packaged administrator page did not render');
    await info.close();info=null;fs.writeFileSync(path.join(dataDir,'smoke-ok.txt'),'Eliminacode 1.1.0 · packaged Electron + SQLite + administrator rendering OK');app.exit(0);return;
  }
  Menu.setApplicationMenu(null);registerIPC();
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'assets','icon.png')));tray.setToolTip('Eliminacode Server · attivo');tray.setContextMenu(Menu.buildFromTemplate([{label:'Apri amministrazione',click:showAdmin},{label:'Server attivo · porta '+info.port,enabled:false},{type:'separator'},{label:'Arresta server',click:()=>{dialog.showMessageBox(win,{type:'question',buttons:['Annulla','Arresta'],defaultId:0,cancelId:0,message:'Arrestare il server?',detail:'Totem, tablet e display non potranno più gestire le code.'}).then(({response})=>{if(response===1){quitting=true;app.quit();}});}}]));tray.on('double-click',showAdmin);createAdmin();if(process.argv.includes('--hidden'))win.hide();
 }catch(err){log('STARTUP ERROR',err);if(!smoke)dialog.showErrorBox('Eliminacode · avvio non riuscito',`${err.code==='EADDRINUSE'?'La porta è già occupata da un altro programma. Chiudi la vecchia versione di Eliminacode.':err.message}\n\nLog: ${logFile}`);app.exit(1);}
});
let closing=false;
app.on('before-quit',event=>{quitting=true;if(info&&!closing){event.preventDefault();closing=true;for(const w of roleWindows)w.destroy();info.close().catch(log).finally(()=>{info=null;app.quit();});}});
app.on('window-all-closed',()=>{});
