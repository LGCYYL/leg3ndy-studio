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
import tempfile  # Adicionado
import shutil    # Adicionado
from flask import Flask, request, jsonify
from flask_cors import CORS

if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

app = Flask(__name__) # Corrigido
CORS(app)

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    PROJECT_ROOT = BASE_DIR
else:
    BASE_DIR = os.path.abspath(os.path.dirname(__file__)) # Corrigido
    PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, '..'))

# --- CORREÇÃO DE PERMISSÃO: CAMINHOS SEGUROS ---
APP_DATA_DIR = os.path.join(os.getenv('APPDATA'), 'LEG3NDY Studio')
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
    pattern = os.path.join(target_dir, f"*{safe_name}*") # Corrigido
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
    # ... (Sua classe original, sem alterações)
    def get_all(self):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f: data = json.load(f)
            path = data.get("download_path", USER_DOWNLOADS)
            if not os.path.exists(path): path = USER_DOWNLOADS
            return {"download_path": path, "auto_start": data.get("auto_start", False), "start_minimized": data.get("start_minimized", False), "minimize_tray": data.get("minimize_tray", True)}
        except: return {"download_path": USER_DOWNLOADS, "auto_start": False, "start_minimized": False, "minimize_tray": True}
    def set_all(self, c):
        d = self.get_all(); d.update(c)
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f: json.dump(d, f, indent=4, ensure_ascii=False); return True
    def get_path(self): return self.get_all()["download_path"]
    def reset_path(self): self.set_all({"download_path": USER_DOWNLOADS}); return USER_DOWNLOADS
config_manager = ConfigManager()

class HistoryManager:
    # ... (Sua classe original, sem alterações)
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
    # ... (Sua classe original, sem alterações)
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
    def __init__(self): # Corrigido
        self.user_agents = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36']
        self.cancel_flags = set()

    def cancel_task(self, task_id): self.cancel_flags.add(task_id); kill_zombies()

    def get_progress_hook(self, task_id):
        # ... (Sua função original, sem alterações)
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
        # AQUI ESTÁ A ÚNICA ALTERAÇÃO DE LÓGICA NESTA PARTE
        opts = {
            'quiet': True, 'no_warnings': True, 'socket_timeout': 30, 'retries': 10,
            'user_agent': random.choice(self.user_agents), 'ignoreerrors': True,
            'nocheckcertificate': True, 'writethumbnail': True, 
            'cachedir': CACHE_DIR, 'paths': { 'home': APP_DATA_DIR }
        }
        if FFMPEG_PATH: opts['ffmpeg_location'] = FFMPEG_PATH
        if task_id: opts['progress_hooks'] = [self.get_progress_hook(task_id)]
        if mode == 'playlist_scan': opts['extract_flat'] = 'in_playlist'; opts['noplaylist'] = False
        else: opts['extract_flat'] = False; opts['noplaylist'] = True
        return opts

    def get_info(self, input_str):
        # ... (Sua função original, sem alterações)
        try:
            clean_input = input_str.split('&t=')[0]; query = clean_input
            if 'open.spotify.com' in clean_input:
                track_name = spotify_engine.resolve_url(clean_input)
                if track_name: query = f"ytsearch1:{track_name} audio"
                else: return {'error': 'Falha ao ler link do Spotify.'}
            elif not clean_input.startswith('http'): query = f"ytsearch1:{clean_input}"
            try:
                if 'ytsearch1:' in query:
                    with yt_dlp.YoutubeDL(self.get_opts('video_full')) as ydl:
                        info = ydl.extract_info(query, download=False)
                        if 'entries' in info and len(info['entries']) > 0: return self.parse_video(info['entries'][0])
                        else: return {'error': 'Nenhum resultado.'}
                elif 'list=' in query:
                    with yt_dlp.YoutubeDL(self.get_opts('playlist_scan')) as ydl:
                        info = ydl.extract_info(query, download=False)
                        if 'entries' in info: return self.parse_playlist(info)
                        else: return self.process_single_video(query)
                else: return self.process_single_video(query)
            except yt_dlp.utils.DownloadError as de: return {'error': f'Erro no YouTube: {str(de)[:100]}...'}
        except Exception as e: return {'error': f"Erro: {str(e)}"}
    def process_single_video(self, url):
        # ... (Sua função original, sem alterações)
        with yt_dlp.YoutubeDL(self.get_opts('video_full')) as ydl_full:
            info_full = ydl_full.extract_info(url, download=False)
            return self.parse_video(info_full)
    def parse_playlist(self, info):
        # ... (Sua função original, sem alterações)
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
        # ... (Sua função original, sem alterações)
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
        if not v_fmts: v_fmts.append({'format_id': 'bestvideo', 'quality': 'Auto', 'filesize': 'N/A', 'filesize_bytes': 0, 'type': 'video'})
        if not a_fmts: a_fmts.append({'format_id': 'bestaudio', 'quality': 'Auto', 'filesize': 'N/A', 'filesize_bytes': 0, 'type': 'audio'})
        return {'type': 'video', 'id': info['id'], 'title': info.get('title'), 'thumbnail': info.get('thumbnail'), 'duration': info.get('duration_string'), 'author': info.get('uploader'), 'formats_video': v_fmts[:8], 'formats_audio': a_fmts[:4]}

    def run_download_thread(self, task_id, url, fmt_id, mode, title, qual, custom_path):
        # AQUI ESTÁ A SEGUNDA ALTERAÇÃO DE LÓGICA: DOWNLOAD-PARA-TEMP
        safe = sanitize_filename(title)
        temp_dir = tempfile.gettempdir()
        temp_filename_base = f"{safe}-{task_id}" # Nome único para o arquivo temporário
        try:
            final_target_dir = custom_path or config_manager.get_path()
            os.makedirs(final_target_dir, exist_ok=True)
            opts = self.get_opts('video_full', task_id)
            
            # Força o download a acontecer na pasta TEMP
            opts['outtmpl'] = os.path.join(temp_dir, f"{temp_filename_base}.%(ext)s")
            
            ext = 'mp3'
            if mode == 'audio':
                opts['format'] = 'bestaudio/best'
                clean_qual = ''.join(filter(str.isdigit, qual)) or '192'
                opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': clean_qual}, {'key': 'EmbedThumbnail'}, {'key': 'FFmpegMetadata'}]
            else: # video
                ext = 'mp4'
                if '1080' in qual: opts['format'] = 'bestvideo[height=1080]+bestaudio/bestvideo[height<=1080]+bestaudio/best'
                elif '720' in qual: opts['format'] = 'bestvideo[height=720]+bestaudio/bestvideo[height<=720]+bestaudio/best'
                else: opts['format'] = f"bestvideo[height<=1080]+bestaudio/best"
                opts['merge_output_format'] = 'mp4'
                opts['postprocessor_args'] = {'merger': ['-c:v', 'copy', '-c:a', 'aac']}
                opts['postprocessors'] = [{'key': 'EmbedThumbnail'}, {'key': 'FFmpegMetadata'}]
            
            opts['overwrites'] = True
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
                raise IOError("Falha ao mover o arquivo para o destino final.")
        except Exception as e:
            update_state(task_id, 'error', 0, str(e))
        finally:
            cleanup_after_download(temp_dir, temp_filename_base)

