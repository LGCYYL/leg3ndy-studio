"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
function subscribe(channel, callback) {
    const listener = (_event, payload) => callback(payload);
    electron_1.ipcRenderer.on(channel, listener);
    return () => electron_1.ipcRenderer.removeListener(channel, listener);
}
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => electron_1.ipcRenderer.invoke('select-folder'),
    openPath: (path) => electron_1.ipcRenderer.invoke('open-path', path),
    openLocalMedia: (path) => electron_1.ipcRenderer.send('open-local-media', path),
    getThumbnail: (filePath) => electron_1.ipcRenderer.invoke('get-thumbnail', filePath),
    getRuntimeInfo: () => ({
        platform: process.platform,
        usesNativeTitleBar: process.platform === 'darwin'
    }),
    minimize: () => electron_1.ipcRenderer.send('window-min'),
    maximize: () => electron_1.ipcRenderer.send('window-max'),
    close: () => electron_1.ipcRenderer.send('window-close'),
    getSysSettings: () => electron_1.ipcRenderer.invoke('get-settings'),
    setSysSettings: (s) => electron_1.ipcRenderer.invoke('set-settings', s),
    getAppVersion: () => electron_1.ipcRenderer.invoke('get-app-version'),
    notifyDownloadPathChanged: (newPath) => electron_1.ipcRenderer.send('config-download-path-changed', newPath),
    onUpdateEvent: (callback) => subscribe('update-event', callback),
    checkForUpdatesManual: () => electron_1.ipcRenderer.send('check-for-updates-manual'),
    installUpdate: () => electron_1.ipcRenderer.send('install-update'),
    onDownloadFolderChanged: (callback) => subscribe('download-folder-changed', callback)
});
