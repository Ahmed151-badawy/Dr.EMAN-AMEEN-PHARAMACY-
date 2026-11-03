@echo off
setlocal
cd /d "%~dp0..\.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0reset_to_empty_catalog.ps1"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Reset failed.
)
pause
