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
import glob

try:
    import yt_dlp_plugins.postprocessor.chrome_cookie_unlock  # noqa: F401
    CHROME_COOKIE_UNLOCK_AVAILABLE = True
except Exception:
    CHROME_COOKIE_UNLOCK_AVAILABLE = False

import yt_dlp
import gc
import tempfile
import shutil
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
import traceback
import socket
import atexit

if sys.platform.startswith('win'):
    if sys.stdout is not None:
        sys.stdout.reconfigure(encoding='utf-8')
    else:
        sys.stdout = open(os.devnull, 'w', encoding='utf-8')
    if sys.stderr is not None:
        sys.stderr.reconfigure(encoding='utf-8')
    else:
        sys.stderr = open(os.devnull, 'w', encoding='utf-8')

app = FastAPI(title="LEG3NDY Studio API")
APP_NAME = "LEG3NDY Studio"

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


def get_default_app_data_dir():
    override = os.getenv('LEG3NDY_APP_DATA_DIR')
    if override:
        return os.path.abspath(override)

    home = os.path.expanduser('~')
    if sys.platform == 'win32':
        root = os.getenv('APPDATA') or os.path.join(home, 'AppData', 'Roaming')
    elif sys.platform == 'darwin':
        root = os.path.join(home, 'Library', 'Application Support')
    else:
        root = os.getenv('XDG_CONFIG_HOME') or os.path.join(home, '.config')
    return os.path.join(root, APP_NAME)


def get_default_downloads_dir():
    return os.path.join(os.path.expanduser('~'), 'Downloads')


def get_runtime_search_roots():
    roots = []
    frozen_base = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else None
    for candidate in [
        frozen_base,
        os.path.join(frozen_base, 'engine') if frozen_base else None,
        PROJECT_ROOT,
        os.path.join(PROJECT_ROOT, 'resources_build'),
        os.path.join(PROJECT_ROOT, 'engine'),
        os.path.join(PROJECT_ROOT, 'resources'),
    ]:
        if candidate and candidate not in roots:
            roots.append(candidate)
    return roots


def binary_names(base_name):
    if sys.platform == 'win32':
        return [f'{base_name}.exe', base_name]
    return [base_name, f'{base_name}.exe']


def find_first_existing(paths):
    for item in paths:
        if item and os.path.exists(item):
            return item
    return None


APP_DATA_DIR = get_default_app_data_dir()
os.makedirs(APP_DATA_DIR, exist_ok=True)
CACHE_DIR = os.path.join(APP_DATA_DIR, 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)
HISTORY_FILE = os.path.join(APP_DATA_DIR, 'history.json')
CONFIG_FILE = os.path.join(APP_DATA_DIR, 'config.json')
USER_DOWNLOADS = get_default_downloads_dir()


def get_ffmpeg_path():
    candidates = []
    for root in get_runtime_search_roots():
        for name in binary_names('ffmpeg'):
            candidates.append(os.path.join(root, name))
    ffmpeg_in_path = shutil.which('ffmpeg')
    if ffmpeg_in_path:
        candidates.append(ffmpeg_in_path)
    return find_first_existing(candidates)
FFMPEG_PATH = get_ffmpeg_path()


def get_node_path():
    candidates = []
    for root in get_runtime_search_roots():
        for name in binary_names('node'):
            candidates.append(os.path.join(root, name))

    node_in_path = shutil.which('node')
    if node_in_path:
        candidates.append(node_in_path)

    if sys.platform == 'win32':
        candidates.extend([
            os.path.join(os.environ.get('ProgramFiles', 'C:\\Program Files'), 'nodejs', 'node.exe'),
            os.path.join(os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)'), 'nodejs', 'node.exe'),
            os.path.join(os.environ.get('APPDATA', ''), 'nvm', 'current', 'node.exe'),
            os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'node', 'node.exe'),
        ])
    else:
        candidates.extend([
            '/opt/homebrew/bin/node',
            '/usr/local/bin/node',
            '/usr/bin/node',
        ])
    return find_first_existing(candidates)
NODE_PATH = get_node_path()

