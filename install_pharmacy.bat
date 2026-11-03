@echo off
TITLE Dr. Eman Ameen Pharmacy - Production Installer
cd /d "%~dp0"
if exist "scripts\windows\install_pharmacy.bat" (
    call "%~dp0scripts\windows\install_pharmacy.bat"
) else (
    echo [ERROR] Could not find scripts\windows\install_pharmacy.bat
    pause
)
