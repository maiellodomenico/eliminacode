import {app,BrowserWindow,ipcMain,shell} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {printTicket} from './printer.js';
import {loadConfig,saveConfig} from './config.js';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
let mainWindow:BrowserWindow|null=null;
function createWindow(){
  const preloadPath=path.join(__dirname,'../electron/preload.cjs');
  mainWindow=new BrowserWindow({fullscreen:true,kiosk:true,autoHideMenuBar:true,backgroundColor:'#ffffff',webPreferences:{preload:preloadPath,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  mainWindow.webContents.on('did-fail-load',(_e,code,desc,url)=>console.error('[TOTEM did-fail-load]',code,desc,url));
  mainWindow.webContents.on('render-process-gone',(_e,details)=>console.error('[TOTEM render-process-gone]',details));
  if(process.env.VITE_DEV_SERVER_URL)mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);else mainWindow.loadFile(path.join(__dirname,'../dist/index.html'));
}
app.whenReady().then(()=>{
  ipcMain.handle('print-ticket',(_e,t)=>printTicket(t));
  ipcMain.handle('get-config',()=>loadConfig());
  ipcMain.handle('save-config',(_e,c)=>saveConfig(c));
  ipcMain.handle('list-printers',async()=>{
    const printers=await mainWindow?.webContents.getPrintersAsync();
    return printers?.map(p=>({name:p.name,displayName:p.displayName}))||[];
  });
  ipcMain.handle('open-printer-settings',()=>shell.openExternal('ms-settings:printers'));
  ipcMain.handle('test-print',()=>printTicket({departmentName:'TEST STAMPANTE',displayNumber:'A001',peopleAhead:2,claimUrl:'https://eliminacode.test'}));
  ipcMain.handle('exit-kiosk',()=>{mainWindow?.setKiosk(false);mainWindow?.setFullScreen(false);return true});
  ipcMain.handle('enter-kiosk',()=>{mainWindow?.setFullScreen(true);mainWindow?.setKiosk(true);return true});
  createWindow();
});
app.on('window-all-closed',()=>app.quit());
