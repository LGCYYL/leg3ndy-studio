import { contextBridge, ipcRenderer } from 'electron';

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    openPath: (path: string) => ipcRenderer.invoke('open-path', path),
    openLocalMedia: (path: string) => ipcRenderer.send('open-local-media', path),
    getThumbnail: (filePath: string) => ipcRenderer.invoke('get-thumbnail', filePath),
    getRuntimeInfo: () => ({
        platform: process.platform,
        usesNativeTitleBar: process.platform === 'darwin'
    }),

    minimize: () => ipcRenderer.send('window-min'),
    maximize: () => ipcRenderer.send('window-max'),
    close: () => ipcRenderer.send('window-close'),

    getSysSettings: () => ipcRenderer.invoke('get-settings'),
    setSysSettings: (s: any) => ipcRenderer.invoke('set-settings', s),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    notifyDownloadPathChanged: (newPath: string) => ipcRenderer.send('config-download-path-changed', newPath),

    onUpdateEvent: (callback: (args: any) => void) => subscribe('update-event', callback),
    checkForUpdatesManual: () => ipcRenderer.send('check-for-updates-manual'),
    installUpdate: () => ipcRenderer.send('install-update'),

    onDownloadFolderChanged: (callback: (args: any) => void) => subscribe('download-folder-changed', callback)
});
