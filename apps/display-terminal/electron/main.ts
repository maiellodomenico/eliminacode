import{app,BrowserWindow,ipcMain}from'electron';
import path from'node:path';
import{fileURLToPath}from'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
let win:BrowserWindow|null=null;
function create(){
  const preloadPath=path.join(__dirname,'../electron/preload.cjs');
  win=new BrowserWindow({fullscreen:true,kiosk:true,autoHideMenuBar:true,backgroundColor:'#ffffff',webPreferences:{preload:preloadPath,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.on('did-fail-load',(_e,code,desc,url)=>console.error('[DISPLAY did-fail-load]',code,desc,url));
  win.webContents.on('render-process-gone',(_e,details)=>console.error('[DISPLAY render-process-gone]',details));
  win.loadFile(path.join(__dirname,'../dist/index.html'));
}
app.whenReady().then(()=>{
  ipcMain.handle('toggle-kiosk',()=>{if(!win)return false;const next=!win.isKiosk();win.setKiosk(next);win.setFullScreen(next);return next});
  create();
});
app.on('window-all-closed',()=>app.quit());
