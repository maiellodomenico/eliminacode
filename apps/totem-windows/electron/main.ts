import {app,BrowserWindow,ipcMain} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {printTicket} from './printer.js';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
function createWindow(){const win=new BrowserWindow({fullscreen:process.env.KIOSK_FULLSCREEN!=='0',kiosk:process.env.KIOSK_MODE!=='0',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});if(process.env.VITE_DEV_SERVER_URL)win.loadURL(process.env.VITE_DEV_SERVER_URL);else win.loadFile(path.join(__dirname,'../dist/index.html'));}
app.whenReady().then(()=>{ipcMain.handle('print-ticket',(_e,t)=>printTicket(t));ipcMain.handle('get-config',()=>({stationId:process.env.STATION_ID||'TOTEM-001'}));createWindow();});
app.on('window-all-closed',()=>app.quit());