# No Windows o PyInstaller pode perder o PATHEXT e o yt-dlp deixa de achar node.exe.
if NODE_PATH and sys.platform == 'win32':
    node_dir = os.path.dirname(NODE_PATH)
    pathext = os.environ.get('PATHEXT', '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC')
    if '.EXE' not in pathext.upper():
        pathext = '.EXE;' + pathext
    os.environ['PATHEXT'] = pathext
    current_path = os.environ.get('PATH', '')
    if node_dir not in current_path:
        os.environ['PATH'] = f"{node_dir}{os.pathsep}{current_path}"


def get_bgutil_server_home():
    override = os.getenv('LEG3NDY_BGUTIL_SERVER_HOME')
    candidates = [
        override,
        os.path.join(os.path.dirname(sys.executable), 'bgutil-server') if getattr(sys, 'frozen', False) else None,
        os.path.join(PROJECT_ROOT, 'resources_build', 'bgutil-server'),
        os.path.join(PROJECT_ROOT, 'bgutil-server'),
        os.path.join(os.path.expanduser('~'), 'bgutil-ytdlp-pot-provider', 'server'),
    ]
    return find_first_existing([p for p in candidates if p])


BGUTIL_SERVER_HOME = get_bgutil_server_home() or os.path.join(os.path.expanduser('~'), 'bgutil-ytdlp-pot-provider', 'server')
BGUTIL_SCRIPT_ENTRY = os.path.join(BGUTIL_SERVER_HOME, 'build', 'generate_once.js')
BGUTIL_HTTP_ENTRY = os.path.join(BGUTIL_SERVER_HOME, 'build', 'main.js')
BGUTIL_PORT = 4416
BGUTIL_PROVIDER_AVAILABLE = bool(NODE_PATH and os.path.exists(BGUTIL_SCRIPT_ENTRY))
bgutil_process = None

def can_use_bgutil_provider():
    return BGUTIL_PROVIDER_AVAILABLE

def _is_local_port_open(port, host='127.0.0.1', timeout=0.25):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False

def start_bgutil_server():
    global bgutil_process
    if not (NODE_PATH and os.path.exists(BGUTIL_HTTP_ENTRY)):
        return
    if _is_local_port_open(BGUTIL_PORT):
        return
    if bgutil_process and bgutil_process.poll() is None:
        return
    try:
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        bgutil_process = subprocess.Popen(
            [NODE_PATH, BGUTIL_HTTP_ENTRY],
            cwd=BGUTIL_SERVER_HOME,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags
        )
        for _ in range(20):
            if _is_local_port_open(BGUTIL_PORT):
                break
            time.sleep(0.2)
    except Exception:
        bgutil_process = None

def stop_bgutil_server():
    global bgutil_process
    if bgutil_process and bgutil_process.poll() is None:
        try:
            bgutil_process.terminate()
            bgutil_process.wait(timeout=3)
        except Exception:
            try:
                bgutil_process.kill()
            except Exception:
                pass
    bgutil_process = None

if BGUTIL_PROVIDER_AVAILABLE:
    start_bgutil_server()

atexit.register(stop_bgutil_server)

if not os.path.exists(HISTORY_FILE):
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f: json.dump([], f, ensure_ascii=False)
if not os.path.exists(CONFIG_FILE):
    default_config = {"download_path": USER_DOWNLOADS, "auto_start": False, "start_minimized": False, "minimize_tray": True}
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f: json.dump(default_config, f, indent=4, ensure_ascii=False)

