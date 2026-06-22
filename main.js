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
const APP_NAME = 'LEG3NDY Studio';
const isMac = process.platform === 'darwin';
let mainWindow = null;
let pythonProcess = null;
let tray = null;
let isQuitting = false;
let minimizeToTray = true;
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const rendererIndexPath = path.join(__dirname, 'frontend', 'dist', 'index.html');
const APP_USER_MODEL_ID = electron_1.app.isPackaged ? 'com.leg3ndy.studio' : 'com.leg3ndy.studio.dev';
const isHiddenStart = process.argv.includes('--hidden');
const appDataDir = path.join(electron_1.app.getPath('appData'), APP_NAME);
const CONFIG_PATH = path.join(appDataDir, 'config.json');
electron_1.app.setAppUserModelId(APP_USER_MODEL_ID);
if (!fs.existsSync(appDataDir)) {
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
const debouncedDownloadFolderChanged = debounce((eventType, filename) => {
    if (!filename)
        return;
    if (filename.endsWith('.part') ||
        filename.endsWith('.ytdl') ||
        filename.endsWith('.tmp') ||
        filename.includes('.temp'))
        return;
    console.log(`[Watcher] Alteracao Valida: ${filename}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-folder-changed', { eventType, filename });
    }
}, 2000);
function getRuntimeAssetPath(...segments) {
    return electron_1.app.isPackaged
        ? path.join(process.resourcesPath, ...segments)
        : path.join(__dirname, ...segments);
}
function resolveFirstExistingPath(candidates) {
    return candidates.find((candidate) => fs.existsSync(candidate));
}
function getBundledExecutableCandidates(baseName) {
    const names = process.platform === 'win32'
        ? [`${baseName}.exe`, baseName]
        : [baseName, `${baseName}.exe`];
    return names.map((name) => path.join(process.resourcesPath, 'engine', name));
}
function getBundledBgutilServerHome() {
    const bundledPath = electron_1.app.isPackaged
        ? path.join(process.resourcesPath, 'engine', 'bgutil-server')
        : path.join(__dirname, 'resources_build', 'bgutil-server');
    if (fs.existsSync(bundledPath)) {
        return bundledPath;
    }
    return process.env.LEG3NDY_BGUTIL_SERVER_HOME;
}
function getAppIconPath() {
    if (process.platform === 'win32') {
        return getRuntimeAssetPath('public', 'icons', 'icon.ico');
    }
    return getRuntimeAssetPath('public', 'icons', 'icon.png');
}
function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    if (mainWindow.isMinimized())
        mainWindow.restore();
    if (!mainWindow.isVisible())
        mainWindow.show();
    mainWindow.focus();
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 1000,
        minHeight: 700,
        frame: isMac,
        titleBarStyle: isMac ? 'hiddenInset' : undefined,
        trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
        backgroundColor: '#0b0d12',
        title: APP_NAME,
        icon: getAppIconPath(),
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    if (devServerUrl) {
        mainWindow.loadURL(devServerUrl);
    }
    else {
        mainWindow.loadFile(rendererIndexPath);
    }
    mainWindow.once('ready-to-show', () => {
        if (!isHiddenStart && mainWindow) {
            mainWindow.show();
        }
        else {
            console.log('Iniciando em modo Stealth');
        }
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
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
function createTray() {
    try {
        const iconPath = getAppIconPath();
        const trayIcon = isMac
            ? electron_1.nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
            : iconPath;
        tray = new electron_1.Tray(trayIcon);
        const contextMenu = electron_1.Menu.buildFromTemplate([
            { label: 'Abrir LEG3NDY Studio', click: () => showMainWindow() },
            { label: 'Sair', click: () => { isQuitting = true; electron_1.app.quit(); } }
        ]);
        tray.setToolTip(APP_NAME);
        tray.setContextMenu(contextMenu);
        tray.on('click', () => showMainWindow());
    }
    catch (e) {
        console.log('Erro Tray:', e);
    }
}
function getDevPythonCommand() {
    return process.env.LEG3NDY_PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
}
function startPython() {
    let cmd;
    let args;
    if (electron_1.app.isPackaged) {
        const backendPath = resolveFirstExistingPath(getBundledExecutableCandidates('leg3ndy-engine'));
        if (!backendPath) {
            console.error('Nao foi possivel localizar o backend empacotado para esta plataforma.');
            return;
        }
        cmd = backendPath;
        args = [];
    }
    else {
        cmd = getDevPythonCommand();
        args = [path.join(__dirname, 'backend', 'server.py')];
    }
    const bgutilServerHome = getBundledBgutilServerHome();
    const spawnOptions = {
        windowsHide: process.platform === 'win32',
        env: {
            ...process.env,
            LEG3NDY_APP_DATA_DIR: appDataDir,
            ...(bgutilServerHome ? { LEG3NDY_BGUTIL_SERVER_HOME: bgutilServerHome } : {})
        }
    };
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
let isManualUpdateCheck = false;
function setupAutoUpdater() {
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    const emitUpdateEvent = (payload, resetManual = false) => {
        const manual = isManualUpdateCheck;
        if (mainWindow) {
            mainWindow.webContents.send('update-event', { ...payload, manual });
        }
        if (resetManual) {
            isManualUpdateCheck = false;
        }
    };
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        emitUpdateEvent({ type: 'checking' });
    });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        emitUpdateEvent({ type: 'available', info });
    });
    electron_updater_1.autoUpdater.on('update-not-available', () => {
        emitUpdateEvent({ type: 'not-available' }, true);
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
        emitUpdateEvent({ type: 'error', error: err.message }, true);
    });
    electron_updater_1.autoUpdater.on('download-progress', (progressObj) => {
        emitUpdateEvent({ type: 'progress', percent: progressObj.percent });
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        emitUpdateEvent({ type: 'downloaded', version: info.version }, true);
    });
    setTimeout(() => { electron_updater_1.autoUpdater.checkForUpdatesAndNotify(); }, 5000);
    setInterval(() => {
        electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
    }, 50 * 60 * 1000);
}
electron_1.ipcMain.on('check-for-updates-manual', () => {
    isManualUpdateCheck = true;
    if (!electron_1.app.isPackaged && mainWindow) {
        mainWindow.webContents.send('update-event', { type: 'checking', manual: true });
        setTimeout(() => {
            mainWindow?.webContents.send('update-event', { type: 'error', error: 'Modo de Desenvolvimento (Atualizacao pulada)', manual: true });
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
electron_1.ipcMain.handle('open-path', async (_e, p) => await electron_1.shell.openPath(p));
electron_1.ipcMain.handle('get-thumbnail', async (_e, filePath) => {
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
electron_1.ipcMain.on('open-local-media', async (_e, p) => {
    try {
        await electron_1.shell.openPath(p);
    }
    catch (err) {
        console.error('Erro abrir midia:', err);
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
electron_1.ipcMain.handle('set-settings', (_e, settings) => {
    if (settings.openAtLogin !== undefined) {
        const args = settings.startHidden ? ['--hidden'] : [];
        electron_1.app.setLoginItemSettings({
            openAtLogin: settings.openAtLogin,
            openAsHidden: Boolean(settings.startHidden),
            path: process.execPath,
            args
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
        showMainWindow();
    });
    electron_1.app.whenReady().then(() => {
        startPython();
        createWindow();
        createTray();
        minimizeToTray = readConfig().minimize_tray;
        setupAutoUpdater();
    });
}
electron_1.app.on('before-quit', () => {
    isQuitting = true;
});
electron_1.app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
    }
    showMainWindow();
});
electron_1.app.on('will-quit', () => {
    if (downloadWatcher) {
        downloadWatcher.close();
        downloadWatcher = null;
    }
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
electron_1.app.on('window-all-closed', () => {
    if (!isMac)
        electron_1.app.quit();
});
