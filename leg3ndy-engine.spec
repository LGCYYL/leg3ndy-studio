# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_all

# Collect ALL files (binaries, datas, hiddenimports) from curl_cffi
# This is critical because curl_cffi ships native C DLLs that hiddenimports alone misses
curl_datas, curl_binaries, curl_hiddenimports = collect_all('curl_cffi')

server_entry = os.path.join('backend', 'server.py')

a = Analysis(
    [server_entry],
    pathex=[],
    binaries=curl_binaries,
    datas=curl_datas,
    hiddenimports=['mutagen', 'websockets'] + curl_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='leg3ndy-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
