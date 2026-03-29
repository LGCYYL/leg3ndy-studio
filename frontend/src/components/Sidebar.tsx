import type { MouseEvent, ReactNode } from 'react';
import { appIconUrl } from '../lib/assets';
import type { ViewName } from '../types';

interface SidebarProps {
  currentView: ViewName;
  queueCount: number;
  currentPath: string;
  currentPathTitle: string;
  onNavigate: (view: ViewName) => void;
  onChooseFolder: () => void;
  onResetPath: () => void;
}

function DashboardIcon(): ReactNode {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function QueueIcon(): ReactNode {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function LibraryIcon(): ReactNode {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
    </svg>
  );
}

function SettingsIcon(): ReactNode {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.48.48 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22l-1.92 3.32c-.12.22.02.49.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.48.48 0 0 0 .48.41h3.84a.48.48 0 0 0 .48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.07.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}

export function Sidebar({
  currentView,
  queueCount,
  currentPath,
  currentPathTitle,
  onNavigate,
  onChooseFolder,
  onResetPath
}: SidebarProps) {
  const navItems: Array<{ view: ViewName; label: string; icon: ReactNode }> = [
    { view: 'home', label: 'Dashboard', icon: <DashboardIcon /> },
    { view: 'queue', label: 'Fila', icon: <QueueIcon /> },
    { view: 'history', label: 'Biblioteca', icon: <LibraryIcon /> },
    { view: 'settings', label: 'Ajustes', icon: <SettingsIcon /> }
  ];

  const handleReset = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onResetPath();
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">
          <img src={appIconUrl} alt="LEG3NDY Studio" />
        </div>
        <div className="brand-copy">
          <span className="brand-title">LEG3NDY</span>
          <span className="brand-subtitle">Studio</span>
        </div>
      </div>

      <nav className="nav-menu">
        {navItems.map((item) => (
          <a
            key={item.view}
            href="#"
            className={`nav-item ${currentView === item.view ? 'active' : ''}`}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(item.view);
            }}
          >
            {item.icon}
            {item.label}
            {item.view === 'queue' ? <span className={`badge ${queueCount === 0 ? 'hidden' : ''}`}>{queueCount}</span> : null}
          </a>
        ))}
      </nav>

      <div className="path-widget">
        <small style={{ color: '#64748B', display: 'block', marginBottom: 5 }}>SALVAR EM:</small>
        <div className="current-path" title={currentPathTitle}>{currentPath}</div>
        <button type="button" onClick={onChooseFolder}>Alterar Pasta</button>
        <div style={{ marginTop: 8 }}>
          <a href="#" onClick={handleReset} style={{ color: '#64748B', fontSize: 11, textDecoration: 'none' }}>
            Redefinir Diretório
          </a>
        </div>
      </div>
    </aside>
  );
}
