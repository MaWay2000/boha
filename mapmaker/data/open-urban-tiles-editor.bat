@echo off
setlocal
cd /d "%~dp0.."
set PORT=8767
start "" "http://127.0.0.1:%PORT%/data/urban-tiles-editor.html"
python -m http.server %PORT% --bind 127.0.0.1
