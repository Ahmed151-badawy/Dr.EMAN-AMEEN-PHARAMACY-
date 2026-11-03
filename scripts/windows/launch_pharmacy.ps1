# Dr. Eman Ameen Pharmacy Management System - Desktop Launcher
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $ProjectRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Launching Dr. Eman Ameen Pharmacy Management System" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$apiPort = 8000
if ($env:API_PORT) { $apiPort = $env:API_PORT }
$frontendPort = 80
if ($env:FRONTEND_PORT) { $frontendPort = $env:FRONTEND_PORT }

# 1. Fast check if backend is already online
$alreadyOnline = $false
try {
    $res = Invoke-RestMethod -Uri "http://localhost:$apiPort/health" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($res.status -eq "ok") { $alreadyOnline = $true }
} catch { }

if (-not $alreadyOnline) {
    & "$ScriptDir\start_pharmacy.ps1"
}

# 2. Launch default browser
$appUrl = if ($frontendPort -eq 80) { "http://localhost" } else { "http://localhost:$frontendPort" }
Write-Host "Opening web application at $appUrl..." -ForegroundColor Green

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

if (Test-Path $chrome) {
    Start-Process $chrome -ArgumentList "--start-maximized", $appUrl
} elseif (Test-Path $edge) {
    Start-Process $edge -ArgumentList "--start-maximized", $appUrl
} else {
    Start-Process $appUrl
}
