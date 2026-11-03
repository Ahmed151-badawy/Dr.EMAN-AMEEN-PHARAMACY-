@echo off
TITLE Primary Owner Setup - Dr. Eman Ameen Pharmacy
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_owner.ps1"
pause
