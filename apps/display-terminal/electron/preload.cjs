const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('displayHost', {
  toggleKiosk: () => ipcRenderer.invoke('toggle-kiosk')
});
