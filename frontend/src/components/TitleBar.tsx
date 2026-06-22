import { appIconUrl } from '../lib/assets';

export function TitleBar() {
  const runtimeInfo = window.electronAPI?.getRuntimeInfo?.();

  if (runtimeInfo?.usesNativeTitleBar) {
    return <div className="macos-drag-bar" />;
  }

  return (
    <div className="title-bar">
      <div className="titlebar-drag-region">
        <div className="titlebar-brand">
          <img src={appIconUrl} alt="" className="titlebar-brand-icon" />
          <span className="app-title">LEG3NDY STUDIO</span>
        </div>
      </div>

      <div className="window-controls">
        <button type="button" onClick={() => window.electronAPI?.minimize()} className="control-btn minimize" aria-label="Minimizar">
          <svg viewBox="0 0 12 2" width="12" height="12">
            <rect x="1" y="0.5" width="10" height="1" rx="0.5" fill="currentColor" />
          </svg>
        </button>
        <button type="button" onClick={() => window.electronAPI?.maximize()} className="control-btn maximize" aria-label="Maximizar">
          <svg viewBox="0 0 12 12" width="12" height="12">
            <rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button type="button" onClick={() => window.electronAPI?.close()} className="control-btn close" aria-label="Fechar">
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path d="M 2 2 L 10 10 M 10 2 L 2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
