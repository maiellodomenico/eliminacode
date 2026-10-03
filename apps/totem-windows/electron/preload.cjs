const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kiosk', {
  printTicket: (ticket) => ipcRenderer.invoke('print-ticket', ticket),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (c) => ipcRenderer.invoke('save-config', c),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  openPrinterSettings: () => ipcRenderer.invoke('open-printer-settings'),
  testPrint: () => ipcRenderer.invoke('test-print'),
  exitKiosk: () => ipcRenderer.invoke('exit-kiosk'),
  enterKiosk: () => ipcRenderer.invoke('enter-kiosk')
});
