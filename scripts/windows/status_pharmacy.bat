@echo off
TITLE Dr. Eman Ameen Pharmacy System Status
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0status_pharmacy.ps1"
pause
