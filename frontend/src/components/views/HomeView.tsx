import { CAROUSEL_SLIDES, PLAYLIST_QUALITIES } from '../../constants';
import { fallbackArtworkUrl } from '../../lib/assets';
import type { AnalyzeResult, FormatOption, MediaMode, PlaylistResult, SearchResults, VideoResult } from '../../types';

interface HomeViewProps {
  query: string;
  analysisQuery: string;
  isLoading: boolean;
  analysis: AnalyzeResult | null;
  activeFormatTab: MediaMode;
  playlistMode: MediaMode;
  playlistQuality: string;
  selectedPlaylistIndices: number[];
  playlistAllSelected: boolean;
  recentlyAddedKey: string | null;
  carouselIndex: number;
  onQueryChange: (value: string) => void;
  onAnalyze: () => void;
  onFormatTabChange: (mode: MediaMode) => void;
  onAddResultToQueue: (format: FormatOption, mode: MediaMode) => void;
  onPlaylistModeChange: (mode: MediaMode) => void;
  onPlaylistQualityChange: (quality: string) => void;
  onTogglePlaylistIndex: (index: number, checked: boolean) => void;
  onToggleAllPlaylist: (checked: boolean) => void;
  onAddPlaylistToQueue: () => void;
  onSelectSearchItem: (url: string) => void;
  onOpenPreview: (videoId: string, title: string) => void;
}

function isVideoResult(result: AnalyzeResult | null): result is VideoResult {
  return result?.type === 'video';
}

function isPlaylistResult(result: AnalyzeResult | null): result is PlaylistResult {
  return result?.type === 'playlist';
}

function isSearchResults(result: AnalyzeResult | null): result is SearchResults {
  return result?.type === 'search_results';
}

