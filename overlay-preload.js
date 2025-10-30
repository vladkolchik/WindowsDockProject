const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore-mouse', !!ignore),
  show: () => ipcRenderer.send('overlay:show'),
  hide: () => ipcRenderer.send('overlay:hide'),
  onClear: (cb) => ipcRenderer.on('overlay:clear', cb),
});

