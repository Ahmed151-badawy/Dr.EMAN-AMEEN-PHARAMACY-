@echo off
TITLE Dr. Eman Ameen Pharmacy - Database Backup
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup_database.ps1"
if /i not "%~1"=="--no-pause" pause