engine = YouTubeEngine()

@app.route('/api/info', methods=['POST'])
def r_info(): return jsonify(engine.get_info(request.json.get('url')))

@app.route('/api/download', methods=['POST'])
def r_dl():
    d = request.json
    video_id = d.get('vidId') or d.get('id')
    if not video_id: return jsonify({'error': 'ID do vídeo não fornecido'}), 400
    
    task_id = f"{video_id}-{random.randint(1000, 9999)}"
    download_states[task_id] = {'status': 'downloading', 'percent': 0, 'msg': 'Iniciando...'}
    
    args = (task_id, f"https://www.youtube.com/watch?v={video_id}", d.get('format_id'), d.get('mode'), d.get('title'), d.get('quality'), d.get('downloadPath'))
    
    t = threading.Thread(target=engine.run_download_thread, args=args)
    t.start()
    return jsonify({'status': 'started', 'task_id': task_id})

@app.route('/api/status/<task_id>', methods=['GET'])
def r_status(task_id): return jsonify(download_states.get(task_id, {'status': 'unknown', 'percent': 0}))

# ... (O resto das rotas, sem alterações)
@app.route('/api/cancel', methods=['POST'])
def r_cancel():
    kill_zombies()
    for tid, state in list(download_states.items()):
        if state['status'] == 'downloading':
            engine.cancel_task(tid); state['status'] = 'cancelled'
    return jsonify({'status': 'ok'})
@app.route('/api/history', methods=['GET'])
def r_hist(): return jsonify(history_manager.get_all())
@app.route('/api/delete', methods=['POST'])
def r_del(): return jsonify({'status': 'ok'}) if history_manager.delete(request.json.get('id')) else jsonify({'error': 'Erro'})
@app.route('/api/clear-all', methods=['POST'])
def r_clear(): return jsonify({'status': 'ok'}) if history_manager.clear_all() else jsonify({'error': 'Erro'})
@app.route('/api/config', methods=['GET', 'POST'])
def r_conf():
    if request.method == 'POST':
        if config_manager.set_all(request.json): return jsonify({'status': 'ok'})
        return jsonify({'error': 'Erro'})
    return jsonify(config_manager.get_all())
@app.route('/api/config/reset', methods=['POST'])
def r_reset(): return jsonify({'status': 'ok', 'path': config_manager.reset_path()})
@app.route('/api/open-folder', methods=['POST'])
def r_open():
    p = config_manager.get_path()
    if sys.platform == 'win32': os.startfile(p)
    else: subprocess.Popen(['xdg-open', p])
    return jsonify({'status': 'ok'})
@app.route('/api/revalidate-history', methods=['POST'])
def r_reval(): return jsonify({'status': 'ok', 'history': history_manager.revalidate_history()})
@app.route('/api/app-info', methods=['GET'])
def r_appinfo(): return jsonify({"version": "1.2.0 1080p-Stable", "engine": "LEG3NDY Core"})

if __name__ == '__main__':
    from waitress import serve
    serve(app, host='127.0.0.1', port=5000, threads=12)