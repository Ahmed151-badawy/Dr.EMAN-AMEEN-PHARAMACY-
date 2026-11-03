@echo off
TITLE Restore Database - Dr. Eman Ameen Pharmacy
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore_database.ps1" -BackupFile "%~1"
pause
