import type { LibraryItem, QueueStatus, SortBy } from '../types';

export function humanSize(bytes?: number | null): string {
  if (bytes === 0) return '0 B';
  if (!bytes) return 'N/A';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(1)} ${units[index]}`;
}

export function truncatePath(path: string | null | undefined, tail = 25): string {
  if (!path) return 'Padrão';
  return path.length > tail ? `...${path.slice(-tail)}` : path;
}

export function formatDate(mtime: number): string {
  const date = new Date(mtime * 1000);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function sortLibraryData(data: LibraryItem[], sortBy: SortBy, ascending: boolean): LibraryItem[] {
  const sorted = [...data];

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date':
        comparison = (a.mtime || 0) - (b.mtime || 0);
        break;
      case 'size':
        comparison = (a.size_bytes || 0) - (b.size_bytes || 0);
        break;
      case 'name':
        comparison = (a.title || '').localeCompare(b.title || '');
        break;
      case 'type':
        comparison = (a.type || '').localeCompare(b.type || '');
        break;
    }

    return ascending ? comparison : -comparison;
  });

  return sorted;
}

export function getQueueStatusClass(status: QueueStatus): string {
  switch (status) {
    case 'done':
      return 'st-done';
    case 'error':
      return 'st-error';
    case 'downloading':
    case 'starting':
      return 'st-loading';
    default:
      return 'st-pending';
  }
}

export function getQueueStatusLabel(status: QueueStatus): string {
  switch (status) {
    case 'done':
      return 'Concluído';
    case 'error':
      return 'Erro';
    case 'downloading':
      return 'Baixando...';
    case 'starting':
      return 'Iniciando...';
    default:
      return 'Pendente';
  }
}

export function createQueueId(): number {
  return Date.now() + Math.round(Math.random() * 1000);
}

export async function sendDesktopNotification(message: string): Promise<void> {
  if (typeof Notification === 'undefined') {
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification('LEG3NDY Studio', { body: message });
    return;
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('LEG3NDY Studio', { body: message });
    }
  }
}
