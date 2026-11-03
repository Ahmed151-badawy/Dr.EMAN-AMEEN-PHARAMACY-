@echo off
TITLE Restarting Dr. Eman Ameen Pharmacy Management System
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart_pharmacy.ps1"
if %ERRORLEVEL% neq 0 pause
