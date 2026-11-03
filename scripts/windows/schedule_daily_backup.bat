@echo off
TITLE Schedule Daily Backup - Dr. Eman Ameen Pharmacy
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0schedule_daily_backup.ps1"
pause
