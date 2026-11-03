@echo off
TITLE Dr. Eman Ameen Pharmacy Management System
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch_pharmacy.ps1"
