interface Window {
    electronAPI: any;
}

let currentData = null;
let selectedDownloadPath = null;
let downloadQueue = [];
let isDownloading = false;
let isCancelled = false;
let refreshTimeout = null;
let libraryHeartbeat = null;

function humanSize(b) {
    if (b === 0) return "0 B";
    if (!b) return "N/A";
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(1)} ${units[i]}`;
}

function showModal(type, title, msg, onConfirm = null) {
    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMsg').innerText = msg;
    const mActions = document.getElementById('modalActions');
    mActions.innerHTML = '';

    const closeBtn = document.createElement('button');
    closeBtn.className = type === 'confirm' ? 'btn-add modal-btn' : 'btn-primary modal-btn';
    closeBtn.innerText = type === 'confirm' ? 'Cancelar' : 'OK';
    closeBtn.onclick = () => { modal.classList.add('hidden'); };

    if (type === 'confirm') {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn-primary modal-btn';
        confirmBtn.innerText = 'Confirmar';
        confirmBtn.onclick = () => { modal.classList.add('hidden'); if (onConfirm) onConfirm(); };
        mActions.appendChild(closeBtn); mActions.appendChild(confirmBtn);
    } else {
        mActions.appendChild(closeBtn);
    }
    modal.classList.remove('hidden');
}

// --- BOOT ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadSysSettings();
    startCarousel();
    updateEstimatedSize();

    if (window.electronAPI && window.electronAPI.onDownloadFolderChanged) {
        window.electronAPI.onDownloadFolderChanged(() => {
            if (document.getElementById('historyView')!.classList.contains('hidden')) {
                triggerSmartSync();
            }
        });
    }

    if (window.electronAPI && window.electronAPI.onUpdateEvent) {
        window.electronAPI.onUpdateEvent((evt: any) => {
            if (evt.type === 'checking') {
                showToast('Buscando atualizações...', false, false, 'loading');
            } else if (evt.type === 'available') {
                showToast(`Nova versão (${evt.info.version}) encontrada. Baixando...`, true, false, 'loading');
            } else if (evt.type === 'downloaded') {
                showToast(`Versão ${evt.version} pronta para instalar.`, true, true, 'success');
            } else if (evt.type === 'error') {
                showToast(`${evt.error}`, false, false, 'error');
            } else if (evt.type === 'progress') {
                showToast(`Baixando atualização (${Math.round(evt.percent)}%)...`, true, false, 'loading');
            }
        });
    }

    window.onfocus = () => { if (!document.getElementById('historyView')!.classList.contains('hidden')) revalidateHistory(); };
});

function showToast(msg: string, isPermanent = false, showAction = false, type: 'info' | 'loading' | 'error' | 'success' = 'info') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    document.getElementById('toastContent')!.innerText = msg;
    const btn = document.getElementById('toastActionBtn');

    if (showAction) btn?.classList.remove('hidden');
    else btn?.classList.add('hidden');

    const iconContainer = document.getElementById('toastIcon');
    if (iconContainer) {
        if (type === 'loading') {
            iconContainer.innerHTML = `<svg class="toast-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10" stroke-opacity="0.3"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>`;
            iconContainer.style.color = '#60a5fa';
        } else if (type === 'error') {
            iconContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor"></circle><path d="M12 8v4" stroke="white" stroke-width="2" stroke-linecap="round"></path><circle cx="12" cy="16" r="1.25" fill="white"></circle></svg>`;
            iconContainer.style.color = '#3b82f6';
        } else if (type === 'success') {
            iconContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor"></circle><path d="M8 12.5l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
            iconContainer.style.color = '#10b981';
        } else {
            iconContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor"></circle><path d="M12 16v-4" stroke="white" stroke-width="2" stroke-linecap="round"></path><circle cx="12" cy="8" r="1.25" fill="white"></circle></svg>`;
            iconContainer.style.color = '#3b82f6';
        }
    }

    toast.classList.remove('hidden');

    if (!isPermanent) {
        setTimeout(() => toast.classList.add('hidden'), 5000);
    }
}

