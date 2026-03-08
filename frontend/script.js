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
            if (document.getElementById('historyView').classList.contains('hidden')) {
                triggerSmartSync();
            }
        });
    }
    window.onfocus = () => { if (!document.getElementById('historyView').classList.contains('hidden')) revalidateHistory(); };
});

async function loadConfig() {
    try {
        const res = await fetch('http://127.0.0.1:5000/api/config');
        const data = await res.json();
        if (data.download_path) { selectedDownloadPath = data.download_path; updatePathUI(data.download_path); }
    } catch (e) {}
}
async function loadSysSettings() {
     try {
        if (window.electronAPI) {
            const s = await window.electronAPI.getSysSettings();
            document.getElementById('checkAutoStart').checked = s.openAtLogin;
            const configRes = await fetch('http://127.0.0.1:5000/api/config');
            const configData = await configRes.json();
            document.getElementById('checkStartHidden').checked = configData.start_minimized;
            document.getElementById('checkMinimizeTray').checked = s.minimizeToTray;
            toggleHiddenState(); 
        }
    } catch(e){}
}
function toggleHiddenState() {
    const startOn = document.getElementById('checkAutoStart').checked;
    const hiddenSwitch = document.getElementById('checkStartHidden');
    hiddenSwitch.disabled = !startOn;
    hiddenSwitch.parentElement.parentElement.style.opacity = startOn ? '1' : '0.5';
}
async function toggleAutoStart() {
    const c = document.getElementById('checkAutoStart').checked;
    const h = document.getElementById('checkStartHidden').checked;
    toggleHiddenState();
    await fetch('http://127.0.0.1:5000/api/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ auto_start: c }) });
    if (window.electronAPI) await window.electronAPI.setSysSettings({ openAtLogin: c, startHidden: h });
}

async function toggleStartHidden() {
    const c = document.getElementById('checkAutoStart').checked;
    const h = document.getElementById('checkStartHidden').checked;
    await fetch('http://127.0.0.1:5000/api/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ start_minimized: h }) });
    if (window.electronAPI) await window.electronAPI.setSysSettings({ openAtLogin: c, startHidden: h });
}

async function toggleMinimizeTray() {
    const c = document.getElementById('checkMinimizeTray').checked;
    await fetch('http://127.0.0.1:5000/api/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ minimize_tray: c }) });
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
    event.currentTarget.classList.add('active');
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(view + 'View').classList.remove('hidden');
    if (view === 'history') { loadHistory(); startLibraryHeartbeat(); } else { stopLibraryHeartbeat(); }
    if(view === 'queue') { renderQueue(); updateEstimatedSize(); }
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
            await fetch('http://127.0.0.1:5000/api/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ download_path: path }) });
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
document.getElementById('urlInput').addEventListener('keypress', (e) => { if(e.key==='Enter') fetchInfo() });

async function fetchInfo() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) return;
    document.getElementById('loader').classList.remove('hidden');
    document.getElementById('resultArea').classList.add('hidden');
    document.getElementById('playlistResultArea').classList.add('hidden');
    try {
        const res = await fetch('http://127.0.0.1:5000/api/info', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url }) });
        const data = await res.json();
        
        if (data.error) {
            showModal('alert', 'Não foi possível analisar', data.error);
        } else {
            currentData = data;
            if (currentData.type === 'playlist') renderPlaylist(currentData); else renderResult(currentData);
        }
    } catch (e) { showModal('alert', 'Erro de Conexão', 'Não foi possível conectar ao servidor interno (Backend). Verifique se o aplicativo foi iniciado corretamente.'); }
    finally { document.getElementById('loader').classList.add('hidden'); }
}

function renderResult(data) {
    document.getElementById('vidThumbnail').src = data.thumbnail;
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
    
    const modeSelect = document.getElementById('plMode');
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
        list.innerHTML += `<div class="pl-item"><input type="checkbox" class="pl-check" data-idx="${index}" checked><img src="${item.thumbnail || 'icon.png'}" class="pl-thumb"><div class="pl-meta"><div class="pl-title" title="${item.title}">${item.title}</div><div class="pl-dur">${item.uploader || ''}</div></div></div>`;
    });
    
    document.getElementById('checkAllPl').onchange = (e) => { document.querySelectorAll('.pl-check').forEach(cb => cb.checked = e.target.checked); };
    document.getElementById('playlistResultArea').classList.remove('hidden');
}

function addPlaylistToQueue() {
    const mode = document.getElementById('plMode').value;
    const qual = document.getElementById('plQuality').value;
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
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); event.target.classList.add('active');
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
    const btn = event.target; btn.innerText = "Adicionado"; btn.style.background = "#10B981";
    setTimeout(() => { btn.innerText = "+ Fila"; btn.style.background = ""; }, 1000);
}

