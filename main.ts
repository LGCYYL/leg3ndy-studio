import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, execSync, ChildProcess } from 'child_process';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let minimizeToTray = true;

app.setAppUserModelId('com.leg3ndy.studio');

// --- ARGS ---
const isHiddenStart = process.argv.includes('--hidden');

const CONFIG_PATH = path.join(app.getPath('appData'), 'LEG3NDY Studio', 'config.json');

const appDataDir = path.join(app.getPath('appData'), 'LEG3NDY Studio');
if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });

let downloadWatcher: fs.FSWatcher | null = null;

function debounce<T extends (...args: any[]) => void>(func: T, delay: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return function (this: any, ...args: Parameters<T>) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- WATCHER CORRIGIDO ---
const debouncedDownloadFolderChanged = debounce((eventType: string, filename: string | null) => {
    if (!filename) return;

    // IGNORA ARQUIVOS TEMPORÁRIOS
    if (filename.endsWith('.part') ||
        filename.endsWith('.ytdl') ||
        filename.endsWith('.tmp') ||
        filename.includes('.temp')) return;

    console.log(`[Watcher] Alteração Válida: ${filename}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-folder-changed', { eventType, filename });
    }
}, 2000);

function createWindow() {
    mainWindow = new BrowserWindow({
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
        if (!isHiddenStart && mainWindow) mainWindow.show();
        else console.log("Iniciando em modo Stealth");
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
}

function createTray() {
    try {
        const iconPath = app.isPackaged
            ? path.join(process.resourcesPath, 'icon-app.png')
            : path.join(__dirname, 'icon-app.png');

        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Abrir LEG3NDY Studio', click: () => { if (mainWindow) mainWindow.show(); } },
            { label: 'Sair', click: () => { isQuitting = true; app.quit(); } }
        ]);
        tray.setToolTip('LEG3NDY Studio');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => { if (mainWindow) mainWindow.show(); });
    } catch (e) { console.log("Erro Tray:", e); }
}

function startPython() {
    let scriptPath: string;
    let cmd: string;
    let args: string[];

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

    autoUpdater.on('checking-for-update', () => {
        if (mainWindow) mainWindow.webContents.send('update-event', { type: 'checking', manual: isManualUpdateCheck });
    });

    autoUpdater.on('update-available', (info) => {
        if (mainWindow) mainWindow.webContents.send('update-event', { type: 'available', info });
        isManualUpdateCheck = false;
    });

    autoUpdater.on('update-not-available', (info) => {
        if (mainWindow) {
            // Silencioso se não houver update e foi auto. Se manual, avisa:
            if (isManualUpdateCheck) mainWindow.webContents.send('update-event', { type: 'not-available' });
        }
        isManualUpdateCheck = false;
    });

    autoUpdater.on('error', (err) => {
        if (mainWindow) mainWindow.webContents.send('update-event', { type: 'error', error: err.message, manual: isManualUpdateCheck });
        isManualUpdateCheck = false;
    });

    autoUpdater.on('download-progress', (progressObj) => {
        if (mainWindow) mainWindow.webContents.send('update-event', { type: 'progress', percent: progressObj.percent });
    });

    autoUpdater.on('update-downloaded', (info) => {
        if (mainWindow) mainWindow.webContents.send('update-event', { type: 'downloaded', version: info.version });
    });

    // Inicia a primeira checagem com um delayzinho pra dar tempo da tela carregar
    setTimeout(() => { autoUpdater.checkForUpdatesAndNotify(); }, 5000);

    // Checa a cada 50 minutos
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 50 * 60 * 1000);
}

// Inicializamos o watcher do frontend via foco da janela, não precisamos mais disso:
// ipcMain.on('config-download-path-changed', (e, newPath: string) => startDownloadFolderWatcher());

ipcMain.on('check-for-updates-manual', () => {
    isManualUpdateCheck = true;
    if (!app.isPackaged && mainWindow) {
        // Modo Dev: O electron-updater ignora a verificação se o app não estiver empacotado.
        // Simulando fluxo visual para testes locais.
        mainWindow.webContents.send('update-event', { type: 'checking', manual: true });
        setTimeout(() => {
            mainWindow?.webContents.send('update-event', { type: 'error', error: 'Modo de Desenvolvimento (Atualização pulada)', manual: true });
        }, 2000);
        return;
    }
    autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle('open-path', async (e, p: string) => await shell.openPath(p));
ipcMain.handle('get-thumbnail', async (e, filePath: string) => {
    try {
        if (filePath.toLowerCase().endsWith('.mp4') || filePath.toLowerCase().endsWith('.mkv')) {
            const size = { width: 160, height: 90 };
            const img = await nativeImage.createThumbnailFromPath(filePath, size);
            return img.toDataURL();
        }
    } catch (err) { console.error('[get-thumbnail] Error:', filePath, err); }
    return null;
});
ipcMain.on('open-local-media', async (e, p: string) => {
    try {
        await shell.openPath(p);
    } catch (err) {
        console.error("Erro abrir midia:", err);
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

ipcMain.handle('set-settings', (e, settings: any) => {
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
        setupAutoUpdater();
    });
}

app.on('will-quit', () => {
    if (pythonProcess && pythonProcess.pid) {
        try {
            if (process.platform === 'win32') {
                execSync(`taskkill /pid ${pythonProcess.pid} /T /F`);
            } else {
                pythonProcess.kill();
            }
        } catch (e: any) { console.log(e.message); }
    }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
