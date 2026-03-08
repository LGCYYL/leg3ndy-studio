import os
import json
import random
import datetime
import sys
import re
import time
import requests
import threading
import subprocess
import yt_dlp
import glob
import gc
import tempfile
import shutil
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
import traceback

if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

app = FastAPI(title="LEG3NDY Studio API")

CONCURRENT_DOWNLOADS = threading.Semaphore(3)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    PROJECT_ROOT = BASE_DIR
else:
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, '..'))

APP_DATA_DIR = os.path.join(os.getenv('APPDATA', ''), 'LEG3NDY Studio')
os.makedirs(APP_DATA_DIR, exist_ok=True)
CACHE_DIR = os.path.join(APP_DATA_DIR, 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)
HISTORY_FILE = os.path.join(APP_DATA_DIR, 'history.json')
CONFIG_FILE = os.path.join(APP_DATA_DIR, 'config.json')
USER_DOWNLOADS = os.path.join(os.path.expanduser('~'), 'Downloads')

def get_ffmpeg_path():
    if getattr(sys, 'frozen', False): base = os.path.dirname(sys.executable)
    else: base = PROJECT_ROOT
    paths = [
        os.path.join(base, 'ffmpeg.exe'), os.path.join(base, 'resources_build', 'ffmpeg.exe'),
        os.path.join(base, 'engine', 'ffmpeg.exe'), os.path.join(base, 'resources', 'ffmpeg.exe'), 'ffmpeg.exe'
    ]
    for p in paths:
        if p == 'ffmpeg.exe': return p
        if os.path.exists(p): return p
    return None
FFMPEG_PATH = get_ffmpeg_path()

if not os.path.exists(HISTORY_FILE):
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f: json.dump([], f, ensure_ascii=False)
if not os.path.exists(CONFIG_FILE):
    default_config = {"download_path": USER_DOWNLOADS, "auto_start": False, "start_minimized": False, "minimize_tray": True}
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f: json.dump(default_config, f, indent=4, ensure_ascii=False)

