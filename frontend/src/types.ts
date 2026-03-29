export type ViewName = 'home' | 'queue' | 'history' | 'settings';
export type MediaMode = 'video' | 'audio';
export type QueueStatus = 'pending' | 'starting' | 'downloading' | 'done' | 'error';
export type SortBy = 'date' | 'size' | 'name' | 'type';

export interface SystemSettings {
  openAtLogin: boolean;
  minimizeToTray: boolean;
}

export interface AppConfig {
  download_path: string;
  auto_start: boolean;
  start_minimized: boolean;
  minimize_tray: boolean;
}

export interface FormatOption {
  format_id: string;
  quality: string;
  filesize: string;
  filesize_bytes: number;
  type: MediaMode;
  restricted?: boolean;
  restriction_reason?: string;
}

export interface PlaylistEntry {
  id: string;
  title: string;
  duration?: string;
  thumbnail?: string;
  uploader?: string;
}

export interface VideoResult {
  type: 'video';
  id: string;
  title: string;
  thumbnail: string;
  duration?: string;
  author?: string;
  formats_video: FormatOption[];
  formats_audio: FormatOption[];
  restriction_message?: string;
}

export interface PlaylistResult {
  type: 'playlist';
  id: string;
  title: string;
  count: number;
  entries: PlaylistEntry[];
}

export interface SearchResults {
  type: 'search_results';
  query: string;
  entries: PlaylistEntry[];
}

export type AnalyzeResult = VideoResult | PlaylistResult | SearchResults;
export type AnalyzeResponse = AnalyzeResult | { error: string };

export interface QueueItem {
  id: number;
  taskId: string | null;
  vidId: string;
  title: string;
  thumbnail?: string;
  formatId: string;
  mode: MediaMode;
  quality: string;
  filesize_bytes: number;
  isEstimated?: boolean;
  status: QueueStatus;
  progress: number;
}

export interface LibraryItem {
  id: string;
  title: string;
  path: string;
  filename: string;
  size: string;
  size_bytes: number;
  type: MediaMode;
  mtime: number;
  thumbnail?: string;
  quality?: string;
}

export interface ModalState {
  variant: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: (() => void | Promise<void>) | null;
}

export interface PreviewSource {
  id: string;
  label: string;
  url: string;
  mimeType?: string;
}

export interface PreviewState {
  open: boolean;
  title: string;
  videoId: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  url?: string;
  mimeType?: string;
  sources?: PreviewSource[];
  error?: string;
}

export interface DownloadStatusResponse {
  status: string;
  percent: number;
  msg?: string;
}

export interface DownloadStartResponse {
  status: 'started' | string;
  task_id?: string;
}

export interface UpdateEvent {
  type: 'checking' | 'available' | 'not-available' | 'downloaded' | 'error' | 'progress';
  manual?: boolean;
  percent?: number;
  version?: string;
  info?: {
    version?: string;
  };
  error?: string;
}