function updateQueueBadge() {
    const c = downloadQueue.filter(i => i.status === 'pending').length;
    document.getElementById('queueCount').innerText = c; document.getElementById('queueCount').classList.toggle('hidden', c === 0);
}

function updateEstimatedSize() {
    const total = downloadQueue.filter(i => i.status === 'pending').reduce((acc, i) => acc + (i.filesize_bytes||0), 0);
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
                method: 'POST', headers: {'Content-Type': 'application/json'},
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
                
                await new Promise((resolve) => {
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
                        } catch(e) { clearInterval(poller); resolve(); }
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
    
    await fetch('http://127.0.0.1:5000/api/cancel', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ids: [] }) });
    
    showModal('alert', 'Cancelado', 'Todos os downloads ativos foram interrompidos e arquivos parciais removidos.');
}

function toggleButtons(downloading) {
    const btnStart = document.getElementById('btnStart'); const btnCancel = document.getElementById('btnCancel'); const btnClean = document.getElementById('btnClean');
    if (downloading) { btnStart.classList.add('btn-disabled'); btnClean.classList.add('btn-disabled'); btnCancel.classList.remove('btn-disabled'); btnCancel.removeAttribute('disabled'); } 
    else { btnStart.classList.remove('btn-disabled'); btnClean.classList.remove('btn-disabled'); btnCancel.classList.add('btn-disabled'); btnCancel.setAttribute('disabled', 'true'); }
}

async function revalidateHistory(silent = false) {
    try {
        const res = await fetch('http://127.0.0.1:5000/api/revalidate-history', { method: 'POST' });
        const d = await res.json();
        if(d.status === 'ok' && d.history) { renderHistoryUI(d.history); } else if (!silent) { loadHistory(); }
    } catch(e) {}
}

async function loadHistory() {
    const list = document.getElementById('historyList');
    if (!list.hasChildNodes()) list.innerHTML = '<p style="text-align:center; color:#64748B;">Carregando...</p>';
    try {
        const res = await fetch('http://127.0.0.1:5000/api/history');
        const data = await res.json();
        renderHistoryUI(data);
    } catch(e) { list.innerHTML = '<p style="text-align:center;">Erro ao carregar.</p>'; }
}

function renderHistoryUI(data) {
    const list = document.getElementById('historyList');
    const scrollPos = list.parentElement ? list.parentElement.scrollTop : 0;
    list.innerHTML = '';
    if (!data || data.length === 0) { list.innerHTML = '<div class="empty-state">Sua biblioteca está vazia. Os arquivos baixados aparecerão aqui.</div>'; return; }
    data.forEach(item => {
        const icon = item.type === 'video' ? '<svg class="h-icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5,3 19,12 5,21 5,3"/></svg>' : '<svg class="h-icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
        list.innerHTML += `<div class="history-item"><div class="h-icon">${icon}</div><div class="h-info"><div class="h-title">${item.title}</div><div class="h-meta">${item.quality} • ${item.filesize_str}</div><div class="h-path">${item.filename}</div></div><button class="btn-trash" onclick="deleteItem('${item.id}')"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div>`;
    });
    if (list.parentElement) list.parentElement.scrollTop = scrollPos;
}
function triggerSmartSync() { if (refreshTimeout) clearTimeout(refreshTimeout); refreshTimeout = setTimeout(() => { revalidateHistory(); }, 500); }
function startLibraryHeartbeat() { stopLibraryHeartbeat(); libraryHeartbeat = setInterval(() => { revalidateHistory(true); }, 2000); }
function stopLibraryHeartbeat() { if (libraryHeartbeat) { clearInterval(libraryHeartbeat); libraryHeartbeat = null; } }
async function deleteItem(id) { showModal('confirm', 'Excluir Arquivo', 'Você tem certeza que deseja deletar este arquivo permanentemente do seu computador? Essa ação não pode ser desfeita.', async () => { await fetch('http://127.0.0.1:5000/api/delete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) }); loadHistory(); }); }
async function clearAllDownloads() { showModal('confirm', 'Apagar Toda a Biblioteca', 'ATENÇÃO: Isso apagará TODOS os arquivos listados na biblioteca do seu disco rígido permanentemente. Tem certeza absoluta?', async () => { await fetch('http://127.0.0.1:5000/api/clear-all', { method: 'POST' }); loadHistory(); }); }
async function openDownloadsFolder() { await fetch('http://127.0.0.1:5000/api/open-folder', { method: 'POST' }); }