async function loadConfig() {
    try {
        const res = await fetch('http://127.0.0.1:5000/api/config');
        const data = await res.json();
        if (data.download_path) { selectedDownloadPath = data.download_path; updatePathUI(data.download_path); }
    } catch (e) { }
}
async function loadSysSettings() {
    try {
        if (window.electronAPI) {
            const s = await window.electronAPI.getSysSettings();
            (document.getElementById('checkAutoStart') as HTMLInputElement).checked = s.openAtLogin;
            const configRes = await fetch('http://127.0.0.1:5000/api/config');
            const configData = await configRes.json();
            (document.getElementById('checkStartHidden') as HTMLInputElement).checked = configData.start_minimized;
            (document.getElementById('checkMinimizeTray') as HTMLInputElement).checked = s.minimizeToTray;
            toggleHiddenState();

            try {
                const version = await window.electronAPI.getAppVersion();
                const badge = document.getElementById('appVersionBadge');
                if (badge) badge.innerText = `v${version}`;
            } catch (e) { }
        }
    } catch (e) { }
}
function toggleHiddenState() {
    const startOn = (document.getElementById('checkAutoStart') as HTMLInputElement).checked;
    const hiddenSwitch = document.getElementById('checkStartHidden') as HTMLInputElement;
    hiddenSwitch.disabled = !startOn;
    hiddenSwitch.parentElement.parentElement.style.opacity = startOn ? '1' : '0.5';
}
async function toggleAutoStart() {
    const c = (document.getElementById('checkAutoStart') as HTMLInputElement).checked;
    const h = (document.getElementById('checkStartHidden') as HTMLInputElement).checked;
    toggleHiddenState();
    await fetch('http://127.0.0.1:5000/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto_start: c }) });
    if (window.electronAPI) await window.electronAPI.setSysSettings({ openAtLogin: c, startHidden: h });
}

async function toggleStartHidden() {
    const c = (document.getElementById('checkAutoStart') as HTMLInputElement).checked;
    const h = (document.getElementById('checkStartHidden') as HTMLInputElement).checked;
    await fetch('http://127.0.0.1:5000/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start_minimized: h }) });
    if (window.electronAPI) await window.electronAPI.setSysSettings({ openAtLogin: c, startHidden: h });
}

async function toggleMinimizeTray() {
    const c = (document.getElementById('checkMinimizeTray') as HTMLInputElement).checked;
    await fetch('http://127.0.0.1:5000/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minimize_tray: c }) });
    if (window.electronAPI) await window.electronAPI.setSysSettings({ minimizeToTray: c });
}

function startCarousel() {
    const slides = document.querySelectorAll('.slide');
    const root = document.documentElement;
    if (slides.length > 0) root.style.setProperty('--ambient-color', slides[0].getAttribute('data-color'));
    let idx = 0;
    setInterval(() => {
        slides[idx].classList.remove('active'); idx = (idx + 1) % slides.length; slides[idx].classList.add('active');
        root.style.setProperty('--ambient-color', slides[idx].getAttribute('data-color'));
    }, 6000);
}

function navTo(view) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    (event.currentTarget as HTMLElement).classList.add('active');
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(view + 'View').classList.remove('hidden');
    if (view === 'history') { loadHistory(); startLibraryHeartbeat(); } else { stopLibraryHeartbeat(); }
    if (view === 'queue') { renderQueue(); updateEstimatedSize(); }
}
function updatePathUI(path) {
    const el = document.getElementById('currentPath');
    el.innerText = path.length > 25 ? '...' + path.slice(-25) : path;
    el.title = path;
}
async function chooseFolder() {
    if (window.electronAPI) {
        const path = await window.electronAPI.selectFolder();
        if (path) {
            selectedDownloadPath = path; updatePathUI(path);
            await fetch('http://127.0.0.1:5000/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ download_path: path }) });
            window.electronAPI.notifyDownloadPathChanged(path);
        }
    }
}
async function resetPath() {
    const res = await fetch('http://127.0.0.1:5000/api/config/reset', { method: 'POST' });
    const data = await res.json();
    if (data.status === 'ok') { selectedDownloadPath = data.path; updatePathUI(data.path); window.electronAPI.notifyDownloadPathChanged(data.path); }
}

// --- BUSCA ---
document.getElementById('btnSearch').addEventListener('click', fetchInfo);
document.getElementById('urlInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchInfo() });

async function fetchInfo() {
    const url = (document.getElementById('urlInput') as HTMLInputElement).value.trim();
    if (!url) return;
    document.getElementById('loader')!.classList.remove('hidden');
    document.getElementById('resultArea')!.classList.add('hidden');
    document.getElementById('playlistResultArea')!.classList.add('hidden');
    document.getElementById('searchListArea')!.classList.add('hidden');
    try {
        const res = await fetch('http://127.0.0.1:5000/api/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
        const data = await res.json();

        if (data.error) {
            showModal('alert', 'Não foi possível analisar', data.error);
        } else {
            currentData = data;
            if (currentData.type === 'playlist') renderPlaylist(currentData);
            else if (currentData.type === 'search_results') renderSearchList(currentData);
            else renderResult(currentData);
        }
    } catch (e) { showModal('alert', 'Erro de Conexão', 'Não foi possível conectar ao servidor interno (Backend). Verifique se o aplicativo foi iniciado corretamente.'); }
    finally { document.getElementById('loader').classList.add('hidden'); }
}

function renderResult(data) {
    const parentContainer = document.getElementById('vidThumbnail').parentElement;
    parentContainer.style.position = 'relative';
    parentContainer.style.cursor = 'pointer';
    parentContainer.onclick = () => openPreview(data.id, data.title.replace(/'/g, "\\'"));

    (document.getElementById('vidThumbnail') as HTMLImageElement).src = data.thumbnail;

    // Add play overlay if it doesn't exist
    if (!document.getElementById('singleVidPlayOverlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'singleVidPlayOverlay';
        overlay.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 10; border-radius: 12px; transition: opacity 0.2s; pointer-events: none;';
        overlay.innerHTML = '<svg viewBox="0 0 24 24" width="48" height="48" fill="white" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.8));"><polygon points="5,3 19,12 5,21 5,3"/></svg>';
        parentContainer.appendChild(overlay);
    }

    document.getElementById('vidTitle').innerText = data.title;
    document.getElementById('vidAuthor').innerText = data.author;
    document.getElementById('vidDuration').innerText = data.duration || '--:--';

    const safeId = encodeURIComponent(data.id);
    const safeTitle = encodeURIComponent(data.title);
    const safeThumb = encodeURIComponent(data.thumbnail);

    const render = (div, list, type) => {
        const el = document.getElementById(div); el.innerHTML = '';
        list.forEach(fmt => {
            el.innerHTML += `<div class="opt-row">
                <div class="opt-info">
                    <div class="opt-quality-badge">${fmt.quality}</div>
                    <span class="opt-size">${fmt.filesize}</span>
                </div>
                <button class="btn-add-mini" onclick="addToQueue('${fmt.format_id}', '${type}', '${fmt.quality}', ${fmt.filesize_bytes}, '${safeId}', '${safeTitle}', '${safeThumb}')">
                    + Fila
                </button>
            </div>`;
        });
    };
    render('videoOptions', data.formats_video, 'video');
    render('audioOptions', data.formats_audio, 'audio');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab:first-child').classList.add('active');
    document.getElementById('videoOptions').classList.remove('hidden');
    document.getElementById('audioOptions').classList.add('hidden');
    document.getElementById('resultArea').classList.remove('hidden');
}

function renderPlaylist(data) {
    document.getElementById('plTitle').innerText = data.title;
    document.getElementById('plCount').innerText = `${data.count} vídeos encontrados`;
    const list = document.getElementById('playlistItems'); list.innerHTML = '';

    const modeSelect = document.getElementById('plMode') as HTMLSelectElement;
    modeSelect.value = 'video';

    const updateQualityOptions = () => {
        const mode = modeSelect.value;
        const qualSelect = document.getElementById('plQuality');
        qualSelect.innerHTML = '';

        if (mode === 'video') {
            qualSelect.innerHTML = `
                <option value="1080p">Full HD (1080p)</option>
                <option value="720p">HD (720p)</option>
                <option value="480p">Leve (480p)</option>
            `;
        } else {
            qualSelect.innerHTML = `
                <option value="320kbps">Alta Qualidade (320kbps)</option>
                <option value="192kbps" selected>Padrão (192kbps)</option>
                <option value="128kbps">Leve (128kbps)</option>
            `;
        }
    };

    modeSelect.onchange = updateQualityOptions;
    updateQualityOptions();

    data.entries.forEach((item, index) => {
        list.innerHTML += `
        <div class="pl-item">
            <input type="checkbox" class="pl-check" data-idx="${index}" checked>
            <div class="pl-thumb-container" style="position: relative; width: 120px; height: 68px; border-radius: 8px; overflow: hidden; cursor: pointer;" onclick="openPreview('${item.id}', '${item.title.replace(/'/g, "\\'")}')">
                <img src="${item.thumbnail || 'icon.png'}" class="pl-thumb" style="width: 100%; height: 100%; object-fit: cover; border-radius: 0;">
                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; opacity: 1; transition: opacity 0.2s;">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="white" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.8));"><polygon points="5,3 19,12 5,21 5,3"/></svg>
                </div>
            </div>
            <div class="pl-meta">
                <div class="pl-title" title="${item.title}">${item.title}</div>
                <div class="pl-dur">${item.uploader || ''}</div>
            </div>
        </div>`;
    });

    document.getElementById('checkAllPl')!.onchange = (e) => { document.querySelectorAll('.pl-check').forEach(cb => (cb as HTMLInputElement).checked = (e.target as HTMLInputElement).checked); };
    document.getElementById('playlistResultArea')!.classList.remove('hidden');
}

function renderSearchList(data: any) {
    const inputStr = (document.getElementById('urlInput') as HTMLInputElement).value;
    document.getElementById('slTitle')!.innerText = `Resultados para: "${inputStr}"`;
    document.getElementById('slCount')!.innerText = `${data.entries.length} vídeos encontrados`;
    const list = document.getElementById('searchItems');
    if (!list) return;
    list.innerHTML = '';

    data.entries.forEach((item: any) => {
        list.innerHTML += `
        <div class="pl-item">
            <div class="pl-thumb-container" style="position: relative; width: 150px; height: 85px; border-radius: 8px; overflow: hidden; cursor: pointer; flex-shrink: 0;" onclick="openPreview('${item.id}', '${item.title.replace(/'/g, "\\'")}')">
                <img src="${item.thumbnail || 'icon.png'}" class="pl-thumb" style="width: 100%; height: 100%; object-fit: cover; border-radius: 0;">
                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; opacity: 1; transition: opacity 0.2s;">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="white" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.8));"><polygon points="5,3 19,12 5,21 5,3"/></svg>
                </div>
            </div>
            <div class="pl-meta" style="flex: 1; min-width: 0;">
                <div class="pl-title" title="${item.title}" style="white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${item.title}</div>
                <div class="pl-dur">${item.uploader || ''} ${item.duration ? '• ' + item.duration : ''}</div>
            </div>
            <button class="btn-primary-mini" onclick="selectSearchItem('https://youtube.com/watch?v=${item.id}')" style="align-self: flex-start; margin-top: 10px;">
                Selecionar
            </button>
        </div>`;
    });

    document.getElementById('searchListArea')!.classList.remove('hidden');
}

function selectSearchItem(url: string) {
    const input = document.getElementById('urlInput') as HTMLInputElement;
    if (input) {
        input.value = url;
    }
    fetchInfo();
}

function addPlaylistToQueue() {
    const mode = (document.getElementById('plMode') as HTMLSelectElement).value;
    const qual = (document.getElementById('plQuality') as HTMLSelectElement).value;
    const checkboxes = document.querySelectorAll('.pl-check:checked');
    if (checkboxes.length === 0) return showModal('alert', 'Nenhum vídeo selecionado', 'Por favor, marque pelo menos um vídeo ou música da lista para adicionar à fila.');
    checkboxes.forEach(cb => {
        const idx = cb.getAttribute('data-idx'); const item = currentData.entries[idx];
        const estSize = mode === 'audio' ? 5000000 : 50000000;
        downloadQueue.push({
            id: Date.now() + Math.random(),
            taskId: null,
            vidId: item.id,
            title: item.title,
            thumbnail: item.thumbnail,
            formatId: 'playlist_video',
            mode: mode,
            quality: qual,
            filesize_bytes: estSize,
            isEstimated: true,
            status: 'pending',
            progress: 0
        });
    });
    updateQueueBadge(); updateEstimatedSize(); navTo('queue');
    new Notification("LEG3NDY Studio", { body: `${checkboxes.length} itens adicionados à fila.` });
}
function switchTab(type) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const targetTab = document.querySelector(`.tab[onclick="switchTab('${type}')"]`);
    if (targetTab) targetTab.classList.add('active');

    document.getElementById('videoOptions').classList.toggle('hidden', type !== 'video');
    document.getElementById('audioOptions').classList.toggle('hidden', type !== 'audio');
}

function addToQueue(fid, mode, qual, size, vidIdEnc, titleEnc, thumbEnc) {
    const vidId = decodeURIComponent(vidIdEnc);
    const title = decodeURIComponent(titleEnc);
    const thumb = decodeURIComponent(thumbEnc);

    downloadQueue.push({
        id: Date.now(),
        taskId: null,
        vidId: vidId,
        title: title,
        thumbnail: thumb,
        formatId: fid,
        mode,
        quality: qual,
        filesize_bytes: size,
        status: 'pending',
        progress: 0
    });
    updateQueueBadge(); updateEstimatedSize();
    const btn = event.target as HTMLElement; btn.innerText = "Adicionado"; btn.style.background = "#10B981";
    setTimeout(() => { btn.innerText = "+ Fila"; btn.style.background = ""; }, 1000);
}

function updateQueueBadge() {
    const c = downloadQueue.filter(i => i.status === 'pending').length;
    document.getElementById('queueCount')!.innerText = c.toString(); document.getElementById('queueCount').classList.toggle('hidden', c === 0);
}

function updateEstimatedSize() {
    const total = downloadQueue.filter(i => i.status === 'pending').reduce((acc, i) => acc + (i.filesize_bytes || 0), 0);
    const hasEstimates = downloadQueue.some(i => i.isEstimated && i.status === 'pending');
    let txt = `Tamanho Estimado: ${humanSize(total)}`; if (hasEstimates) txt += "* (Aprox)";
    document.getElementById('estimatedQueueSize').innerText = txt;
}

function removeFromQueue(id) {
    downloadQueue = downloadQueue.filter(i => i.id !== id);
    renderQueue(); updateQueueBadge(); updateEstimatedSize();
}
function clearQueue() {
    if (downloadQueue.length === 0) return;
    if (isDownloading) return showModal('alert', 'Aguarde', 'Você não pode limpar a fila enquanto houver downloads ativos. Por favor, cancele ou aguarde o término.');
    showModal('confirm', 'Limpar toda a fila?', 'Você tem certeza que deseja remover todos os itens da lista de espera? Isso não apaga arquivos já baixados.', () => { downloadQueue = []; renderQueue(); updateQueueBadge(); updateEstimatedSize(); });
}

function updateGlobalProgress() {
    const container = document.getElementById('globalProgressContainer');
    if (!isDownloading) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const total = downloadQueue.length;
    const completed = downloadQueue.filter(i => i.status === 'done').length;

    const percent = total > 0 ? (completed / total) * 100 : 0;

    document.getElementById('gpCount').innerText = `${completed}/${total} Concluídos`;
    document.getElementById('gpBar').style.width = `${percent}%`;
}

// --- CORE: DOWNLOAD MANAGER ---
async function processQueue() {
    if (isDownloading) return;
    const pending = downloadQueue.filter(i => i.status === 'pending');
    if (pending.length === 0) return showModal('alert', 'Sua fila está vazia', 'Adicione vídeos ou músicas à fila antes de iniciar o download.');

    isDownloading = true; isCancelled = false; toggleButtons(true);
    renderQueue();
    updateGlobalProgress();

    for (const item of pending) {
        if (isCancelled) break;
        item.status = 'starting'; renderQueue();

        try {
            const res = await fetch('http://127.0.0.1:5000/api/download', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                // AQUI ESTÁ A ÚNICA CORREÇÃO DESTE ARQUIVO
                body: JSON.stringify({
                    vidId: item.vidId, // Enviando 'vidId' em vez de 'id'
                    title: item.title,
                    format_id: item.formatId,
                    mode: item.mode,
                    quality: item.quality,
                    downloadPath: selectedDownloadPath
                })
            });
            const d = await res.json();

            if (d.status === 'started') {
                item.taskId = d.task_id;
                item.status = 'downloading';
                renderQueue();

                await new Promise<void>((resolve) => {
                    const poller = setInterval(async () => {
                        if (isCancelled) {
                            clearInterval(poller);
                            item.status = 'pending';
                            resolve();
                            return;
                        }

                        try {
                            const statRes = await fetch(`http://127.0.0.1:5000/api/status/${item.taskId}`);
                            const statData = await statRes.json();

                            if (statData.status === 'cancelled') {
                                clearInterval(poller);
                                item.status = 'pending';
                                item.progress = 0;
                                resolve();
                                return;
                            }

                            item.progress = statData.percent;
                            updateItemProgressUI(item.id, statData.percent);

                            if (statData.status === 'success') {
                                clearInterval(poller);
                                item.status = 'done';
                                item.progress = 100;
                                updateGlobalProgress();
                                renderQueue();
                                resolve();
                            } else if (statData.status === 'error') {
                                clearInterval(poller);
                                item.status = 'error';
                                renderQueue();
                                resolve();
                            }
                        } catch (e) { clearInterval(poller); resolve(); }
                    }, 500);
                });
            } else {
                item.status = 'error';
                renderQueue();
            }

        } catch (e) { item.status = 'error'; renderQueue(); }
    }

    isDownloading = false;
    toggleButtons(false);
    updateQueueBadge();
    updateEstimatedSize();
    updateGlobalProgress();
    renderQueue();

    if (!isCancelled) new Notification("LEG3NDY Studio", { body: "Todos os downloads da fila foram concluídos com sucesso." });
}

function renderQueue() {
    const list = document.getElementById('queueList');
    if (downloadQueue.length === 0) { list.innerHTML = '<div class="empty-state">Sua fila está vazia.</div>'; return; }

    list.innerHTML = '';

    downloadQueue.forEach(i => {
        let stClass = i.status === 'done' ? 'st-done' : i.status === 'error' ? 'st-error' : i.status === 'downloading' ? 'st-loading' : 'st-pending';
        let stText = i.status === 'done' ? 'Concluído' : i.status === 'error' ? 'Erro' : i.status === 'downloading' ? 'Baixando...' : i.status === 'starting' ? 'Iniciando...' : 'Pendente';

        let progressHTML = '';
        if (i.status === 'downloading' || i.status === 'done') {
            progressHTML = `
            <div class="q-progress-track">
                <div class="q-progress-bar" id="prog-bar-${i.id}" style="width: ${i.progress}%"></div>
            </div>`;
        } else if (i.status === 'starting') {
            progressHTML = `
            <div class="q-progress-track">
                <div class="q-progress-bar" style="width: 0%; opacity: 0.5;"></div>
            </div>`;
        }

        list.innerHTML += `
        <div class="queue-item">
            <img src="${i.thumbnail || 'icon.png'}">
            <div class="q-info">
                <div class="q-title">${i.title}</div>
                <div class="q-meta">${i.mode} • ${i.quality}</div>
                ${progressHTML}
            </div>
            <div class="q-status">
                <span class="${stClass}">${stText}</span>
            </div>
            <button class="queue-trash" onclick="removeFromQueue(${i.id})" ${isDownloading ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
        </div>`;
    });
}

let isHoveringLibrary = false;
document.addEventListener('DOMContentLoaded', () => {
    const hl = document.getElementById('historyList');
    if (hl) {
        hl.addEventListener('mouseenter', () => isHoveringLibrary = true);
        hl.addEventListener('mouseleave', () => isHoveringLibrary = false);
    }
});

function updateItemProgressUI(itemId, percent) {
    const el = document.getElementById(`prog-bar-${itemId}`);
    if (el) el.style.width = `${percent}%`;
}

async function cancelDownloads() {
    if (!isDownloading) return;

    isDownloading = false;
    isCancelled = true;

    downloadQueue.forEach(item => {
        if (item.status === 'downloading' || item.status === 'starting') {
            item.status = 'pending';
            item.progress = 0;
        }
    });

    renderQueue();
    toggleButtons(false);
    updateGlobalProgress();

    await fetch('http://127.0.0.1:5000/api/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [] }) });

    showModal('alert', 'Cancelado', 'Todos os downloads ativos foram interrompidos e arquivos parciais removidos.');
}

function toggleButtons(downloading) {
    const btnStart = document.getElementById('btnStart'); const btnCancel = document.getElementById('btnCancel'); const btnClean = document.getElementById('btnClean');
    if (downloading) { btnStart.classList.add('btn-disabled'); btnClean.classList.add('btn-disabled'); btnCancel.classList.remove('btn-disabled'); btnCancel.removeAttribute('disabled'); }
    else { btnStart.classList.remove('btn-disabled'); btnClean.classList.remove('btn-disabled'); btnCancel.classList.add('btn-disabled'); btnCancel.setAttribute('disabled', 'true'); }
}

async function revalidateHistory(silent = false) {
    if (isHoveringLibrary) return;
    try {
        const res = await fetch('http://127.0.0.1:5000/api/library');
        const data = await res.json();
        renderHistoryUI(data);
    } catch (e) {
        if (!silent) console.error("Erro no heartbeat da biblioteca");
    }
}

async function loadHistory() {
    const list = document.getElementById('historyList');
    if (!list.hasChildNodes()) list.innerHTML = '<p style="text-align:center; color:#64748B;">Carregando Biblioteca...</p>';
    try {
        const res = await fetch('http://127.0.0.1:5000/api/library');
        const data = await res.json();
        renderHistoryUI(data);
    } catch (e) { list.innerHTML = '<p style="text-align:center;">Erro ao carregar arquivos locais.</p>'; }
}

// Cache for native thumbnails so heartbeat re-renders don't flicker
const _thumbCache = new Map<string, string>();

// Sort state
let _sortBy = 'date';   // 'date' | 'size' | 'name' | 'type'
let _sortAsc = false;    // false = descending (newest/biggest first)
let _lastLibraryData: any[] = [];

const _sortLabels = { date: 'Por data', size: 'Por tamanho', name: 'Por nome', type: 'Por tipo' };

function toggleSortDropdown(e?: MouseEvent) {
    if (e) {
        e.stopPropagation();
    }
    const menu = document.getElementById('sortDropdownMenu');
    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : 'block';

    // Highlight active option
    document.querySelectorAll('.sort-option').forEach((el: HTMLElement) => {
        const active = el.getAttribute('data-sort') === _sortBy;
        el.style.color = active ? '#3b82f6' : '#94a3b8';
        el.style.fontWeight = active ? '600' : '500';
    });

    if (!isOpen) {
        const close = (eClick) => {
            if (!menu.contains(eClick.target as Node)) {
                menu.style.display = 'none';
                document.removeEventListener('click', close);
            }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
    }
}

function setSortBy(by: string) {
    _sortBy = by;
    document.getElementById('sortDropdownMenu').style.display = 'none';
    const btn = document.getElementById('sortDropdownBtn');
    btn.innerHTML = `${_sortLabels[by]} <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`;
    renderHistoryUI(_lastLibraryData);
}

function toggleSortDir() {
    _sortAsc = !_sortAsc;
    const btn = document.getElementById('sortDirBtn');
    btn.style.color = _sortAsc ? '#3b82f6' : '#94a3b8';
    btn.title = _sortAsc ? 'Ordem crescente' : 'Ordem decrescente';
    renderHistoryUI(_lastLibraryData);
}

function formatDate(mtime: number): string {
    const d = new Date(mtime * 1000);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hrs = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${mon}/${year} ${hrs}:${min}`;
}

function sortLibraryData(data: any[]): any[] {
    const sorted = [...data];
    sorted.sort((a, b) => {
        let cmp = 0;
        switch (_sortBy) {
            case 'date': cmp = (a.mtime || 0) - (b.mtime || 0); break;
            case 'size': cmp = (a.size_bytes || 0) - (b.size_bytes || 0); break;
            case 'name': cmp = (a.title || '').localeCompare(b.title || ''); break;
            case 'type': cmp = (a.type || '').localeCompare(b.type || ''); break;
        }
        return _sortAsc ? cmp : -cmp;
    });
    return sorted;
}

function renderHistoryUI(data) {
    _lastLibraryData = data;
    const list = document.getElementById('historyList');
    const scrollPos = list.parentElement ? list.parentElement.scrollTop : 0;
    list.innerHTML = '';
    if (!data || data.length === 0) { list.innerHTML = '<div class="empty-state">Sua biblioteca está vazia. Os arquivos baixados aparecerão aqui.</div>'; return; }

    const sorted = sortLibraryData(data);
    const thumbRequests: { index: number, rawPath: string }[] = [];
    let htmlParts: string[] = [];

    sorted.forEach((item, index) => {
        let mediaVisual = '';
        const thumbId = `thumb-lib-${index}`;
        const cleanPath = item.path.replace(/\\/g, '\\\\');
        const cachedThumb = _thumbCache.get(item.path);
        const hasThumb = item.thumbnail || cachedThumb;
        const dateStr = item.mtime ? formatDate(item.mtime) : '';

        if (item.thumbnail) {
            mediaVisual = `<img src="${item.thumbnail}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
        } else if (cachedThumb) {
            mediaVisual = `<img src="${cachedThumb}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
        } else {
            const fallbackIcon = item.type === 'video' ? '<svg class="h-icon-svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><polygon points="5,3 19,12 5,21 5,3"/></svg>' : '<svg class="h-icon-svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
            mediaVisual = `<div id="${thumbId}" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">${fallbackIcon}</div>`;

            if (item.type === 'video') {
                thumbRequests.push({ index, rawPath: item.path });
            }
        }

        const iconStyle = hasThumb ? 'padding:0; background:none; border:none; width:80px; height:45px;' : '';

        htmlParts.push(`
        <div class="history-item">
            <div class="h-icon" id="hicon-${index}" style="${iconStyle}" onclick="window.electronAPI.openLocalMedia('${cleanPath}')" title="Reproduzir no Windows">
                ${mediaVisual}
            </div>
            <div class="h-info" onclick="window.electronAPI.openLocalMedia('${cleanPath}')" style="cursor:pointer;" title="Reproduzir no Windows">
                <div class="h-title">${item.title}</div>
                <div class="h-meta">${item.quality || item.type.toUpperCase()} • ${item.size}${dateStr ? ' • ' + dateStr : ''}</div>
                <div class="h-path">${item.filename}</div>
            </div>
            <button class="btn-trash" onclick="deleteItem('${item.id}', '${item.filename.replace(/'/g, "\\'")}')" title="Apagar do Computador">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
        </div>`);
    });

    list.innerHTML = htmlParts.join('');
    if (list.parentElement) list.parentElement.scrollTop = scrollPos;

    // Request native thumbnails AFTER DOM is stable
    if (window.electronAPI && window.electronAPI.getThumbnail) {
        thumbRequests.forEach(req => {
            window.electronAPI.getThumbnail(req.rawPath).then((thumb: string) => {
                if (thumb) {
                    _thumbCache.set(req.rawPath, thumb);
                    const el = document.getElementById(`thumb-lib-${req.index}`);
                    if (el) el.innerHTML = `<img src="${thumb}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
                    const icon = document.getElementById(`hicon-${req.index}`);
                    if (icon) icon.setAttribute('style', 'padding:0; background:none; border:none; width:80px; height:45px;');
                }
            }).catch(() => { });
        });
    }
}
function triggerSmartSync() { if (refreshTimeout) clearTimeout(refreshTimeout); refreshTimeout = setTimeout(() => { revalidateHistory(); }, 500); }
function startLibraryHeartbeat() { stopLibraryHeartbeat(); libraryHeartbeat = setInterval(() => { revalidateHistory(true); }, 2000); }
function stopLibraryHeartbeat() { if (libraryHeartbeat) { clearInterval(libraryHeartbeat); libraryHeartbeat = null; } }
async function deleteItem(id, filename) { showModal('confirm', 'Excluir Arquivo', 'Você tem certeza que deseja deletar este arquivo permanentemente do computador? Essa ação não pode ser desfeita.', async () => { await fetch('http://127.0.0.1:5000/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, filename }) }); loadHistory(); }); }
async function clearAllDownloads() { showModal('confirm', 'Apagar Toda a Biblioteca', 'ATENÇÃO: Isso apagará TODOS os arquivos listados na biblioteca do seu disco rígido permanentemente. Tem certeza absoluta?', async () => { await fetch('http://127.0.0.1:5000/api/clear-all', { method: 'POST' }); loadHistory(); }); }
async function openDownloadsFolder() {
    const p = document.getElementById('currentPath').title;
    if (window.electronAPI && p && p !== 'Padrão' && !p.includes('...')) {
        await window.electronAPI.openPath(p);
    } else {
        await fetch('http://127.0.0.1:5000/api/open-folder', { method: 'POST' });
    }
}

// --- PREVIEW SYSTEM ---
function openPreview(videoId, title) {
    const modal = document.getElementById('previewModal');
    const container = document.getElementById('previewContainer');
    const titleEl = document.getElementById('previewTitle');

    titleEl.innerText = title;

    container.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#94a3b8; background:#000;">
        <svg class="toast-spin" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 12px;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
        <span>Carregando prévia...</span>
    </div>`;

    modal.classList.remove('hidden');

    fetch(`http://127.0.0.1:5000/api/preview?id=${videoId}`)
        .then(res => res.json())
        .then(data => {
            if (data.url) {
                container.innerHTML = `<video width="100%" height="100%" controls autoplay style="outline:none; border-radius:8px; background:#000;">
                    <source src="${data.url}" type="video/mp4">
                </video>`;
            } else {
                container.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center; display:flex; flex-direction:column; justify-content:center; height:100%;">Erro ao carregar prévia: O vídeo pode ter restrição de idade ou DRM.<br>Mas o <b>Download</b> ainda funcionará!</div>`;
            }
        })
        .catch(err => {
            container.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center; display:flex; flex-direction:column; justify-content:center; height:100%;">Falha na conexão com o servidor.</div>`;
        });
}

function closePreview() {
    const modal = document.getElementById('previewModal');
    const container = document.getElementById('previewContainer');

    modal.classList.add('hidden');
    container.innerHTML = '';
}
