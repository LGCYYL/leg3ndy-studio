"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const electron_updater_1 = require("electron-updater");
let mainWindow = null;
let pythonProcess = null;
let tray = null;
let isQuitting = false;
let minimizeToTray = true;
electron_1.app.setAppUserModelId('com.leg3ndy.studio');
// --- ARGS ---
const isHiddenStart = process.argv.includes('--hidden');
const CONFIG_PATH = electron_1.app.isPackaged
    ? path.join(electron_1.app.getPath('appData'), 'LEG3NDY Studio', 'config.json')
    : path.join(__dirname, 'backend', 'config.json');
if (electron_1.app.isPackaged) {
    const appDataDir = path.join(electron_1.app.getPath('appData'), 'LEG3NDY Studio');
    if (!fs.existsSync(appDataDir))
        fs.mkdirSync(appDataDir, { recursive: true });
}
let downloadWatcher = null;
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}
// --- WATCHER CORRIGIDO ---
const debouncedDownloadFolderChanged = debounce((eventType, filename) => {
    if (!filename)
        return;
    // IGNORA ARQUIVOS TEMPORÁRIOS
    if (filename.endsWith('.part') ||
        filename.endsWith('.ytdl') ||
        filename.endsWith('.tmp') ||
        filename.includes('.temp'))
        return;
    console.log(`[Watcher] Alteração Válida: ${filename}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-folder-changed', { eventType, filename });
    }
}, 2000);
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280, height: 850, minWidth: 1000, minHeight: 700,
        frame: false, backgroundColor: '#0b0d12',
        title: 'LEG3NDY Studio',
        icon: path.join(__dirname, 'icon-app.png'),
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js') // will be .js after compilation
        }
    });
    mainWindow.loadFile('frontend/index.html');
    mainWindow.once('ready-to-show', () => {
        if (!isHiddenStart && mainWindow)
            mainWindow.show();
        else
            console.log("Iniciando em modo Stealth");
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.on('close', (e) => {
        if (!isQuitting && minimizeToTray && mainWindow) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}
function createTray() {
    try {
        const iconPath = electron_1.app.isPackaged
            ? path.join(process.resourcesPath, 'icon-app.png')
            : path.join(__dirname, 'icon-app.png');
        tray = new electron_1.Tray(iconPath);
        const contextMenu = electron_1.Menu.buildFromTemplate([
            { label: 'Abrir LEG3NDY Studio', click: () => { if (mainWindow)
                    mainWindow.show(); } },
            { label: 'Sair', click: () => { isQuitting = true; electron_1.app.quit(); } }
        ]);
        tray.setToolTip('LEG3NDY Studio');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => { if (mainWindow)
            mainWindow.show(); });
    }
    catch (e) {
        console.log("Erro Tray:", e);
    }
}
function startPython() {
    let scriptPath;
    let cmd;
    let args;
    if (electron_1.app.isPackaged) {
        scriptPath = path.join(process.resourcesPath, 'engine', 'leg3ndy-engine.exe');
        cmd = scriptPath;
        args = [];
    }
    else {
        scriptPath = path.join(__dirname, 'backend', 'server.py');
        cmd = 'python';
        args = [scriptPath];
    }
    const spawnOptions = { windowsHide: true };
    console.log(`Iniciando Backend: ${cmd}`);
    pythonProcess = (0, child_process_1.spawn)(cmd, args, spawnOptions);
    pythonProcess.on('error', (err) => {
        console.error(`Falha ao iniciar Python: ${err}`);
    });
}
function readConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH))
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    catch (e) { }
    return { minimize_tray: true, auto_start: false, download_path: path.join(electron_1.app.getPath('home'), 'Downloads') };
}
function writeConfig(updates) {
    try {
        let config = readConfig();
        Object.assign(config, updates);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
    }
    catch (e) { }
}
function setupAutoUpdater() {
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        if (mainWindow)
            mainWindow.webContents.send('update-event', { type: 'checking' });
    });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        if (mainWindow)
            mainWindow.webContents.send('update-event', { type: 'available', info });
    });
    electron_updater_1.autoUpdater.on('update-not-available', (info) => {
        // Silencioso se não houver update
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
        if (mainWindow)
            mainWindow.webContents.send('update-event', { type: 'error', error: err.message });
    });
    electron_updater_1.autoUpdater.on('download-progress', (progressObj) => {
        if (mainWindow)
            mainWindow.webContents.send('update-event', { type: 'progress', percent: progressObj.percent });
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        if (mainWindow)
            mainWindow.webContents.send('update-event', { type: 'downloaded', version: info.version });
    });
    // Inicia a primeira checagem com um delayzinho pra dar tempo da tela carregar
    setTimeout(() => { electron_updater_1.autoUpdater.checkForUpdatesAndNotify(); }, 5000);
    // Checa a cada 50 minutos
    setInterval(() => {
        electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
    }, 50 * 60 * 1000);
}
// Inicializamos o watcher do frontend via foco da janela, não precisamos mais disso:
// ipcMain.on('config-download-path-changed', (e, newPath: string) => startDownloadFolderWatcher());
electron_1.ipcMain.on('check-for-updates-manual', () => {
    if (!electron_1.app.isPackaged && mainWindow) {
        // Modo Dev: O electron-updater ignora a verificação se o app não estiver empacotado.
        // Simulando fluxo visual para testes locais.
        mainWindow.webContents.send('update-event', { type: 'checking' });
        setTimeout(() => {
            mainWindow?.webContents.send('update-event', { type: 'error', error: 'Modo de Desenvolvimento (Atualização pulada)' });
        }, 2000);
        return;
    }
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
});
electron_1.ipcMain.on('install-update', () => {
    electron_updater_1.autoUpdater.quitAndInstall();
});
electron_1.ipcMain.handle('select-folder', async () => {
    if (!mainWindow)
        return null;
    const res = await electron_1.dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
});
electron_1.ipcMain.handle('open-path', async (e, p) => await electron_1.shell.openPath(p));
electron_1.ipcMain.handle('get-thumbnail', async (e, filePath) => {
    try {
        if (filePath.toLowerCase().endsWith('.mp4') || filePath.toLowerCase().endsWith('.mkv')) {
            const size = { width: 160, height: 90 };
            const img = await electron_1.nativeImage.createThumbnailFromPath(filePath, size);
            return img.toDataURL();
        }
    }
    catch (err) {
        console.error('[get-thumbnail] Error:', filePath, err);
    }
    return null;
});
electron_1.ipcMain.on('open-local-media', async (e, p) => {
    try {
        await electron_1.shell.openPath(p);
    }
    catch (err) {
        console.error("Erro abrir midia:", err);
    }
});
electron_1.ipcMain.on('window-min', () => { if (mainWindow)
    mainWindow.minimize(); });
electron_1.ipcMain.on('window-max', () => { if (mainWindow)
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
electron_1.ipcMain.on('window-close', () => { if (mainWindow)
    mainWindow.close(); });
electron_1.ipcMain.handle('get-settings', () => {
    const s = electron_1.app.getLoginItemSettings();
    const c = readConfig();
    return {
        openAtLogin: s.openAtLogin || c.auto_start || false,
        minimizeToTray: c.minimize_tray !== undefined ? c.minimize_tray : true
    };
});
electron_1.ipcMain.handle('get-app-version', () => {
    return electron_1.app.getVersion();
});
electron_1.ipcMain.handle('set-settings', (e, settings) => {
    if (settings.openAtLogin !== undefined) {
        const args = settings.startHidden ? ['--hidden'] : [];
        electron_1.app.setLoginItemSettings({
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
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            if (!mainWindow.isVisible())
                mainWindow.show();
            mainWindow.focus();
        }
    });
    electron_1.app.whenReady().then(() => {
        startPython();
        createWindow();
        createTray();
        minimizeToTray = readConfig().minimize_tray;
        setupAutoUpdater();
    });
}
electron_1.app.on('will-quit', () => {
    if (pythonProcess && pythonProcess.pid) {
        try {
            if (process.platform === 'win32') {
                (0, child_process_1.execSync)(`taskkill /pid ${pythonProcess.pid} /T /F`);
            }
            else {
                pythonProcess.kill();
            }
        }
        catch (e) {
            console.log(e.message);
        }
    }
});
electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    electron_1.app.quit(); });
