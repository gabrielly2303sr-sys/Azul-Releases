const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('azul', {
  launchApp: name => ipcRenderer.invoke('apps:launch', name),
  listInstalledApps: () => ipcRenderer.invoke('apps:list-installed'),
  launchInstalledApp: appId => ipcRenderer.invoke('apps:launch-installed', appId),
  scanFocusApps: () => ipcRenderer.invoke('focus:scan'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
  notify: (title, body) => ipcRenderer.invoke('system:notify', title, body),
  openExternal: url => ipcRenderer.invoke('external:open', url),
  backupBeforeMigration: raw => ipcRenderer.invoke('storage:backup-before-migration', raw),
  importBackup: () => ipcRenderer.invoke('storage:import-backup'),
  exportBackup: serialized => ipcRenderer.invoke('storage:export-backup', serialized),
  importMapImage: () => ipcRenderer.invoke('assets:import-image')
});
