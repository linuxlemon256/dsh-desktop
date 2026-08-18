const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__dshDesktop__', {
  get: () => ipcRenderer.invoke('settings:get'),
  setPort: (port) => ipcRenderer.invoke('settings:set', port),
  scanPorts: (start, end) => ipcRenderer.invoke('ports:scan', start, end),
  identify: (port) => ipcRenderer.invoke('ports:identify', port),
  restart: () => ipcRenderer.invoke('dsh:restart'),
});
