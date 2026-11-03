@echo off
TITLE Dr. Eman Ameen Pharmacy - Production Installer
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_pharmacy.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Installation wizard exited with code %ERRORLEVEL%.
    pause
) else (
    echo.
    echo Press any key to exit installer . . .
    pause >nul
)
