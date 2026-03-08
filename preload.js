"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => electron_1.ipcRenderer.invoke('select-folder'),
    openPath: (path) => electron_1.ipcRenderer.invoke('open-path', path),
    openLocalMedia: (path) => electron_1.ipcRenderer.send('open-local-media', path),
    getThumbnail: (filePath) => electron_1.ipcRenderer.invoke('get-thumbnail', filePath),
    // Controles de Janela
    minimize: () => electron_1.ipcRenderer.send('window-min'),
    maximize: () => electron_1.ipcRenderer.send('window-max'),
    close: () => electron_1.ipcRenderer.send('window-close'),
    // Configs - Expandido
    getSysSettings: () => electron_1.ipcRenderer.invoke('get-settings'),
    setSysSettings: (s) => electron_1.ipcRenderer.invoke('set-settings', s),
    getAppVersion: () => electron_1.ipcRenderer.invoke('get-app-version'),
    // NOVO: Para notificar o Electron sobre mudança de path de download
    notifyDownloadPathChanged: (newPath) => electron_1.ipcRenderer.send('config-download-path-changed', newPath),
    // Atualizações
    onUpdateEvent: (callback) => electron_1.ipcRenderer.on('update-event', (event, args) => callback(args)),
    checkForUpdatesManual: () => electron_1.ipcRenderer.send('check-for-updates-manual'),
    installUpdate: () => electron_1.ipcRenderer.send('install-update'),
    // NOVO: Para o frontend receber eventos de mudança na pasta de downloads
    onDownloadFolderChanged: (callback) => electron_1.ipcRenderer.on('download-folder-changed', (event, args) => callback(args)),
    // NOVO: Para o frontend pedir a revalidação do histórico ao backend via Electron (opcional)
    revalidateBackendHistory: () => electron_1.ipcRenderer.invoke('revalidate-backend-history')
});
