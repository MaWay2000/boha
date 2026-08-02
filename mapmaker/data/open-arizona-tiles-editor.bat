@echo off
setlocal
cd /d "%~dp0.."
set PORT=8766
start "" "http://127.0.0.1:%PORT%/data/arizona-tiles-editor.html"
python -m http.server %PORT% --bind 127.0.0.1
