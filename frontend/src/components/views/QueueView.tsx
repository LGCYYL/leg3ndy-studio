import { fallbackArtworkUrl } from '../../lib/assets';
import { getQueueStatusClass, getQueueStatusLabel } from '../../lib/utils';
import type { QueueItem } from '../../types';

interface QueueViewProps {
  queue: QueueItem[];
  estimatedSizeText: string;
  isDownloading: boolean;
  onClearQueue: () => void;
  onCancelDownloads: () => void;
  onStartDownloads: () => void;
  onRemoveFromQueue: (id: number) => void;
}

export function QueueView({
  queue,
  estimatedSizeText,
  isDownloading,
  onClearQueue,
  onCancelDownloads,
  onStartDownloads,
  onRemoveFromQueue
}: QueueViewProps) {
  return (
    <div className="view-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
        <h2 style={{ fontSize: 24 }}>Fila de Downloads</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="queue-estimated-size">{estimatedSizeText}</span>
          <button className="btn-danger" onClick={onClearQueue}>Limpar</button>
          <button className={`btn-secondary ${!isDownloading ? 'btn-disabled' : ''}`} onClick={onCancelDownloads} disabled={!isDownloading}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={onStartDownloads}>Iniciar</button>
        </div>
      </div>
      <div className="list-container">
        {queue.length === 0 ? <div className="empty-state">Sua fila está vazia.</div> : null}

        {queue.map((item) => (
          <div key={item.id} className="queue-item">
            <img src={item.thumbnail || fallbackArtworkUrl} alt={item.title} />
            <div className="q-info">
              <div className="q-title">{item.title}</div>
              <div className="q-meta">{item.mode} • {item.quality}</div>
              {item.status === 'downloading' || item.status === 'done' ? (
                <div className="q-progress-track">
                  <div className="q-progress-bar" style={{ width: `${item.progress}%` }} />
                </div>
              ) : null}
              {item.status === 'starting' ? (
                <div className="q-progress-track">
                  <div className="q-progress-bar" style={{ width: '0%', opacity: 0.5 }} />
                </div>
              ) : null}
            </div>
            <div className="q-status">
              <span className={getQueueStatusClass(item.status)}>{getQueueStatusLabel(item.status)}</span>
            </div>
            <button className="queue-trash" onClick={() => onRemoveFromQueue(item.id)} disabled={isDownloading} style={isDownloading ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
