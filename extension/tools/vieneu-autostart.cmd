@echo off
rem Double-click to make the VieNeu voice server start with Windows (see vieneu-autostart.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0vieneu-autostart.ps1" %*
pause
