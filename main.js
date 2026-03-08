const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
let mainWindow;
let pythonProcess;
let tray = null;
let isQuitting = false;
let minimizeToTray = true;

app.setAppUserModelId('com.leg3ndy.studio');

// --- ARGS ---
const isHiddenStart = process.argv.includes('--hidden');

const CONFIG_PATH = app.isPackaged 
    ? path.join(app.getPath('appData'), 'LEG3NDY Studio', 'config.json')
    : path.join(__dirname, 'backend', 'config.json');

if (app.isPackaged) {
    const appDataDir = path.join(app.getPath('appData'), 'LEG3NDY Studio');
    if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });
}

let downloadWatcher = null;

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- WATCHER CORRIGIDO ---
const debouncedDownloadFolderChanged = debounce((eventType, filename) => {
    if (!filename) return;
    
    // IGNORA ARQUIVOS TEMPORÁRIOS
    if (filename.endsWith('.part') || 
        filename.endsWith('.ytdl') || 
        filename.endsWith('.tmp') ||
        filename.includes('.temp')) return;
        
    console.log(`[Watcher] Alteração Válida: ${filename}`);
    if (mainWindow) mainWindow.webContents.send('download-folder-changed', { eventType, filename });
}, 2000);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280, height: 850, minWidth: 1000, minHeight: 700,
        frame: false, backgroundColor: '#0b0d12',
        title: 'LEG3NDY Studio',
        icon: path.join(__dirname, 'icon-app.png'), 
        show: false, 
        webPreferences: {
            nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('frontend/index.html');

    mainWindow.once('ready-to-show', () => {
        if (!isHiddenStart) mainWindow.show();
        else console.log("Iniciando em modo Stealth");
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('close', (e) => {
        if (!isQuitting && minimizeToTray) {
            e.preventDefault();
            mainWindow.hide();
            return false;
        }
    });
}

function createTray() {
    try {
        const iconPath = app.isPackaged 
            ? path.join(process.resourcesPath, 'icon-app.png')
            : path.join(__dirname, 'icon-app.png');

        tray = new Tray(iconPath); 
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Abrir LEG3NDY Studio', click: () => mainWindow.show() },
            { label: 'Sair', click: () => { isQuitting = true; app.quit(); }}
        ]);
        tray.setToolTip('LEG3NDY Studio');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => mainWindow.show());
    } catch (e) { console.log("Erro Tray:", e); }
}

function startPython() {
    let scriptPath;
    let cmd;
    let args;

    if (app.isPackaged) {
        scriptPath = path.join(process.resourcesPath, 'engine', 'leg3ndy-engine.exe');
        cmd = scriptPath;
        args = [];
    } else {
        scriptPath = path.join(__dirname, 'backend', 'server.py');
        cmd = 'python';
        args = [scriptPath];
    }
    const spawnOptions = { windowsHide: true };
    console.log(`Iniciando Backend: ${cmd}`);
    pythonProcess = spawn(cmd, args, spawnOptions);
}

function readConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {}
    return { minimize_tray: true, auto_start: false, download_path: path.join(app.getPath('home'), 'Downloads') };
}

function writeConfig(updates) {
    try {
        let config = readConfig();
        Object.assign(config, updates);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
    } catch (e) {}
}

function startDownloadFolderWatcher() {
    if (downloadWatcher) downloadWatcher.close();
    const config = readConfig();
    const dp = config.download_path;
    if (dp && fs.existsSync(dp)) {
        downloadWatcher = fs.watch(dp, { recursive: false }, (eventType, filename) => {
            debouncedDownloadFolderChanged(eventType, filename);
        });
    }
}

ipcMain.handle('select-folder', async () => {
    const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle('open-path', async (e, p) => await shell.openPath(p));
ipcMain.on('window-min', () => mainWindow.minimize());
ipcMain.on('window-max', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());

ipcMain.handle('get-settings', () => {
    const s = app.getLoginItemSettings();
    const c = readConfig();
    return { 
        openAtLogin: s.openAtLogin || c.auto_start || false, 
        minimizeToTray: c.minimize_tray !== undefined ? c.minimize_tray : true 
    };
});

ipcMain.handle('set-settings', (e, settings) => {
    if (settings.openAtLogin !== undefined) {
        const args = settings.startHidden ? ['--hidden'] : [];
        app.setLoginItemSettings({
            openAtLogin: settings.openAtLogin,
            path: process.execPath,
            args: args
        });
        writeConfig({ auto_start: settings.openAtLogin, start_minimized: settings.startHidden });
    }
    if (settings.minimizeToTray !== undefined) {
        minimizeToTray = settings.minimizeToTray;
        writeConfig({ minimize_tray: settings.minimizeToTray });
    }
    return true;
});

ipcMain.on('config-download-path-changed', (e, newPath) => startDownloadFolderWatcher());

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        startPython();
        createWindow();
        createTray();
        minimizeToTray = readConfig().minimize_tray;
        startDownloadFolderWatcher();
    });
}

app.on('will-quit', () => {
    if (downloadWatcher) downloadWatcher.close();
    if (pythonProcess) {
        try {
            if (process.platform === 'win32') {
                execSync(`taskkill /pid ${pythonProcess.pid} /T /F`);
            } else {
                pythonProcess.kill();
            }
        } catch (e) { console.log(e.message); }
    }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });