import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, execSync, ChildProcess } from 'child_process';
import { autoUpdater } from 'electron-updater';

const APP_NAME = 'LEG3NDY Studio';
const isMac = process.platform === 'darwin';

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let minimizeToTray = true;
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const rendererIndexPath = path.join(__dirname, 'frontend', 'dist', 'index.html');
const APP_USER_MODEL_ID = app.isPackaged ? 'com.leg3ndy.studio' : 'com.leg3ndy.studio.dev';
const isHiddenStart = process.argv.includes('--hidden');
const appDataDir = path.join(app.getPath('appData'), APP_NAME);
const CONFIG_PATH = path.join(appDataDir, 'config.json');

app.setAppUserModelId(APP_USER_MODEL_ID);

if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
}

let downloadWatcher: fs.FSWatcher | null = null;

function debounce<T extends (...args: any[]) => void>(func: T, delay: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return function (this: any, ...args: Parameters<T>) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

const debouncedDownloadFolderChanged = debounce((eventType: string, filename: string | null) => {
    if (!filename) return;

    if (filename.endsWith('.part') ||
        filename.endsWith('.ytdl') ||
        filename.endsWith('.tmp') ||
        filename.includes('.temp')) return;

    console.log(`[Watcher] Alteracao Valida: ${filename}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-folder-changed', { eventType, filename });
    }
}, 2000);

function getRuntimeAssetPath(...segments: string[]) {
    return app.isPackaged
        ? path.join(process.resourcesPath, ...segments)
        : path.join(__dirname, ...segments);
}

function resolveFirstExistingPath(candidates: string[]) {
    return candidates.find((candidate) => fs.existsSync(candidate));
}

function getBundledExecutableCandidates(baseName: string) {
    const names = process.platform === 'win32'
        ? [`${baseName}.exe`, baseName]
        : [baseName, `${baseName}.exe`];
    return names.map((name) => path.join(process.resourcesPath, 'engine', name));
}

function getBundledBgutilServerHome() {
    const bundledPath = app.isPackaged
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
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
}

function createWindow() {
    mainWindow = new BrowserWindow({
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
    } else {
        mainWindow.loadFile(rendererIndexPath);
    }

    mainWindow.once('ready-to-show', () => {
        if (!isHiddenStart && mainWindow) {
            mainWindow.show();
        } else {
            console.log('Iniciando em modo Stealth');
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('close', (e: Electron.Event) => {
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
            ? nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
            : iconPath;

        tray = new Tray(trayIcon);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Abrir LEG3NDY Studio', click: () => showMainWindow() },
            { label: 'Sair', click: () => { isQuitting = true; app.quit(); } }
        ]);
        tray.setToolTip(APP_NAME);
        tray.setContextMenu(contextMenu);
        tray.on('click', () => showMainWindow());
    } catch (e) {
        console.log('Erro Tray:', e);
    }
}

function getDevPythonCommand() {
    return process.env.LEG3NDY_PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
}

function startPython() {
    let cmd: string;
    let args: string[];

    if (app.isPackaged) {
        const backendPath = resolveFirstExistingPath(getBundledExecutableCandidates('leg3ndy-engine'));
        if (!backendPath) {
            console.error('Nao foi possivel localizar o backend empacotado para esta plataforma.');
            return;
        }
        cmd = backendPath;
        args = [];
    } else {
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
    pythonProcess = spawn(cmd, args, spawnOptions);

    pythonProcess.on('error', (err) => {
        console.error(`Falha ao iniciar Python: ${err}`);
    });
}

function readConfig(): any {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) { }
    return { minimize_tray: true, auto_start: false, download_path: path.join(app.getPath('home'), 'Downloads') };
}

function writeConfig(updates: any) {
    try {
        let config = readConfig();
        Object.assign(config, updates);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
    } catch (e) { }
}

let isManualUpdateCheck = false;

function setupAutoUpdater() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.disableDifferentialDownload = true;

    const emitUpdateEvent = (payload: Record<string, unknown>, resetManual = false) => {
        const manual = isManualUpdateCheck;
        if (mainWindow) {
            mainWindow.webContents.send('update-event', { ...payload, manual });
        }
        if (resetManual) {
            isManualUpdateCheck = false;
        }
    };

    autoUpdater.on('checking-for-update', () => {
        emitUpdateEvent({ type: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        emitUpdateEvent({ type: 'available', info });
    });

    autoUpdater.on('update-not-available', () => {
        emitUpdateEvent({ type: 'not-available' }, true);
    });

    autoUpdater.on('error', (err) => {
        emitUpdateEvent({ type: 'error', error: err.message }, true);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        emitUpdateEvent({ type: 'progress', percent: progressObj.percent });
    });

    autoUpdater.on('update-downloaded', (info) => {
        emitUpdateEvent({ type: 'downloaded', version: info.version }, true);
    });

    setTimeout(() => { autoUpdater.checkForUpdatesAndNotify(); }, 5000);
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 50 * 60 * 1000);
}

ipcMain.on('check-for-updates-manual', () => {
    isManualUpdateCheck = true;
    if (!app.isPackaged && mainWindow) {
        mainWindow.webContents.send('update-event', { type: 'checking', manual: true });
        setTimeout(() => {
            mainWindow?.webContents.send('update-event', { type: 'error', error: 'Modo de Desenvolvimento (Atualizacao pulada)', manual: true });
        }, 2000);
        return;
    }
    autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on('install-update', () => {
    if (process.platform === 'win32') {
        autoUpdater.quitAndInstall(true, true);
        return;
    }

    autoUpdater.quitAndInstall();
});

ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('open-path', async (_e, p: string) => await shell.openPath(p));

ipcMain.handle('get-thumbnail', async (_e, filePath: string) => {
    try {
        if (filePath.toLowerCase().endsWith('.mp4') || filePath.toLowerCase().endsWith('.mkv')) {
            const size = { width: 160, height: 90 };
            const img = await nativeImage.createThumbnailFromPath(filePath, size);
            return img.toDataURL();
        }
    } catch (err) {
        console.error('[get-thumbnail] Error:', filePath, err);
    }
    return null;
});

ipcMain.on('open-local-media', async (_e, p: string) => {
    try {
        await shell.openPath(p);
    } catch (err) {
        console.error('Erro abrir midia:', err);
    }
});

ipcMain.on('window-min', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-max', () => { if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

ipcMain.handle('get-settings', () => {
    const s = app.getLoginItemSettings();
    const c = readConfig();
    return {
        openAtLogin: s.openAtLogin || c.auto_start || false,
        minimizeToTray: c.minimize_tray !== undefined ? c.minimize_tray : true
    };
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('set-settings', (_e, settings: any) => {
    if (settings.openAtLogin !== undefined) {
        const args = settings.startHidden ? ['--hidden'] : [];
        app.setLoginItemSettings({
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

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        showMainWindow();
    });

    app.whenReady().then(() => {
        startPython();
        createWindow();
        createTray();
        minimizeToTray = readConfig().minimize_tray;
        setupAutoUpdater();
    });
}

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
    }
    showMainWindow();
});

app.on('will-quit', () => {
    if (downloadWatcher) {
        downloadWatcher.close();
        downloadWatcher = null;
    }
    if (pythonProcess && pythonProcess.pid) {
        try {
            if (process.platform === 'win32') {
                execSync(`taskkill /pid ${pythonProcess.pid} /T /F`);
            } else {
                pythonProcess.kill();
            }
        } catch (e: any) {
            console.log(e.message);
        }
    }
});

app.on('window-all-closed', () => {
    if (!isMac) app.quit();
});
