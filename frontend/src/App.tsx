import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';
import { CAROUSEL_SLIDES, PLAYLIST_QUALITIES } from './constants';
import { api } from './lib/api';
import { createQueueId, humanSize, sendDesktopNotification, sortLibraryData, truncatePath } from './lib/utils';
import { Modal } from './components/Modal';
import { PreviewModal } from './components/PreviewModal';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { HistoryView } from './components/views/HistoryView';
import { HomeView } from './components/views/HomeView';
import { QueueView } from './components/views/QueueView';
import { SettingsView } from './components/views/SettingsView';
import type {
  AnalyzeResult,
  AppConfig,
  FormatOption,
  LibraryItem,
  MediaMode,
  ModalState,
  PreviewState,
  QueueItem,
  SortBy,
  SystemSettings,
  UpdateEvent,
  ViewName
} from './types';

const DEFAULT_CONFIG: AppConfig = {
  download_path: '',
  auto_start: false,
  start_minimized: false,
  minimize_tray: true
};

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  openAtLogin: false,
  minimizeToTray: true
};

const DEFAULT_PREVIEW: PreviewState = {
  open: false,
  title: '',
  videoId: '',
  status: 'idle'
};

const BOOTSTRAP_RETRIES = 8;
const BOOTSTRAP_RETRY_DELAY_MS = 600;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function retryRequest<T>(task: () => Promise<T>, retries = BOOTSTRAP_RETRIES, delayMs = BOOTSTRAP_RETRY_DELAY_MS): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries - 1) {
        break;
      }
      await wait(delayMs);
    }
  }

  throw lastError ?? new Error('Falha ao carregar dados iniciais.');
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewName>('home');
  const [query, setQuery] = useState('');
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeFormatTab, setActiveFormatTab] = useState<MediaMode>('video');
  const [playlistMode, setPlaylistMode] = useState<MediaMode>('video');
  const [playlistQuality, setPlaylistQuality] = useState('1080p');
  const [selectedPlaylistIndices, setSelectedPlaylistIndices] = useState<number[]>([]);
  const [recentlyAddedKey, setRecentlyAddedKey] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [selectedDownloadPath, setSelectedDownloadPath] = useState('');
  const [appVersion, setAppVersion] = useState('?.?.?');

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [isHoveringLibrary, setIsHoveringLibrary] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<ModalState | null>(null);
  const [preview, setPreview] = useState<PreviewState>(DEFAULT_PREVIEW);

  const queueRef = useRef<QueueItem[]>([]);
  const selectedPathRef = useRef<string | null>(null);
  const cancelDownloadsRef = useRef(false);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    selectedPathRef.current = selectedDownloadPath || null;
  }, [selectedDownloadPath]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCarouselIndex((currentIndex) => (currentIndex + 1) % CAROUSEL_SLIDES.length);
    }, 6000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--ambient-color', CAROUSEL_SLIDES[carouselIndex].color);
  }, [carouselIndex]);


  useEffect(() => {
    let active = true;

    void retryRequest(() => api.getConfig())
      .then((configData) => {
        if (!active) {
          return;
        }

        setConfig(configData);
        setSelectedDownloadPath(configData.download_path || '');
      })
      .catch(() => {
        // Ignora falhas de boot do backend para não travar a interface.
      });

    void Promise.resolve(window.electronAPI?.getSysSettings?.())
      .then((electronSettings) => {
        if (active && electronSettings) {
          setSystemSettings(electronSettings);
        }
      })
      .catch(() => {
        // Ignora falhas do shell do Electron.
      });

    void Promise.resolve(window.electronAPI?.getAppVersion?.())
      .then((version) => {
        if (active && version) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        // Ignora falhas do shell do Electron.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sortMenuOpen) {
      return;
    }

    const closeMenu = () => setSortMenuOpen(false);
    document.addEventListener('click', closeMenu);

    return () => document.removeEventListener('click', closeMenu);
  }, [sortMenuOpen]);

  useEffect(() => {
    if (currentView !== 'history') {
      return;
    }

    void loadLibrary();

    const interval = window.setInterval(() => {
      if (!isHoveringLibrary) {
        void loadLibrary(true);
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [currentView, isHoveringLibrary]);

  useEffect(() => {
    if (currentView !== 'history' || !window.electronAPI?.getThumbnail) {
      return;
    }

    const missingThumbnails = libraryItems.filter((item) => item.type === 'video' && !item.thumbnail && !thumbnailCache[item.path]);

    missingThumbnails.forEach((item) => {
      window.electronAPI
        ?.getThumbnail(item.path)
        .then((thumbnail) => {
          if (!thumbnail) {
            return;
          }

          setThumbnailCache((currentCache) => {
            if (currentCache[item.path]) {
              return currentCache;
            }

            return {
              ...currentCache,
              [item.path]: thumbnail
            };
          });
        })
        .catch(() => {
          // Ignora thumbnail nativa ausente.
        });
    });
  }, [currentView, libraryItems, thumbnailCache]);

  const handleUpdateEvent = useEffectEvent((event: UpdateEvent) => {
    if (event.type === 'checking' || event.type === 'available' || event.type === 'progress') {
      return;
    }

    if (event.type === 'not-available') {
      if (event.manual) {
        openModal('alert', 'Atualizações', 'Você já possui a versão mais recente.');
      }
      return;
    }

    if (event.type === 'downloaded') {
      openModal(
        'confirm',
        'Atualização pronta',
        `A versão ${event.version ?? '?'} foi baixada e está pronta para instalar. Deseja reiniciar e instalar agora?`,
        () => {
          window.electronAPI?.installUpdate();
        }
      );
      return;
    }

    if (event.type === 'error' && event.manual) {
      openModal('alert', 'Falha ao verificar atualizações', event.error ?? 'Falha ao verificar atualizações.');
    }
  });

  const handleWindowFocus = useEffectEvent(() => {
    if (currentView === 'history') {
      void loadLibrary(true);
    }
  });

  const handleDownloadFolderChanged = useEffectEvent(() => {
    if (currentView === 'history') {
      void loadLibrary(true);
    }
  });

  useEffect(() => {
    const unsubscribeUpdate = window.electronAPI?.onUpdateEvent?.(handleUpdateEvent);
    const unsubscribeFolder = window.electronAPI?.onDownloadFolderChanged?.(handleDownloadFolderChanged);

    return () => {
      if (typeof unsubscribeUpdate === 'function') {
        unsubscribeUpdate();
      }
      if (typeof unsubscribeFolder === 'function') {
        unsubscribeFolder();
      }
    };
  }, [handleUpdateEvent, handleDownloadFolderChanged]);

  useEffect(() => {
    const listener = () => handleWindowFocus();
    window.addEventListener('focus', listener);
    return () => window.removeEventListener('focus', listener);
  }, [handleWindowFocus]);

  function openModal(variant: ModalState['variant'], title: string, message: string, onConfirm: ModalState['onConfirm'] = null) {
    setModal({ variant, title, message, onConfirm });
  }

  function closeModal() {
    setModal(null);
  }

  function handleModalConfirm() {
    const confirmAction = modal?.onConfirm;
    setModal(null);
    void confirmAction?.();
  }

  function setQueueState(updater: QueueItem[] | ((currentQueue: QueueItem[]) => QueueItem[])) {
    setQueue((currentQueue) => {
      const nextQueue = typeof updater === 'function' ? updater(currentQueue) : updater;
      queueRef.current = nextQueue;
      return nextQueue;
    });
  }

  function updateQueueItem(itemId: number, updater: (item: QueueItem) => QueueItem) {
    setQueueState((currentQueue) => currentQueue.map((item) => (item.id === itemId ? updater(item) : item)));
  }

  async function loadLibrary(silent = false) {
    if (!silent) {
      setIsHistoryLoading(true);
    }

    try {
      const data = await api.getLibrary();
      startTransition(() => {
        setLibraryItems(data);
      });
    } catch {
      if (!silent) {
        console.error('Erro ao carregar arquivos locais.');
      }
    } finally {
      if (!silent) {
        setIsHistoryLoading(false);
      }
    }
  }

  async function handleAnalyze(nextInput?: string) {
    const value = (nextInput ?? query).trim();
    if (!value) {
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);
    setAnalysisQuery(value);
    setActiveFormatTab('video');

    try {
      const response = await api.analyze(value);
      if ('error' in response) {
        openModal('alert', 'Não foi possível analisar', response.error);
        return;
      }

      if (response.type === 'playlist') {
        setPlaylistMode('video');
        setPlaylistQuality('1080p');
        setSelectedPlaylistIndices(response.entries.map((_, index) => index));
      } else {
        setSelectedPlaylistIndices([]);
      }

      startTransition(() => {
        setAnalysis(response);
      });
    } catch {
      openModal('alert', 'Erro de Conexão', 'Não foi possível conectar ao servidor interno (backend). Verifique se o aplicativo foi iniciado corretamente.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleAddResultToQueue(format: FormatOption, mode: MediaMode) {
    if (!analysis || analysis.type !== 'video') {
      return;
    }

    if (format.restricted) {
      openModal(
        'alert',
        'Qualidade bloqueada pelo YouTube',
        format.restriction_reason || 'Esta qualidade exige uma validação extra do YouTube nesta sessão e não está liberada para download automático agora.'
      );
      return;
    }

    const addKey = `${mode}:${format.format_id}`;

    setQueueState((currentQueue) => [
      ...currentQueue,
      {
        id: createQueueId(),
        taskId: null,
        vidId: analysis.id,
        title: analysis.title,
        thumbnail: analysis.thumbnail,
        formatId: format.format_id,
        mode,
        quality: format.quality,
        filesize_bytes: format.filesize_bytes,
        status: 'pending',
        progress: 0
      }
    ]);

    setRecentlyAddedKey(addKey);
    window.setTimeout(() => setRecentlyAddedKey((currentKey) => (currentKey === addKey ? null : currentKey)), 1000);
  }

  function handlePlaylistModeChange(mode: MediaMode) {
    setPlaylistMode(mode);
    setPlaylistQuality(mode === 'audio' ? '192kbps' : '1080p');
  }

  function handleTogglePlaylistIndex(index: number, checked: boolean) {
    setSelectedPlaylistIndices((currentSelection) => {
      if (checked) {
        return Array.from(new Set([...currentSelection, index])).sort((left, right) => left - right);
      }

      return currentSelection.filter((selectedIndex) => selectedIndex !== index);
    });
  }

  function handleToggleAllPlaylist(checked: boolean) {
    if (!analysis || analysis.type !== 'playlist') {
      return;
    }

    setSelectedPlaylistIndices(checked ? analysis.entries.map((_, index) => index) : []);
  }

  async function handleAddPlaylistToQueue() {
    if (!analysis || analysis.type !== 'playlist') {
      return;
    }

    const selectedItems = analysis.entries.filter((_, index) => selectedPlaylistIndices.includes(index));
    if (selectedItems.length === 0) {
      openModal('alert', 'Nenhum vídeo selecionado', 'Por favor, marque pelo menos um vídeo ou música da lista para adicionar à fila.');
      return;
    }

    const estimatedSize = playlistMode === 'audio' ? 5_000_000 : 50_000_000;

    setQueueState((currentQueue) => [
      ...currentQueue,
      ...selectedItems.map((item) => ({
        id: createQueueId(),
        taskId: null,
        vidId: item.id,
        title: item.title,
        thumbnail: item.thumbnail,
        formatId: 'playlist_video',
        mode: playlistMode,
        quality: playlistQuality,
        filesize_bytes: estimatedSize,
        isEstimated: true,
        status: 'pending' as const,
        progress: 0
      }))
    ]);

    setCurrentView('queue');
    await sendDesktopNotification(`${selectedItems.length} itens adicionados à fila.`);
  }

  function handleSelectSearchItem(url: string) {
    setQuery(url);
    void handleAnalyze(url);
  }

  function handleRemoveFromQueue(itemId: number) {
    if (isDownloading) {
      return;
    }

    setQueueState((currentQueue) => currentQueue.filter((item) => item.id !== itemId));
  }

  function handleClearQueue() {
    if (queueRef.current.length === 0) {
      return;
    }

    if (isDownloading) {
      openModal('alert', 'Aguarde', 'Você não pode limpar a fila enquanto houver downloads ativos. Por favor, cancele ou aguarde o término.');
      return;
    }

    openModal('confirm', 'Limpar toda a fila?', 'Você tem certeza que deseja remover todos os itens da lista de espera? Isso não apaga arquivos já baixados.', () => {
      setQueueState([]);
    });
  }

  async function pollDownload(queueItemId: number, taskId: string): Promise<'success' | 'error' | 'cancelled'> {
    return new Promise((resolve) => {
      const interval = window.setInterval(async () => {
        if (cancelDownloadsRef.current) {
          window.clearInterval(interval);
          updateQueueItem(queueItemId, (item) => ({ ...item, status: 'pending', progress: 0 }));
          resolve('cancelled');
          return;
        }

        try {
          const status = await api.getDownloadStatus(taskId);

          if (status.status === 'cancelled') {
            window.clearInterval(interval);
            updateQueueItem(queueItemId, (item) => ({ ...item, status: 'pending', progress: 0 }));
            resolve('cancelled');
            return;
          }

          updateQueueItem(queueItemId, (item) => ({ ...item, progress: status.percent ?? item.progress }));

          if (status.status === 'success') {
            window.clearInterval(interval);
            updateQueueItem(queueItemId, (item) => ({ ...item, status: 'done', progress: 100 }));
            void loadLibrary(true);
            resolve('success');
            return;
          }

          if (status.status === 'error') {
            window.clearInterval(interval);
            updateQueueItem(queueItemId, (item) => ({ ...item, status: 'error' }));
            resolve('error');
          }
        } catch {
          window.clearInterval(interval);
          updateQueueItem(queueItemId, (item) => ({ ...item, status: 'error' }));
          resolve('error');
        }
      }, 500);
    });
  }

  async function handleStartDownloads() {
    if (isDownloading) {
      return;
    }

    const pendingItems = queueRef.current.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0) {
      openModal('alert', 'Sua fila está vazia', 'Adicione vídeos ou músicas à fila antes de iniciar o download.');
      return;
    }

    cancelDownloadsRef.current = false;
    setIsDownloading(true);

    for (const pendingItem of pendingItems) {
      if (cancelDownloadsRef.current) {
        break;
      }

      updateQueueItem(pendingItem.id, (item) => ({ ...item, status: 'starting' }));

      try {
        const response = await api.startDownload({
          vidId: pendingItem.vidId,
          title: pendingItem.title,
          format_id: pendingItem.formatId,
          mode: pendingItem.mode,
          quality: pendingItem.quality,
          downloadPath: selectedPathRef.current
        });

        if (response.status !== 'started' || !response.task_id) {
          updateQueueItem(pendingItem.id, (item) => ({ ...item, status: 'error' }));
          continue;
        }

        updateQueueItem(pendingItem.id, (item) => ({ ...item, status: 'downloading', taskId: response.task_id! }));
        await pollDownload(pendingItem.id, response.task_id);
      } catch {
        updateQueueItem(pendingItem.id, (item) => ({ ...item, status: 'error' }));
      }
    }

    setIsDownloading(false);

    if (!cancelDownloadsRef.current) {
      await sendDesktopNotification('Todos os downloads da fila foram concluídos com sucesso.');
    }
  }

  async function handleCancelDownloads() {
    if (!isDownloading) {
      return;
    }

    cancelDownloadsRef.current = true;
    setIsDownloading(false);
    setQueueState((currentQueue) =>
      currentQueue.map((item) =>
        item.status === 'downloading' || item.status === 'starting'
          ? { ...item, status: 'pending', progress: 0 }
          : item
      )
    );

    try {
      await api.cancelDownloads();
    } finally {
      openModal('alert', 'Cancelado', 'Todos os downloads ativos foram interrompidos e arquivos parciais removidos.');
    }
  }

  async function handleChooseFolder() {
    const newPath = await window.electronAPI?.selectFolder?.();
    if (!newPath) {
      return;
    }

    setSelectedDownloadPath(newPath);
    setConfig((currentConfig) => ({ ...currentConfig, download_path: newPath }));
    await api.setConfig({ download_path: newPath });
    window.electronAPI?.notifyDownloadPathChanged(newPath);
  }

  async function handleResetPath() {
    const response = await api.resetPath();
    setSelectedDownloadPath(response.path);
    setConfig((currentConfig) => ({ ...currentConfig, download_path: response.path }));
    window.electronAPI?.notifyDownloadPathChanged(response.path);
  }

  async function handleToggleAutoStart(value: boolean) {
    setSystemSettings((currentSettings) => ({ ...currentSettings, openAtLogin: value }));
    setConfig((currentConfig) => ({ ...currentConfig, auto_start: value }));

    await api.setConfig({ auto_start: value });
    await window.electronAPI?.setSysSettings?.({ openAtLogin: value, startHidden: config.start_minimized });
  }

  async function handleToggleStartHidden(value: boolean) {
    setConfig((currentConfig) => ({ ...currentConfig, start_minimized: value }));

    await api.setConfig({ start_minimized: value });
    await window.electronAPI?.setSysSettings?.({ openAtLogin: systemSettings.openAtLogin, startHidden: value });
  }

  async function handleToggleMinimizeTray(value: boolean) {
    setSystemSettings((currentSettings) => ({ ...currentSettings, minimizeToTray: value }));
    setConfig((currentConfig) => ({ ...currentConfig, minimize_tray: value }));

    await api.setConfig({ minimize_tray: value });
    await window.electronAPI?.setSysSettings?.({ minimizeToTray: value });
  }

  function handleNavigate(view: ViewName) {
    setCurrentView(view);
    setSortMenuOpen(false);
  }

  function handleSetSortBy(nextSortBy: SortBy) {
    setSortBy(nextSortBy);
    setSortMenuOpen(false);
  }

  function handleOpenPreview(videoId: string, title: string) {
    previewRequestRef.current += 1;
    const requestId = previewRequestRef.current;

    setPreview({
      open: true,
      title,
      videoId,
      status: 'loading'
    });

    api.getPreview(videoId)
      .then((response) => {
        if (previewRequestRef.current !== requestId) {
          return;
        }

        if (response.url) {
          setPreview({
            open: true,
            title,
            videoId,
            status: 'ready',
            url: response.url,
            mimeType: response.mime_type,
            sources: (response.sources || []).map((source) => ({
              id: source.id,
              label: source.label,
              url: source.url,
              mimeType: source.mime_type
            }))
          });
          return;
        }

        setPreview({
          open: true,
          title,
          videoId,
          status: 'error',
          error: 'Erro ao carregar prévia: o vídeo pode ter restrição de idade ou DRM. Mas o download ainda funcionará.'
        });
      })
      .catch(() => {
        if (previewRequestRef.current !== requestId) {
          return;
        }

        setPreview({
          open: true,
          title,
          videoId,
          status: 'error',
          error: 'Falha na conexão com o servidor.'
        });
      });
  }

  function handleClosePreview() {
    previewRequestRef.current += 1;
    setPreview(DEFAULT_PREVIEW);
  }

  function handleDeleteItem(id: string, filename: string) {
    openModal('confirm', 'Excluir Arquivo', 'Você tem certeza que deseja deletar este arquivo permanentemente do computador? Essa ação não pode ser desfeita.', async () => {
      await api.deleteItem(id, filename);
      await loadLibrary();
    });
  }

  function handleClearAllDownloads() {
    openModal('confirm', 'Apagar Toda a Biblioteca', 'ATENÇÃO: Isso apagará TODOS os arquivos listados na biblioteca do seu disco rígido permanentemente. Tem certeza absoluta?', async () => {
      await api.clearAll();
      await loadLibrary();
    });
  }

  async function handleOpenDownloadsFolder() {
    const activeDownloadPath = selectedDownloadPath || config.download_path || '';

    if (activeDownloadPath) {
      await window.electronAPI?.openPath?.(activeDownloadPath);
      return;
    }

    await api.openFolder();
  }

  const activeDownloadPath = selectedDownloadPath || config.download_path || '';
  const pendingItems = queue.filter((item) => item.status === 'pending');
  const queueCount = pendingItems.length;
  const totalPendingBytes = pendingItems.reduce((total, item) => total + (item.filesize_bytes || 0), 0);
  const estimatedSizeText = `Tamanho Estimado: ${humanSize(totalPendingBytes)}${pendingItems.some((item) => item.isEstimated) ? '* (Aprox)' : ''}`;
  const sortedLibraryItems = sortLibraryData(libraryItems, sortBy, sortAsc);
  const playlistAllSelected =
    analysis?.type === 'playlist' &&
    analysis.entries.length > 0 &&
    selectedPlaylistIndices.length === analysis.entries.length;
  const completedCount = queue.filter((item) => item.status === 'done').length;
  const totalQueueItems = queue.length;
  const globalProgress = totalQueueItems > 0 ? (completedCount / totalQueueItems) * 100 : 0;

  return (
    <>
      <div className="ambient-glow" />
      <TitleBar />

      <div className="app-container">
        <Sidebar
          currentView={currentView}
          queueCount={queueCount}
          currentPath={truncatePath(activeDownloadPath)}
          currentPathTitle={activeDownloadPath || 'Padrão'}
          onNavigate={handleNavigate}
          onChooseFolder={handleChooseFolder}
          onResetPath={handleResetPath}
        />

        <main className="main-content">
          {currentView === 'home' ? (
            <HomeView
              query={query}
              analysisQuery={analysisQuery}
              isLoading={isAnalyzing}
              analysis={analysis}
              activeFormatTab={activeFormatTab}
              playlistMode={playlistMode}
              playlistQuality={playlistQuality}
              selectedPlaylistIndices={selectedPlaylistIndices}
              playlistAllSelected={Boolean(playlistAllSelected)}
              recentlyAddedKey={recentlyAddedKey}
              carouselIndex={carouselIndex}
              onQueryChange={setQuery}
              onAnalyze={() => void handleAnalyze()}
              onFormatTabChange={setActiveFormatTab}
              onAddResultToQueue={handleAddResultToQueue}
              onPlaylistModeChange={handlePlaylistModeChange}
              onPlaylistQualityChange={setPlaylistQuality}
              onTogglePlaylistIndex={handleTogglePlaylistIndex}
              onToggleAllPlaylist={handleToggleAllPlaylist}
              onAddPlaylistToQueue={() => void handleAddPlaylistToQueue()}
              onSelectSearchItem={handleSelectSearchItem}
              onOpenPreview={handleOpenPreview}
            />
          ) : null}

          {currentView === 'queue' ? (
            <QueueView
              queue={queue}
              estimatedSizeText={estimatedSizeText}
              isDownloading={isDownloading}
              onClearQueue={handleClearQueue}
              onCancelDownloads={() => void handleCancelDownloads()}
              onStartDownloads={() => void handleStartDownloads()}
              onRemoveFromQueue={handleRemoveFromQueue}
            />
          ) : null}

          {currentView === 'history' ? (
            <HistoryView
              items={sortedLibraryItems}
              isLoading={isHistoryLoading}
              sortBy={sortBy}
              sortAsc={sortAsc}
              sortMenuOpen={sortMenuOpen}
              thumbnailCache={thumbnailCache}
              onToggleSortMenu={() => setSortMenuOpen((isOpen) => !isOpen)}
              onSetSortBy={handleSetSortBy}
              onToggleSortDir={() => setSortAsc((isAscending) => !isAscending)}
              onClearAll={handleClearAllDownloads}
              onOpenFolder={() => void handleOpenDownloadsFolder()}
              onDeleteItem={handleDeleteItem}
              onOpenItem={(path) => window.electronAPI?.openLocalMedia(path)}
              onHoverChange={setIsHoveringLibrary}
            />
          ) : null}

          {currentView === 'settings' ? (
            <SettingsView
              openAtLogin={systemSettings.openAtLogin}
              startHidden={config.start_minimized}
              minimizeToTray={systemSettings.minimizeToTray}
              appVersion={appVersion}
              onToggleAutoStart={(value) => void handleToggleAutoStart(value)}
              onToggleStartHidden={(value) => void handleToggleStartHidden(value)}
              onToggleMinimizeTray={(value) => void handleToggleMinimizeTray(value)}
              onCheckForUpdates={() => window.electronAPI?.checkForUpdatesManual()}
            />
          ) : null}
        </main>
      </div>

      <div className={`global-progress-container ${isDownloading ? '' : 'hidden'}`}>
        <div className="gp-info">
          <span className="gp-status">Processando fila...</span>
          <span className="gp-count">{`${completedCount}/${totalQueueItems} Concluídos`}</span>
        </div>
        <div className="gp-track">
          <div className="gp-bar" style={{ width: `${globalProgress}%` }} />
        </div>
      </div>
      <Modal modal={modal} onClose={closeModal} onConfirm={handleModalConfirm} />
      <PreviewModal preview={preview} onClose={handleClosePreview} />
    </>
  );
}



