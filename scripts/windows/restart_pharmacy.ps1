# Dr. Eman Ameen Pharmacy Management System - Restart Script
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $ProjectRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Restarting Dr. Eman Ameen Pharmacy Management System" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

docker compose restart
Start-Sleep -Seconds 3

& "$ScriptDir\status_pharmacy.ps1"
