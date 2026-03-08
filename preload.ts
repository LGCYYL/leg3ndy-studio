import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    openPath: (path: string) => ipcRenderer.invoke('open-path', path),
    openLocalMedia: (path: string) => ipcRenderer.send('open-local-media', path),
    getThumbnail: (filePath: string) => ipcRenderer.invoke('get-thumbnail', filePath),

    // Controles de Janela
    minimize: () => ipcRenderer.send('window-min'),
    maximize: () => ipcRenderer.send('window-max'),
    close: () => ipcRenderer.send('window-close'),

    // Configs - Expandido
    getSysSettings: () => ipcRenderer.invoke('get-settings'),
    setSysSettings: (s: any) => ipcRenderer.invoke('set-settings', s),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // NOVO: Para notificar o Electron sobre mudança de path de download
    notifyDownloadPathChanged: (newPath: string) => ipcRenderer.send('config-download-path-changed', newPath),

    // Atualizações
    onUpdateEvent: (callback: (args: any) => void) => ipcRenderer.on('update-event', (event, args) => callback(args)),
    checkForUpdatesManual: () => ipcRenderer.send('check-for-updates-manual'),
    installUpdate: () => ipcRenderer.send('install-update'),

    // NOVO: Para o frontend receber eventos de mudança na pasta de downloads
    onDownloadFolderChanged: (callback: (args: any) => void) => ipcRenderer.on('download-folder-changed', (event, args) => callback(args)),

    // NOVO: Para o frontend pedir a revalidação do histórico ao backend via Electron (opcional)
    revalidateBackendHistory: () => ipcRenderer.invoke('revalidate-backend-history')
});
