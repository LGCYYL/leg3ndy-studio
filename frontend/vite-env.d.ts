/// <reference types="vite/client" />

interface ElectronSystemSettings {
  openAtLogin: boolean;
  minimizeToTray: boolean;
}

interface ElectronRuntimeInfo {
  platform: NodeJS.Platform;
  usesNativeTitleBar: boolean;
}

interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  openPath: (path: string) => Promise<string>;
  openLocalMedia: (path: string) => void;
  getThumbnail: (filePath: string) => Promise<string | null>;
  getRuntimeInfo: () => ElectronRuntimeInfo;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  getSysSettings: () => Promise<ElectronSystemSettings>;
  setSysSettings: (settings: Record<string, unknown>) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  notifyDownloadPathChanged: (newPath: string) => void;
  onUpdateEvent: (callback: (args: any) => void) => void | (() => void);
  checkForUpdatesManual: () => void;
  installUpdate: () => void;
  onDownloadFolderChanged: (callback: (args: any) => void) => void | (() => void);
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
