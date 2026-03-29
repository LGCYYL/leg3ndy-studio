import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Hls from 'hls.js';
import type { PreviewSource, PreviewState } from '../types';

interface PreviewModalProps {
  preview: PreviewState;
  onClose: () => void;
}

const overlayStyle: CSSProperties = {
  background: 'rgba(11, 13, 18, 0.5)',
  backdropFilter: 'blur(25px)',
  WebkitBackdropFilter: 'blur(25px)',
  top: 32,
  zIndex: 9999
};

const contentStyle: CSSProperties = {
  width: '80vw',
  maxWidth: 1000,
  height: 'auto',
  maxHeight: '85vh',
  padding: 20,
  background: '#11141D',
  borderRadius: 16,
  position: 'relative',
  display: 'flex',
  flexDirection: 'column'
};

const closeStyle: CSSProperties = {
  position: 'absolute',
  top: -15,
  right: -15,
  background: '#3b82f6',
  border: 'none',
  width: 36,
  height: 36,
  borderRadius: '50%',
  color: 'white',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
  zIndex: 100
};

const containerStyle: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: 8,
  overflow: 'hidden',
  background: '#000',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
};

function isHlsSource(source?: PreviewSource | null) {
  if (!source) {
    return false;
  }

  const mimeType = String(source.mimeType || '').toLowerCase();
  return mimeType.includes('mpegurl') || source.url.includes('.m3u8');
}

export function PreviewModal({ preview, onClose }: PreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const availableSources = (preview.sources && preview.sources.length > 0)
    ? preview.sources
    : (preview.url ? [{ id: 'primary', label: 'Auto', url: preview.url, mimeType: preview.mimeType }] : []);

  const activeSource = availableSources.find((source) => source.id === selectedSourceId) || availableSources[0] || null;

  useEffect(() => {
    setSelectedSourceId(availableSources[0]?.id || '');
    setPlaybackError(null);
  }, [preview.open, preview.videoId, preview.url, preview.sources]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || preview.status !== 'ready' || !activeSource) {
      return undefined;
    }

    setPlaybackError(null);

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const fallbackSource = availableSources.find((source) => !isHlsSource(source));
    const tryFallbackToDirect = () => {
      if (fallbackSource && fallbackSource.id !== activeSource.id) {
        setSelectedSourceId(fallbackSource.id);
        return true;
      }
      return false;
    };

    const handleVideoError = () => {
      if (!tryFallbackToDirect()) {
        setPlaybackError('Nao foi possivel reproduzir esta previa agora.');
      }
    };

    destroyHls();
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.addEventListener('error', handleVideoError);

    if (isHlsSource(activeSource)) {
      const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL');
      if (nativeHls) {
        video.src = activeSource.url;
        video.load();
        void video.play().catch(() => {});
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false
        });
        hlsRef.current = hls;
        hls.loadSource(activeSource.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) {
            return;
          }

          destroyHls();
          if (!tryFallbackToDirect()) {
            setPlaybackError('Nao foi possivel abrir esta fonte de previa.');
          }
        });
      } else if (!tryFallbackToDirect()) {
        setPlaybackError('Este formato de previa nao e suportado neste ambiente.');
      }
    } else {
      video.src = activeSource.url;
      video.load();
      void video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener('error', handleVideoError);
      destroyHls();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [activeSource, availableSources, preview.status]);

  if (!preview.open) {
    return null;
  }

  return (
    <div className="modal-overlay" style={overlayStyle}>
      <div className="modal-content" style={contentStyle}>
        <button type="button" onClick={onClose} style={closeStyle} aria-label="Fechar previa">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        <div style={containerStyle}>
          {preview.status === 'loading' ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94a3b8', background: '#000' }}>
              <svg className="toast-spin" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 12 }}><circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
              <span>Carregando previa...</span>
            </div>
          ) : null}
          {preview.status === 'ready' ? (
            playbackError ? (
              <div style={{ color: '#ef4444', padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>{playbackError}</div>
            ) : (
              <video ref={videoRef} width="100%" height="100%" controls autoPlay playsInline style={{ outline: 'none', borderRadius: 8, background: '#000' }} />
            )
          ) : null}
          {preview.status === 'error' ? (
            <div style={{ color: '#ef4444', padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>{preview.error}</div>
          ) : null}
        </div>
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <h3 style={{ color: 'white', margin: '0 0 10px 0', fontSize: 18 }}>{preview.title}</h3>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Nota: Caso a previa nao carregue (Erro 150/153), ela foi bloqueada pelo autor, mas o <b>Download do arquivo</b> funcionara normalmente!</p>
        </div>
      </div>
    </div>
  );
}