def kill_zombies():
    if sys.platform == 'win32':
        try: subprocess.run('taskkill /F /IM ffmpeg.exe', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except: pass
    else:
        try: subprocess.run(['pkill', '-x', 'ffmpeg'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
                os.chmod(filepath, 0o666)
                os.remove(filepath)
                return True
            except: pass
            if sys.platform == 'win32':
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
        self.android_user_agent = 'com.google.android.youtube/21.02.35 (Linux; U; Android 11) gzip'
        self.browser_cookie_sources = ['edge', 'chrome', 'brave', 'chromium', 'vivaldi', 'opera', 'firefox']
        self.pot_client_profiles = ['web_pot', 'mweb_pot'] if can_use_bgutil_provider() else []
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

    def merge_youtube_extractor_args(self, opts, **kwargs):
        extractor_args = dict(opts.get('extractor_args') or {})
        youtube_args = dict(extractor_args.get('youtube') or {})
        for key, value in kwargs.items():
            if value is not None:
                youtube_args[key] = value
        extractor_args['youtube'] = youtube_args
        opts['extractor_args'] = extractor_args
        return opts

    def include_missing_pot_formats(self, opts):
        extractor_args = dict(opts.get('extractor_args') or {})
        youtube_args = dict(extractor_args.get('youtube') or {})
        format_types = list(youtube_args.get('formats') or [])
        for format_type in ('missing_pot', 'duplicate'):
            if format_type not in format_types:
                format_types.append(format_type)
        youtube_args['formats'] = format_types
        extractor_args['youtube'] = youtube_args
        opts['extractor_args'] = extractor_args
        return opts

    def is_missing_pot_format(self, fmt):
        return 'MISSING POT' in str(fmt.get('format_note') or '').upper()

    def score_format_variant(self, fmt):
        return (
            1 if not self.is_missing_pot_format(fmt) else 0,
            1 if fmt.get('url') else 0,
            1 if fmt.get('acodec') not in (None, 'none') else 0,
            1 if fmt.get('filesize') or fmt.get('filesize_approx') else 0,
            float(fmt.get('tbr') or 0),
        )

    def get_opts(self, mode='full', task_id=None, client_profile=None, browser=None, include_missing_pot=False):
        opts = {
            'quiet': True, 'no_warnings': True, 'socket_timeout': 30, 'retries': 10,
            'user_agent': random.choice(self.user_agents), 'ignoreerrors': True,
            'nocheckcertificate': True, 'writethumbnail': True, 
            'cachedir': CACHE_DIR, 'paths': { 'home': APP_DATA_DIR },
            'js_runtimes': {'node': {'path': NODE_PATH}} if NODE_PATH else {'node': {}},
            'remote_components': {'ejs:github'},
        }
        cookie_path_root = os.path.join(PROJECT_ROOT, 'cookies.txt')
        cookie_path_appdata = os.path.join(APP_DATA_DIR, 'cookies.txt')
        if os.path.exists(cookie_path_root): opts['cookiefile'] = cookie_path_root
        elif os.path.exists(cookie_path_appdata): opts['cookiefile'] = cookie_path_appdata
        elif browser: opts['cookiesfrombrowser'] = (browser,)
        
        if FFMPEG_PATH: opts['ffmpeg_location'] = FFMPEG_PATH
        if task_id: opts['progress_hooks'] = [self.get_progress_hook(task_id)]
        if mode == 'playlist_scan': opts['extract_flat'] = 'in_playlist'; opts['noplaylist'] = False
        else: opts['extract_flat'] = False; opts['noplaylist'] = True
        if client_profile: self.apply_client_profile(opts, client_profile)
        if include_missing_pot: self.include_missing_pot_formats(opts)
        return opts

    def apply_client_profile(self, opts, client_profile):
        if client_profile not in ('android', 'android_web', 'web', 'mweb', 'web_pot', 'mweb_pot'):
            return opts
        headers = dict(opts.get('http_headers') or {})
        if client_profile in ('android', 'android_web'):
            headers.update({
                'User-Agent': self.android_user_agent,
                'X-YouTube-Client-Name': '3',
                'X-YouTube-Client-Version': '21.02.35',
            })
            opts['user_agent'] = self.android_user_agent
            opts['http_headers'] = headers
            if client_profile == 'android':
                self.merge_youtube_extractor_args(opts, player_client=['android'])
            else:
                self.merge_youtube_extractor_args(opts, player_client=['android', 'web'])
            return opts

        pot_client = 'web' if client_profile in ('web', 'web_pot') else 'mweb'
        opts['http_headers'] = headers
        self.merge_youtube_extractor_args(opts, player_client=[pot_client])
        if client_profile in ('web_pot', 'mweb_pot'):
            self.merge_youtube_extractor_args(opts, fetch_pot=['always'])
        return opts

    def clone_opts_with_client_profile(self, opts, client_profile=None, browser=None, include_missing_pot=False):
        cloned = dict(opts)
        if 'paths' in opts: cloned['paths'] = dict(opts['paths'])
        if 'postprocessor_args' in opts: cloned['postprocessor_args'] = dict(opts['postprocessor_args'])
        if 'http_headers' in opts: cloned['http_headers'] = dict(opts['http_headers'])
        if 'extractor_args' in opts:
            cloned['extractor_args'] = json.loads(json.dumps(opts['extractor_args']))
        else:
            cloned.pop('extractor_args', None)
        if 'cookiefile' not in cloned and browser: cloned['cookiesfrombrowser'] = (browser,)
        if client_profile: self.apply_client_profile(cloned, client_profile)
        if include_missing_pot: self.include_missing_pot_formats(cloned)
        return cloned

    def extract_video_info(self, url, client_profile=None, browser=None, include_missing_pot=False):
        opts = self.get_opts('video_full', client_profile=client_profile, browser=browser, include_missing_pot=include_missing_pot)
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)

    def get_available_video_heights(self, info):
        heights = set()
        for f in (info or {}).get('formats', []):
            height = int(f.get('height') or 0)
            if height and 144 <= height <= 1080 and f.get('vcodec') not in (None, 'none'):
                heights.add(height)
        return sorted(heights, reverse=True)

    def should_probe_android(self, info):
        heights = self.get_available_video_heights(info)
        if not heights:
            return True
        return heights[0] <= 360 or len(heights) <= 2

    def get_fallback_client_profiles(self):
        profiles = ['web', 'mweb', 'android', 'android_web']
        if self.pot_client_profiles:
            for profile in self.pot_client_profiles:
                if profile not in profiles:
                    profiles.append(profile)
        return profiles

    def score_video_info(self, info):
        heights = self.get_available_video_heights(info)
        return (
            heights[0] if heights else 0,
            len(heights),
            len((info or {}).get('formats', []))
        )

    def merge_video_infos(self, base_info, extra_info):
        if not base_info:
            return extra_info
        if not extra_info:
            return base_info
        merged = dict(base_info)
        best_formats = {}
        for source in (base_info, extra_info):
            for f in source.get('formats', []):
                key = (
                    str(f.get('format_id') or ''),
                    str(f.get('ext') or ''),
                    int(f.get('height') or 0),
                    str(f.get('vcodec') or ''),
                    str(f.get('acodec') or ''),
                    int(f.get('fps') or 0),
                    round(float(f.get('tbr') or 0), 2),
                )
                current = best_formats.get(key)
                if not current or self.score_format_variant(f) > self.score_format_variant(current):
                    best_formats[key] = f
        merged['formats'] = list(best_formats.values())
        for field in ('id', 'title', 'thumbnail', 'duration', 'duration_string', 'uploader'):
            if not merged.get(field) and extra_info.get(field):
                merged[field] = extra_info.get(field)
        return merged

    def estimate_format_size(self, fmt, duration, bitrate_key='tbr'):
        filesize = fmt.get('filesize') or fmt.get('filesize_approx') or 0
        if filesize:
            return int(filesize)
        bitrate = float(fmt.get(bitrate_key) or 0)
        if bitrate > 0 and duration > 0:
            return int((bitrate * 1000 / 8) * duration)
        return 0

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
        info_candidates = []
        base_opts = self.get_opts('video_full')

        try:
            info_default = self.extract_video_info(url)
            if info_default:
                info_candidates.append(info_default)
        except:
            info_default = None

        if self.should_probe_android(info_default):
            for client_profile in self.get_fallback_client_profiles():
                try:
                    info_candidate = self.extract_video_info(url, client_profile=client_profile)
                    if info_candidate:
                        info_candidates.append(info_candidate)
                except:
                    pass

        info_full = None
        if info_candidates:
            ranked_candidates = sorted(info_candidates, key=self.score_video_info, reverse=True)
            info_full = ranked_candidates[0]
            for info_candidate in ranked_candidates[1:]:
                info_full = self.merge_video_infos(info_full, info_candidate)

        if (not info_full or self.should_probe_android(info_full)) and 'cookiefile' not in base_opts:
            for browser in self.browser_cookie_sources:
                for client_profile in ([None] + self.get_fallback_client_profiles()):
                    try:
                        info_candidate = self.extract_video_info(url, client_profile=client_profile, browser=browser)
                        if info_candidate:
                            info_candidates.append(info_candidate)
                    except:
                        pass
            if info_candidates:
                ranked_candidates = sorted(info_candidates, key=self.score_video_info, reverse=True)
                info_full = ranked_candidates[0]
                for info_candidate in ranked_candidates[1:]:
                    info_full = self.merge_video_infos(info_full, info_candidate)

        # Detecta qualidades altas escondidas pelo yt-dlp como MISSING POT, para
        # podermos sinalizar corretamente a limitação do YouTube na UI.
        if info_full and self.should_probe_android(info_full):
            for client_profile in ('android', 'android_web'):
                try:
                    info_candidate = self.extract_video_info(url, client_profile=client_profile, include_missing_pot=True)
                    if info_candidate:
                        info_full = self.merge_video_infos(info_full, info_candidate)
                except:
                    pass

        # Fallback CLI Extremo: bypass frozen subprocess bugs (quando Node não é chamado direito no PyInstaller)
        if (not info_full or self.should_probe_android(info_full)) and getattr(sys, 'frozen', False):
            import subprocess
            try:
                cmd = [
                    sys.executable, '-m', 'yt_dlp', '-j', '--no-warnings',
                    '--user-agent', self.android_user_agent,
                    '--extractor-args', 'youtube:player_client=android,web'
                ]
                if NODE_PATH: cmd.extend(['--js-runtimes', f'node:{NODE_PATH}'])
                cmd.append(url)
                
                env = os.environ.copy()
                env['NODE_SKIP_PLATFORM_CHECK'] = '1'
                
                flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
                res = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, creationflags=flags, env=env, text=True)
                info_cli = json.loads(res.strip().split('\n')[-1])
                if info_cli:
                    info_full = self.merge_video_infos(info_full, info_cli)
            except Exception:
                pass
                    
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
        dur = info.get('duration') or 0
        best_videos = {}
        best_audios = {}

        for f in info.get('formats', []):
            format_id = str(f.get('format_id') or '').strip()
            height = int(f.get('height') or 0)
            if not format_id or not height or not (144 <= height <= 1080):
                continue
            if f.get('vcodec') in (None, 'none'):
                continue

            is_restricted = self.is_missing_pot_format(f)
            has_audio = f.get('acodec') not in (None, 'none')
            filesize = self.estimate_format_size(f, dur, 'tbr')
            selector = format_id if has_audio else f"{format_id}+bestaudio[ext=m4a]/bestaudio/best/{format_id}"
            rank = (
                1 if not is_restricted else 0,
                1 if has_audio else 0,
                1 if f.get('ext') == 'mp4' else 0,
                1 if str(f.get('vcodec') or '').startswith('avc1') else 0,
                int(f.get('fps') or 0),
                float(f.get('tbr') or 0),
            )
            item = {
                'format_id': selector,
                'quality': f"{height}p",
                'filesize': history_manager.human_size(filesize),
                'filesize_bytes': int(filesize),
                'type': 'video'
            }
            if is_restricted:
                item['restricted'] = True
                item['restriction_reason'] = 'O YouTube exigiu validação extra para liberar esta qualidade neste vídeo.'
            current = best_videos.get(height)
            if not current or rank > current['rank']:
                best_videos[height] = {
                    'rank': rank,
                    'item': item
                }

        for f in info.get('formats', []):
            format_id = str(f.get('format_id') or '').strip()
            if not format_id or f.get('acodec') == 'none' or f.get('vcodec') != 'none':
                continue
            abr = int(f.get('abr') or 0)
            if abr <= 0:
                continue
            is_restricted = self.is_missing_pot_format(f)
            filesize = self.estimate_format_size(f, dur, 'abr')
            rank = (
                1 if not is_restricted else 0,
                1 if f.get('ext') in ('m4a', 'mp4') else 0,
                int(f.get('asr') or 0),
                float(f.get('tbr') or 0),
            )
            item = {
                'format_id': format_id,
                'quality': f"{abr}kbps",
                'filesize': history_manager.human_size(filesize),
                'filesize_bytes': int(filesize),
                'type': 'audio'
            }
            if is_restricted:
                item['restricted'] = True
                item['restriction_reason'] = 'O YouTube exigiu validação extra para liberar esta qualidade de áudio neste vídeo.'
            current = best_audios.get(abr)
            if not current or rank > current['rank']:
                best_audios[abr] = {
                    'rank': rank,
                    'item': item
                }

        ordered_video_entries = sorted(best_videos.items(), key=lambda item: item[0], reverse=True)
        v_fmts = [entry['item'] for _, entry in ordered_video_entries]
        a_fmts = [entry['item'] for _, entry in sorted(best_audios.items(), key=lambda item: item[0], reverse=True)]
        unrestricted_heights = [height for height, entry in ordered_video_entries if not entry['item'].get('restricted')]
        max_unrestricted_height = unrestricted_heights[0] if unrestricted_heights else 0
        blocked_qualities = [f"{height}p" for height, entry in ordered_video_entries if entry['item'].get('restricted') and height > max_unrestricted_height]
        restriction_message = None
        if blocked_qualities:
            preview_blocked = ', '.join(blocked_qualities[:4])
            restriction_message = f"Qualidades mais altas foram detectadas ({preview_blocked}), mas o YouTube exigiu validação extra nesta sessão. As opções liberadas continuam funcionando normalmente."
        
        if not v_fmts: 
            v_fmts.append({'format_id': 'bestvideo+bestaudio/best/best', 'quality': 'Auto', 'filesize': 'N/A', 'filesize_bytes': 0, 'type': 'video'})
            
        if not a_fmts or len(a_fmts) == 0: 
            size_320 = history_manager.human_size((320 * 1000 / 8) * dur) if dur > 0 else 'N/A'
            size_192 = history_manager.human_size((192 * 1000 / 8) * dur) if dur > 0 else 'N/A'
            size_128 = history_manager.human_size((128 * 1000 / 8) * dur) if dur > 0 else 'N/A'
            a_fmts = [
                {'format_id': 'bestaudio/best', 'quality': '320kbps', 'filesize': size_320, 'filesize_bytes': int((320 * 1000 / 8) * dur), 'type': 'audio'},
                {'format_id': 'bestaudio/best', 'quality': '192kbps', 'filesize': size_192, 'filesize_bytes': int((192 * 1000 / 8) * dur), 'type': 'audio'},
                {'format_id': 'bestaudio/best', 'quality': '128kbps', 'filesize': size_128, 'filesize_bytes': int((128 * 1000 / 8) * dur), 'type': 'audio'}
            ]
            
        return {'type': 'video', 'id': info['id'], 'title': info.get('title'), 'thumbnail': info.get('thumbnail'), 'duration': info.get('duration_string'), 'author': info.get('uploader'), 'formats_video': v_fmts[:8], 'formats_audio': a_fmts[:4], 'restriction_message': restriction_message}

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
                    opts['format'] = fmt_id or 'bestaudio/best'
                    clean_qual = ''.join(filter(str.isdigit, qual)) or '192'
                    opts['postprocessors'] = [
                        {'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': clean_qual},
                        {'key': 'FFmpegThumbnailsConvertor', 'format': 'jpg'},
                        {'key': 'EmbedThumbnail'}, 
                        {'key': 'FFmpegMetadata'}
                    ]
                else:
                    ext = 'mp4'
                    if fmt_id and fmt_id != 'playlist_video': opts['format'] = fmt_id
                    elif '1080' in qual: opts['format'] = 'bestvideo[height=1080]+bestaudio/bestvideo[height<=1080]+bestaudio/best'
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
                attempts = [opts]
                for client_profile in self.get_fallback_client_profiles():
                    attempts.append(self.clone_opts_with_client_profile(opts, client_profile))
                if 'cookiefile' not in opts:
                    for browser in self.browser_cookie_sources:
                        attempts.append(self.clone_opts_with_client_profile(opts, browser=browser))
                        for client_profile in self.get_fallback_client_profiles():
                            attempts.append(self.clone_opts_with_client_profile(opts, client_profile, browser))
                last_error = None
                for attempt_opts in attempts:
                    try:
                        with yt_dlp.YoutubeDL(attempt_opts) as ydl:
                            ydl.download([url])
                        last_error = None
                        break
                    except Exception as e:
                        last_error = e
                if last_error:
                    raise last_error

                
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
        target = id if id.startswith('http') else f"https://www.youtube.com/watch?v={id}"
        info = None

        try:
            info = engine.extract_video_info(target)
        except Exception:
            info = None

        if not info:
            for client_profile in engine.get_fallback_client_profiles():
                try:
                    info = engine.extract_video_info(target, client_profile=client_profile)
                    if info:
                        break
                except Exception:
                    continue

        if not info:
            return {'error': 'Nao foi possivel carregar a previa.'}

        raw_candidates = []
        for fmt in info.get('formats', []):
            if fmt.get('vcodec') in (None, 'none') or fmt.get('acodec') in (None, 'none'):
                continue
            fmt_url = fmt.get('url')
            if not fmt_url:
                continue
            protocol = str(fmt.get('protocol') or '')
            if protocol not in ('https', 'http', 'm3u8', 'm3u8_native'):
                continue
            height = int(fmt.get('height') or 0)
            mime_type = 'application/x-mpegURL' if 'm3u8' in protocol else 'video/mp4'
            quality_label = f"{height}p" if height else 'Auto'
            raw_candidates.append({
                'id': f"{quality_label}-{protocol}-{fmt.get('format_id')}",
                'label': quality_label,
                'url': fmt_url,
                'height': height,
                'protocol': protocol,
                'mime_type': mime_type,
            })

        best_by_quality = {}
        for candidate in raw_candidates:
            key = candidate['label']
            current = best_by_quality.get(key)
            if not current or (
                (candidate['height'] or 0,
                 1 if candidate['mime_type'] == 'application/x-mpegURL' else 0,
                 1 if candidate['protocol'] in ('https', 'http') else 0)
                >
                (current['height'] or 0,
                 1 if current['mime_type'] == 'application/x-mpegURL' else 0,
                 1 if current['protocol'] in ('https', 'http') else 0)
            ):
                best_by_quality[key] = candidate

        sources = sorted(best_by_quality.values(), key=lambda candidate: candidate['height'] or 0, reverse=True)

        direct_fallback = next((
            candidate for candidate in sorted(raw_candidates, key=lambda item: item['height'] or 0, reverse=True)
            if candidate['mime_type'] == 'video/mp4'
        ), None)

        if not direct_fallback:
            for direct_profile in ('web', 'mweb'):
                try:
                    direct_info = engine.extract_video_info(target, client_profile=direct_profile)
                except Exception:
                    direct_info = None
                if not direct_info:
                    continue
                direct_candidates = []
                for fmt in direct_info.get('formats', []):
                    if fmt.get('vcodec') in (None, 'none') or fmt.get('acodec') in (None, 'none'):
                        continue
                    fmt_url = fmt.get('url')
                    if not fmt_url:
                        continue
                    protocol = str(fmt.get('protocol') or '')
                    if protocol not in ('https', 'http'):
                        continue
                    height = int(fmt.get('height') or 0)
                    direct_candidates.append({
                        'id': f"{height or 'auto'}-{protocol}-{fmt.get('format_id')}",
                        'label': f"{height}p" if height else 'Auto',
                        'url': fmt_url,
                        'height': height,
                        'protocol': protocol,
                        'mime_type': 'video/mp4',
                    })
                if direct_candidates:
                    direct_fallback = sorted(direct_candidates, key=lambda item: item['height'] or 0, reverse=True)[0]
                    break

        if direct_fallback and all(source['id'] != direct_fallback['id'] for source in sources):
            direct_copy = dict(direct_fallback)
            direct_copy['label'] = f"{direct_copy['label']} (compat)"
            sources.append(direct_copy)

        sources = sources[:6]

        selected = None
        if sources:
            selected = sources[0]

        if not selected and info.get('url'):
            selected = {
                'id': 'auto-primary',
                'label': info.get('format_note') or info.get('resolution') or 'Auto',
                'url': info.get('url'),
                'mime_type': 'video/mp4'
            }
            sources = [selected]

        if not selected:
            return {'error': 'Nenhum stream compativel foi encontrado para a previa.'}

        return {
            'url': selected['url'],
            'mime_type': selected.get('mime_type', 'video/mp4'),
            'sources': [
                {
                    'id': source['id'],
                    'label': source['label'],
                    'url': source['url'],
                    'mime_type': source.get('mime_type', 'video/mp4')
                }
                for source in sources
            ]
        }
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
    if sys.platform == 'win32':
        os.startfile(p)
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', p])
    else:
        subprocess.Popen(['xdg-open', p])
    return {'status': 'ok'}

@app.post("/api/revalidate-history")
def r_reval(): 
    return {'status': 'ok', 'history': history_manager.revalidate_history()}

@app.get("/api/app-info")
def r_appinfo(): 
    return {"version": "1.2.0 1080p-Stable", "engine": "LEG3NDY Core"}


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=5000, log_level="info")