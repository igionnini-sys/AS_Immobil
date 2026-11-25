const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('immobilDesktop', Object.freeze({
  read: slot => ipcRenderer.invoke('archive:read', slot),
  write: (slot, contents) => ipcRenderer.invoke('archive:write', slot, contents),
  exportFile: contents => ipcRenderer.invoke('archive:export', contents),
  applicationReady: () => ipcRenderer.send('app:renderer-ready'),
  onBeforeClose: callback => {
    const listener = () => { Promise.resolve().then(callback).then(ok => ipcRenderer.send('archive:close-ready', ok), () => ipcRenderer.send('archive:close-ready', false)); };
    ipcRenderer.on('archive:before-close', listener);
    return () => ipcRenderer.removeListener('archive:before-close', listener);
  },
}));
