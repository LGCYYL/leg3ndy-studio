import { SORT_LABELS } from '../../constants';
import { formatDate } from '../../lib/utils';
import type { LibraryItem, SortBy } from '../../types';

interface HistoryViewProps {
  items: LibraryItem[];
  isLoading: boolean;
  sortBy: SortBy;
  sortAsc: boolean;
  sortMenuOpen: boolean;
  thumbnailCache: Record<string, string>;
  onToggleSortMenu: () => void;
  onSetSortBy: (sortBy: SortBy) => void;
  onToggleSortDir: () => void;
  onClearAll: () => void;
  onOpenFolder: () => void;
  onDeleteItem: (id: string, filename: string) => void;
  onOpenItem: (path: string) => void;
  onHoverChange: (isHovering: boolean) => void;
}

export function HistoryView({
  items,
  isLoading,
  sortBy,
  sortAsc,
  sortMenuOpen,
  thumbnailCache,
  onToggleSortMenu,
  onSetSortBy,
  onToggleSortDir,
  onClearAll,
  onOpenFolder,
  onDeleteItem,
  onOpenItem,
  onHoverChange
}: HistoryViewProps) {
  return (
    <div className="view-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
        <h2 style={{ fontSize: 24 }}>Biblioteca</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }} onClick={(event) => event.stopPropagation()}>
            <button id="sortDropdownBtn" className="btn-sort" onClick={onToggleSortMenu}>
              Classificar
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div
              id="sortDropdownMenu"
              style={{
                display: sortMenuOpen ? 'block' : 'none',
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 6,
                background: '#1a1d2e',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '6px 0',
                minWidth: 160,
                zIndex: 50,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
              }}
            >
              {(Object.keys(SORT_LABELS) as SortBy[]).map((option) => (
                <div
                  key={option}
                  onClick={() => onSetSortBy(option)}
                  data-sort={option}
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    color: option === sortBy ? '#3b82f6' : '#94a3b8',
                    fontSize: 14,
                    transition: 'background 0.15s',
                    fontWeight: option === sortBy ? 600 : 500
                  }}
                >
                  {SORT_LABELS[option]}
                </div>
              ))}
            </div>
            <button onClick={onToggleSortDir} className="btn-sort btn-sort-icon" title="Alternar ordem">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: sortAsc ? '#3b82f6' : '#94a3b8' }}>
                <path d="M8 20V4 M4 8l4-4 4 4 M16 4v16 M12 16l4 4 4-4" />
              </svg>
            </button>
          </div>
          <button className="btn-danger" onClick={onClearAll}>Apagar Todos</button>
          <button className="btn-primary" onClick={onOpenFolder}>Abrir Pasta</button>
        </div>
      </div>
      <div className="list-container" onMouseEnter={() => onHoverChange(true)} onMouseLeave={() => onHoverChange(false)}>
        {isLoading && items.length === 0 ? <p style={{ textAlign: 'center', color: '#64748B' }}>Carregando Biblioteca...</p> : null}
        {!isLoading && items.length === 0 ? <div className="empty-state">Sua biblioteca está vazia. Os arquivos baixados aparecerão aqui.</div> : null}

        {items.map((item) => {
          const thumbnail = item.thumbnail || thumbnailCache[item.path];
          const dateStr = item.mtime ? formatDate(item.mtime) : '';
          const iconStyle = thumbnail ? { padding: 0, background: 'none', border: 'none', width: 80, height: 45 } : undefined;

          return (
            <div key={item.id} className="history-item">
              <div
                className={`h-icon ${thumbnail ? 'has-thumbnail' : 'is-placeholder'}`}
                style={iconStyle}
                onClick={() => onOpenItem(item.path)}
                title="Reproduzir no Windows"
              >
                {thumbnail ? (
                  <img src={thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} alt={item.title} />
                ) : item.type === 'video' ? (
                  <svg className="h-icon-svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><polygon points="5,3 19,12 5,21 5,3" /></svg>
                ) : (
                  <svg className="h-icon-svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                )}
              </div>
              <div className="h-info" onClick={() => onOpenItem(item.path)} style={{ cursor: 'pointer' }} title="Reproduzir no Windows">
                <div className="h-title">{item.title}</div>
                <div className="h-meta">{item.quality || item.type.toUpperCase()} • {item.size}{dateStr ? ` • ${dateStr}` : ''}</div>
                <div className="h-path">{item.filename}</div>
              </div>
              <button className="btn-trash" onClick={() => onDeleteItem(item.id, item.filename)} title="Apagar do Computador">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}




