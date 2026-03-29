import { API_BASE_URL } from '../constants';
import type {
  AnalyzeResponse,
  AppConfig,
  DownloadStartResponse,
  DownloadStatusResponse,
  LibraryItem
} from '../types';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erro inesperado');
  }

  return data as T;
}

export const api = {
  getConfig: () => request<AppConfig>('/api/config'),
  setConfig: (config: Partial<AppConfig>) =>
    request<{ status: string }>('/api/config', {
      method: 'POST',
      body: JSON.stringify(config)
    }),
  analyze: (url: string) =>
    request<AnalyzeResponse>('/api/info', {
      method: 'POST',
      body: JSON.stringify({ url })
    }),
  startDownload: (payload: {
    vidId: string;
    title: string;
    format_id: string;
    mode: string;
    quality: string;
    downloadPath?: string | null;
  }) =>
    request<DownloadStartResponse>('/api/download', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getDownloadStatus: (taskId: string) => request<DownloadStatusResponse>(`/api/status/${taskId}`),
  cancelDownloads: () =>
    request<{ status: string }>('/api/cancel', {
      method: 'POST',
      body: JSON.stringify({ ids: [] })
    }),
  getLibrary: () => request<LibraryItem[]>('/api/library'),
  deleteItem: (id: string, filename: string) =>
    request<{ status?: string; error?: string }>('/api/delete', {
      method: 'POST',
      body: JSON.stringify({ id, filename })
    }),
  clearAll: () => request<{ status?: string; error?: string }>('/api/clear-all', { method: 'POST' }),
  resetPath: () => request<{ status: string; path: string }>('/api/config/reset', { method: 'POST' }),
  getPreview: (id: string) => request<{ url?: string; mime_type?: string; sources?: Array<{ id: string; label: string; url: string; mime_type?: string }>; error?: string }>(`/api/preview?id=${id}`),
  openFolder: () => request<{ status: string }>('/api/open-folder', { method: 'POST' })
};
