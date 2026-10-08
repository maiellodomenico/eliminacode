const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('host',Object.freeze({
 openRole:url=>ipcRenderer.invoke('open-role',url),
 printers:()=>ipcRenderer.invoke('list-printers'),
 printerSettings:()=>ipcRenderer.invoke('printer-settings'),
 printTicket:ticket=>ipcRenderer.invoke('print-ticket',ticket),
 testPrint:()=>ipcRenderer.invoke('test-print'),
 loginSettings:()=>ipcRenderer.invoke('login-settings'),
 setAutoStart:value=>ipcRenderer.invoke('set-auto-start',value)
}));
