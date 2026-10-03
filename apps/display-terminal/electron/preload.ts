import{contextBridge,ipcRenderer}from'electron';contextBridge.exposeInMainWorld('displayHost',{toggleKiosk:()=>ipcRenderer.invoke('toggle-kiosk')});
