# Dr. Eman Ameen Pharmacy Management System - Shutdown Script
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $ProjectRoot

Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host " Stopping Dr. Eman Ameen Pharmacy Management System" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Yellow

# Safe shutdown: stops and removes containers without touching persistent volumes
docker compose down

Write-Host ""
Write-Host "[OK] Pharmacy system containers stopped cleanly. Database data is preserved." -ForegroundColor Green
