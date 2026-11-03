@echo off
TITLE Starting Dr. Eman Ameen Pharmacy Management System
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_pharmacy.ps1"
if %ERRORLEVEL% neq 0 pause
