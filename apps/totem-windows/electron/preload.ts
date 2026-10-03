import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('kiosk',{
  printTicket:(ticket:any)=>ipcRenderer.invoke('print-ticket',ticket),
  getConfig:()=>ipcRenderer.invoke('get-config'),
  saveConfig:(c:any)=>ipcRenderer.invoke('save-config',c),
  listPrinters:()=>ipcRenderer.invoke('list-printers'),
  openPrinterSettings:()=>ipcRenderer.invoke('open-printer-settings'),
  testPrint:()=>ipcRenderer.invoke('test-print'),
  exitKiosk:()=>ipcRenderer.invoke('exit-kiosk'),
  enterKiosk:()=>ipcRenderer.invoke('enter-kiosk')
});
