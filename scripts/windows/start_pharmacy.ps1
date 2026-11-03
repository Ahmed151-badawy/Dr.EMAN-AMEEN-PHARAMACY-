# Dr. Eman Ameen Pharmacy Management System - Startup Script
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $ProjectRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Starting Dr. Eman Ameen Pharmacy Management System" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Verify Docker daemon is running
try {
    docker info 2>&1 | Out-Null
} catch {
    Write-Host "[INFO] Docker Desktop is not active. Attempting to start Docker..." -ForegroundColor Yellow
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
    } else {
        Write-Host "[ERROR] Docker Desktop executable not found at '$dockerExe'." -ForegroundColor Red
        Write-Host "Please start Docker Desktop manually." -ForegroundColor Red
        exit 1
    }

    Write-Host "Waiting for Docker engine to become ready..." -ForegroundColor Yellow
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        try {
            docker info 2>&1 | Out-Null
            $ready = $true
            break
        } catch { }
    }
    if (-not $ready) {
        Write-Host "[ERROR] Timed out waiting for Docker Desktop to initialize." -ForegroundColor Red
        exit 1
    }
}

# 2. Check for .env file
if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] Production '.env' file not found in '$ProjectRoot'!" -ForegroundColor Red
    Write-Host "Please copy '.env.example' to '.env' and configure your secure credentials." -ForegroundColor Yellow
    exit 1
}

# 3. Start containers
Write-Host "Starting application services with Docker Compose..." -ForegroundColor Green
docker compose up -d --build

# 4. Wait for health check
$apiPort = 8000
if ($env:API_PORT) { $apiPort = $env:API_PORT }
Write-Host "Waiting for backend service health at http://localhost:$apiPort/health..." -ForegroundColor Yellow
$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:$apiPort/health" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($res.status -eq "ok") {
            $healthy = $true
            break
        }
    } catch { }
}

if ($healthy) {
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host " Dr. Eman Ameen Pharmacy Management System is ONLINE and HEALTHY" -ForegroundColor Green
    Write-Host " Web Interface: http://localhost" -ForegroundColor White
    Write-Host " Backend API:   http://localhost:$apiPort" -ForegroundColor White
    Write-Host "======================================================================" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Backend is taking longer than expected to become healthy." -ForegroundColor Yellow
    Write-Host "Check container logs with: docker compose logs api" -ForegroundColor Yellow
}
