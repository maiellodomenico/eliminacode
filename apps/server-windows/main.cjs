const {app,BrowserWindow}=require('electron');
const path=require('path');
const {startServer}=require('./server.cjs');
let win;
app.whenReady().then(async()=>{
  app.setLoginItemSettings({openAtLogin:true});
  const info=await startServer();
  win=new BrowserWindow({width:1280,height:820,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  await win.loadURL(`http://127.0.0.1:${info.port}/admin`);
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