def kill_zombies():
    if sys.platform == 'win32':
        try: subprocess.run('taskkill /F /IM ffmpeg.exe', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except: pass

def force_delete_file(filepath):
    if not os.path.exists(filepath): return True
    for i in range(3):
        try:
            gc.collect(); os.remove(filepath)
            return True
        except:
            time.sleep(1)
            try:
                subprocess.run(f'del /f /q "{filepath}"', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if not os.path.exists(filepath): return True
            except: pass
    return False

def _terminator_thread(target_dir, safe_name):
    time.sleep(3)
    temp_extensions = ['.part', '.ytdl', '.temp', '.tmp', '.f\d+', '.frag', '.webp', '.jpg', '.png']
    pattern = os.path.join(target_dir, f"*{safe_name}*")
    files = glob.glob(pattern)
    for f in files:
        if any(f.endswith(ext) for ext in temp_extensions) and not f.endswith(('.mp4', '.mp3')):
            force_delete_file(f)

def cleanup_after_download(target_dir, safe_name):
    threading.Thread(target=_terminator_thread, args=(target_dir, safe_name), daemon=True).start()

download_states = {}
def update_state(task_id, status, percent=0, msg=""):
    if task_id in download_states:
        download_states[task_id].update({'status': status, 'percent': percent, 'msg': msg})

def sanitize_filename(s):
    import unicodedata
    s = str(s); s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-zA-Z0-9\-\_ ]', '', s).strip(); s = re.sub(r'\s+', ' ', s)
    return s[:80] if s else "video_download"

class ConfigManager:
    def get_all(self):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f: data = json.load(f)
            path = data.get("download_path", USER_DOWNLOADS)
            if not os.path.exists(path): path = USER_DOWNLOADS
            return {"download_path": path, "auto_start": data.get("auto_start", False), "start_minimized": data.get("start_minimized", False), "minimize_tray": data.get("minimize_tray", True)}
        except: return {"download_path": USER_DOWNLOADS, "auto_start": False, "start_minimized": False, "minimize_tray": True}
    def set_all(self, c: dict):
        d = self.get_all(); d.update(c)
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f: json.dump(d, f, indent=4, ensure_ascii=False); return True
    def get_path(self): return self.get_all()["download_path"]
    def reset_path(self): self.set_all({"download_path": USER_DOWNLOADS}); return USER_DOWNLOADS
config_manager = ConfigManager()

class HistoryManager:
    def human_size(self, b):
        if not b: return "N/A"
        try: v = float(b)
        except (ValueError, TypeError): return "N/A"
        for u in ['B', 'KB', 'MB', 'GB', 'TB']:
            if v < 1024: return f"{v:.1f} {u}"
            v /= 1024
        return f"{v:.1f} TB"
    def add(self, item):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f: h = json.load(f)
        except: h = []
        if os.path.exists(item['path']):
            item['filesize_bytes'] = os.path.getsize(item['path'])
            item['filesize_str'] = self.human_size(item['filesize_bytes'])
        item.update({'date': datetime.datetime.now().strftime("%d/%m/%Y %H:%M"), 'id': str(random.randint(10000, 99999))})
        h.insert(0, item)
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f: json.dump(h, f, indent=4, ensure_ascii=False)
    def get_all(self):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f: return json.load(f)
        except: return []
    def delete(self, id):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f: h = json.load(f)
            tgt = next((i for i in h if i['id'] == id), None)
            if tgt and os.path.exists(tgt['path']):
                try: os.remove(tgt['path'])
                except: pass
            h = [i for i in h if i['id'] != id]
            with open(HISTORY_FILE, 'w', encoding='utf-8') as f: json.dump(h, f, indent=4, ensure_ascii=False)
            return True
        except: return False
    def clear_all(self):
        try:
            history = self.get_all()
            for item in history:
                if item.get('path') and os.path.exists(item['path']): force_delete_file(item['path'])
            with open(HISTORY_FILE, 'w', encoding='utf-8') as f: json.dump([], f, ensure_ascii=False)
            return True
        except: return False
    def revalidate_history(self):
        try:
            h = self.get_all()
            nh = [i for i in h if i.get('path') and os.path.exists(i['path'])]
            if len(h) != len(nh):
                with open(HISTORY_FILE, 'w', encoding='utf-8') as f: json.dump(nh, f, indent=4, ensure_ascii=False)
            return nh
        except: return []
history_manager = HistoryManager()

class SpotifyEngine:
    def resolve_url(self, url):
        try:
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(response.text, 'html.parser')
                title_tag = soup.find('title')
                if title_tag: return title_tag.text.replace('| Spotify', '').strip()
        except: pass
        return None
spotify_engine = SpotifyEngine()

class YouTubeEngine:
    def __init__(self):
        self.user_agents = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36']
        self.cancel_flags = set()

    def cancel_task(self, task_id): self.cancel_flags.add(task_id); kill_zombies()

    def get_progress_hook(self, task_id):
        def hook(d):
            if task_id in self.cancel_flags: raise Exception("CANCELLED_BY_USER")
            if d['status'] == 'downloading':
                try:
                    total = d.get('total_bytes') or d.get('total_bytes_estimate')
                    downloaded = d.get('downloaded_bytes', 0)
                    if total: percent = (downloaded / total) * 100
                    else:
                        p_str = d.get('_percent_str', '0%').replace('%',''); p_str = re.sub(r'\x1b\[[0-9;]*m', '', p_str)
                        percent = float(p_str)
                    update_state(task_id, 'downloading', percent, "Baixando...")
                except: pass
            elif d['status'] == 'finished':
                update_state(task_id, 'downloading', 99, "Processando...")
        return hook

    def get_opts(self, mode='full', task_id=None):
        opts = {
            'quiet': True, 'no_warnings': True, 'socket_timeout': 30, 'retries': 10,
            'user_agent': random.choice(self.user_agents), 'ignoreerrors': True,
            'nocheckcertificate': True, 'writethumbnail': True, 
            'cachedir': CACHE_DIR, 'paths': { 'home': APP_DATA_DIR },
            'js_runtimes': {'node': {}}
        }
        cookie_path_root = os.path.join(PROJECT_ROOT, 'cookies.txt')
        cookie_path_appdata = os.path.join(APP_DATA_DIR, 'cookies.txt')
        if os.path.exists(cookie_path_root): opts['cookiefile'] = cookie_path_root
        elif os.path.exists(cookie_path_appdata): opts['cookiefile'] = cookie_path_appdata
        
        if FFMPEG_PATH: opts['ffmpeg_location'] = FFMPEG_PATH
        if task_id: opts['progress_hooks'] = [self.get_progress_hook(task_id)]
        if mode == 'playlist_scan': opts['extract_flat'] = 'in_playlist'; opts['noplaylist'] = False
        else: opts['extract_flat'] = False; opts['noplaylist'] = True
        return opts

    def get_info(self, input_str: str) -> dict:
        try:
            clean_input = input_str.split('&t=')[0]
            if 'v=' in clean_input and 'list=' in clean_input:
                clean_input = clean_input.split('&list=')[0]
            query = clean_input
            if 'open.spotify.com' in clean_input:
                track_name = spotify_engine.resolve_url(clean_input)
                if track_name: query = f"ytsearch1:{track_name} audio"
                else: return {'error': 'Falha ao ler link do Spotify.'}
            elif not clean_input.startswith('http'): query = f"ytsearch30:{clean_input}"
            try:
                if 'ytsearch30:' in query:
                    with yt_dlp.YoutubeDL(self.get_opts('playlist_scan')) as ydl:
                        info = ydl.extract_info(query, download=False)
                        if 'entries' in info and len(info['entries']) > 0: return self.parse_search_results(info)
                        else: return {'error': 'Nenhum resultado.'}
                elif 'ytsearch1:' in query:
                    with yt_dlp.YoutubeDL(self.get_opts('video_full')) as ydl:
                        info = ydl.extract_info(query, download=False)
                        if info and 'entries' in info and len(info['entries']) > 0 and info['entries'][0]: return self.parse_video(info['entries'][0])
                        else: return {'error': 'Nenhum resultado.'}
                elif 'list=' in query:
                    with yt_dlp.YoutubeDL(self.get_opts('playlist_scan')) as ydl:
                        info = ydl.extract_info(query, download=False)
                        if 'entries' in info: return self.parse_playlist(info)
                        else: return self.process_single_video(query)
                else: return self.process_single_video(query)
            except yt_dlp.utils.DownloadError as de: return {'error': f'Erro no YouTube: {str(de)[:100]}...'}
        except Exception as e: return {'error': f"Erro: {str(e)}"}
        
    def parse_search_results(self, info):
        entries = []
        for entry in info.get('entries', []):
            if entry:
                entries.append({'id': entry.get('id'), 'title': entry.get('title', 'Sem título'), 'duration': entry.get('duration'), 'thumbnail': (entry.get('thumbnails', [{}]) or [{}])[0].get('url'), 'uploader': entry.get('uploader')})
        return {'type': 'search_results', 'query': info.get('id', ''), 'entries': entries}
        
    def process_single_video(self, url):
        with yt_dlp.YoutubeDL(self.get_opts('video_full')) as ydl_full:
            info_full = None
            try: info_full = ydl_full.extract_info(url, download=False)
            except: pass
            
            if not info_full:
                opts_fallback = self.get_opts('video_full')
                opts_fallback['extractor_args'] = {'youtube': {'player_client': ['android']}}
                with yt_dlp.YoutubeDL(opts_fallback) as ydl_fb:
                    try: info_full = ydl_fb.extract_info(url, download=False)
                    except: pass
                    
            if not info_full: return {'error': 'Não foi possível extrair os dados. O vídeo pode ser privado, restrito ou inválido.'}
            return self.parse_video(info_full)
            
    def parse_playlist(self, info):
        entries = []; limit = 1000; count = 0
        raw_entries = info.get('entries')
        if raw_entries is None:
            return {'type': 'playlist', 'id': info.get('id'), 'title': info.get('title', 'Playlist Restrita/Vazia'), 'count': 0, 'entries': []}
        for entry in raw_entries:
            if count >= limit: break
            if entry:
                entries.append({'id': entry.get('id'), 'title': entry.get('title', 'Sem título'), 'duration': entry.get('duration'), 'thumbnail': (entry.get('thumbnails', [{}]) or [{}])[0].get('url'), 'uploader': entry.get('uploader')})
                count += 1
        return {'type': 'playlist', 'id': info.get('id'), 'title': info.get('title'), 'count': len(entries), 'entries': entries}
        
    def parse_video(self, info):
        if not info: return {'error': 'Dados do vídeo corrompidos ou bloqueados.'}
        v_fmts, a_fmts = [], []; dur = info.get('duration') or 0; seen = set()
        for f in info.get('formats', []):
            if f.get('height') and 144 <= f['height'] <= 1080 and f['height'] not in seen:
                tbr = f.get('tbr') or 0; filesize = f.get('filesize') or 0
                if filesize == 0 and tbr > 0 and dur > 0: filesize = (tbr * 1000 / 8) * dur
                v_fmts.append({'format_id': f['format_id'], 'quality': f"{f['height']}p", 'filesize': history_manager.human_size(filesize), 'filesize_bytes': int(filesize), 'type': 'video'}); seen.add(f['height'])
        for f in info.get('formats', []):
            if f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                abr = int(f.get('abr') or 0)
                if abr > 0:
                    filesize = f.get('filesize') or 0
                    if filesize == 0 and dur > 0: filesize = (abr * 1000 / 8) * dur
                    a_fmts.append({'format_id': f['format_id'], 'quality': f"{abr}kbps", 'filesize': history_manager.human_size(filesize), 'filesize_bytes': int(filesize), 'type': 'audio'})
        v_fmts.sort(key=lambda x: int(x['quality'][:-1]) if 'p' in x['quality'] else 0, reverse=True)
        a_fmts.sort(key=lambda x: int(x['quality'][:-4]) if 'kbps' in x['quality'] else 0, reverse=True)
        
        if not v_fmts: 
            v_fmts.append({'format_id': 'bestvideo', 'quality': 'Auto', 'filesize': 'N/A', 'filesize_bytes': 0, 'type': 'video'})
            
        if not a_fmts or len(a_fmts) == 0: 
            size_320 = history_manager.human_size((320 * 1000 / 8) * dur) if dur > 0 else 'N/A'
            size_192 = history_manager.human_size((192 * 1000 / 8) * dur) if dur > 0 else 'N/A'
            size_128 = history_manager.human_size((128 * 1000 / 8) * dur) if dur > 0 else 'N/A'
            a_fmts = [
                {'format_id': 'bestaudio/best', 'quality': '320kbps', 'filesize': size_320, 'filesize_bytes': int((320 * 1000 / 8) * dur), 'type': 'audio'},
                {'format_id': 'bestaudio/best', 'quality': '192kbps', 'filesize': size_192, 'filesize_bytes': int((192 * 1000 / 8) * dur), 'type': 'audio'},
                {'format_id': 'bestaudio/best', 'quality': '128kbps', 'filesize': size_128, 'filesize_bytes': int((128 * 1000 / 8) * dur), 'type': 'audio'}
            ]
            
        return {'type': 'video', 'id': info['id'], 'title': info.get('title'), 'thumbnail': info.get('thumbnail'), 'duration': info.get('duration_string'), 'author': info.get('uploader'), 'formats_video': v_fmts[:8], 'formats_audio': a_fmts[:4]}

    def run_download_thread(self, task_id: str, url: str, fmt_id: str, mode: str, title: str, qual: str, custom_path: str):
        update_state(task_id, 'pending', 0, "Aguardando fila...")
        with CONCURRENT_DOWNLOADS:
            update_state(task_id, 'starting', 0, "Iniciando processo...")
            safe = sanitize_filename(title)
            temp_dir = tempfile.gettempdir()
            temp_filename_base = f"{safe}-{task_id}" 
            try:
                final_target_dir = custom_path or config_manager.get_path()
                os.makedirs(final_target_dir, exist_ok=True)
                opts = self.get_opts('video_full', task_id)
                opts['outtmpl'] = os.path.join(temp_dir, f"{temp_filename_base}.%(ext)s")
                
                ext = 'mp3'
                if mode == 'audio':
                    opts['format'] = 'bestaudio/best'
                    clean_qual = ''.join(filter(str.isdigit, qual)) or '192'
                    opts['postprocessors'] = [
                        {'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': clean_qual},
                        {'key': 'FFmpegThumbnailsConvertor', 'format': 'jpg'},
                        {'key': 'EmbedThumbnail'}, 
                        {'key': 'FFmpegMetadata'}
                    ]
                else:
                    ext = 'mp4'
                    if '1080' in qual: opts['format'] = 'bestvideo[height=1080]+bestaudio/bestvideo[height<=1080]+bestaudio/best'
                    elif '720' in qual: opts['format'] = 'bestvideo[height=720]+bestaudio/bestvideo[height<=720]+bestaudio/best'
                    else: opts['format'] = f"bestvideo[height<=1080]+bestaudio/best"
                    opts['merge_output_format'] = 'mp4'
                    opts['postprocessor_args'] = {'merger': ['-c:v', 'copy', '-c:a', 'aac']}
                    opts['postprocessors'] = [
                        {'key': 'FFmpegThumbnailsConvertor', 'format': 'jpg'},
                        {'key': 'EmbedThumbnail'}, 
                        {'key': 'FFmpegMetadata'}
                    ]
                
                opts['overwrites'] = True
                try: 
                    with yt_dlp.YoutubeDL(opts) as ydl: ydl.download([url])
                except:
                    opts['extractor_args'] = {'youtube': {'player_client': ['android']}}
                    with yt_dlp.YoutubeDL(opts) as ydl: ydl.download([url])

                
                temp_filepath = os.path.join(temp_dir, f"{temp_filename_base}.{ext}")
                if not os.path.exists(temp_filepath):
                    raise FileNotFoundError(f"Arquivo temporário não encontrado: {temp_filepath}")
                
                final_filename = f"{safe} [{qual}].{ext}"
                final_filepath = os.path.join(final_target_dir, final_filename)
                
                shutil.move(temp_filepath, final_filepath)
                
                if os.path.exists(final_filepath):
                    update_state(task_id, 'success', 100, final_filepath)
                    history_manager.add({'title': title, 'type': mode, 'quality': qual, 'path': final_filepath, 'filename': final_filename})
                else:
                    raise IOError("Falha ao mover o arquivo")
            except Exception as e:
                err_str = str(e)
                if len(err_str) > 200: err_str = err_str[:200] + "..."
                trace = traceback.format_exc(limit=1)
                update_state(task_id, 'error', 0, f"Erro: {err_str}")
                print(f"[{task_id}] EXCEPTION:\n{trace}")
            finally:
                if task_id in self.cancel_flags: self.cancel_flags.remove(task_id)
                cleanup_after_download(temp_dir, temp_filename_base)

engine = YouTubeEngine()

# Pydantic Schemas
class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    vidId: Optional[str] = None
    id: Optional[str] = None
    title: Optional[str] = None
    format_id: Optional[str] = None
    mode: Optional[str] = None
    quality: Optional[str] = None
    downloadPath: Optional[str] = None

class ActionRequest(BaseModel):
    id: Optional[str] = None
    ids: Optional[List[str]] = None
    filename: Optional[str] = None

class ConfigRequest(BaseModel):
    download_path: Optional[str] = None
    auto_start: Optional[bool] = None
    start_minimized: Optional[bool] = None
    minimize_tray: Optional[bool] = None

@app.post("/api/info")
def r_info(req: InfoRequest): 
    return engine.get_info(req.url)

@app.post("/api/download")
def r_dl(req: DownloadRequest, background_tasks: BackgroundTasks):
    video_id = req.vidId or req.id
    if not video_id: 
        raise HTTPException(status_code=400, detail="ID do vídeo não fornecido")
    
    task_id = f"{video_id}-{random.randint(1000, 9999)}"
    download_states[task_id] = {'status': 'downloading', 'percent': 0, 'msg': 'Iniciando...'}
    
    background_tasks.add_task(
        engine.run_download_thread, 
        task_id, 
        f"https://www.youtube.com/watch?v={video_id}", 
        req.format_id or '', 
        req.mode or 'video', 
        req.title or 'Unknown', 
        req.quality or 'Auto', 
        req.downloadPath or ''
    )
    return {'status': 'started', 'task_id': task_id}

@app.get("/api/status/{task_id}")
def r_status(task_id: str): 
    return download_states.get(task_id, {'status': 'unknown', 'percent': 0})

@app.post("/api/cancel")
def r_cancel():
    kill_zombies()
    for tid, state in list(download_states.items()):
        if state['status'] == 'downloading':
            engine.cancel_task(tid); state['status'] = 'cancelled'
    return {'status': 'ok'}

@app.get("/api/preview")
def r_preview(id: str):
    try:
        opts = engine.get_opts('info', 'preview')
        opts['format'] = 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best'
        opts['extractor_args'] = {'youtube': {'player_client': ['android']}}
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(id, download=False)
        except:
            opts.pop('extractor_args', None)
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(id, download=False)
                
        url = info.get('url')
        if not url:
            for f in info.get('formats', []):
                if f.get('vcodec') != 'none' and f.get('acodec') != 'none':
                    url = f.get('url')
                    break
        return {'url': url}
    except Exception as e:
        return {'error': str(e)}

@app.get("/api/history")
def r_hist(): 
    return history_manager.get_all()

@app.get("/api/library")
def r_library():
    try:
        base_path = config_manager.get_path()
        if not os.path.exists(base_path): return []
        
        hist = history_manager.get_all()
        hist_map = {h['filename']: h for h in hist if 'filename' in h}
        
        library_items = []
        for f in os.listdir(base_path):
            if f.endswith('.mp4') or f.endswith('.mp3'):
                full_path = os.path.join(base_path, f)
                size_bytes = os.path.getsize(full_path)
                
                item = {
                    'id': str(hash(f)),
                    'title': f.rsplit('.', 1)[0],
                    'path': full_path,
                    'filename': f,
                    'size': history_manager.human_size(size_bytes),
                    'size_bytes': size_bytes,
                    'type': 'video' if f.endswith('.mp4') else 'audio',
                    'mtime': os.path.getmtime(full_path)
                }
                
                # Enriquecer com dados do histórico se disponível (como a thumbnail e qualidade original)
                if f in hist_map:
                    item['title'] = hist_map[f].get('title', item['title'])
                    item['thumbnail'] = hist_map[f].get('thumbnail', '')
                    item['quality'] = hist_map[f].get('quality', '')
                    
                library_items.append(item)
                
        # Ordenar por data de modificação (mais novos primeiro)
        library_items.sort(key=lambda x: x['mtime'], reverse=True)
        return library_items
    except Exception as e:
        print(f"Error scanning library: {e}")
        return []

@app.post("/api/delete")
def r_del(req: ActionRequest):
    phys_deleted = False
    if req.filename:
        try:
            base_path = config_manager.get_path()
            safe_filename = os.path.basename(req.filename)
            full_path = os.path.join(base_path, safe_filename)
            if os.path.exists(full_path):
                os.remove(full_path)
                phys_deleted = True
        except Exception as e:
            print(f"Error removing file physically: {e}")
            
    hist_deleted = history_manager.delete(req.id)
    if phys_deleted or hist_deleted:
        return {'status': 'ok'}
    return {'error': 'Erro na exclusão do arquitvo'}

@app.post("/api/clear-all")
def r_clear(): 
    try:
        base_path = config_manager.get_path()
        hist = history_manager.get_all()
        for h in hist:
            if 'filename' in h:
                safe_filename = os.path.basename(h['filename'])
                full_path = os.path.join(base_path, safe_filename)
                if os.path.exists(full_path):
                    os.remove(full_path)
    except Exception as e:
        print(f"Error clearing physical library: {e}")
        
    if history_manager.clear_all():
        return {'status': 'ok'}
    return {'error': 'Erro ao limpar banco de dados'}

@app.get("/api/config")
def r_get_conf():
    return config_manager.get_all()

@app.post("/api/config")
async def r_post_conf(request: Request):
    try:
        data = await request.json()
        if config_manager.set_all(data):
            return {'status': 'ok'}
    except Exception:
        pass
    return {'error': 'Erro'}

@app.post("/api/config/reset")
def r_reset(): 
    return {'status': 'ok', 'path': config_manager.reset_path()}

@app.post("/api/open-folder")
def r_open():
    p = config_manager.get_path()
    if sys.platform == 'win32': os.startfile(p)
    else: subprocess.Popen(['xdg-open', p])
    return {'status': 'ok'}

@app.post("/api/revalidate-history")
def r_reval(): 
    return {'status': 'ok', 'history': history_manager.revalidate_history()}

@app.get("/api/app-info")
def r_appinfo(): 
    return {"version": "1.2.0 1080p-Stable", "engine": "LEG3NDY Core"}

if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=5000, log_level="info")