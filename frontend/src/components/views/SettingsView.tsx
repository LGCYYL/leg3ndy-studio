interface SettingsViewProps {
  openAtLogin: boolean;
  startHidden: boolean;
  minimizeToTray: boolean;
  appVersion: string;
  onToggleAutoStart: (value: boolean) => void;
  onToggleStartHidden: (value: boolean) => void;
  onToggleMinimizeTray: (value: boolean) => void;
  onCheckForUpdates: () => void;
}

export function SettingsView({
  openAtLogin,
  startHidden,
  minimizeToTray,
  appVersion,
  onToggleAutoStart,
  onToggleStartHidden,
  onToggleMinimizeTray,
  onCheckForUpdates
}: SettingsViewProps) {
  const platform = window.electronAPI?.getRuntimeInfo?.()?.platform;
  const isMac = platform === 'darwin';

  return (
    <div className="view-section">
      <h2 style={{ fontSize: 24, marginBottom: 30 }}>Ajustes</h2>
      <div className="settings-grid">
        <div className="setting-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="setting-info">
              <h3>{isMac ? 'Iniciar com o macOS' : 'Iniciar com o Windows'}</h3>
              <p style={{ color: '#64748B', fontSize: 13 }}>{isMac ? 'O app ficará pronto em background.' : 'O app ficará pronto na bandeja.'}</p>
            </div>
            <label className="switch"><input type="checkbox" checked={openAtLogin} onChange={(event) => onToggleAutoStart(event.target.checked)} /><span className="slider"></span></label>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', width: '100%' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="setting-info">
              <h3>Iniciar Minimizado</h3>
              <p style={{ color: '#64748B', fontSize: 13 }}>{isMac ? 'Não abre a janela ao ligar o Mac (Modo Stealth).' : 'Não abre a janela ao ligar o PC (Modo Stealth).'}</p>
            </div>
            <label className="switch"><input type="checkbox" checked={startHidden} disabled={!openAtLogin} onChange={(event) => onToggleStartHidden(event.target.checked)} /><span className="slider"></span></label>
          </div>
        </div>

        <div className="setting-card">
          <div className="setting-info">
            <h3>Minimizar para Bandeja</h3>
            <p style={{ color: '#64748B', fontSize: 13 }}>{isMac ? 'Oculta o app e o mantém ativo em background.' : 'Mantém downloads ativos em background.'}</p>
          </div>
          <label className="switch"><input type="checkbox" checked={minimizeToTray} onChange={(event) => onToggleMinimizeTray(event.target.checked)} /><span className="slider"></span></label>
        </div>

        <div className="setting-card setting-block">
          <div className="changelog-header">
            <h3>Versão do Sistema</h3>
            <span className="version-badge">v{appVersion}</span>
          </div>
          <ul className="changelog-list">
            <li><strong>Interface Ultra-Fluida:</strong> Proteção contra travamentos, mesmo baixando arquivos pesados ou listas grandes.</li>
            <li><strong>Qualidade Máxima:</strong> Baixe vídeos em Full HD (1080p) e músicas (MP3) com capa do álbum automática.</li>
            <li><strong>Fila Inteligente:</strong> Adicione playlists inteiras, links do Spotify ou vários vídeos para baixar na sequência.</li>
            <li><strong>Monitoramento Real:</strong> Barras de progresso precisas para você saber exatamente quanto falta para acabar.</li>
          </ul>
          <div style={{ marginTop: 25 }}>
            <button className="btn-secondary" style={{ fontSize: 13, padding: '8px 16px', minHeight: 36 }} onClick={onCheckForUpdates}>Verificar Atualizações</button>
          </div>
        </div>
      </div>

      <div className="license-footer">
        <p className="license-tagline">LEG3NDY - Tecnologia além dos limites</p>
        <p className="license-copy">© 2026 LEG3NDY. Todos os direitos reservados.<br />Proibida a redistribuição não autorizada.</p>
        <a href="https://leg3ndy.com.br/privacy-policy" target="_blank" rel="noreferrer" className="legal-link">Política de Privacidade</a>
      </div>
    </div>
  );
}
