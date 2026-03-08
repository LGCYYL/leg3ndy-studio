const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    
    // Controles de Janela
    minimize: () => ipcRenderer.send('window-min'),
    maximize: () => ipcRenderer.send('window-max'),
    close: () => ipcRenderer.send('window-close'),
    
    // Configs - Expandido
    getSysSettings: () => ipcRenderer.invoke('get-settings'),
    setSysSettings: (s) => ipcRenderer.invoke('set-settings', s),

    // NOVO: Para notificar o Electron sobre mudança de path de download
    notifyDownloadPathChanged: (newPath) => ipcRenderer.send('config-download-path-changed', newPath),

    // NOVO: Para o frontend receber eventos de mudança na pasta de downloads
    onDownloadFolderChanged: (callback) => ipcRenderer.on('download-folder-changed', (event, args) => callback(args)),
    
    // NOVO: Para o frontend pedir a revalidação do histórico ao backend via Electron (opcional)
    revalidateBackendHistory: () => ipcRenderer.invoke('revalidate-backend-history')
});