export function HomeView({
  query,
  analysisQuery,
  isLoading,
  analysis,
  activeFormatTab,
  playlistMode,
  playlistQuality,
  selectedPlaylistIndices,
  playlistAllSelected,
  recentlyAddedKey,
  carouselIndex,
  onQueryChange,
  onAnalyze,
  onFormatTabChange,
  onAddResultToQueue,
  onPlaylistModeChange,
  onPlaylistQualityChange,
  onTogglePlaylistIndex,
  onToggleAllPlaylist,
  onAddPlaylistToQueue,
  onSelectSearchItem,
  onOpenPreview
}: HomeViewProps) {
  return (
    <div className="view-section">
      <div className="carousel-container">
        {CAROUSEL_SLIDES.map((slide, index) => (
          <div
            key={slide.title}
            className={`slide ${carouselIndex === index ? 'active' : ''}`}
            data-color={slide.color}
            style={{ backgroundImage: `url('${slide.image}')` }}
          >
            <div className="slide-content">
              <h2>{slide.title}</h2>
              <p>{slide.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="input-card">
        <div className="input-wrapper">
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onAnalyze();
              }
            }}
            placeholder="Link (YouTube, Spotify) ou Nome da Música..."
          />
          <button type="button" className="btn-primary" onClick={onAnalyze}>Analisar</button>
        </div>
      </div>

      {isLoading ? <div className="loader">Processando...</div> : null}

      {isVideoResult(analysis) ? (
        <div className="result-grid">
          <div className="video-preview">
            <div className="thumb-wrapper" style={{ position: 'relative', cursor: 'pointer' }} onClick={() => onOpenPreview(analysis.id, analysis.title)}>
              <img src={analysis.thumbnail} alt={analysis.title} />
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 12, transition: 'opacity 0.2s', pointerEvents: 'none' }}>
                <svg viewBox="0 0 24 24" width="48" height="48" fill="white" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}><polygon points="5,3 19,12 5,21 5,3" /></svg>
              </div>
              <span className="duration-badge">{analysis.duration || '--:--'}</span>
            </div>
            <div className="vid-meta">
              <h3>{analysis.title}</h3>
              <p>{analysis.author}</p>
            </div>
          </div>
          <div className="format-options">
            <div className="tabs"><button className={`tab ${activeFormatTab === 'video' ? 'active' : ''}`} onClick={() => onFormatTabChange('video')}>Vídeo</button><button className={`tab ${activeFormatTab === 'audio' ? 'active' : ''}`} onClick={() => onFormatTabChange('audio')}>Áudio</button></div>
            {analysis.restriction_message ? <div className="analysis-warning">{analysis.restriction_message}</div> : null}
            <div className={`options-list ${activeFormatTab === 'video' ? '' : 'hidden'}`}>
              {analysis.formats_video.map((format) => {
                const addKey = `video:${format.format_id}`;
                const isRestricted = Boolean(format.restricted);
                return (
                  <div key={addKey} className={`opt-row ${isRestricted ? 'is-restricted' : ''}`}>
                    <div className="opt-info-stack">
                      <div className="opt-info"><div className="opt-quality-badge">{format.quality}</div><span className="opt-size">{format.filesize}</span></div>
                      {isRestricted ? <span className="opt-restriction">{format.restriction_reason || 'Bloqueado pelo YouTube nesta sessão.'}</span> : null}
                    </div>
                    <button className={`btn-add-mini ${isRestricted ? 'btn-disabled' : ''}`} disabled={isRestricted} onClick={() => onAddResultToQueue(format, 'video')}>{isRestricted ? 'Bloqueado' : recentlyAddedKey === addKey ? 'Adicionado' : '+ Fila'}</button>
                  </div>
                );
              })}
            </div>
            <div className={`options-list ${activeFormatTab === 'audio' ? '' : 'hidden'}`}>
              {analysis.formats_audio.map((format) => {
                const addKey = `audio:${format.format_id}`;
                const isRestricted = Boolean(format.restricted);
                return (
                  <div key={addKey} className={`opt-row ${isRestricted ? 'is-restricted' : ''}`}>
                    <div className="opt-info-stack">
                      <div className="opt-info"><div className="opt-quality-badge">{format.quality}</div><span className="opt-size">{format.filesize}</span></div>
                      {isRestricted ? <span className="opt-restriction">{format.restriction_reason || 'Bloqueado pelo YouTube nesta sessão.'}</span> : null}
                    </div>
                    <button className={`btn-add-mini ${isRestricted ? 'btn-disabled' : ''}`} disabled={isRestricted} onClick={() => onAddResultToQueue(format, 'audio')}>{isRestricted ? 'Bloqueado' : recentlyAddedKey === addKey ? 'Adicionado' : '+ Fila'}</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {isPlaylistResult(analysis) ? (
        <div className="playlist-grid">
          <div className="pl-header"><h3>{analysis.title}</h3><p>{analysis.count} vídeos encontrados</p></div>
          <div className="pl-controls">
            <div className="pl-config">
              <select className="pl-select" value={playlistMode} onChange={(event) => onPlaylistModeChange(event.target.value as MediaMode)}>
                <option value="video">Vídeo (MP4)</option>
                <option value="audio">Áudio (MP3)</option>
              </select>
              <div className="pl-divider"></div>
              <select className="pl-select" value={playlistQuality} onChange={(event) => onPlaylistQualityChange(event.target.value)}>
                {PLAYLIST_QUALITIES[playlistMode].map((quality) => (<option key={quality.value} value={quality.value}>{quality.label}</option>))}
              </select>
            </div>
            <div className="pl-actions"><label className="pl-check-all"><input type="checkbox" checked={playlistAllSelected} onChange={(event) => onToggleAllPlaylist(event.target.checked)} /> Selecionar Tudo</label><button className="btn-primary" onClick={onAddPlaylistToQueue}>+ Adicionar à Fila</button></div>
          </div>
          <div className="pl-list-container">
            <div className="pl-list">
              {analysis.entries.map((item, index) => (
                <div key={`${item.id}-${index}`} className="pl-item">
                  <input type="checkbox" className="pl-check" checked={selectedPlaylistIndices.includes(index)} onChange={(event) => onTogglePlaylistIndex(index, event.target.checked)} />
                  <div style={{ position: 'relative', width: 120, height: 68, borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }} onClick={() => onOpenPreview(item.id, item.title)}>
                    <img src={item.thumbnail || fallbackArtworkUrl} className="pl-thumb" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 0 }} alt={item.title} />
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1, transition: 'opacity 0.2s' }}><svg viewBox="0 0 24 24" width="28" height="28" fill="white" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}><polygon points="5,3 19,12 5,21 5,3" /></svg></div>
                  </div>
                  <div className="pl-meta"><div className="pl-title" title={item.title}>{item.title}</div><div className="pl-dur">{item.uploader || ''}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isSearchResults(analysis) ? (
        <div className="playlist-grid">
          <div className="pl-header"><h3>{`Resultados para: "${analysisQuery}"`}</h3><p>{analysis.entries.length} vídeos encontrados</p></div>
          <div className="pl-list-container">
            <div className="pl-list">
              {analysis.entries.map((item, index) => (
                <div key={`${item.id}-${index}`} className="pl-item">
                  <div style={{ position: 'relative', width: 150, height: 85, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', flexShrink: 0 }} onClick={() => onOpenPreview(item.id, item.title)}>
                    <img src={item.thumbnail || fallbackArtworkUrl} className="pl-thumb" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 0 }} alt={item.title} />
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1, transition: 'opacity 0.2s' }}><svg viewBox="0 0 24 24" width="32" height="32" fill="white" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}><polygon points="5,3 19,12 5,21 5,3" /></svg></div>
                  </div>
                  <div className="pl-meta" style={{ flex: 1, minWidth: 0 }}><div className="pl-title" title={item.title} style={{ whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.title}</div><div className="pl-dur">{item.uploader || ''}{item.duration ? ` • ${item.duration}` : ''}</div></div>
                  <button className="btn-primary-mini" onClick={() => onSelectSearchItem(`https://youtube.com/watch?v=${item.id}`)} style={{ alignSelf: 'flex-start', marginTop: 10 }}>Selecionar</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
