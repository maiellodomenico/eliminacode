import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('kiosk',{printTicket:(ticket:any)=>ipcRenderer.invoke('print-ticket',ticket),getConfig:()=>ipcRenderer.invoke('get-config')});
