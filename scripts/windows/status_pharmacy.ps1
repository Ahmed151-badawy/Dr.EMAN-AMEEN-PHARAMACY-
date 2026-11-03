# Dr. Eman Ameen Pharmacy Management System - Status Script
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $ProjectRoot

# Load .env file into Process environment if present
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $k = $parts[0].Trim()
            $v = $parts[1].Trim()
            if (-not [string]::IsNullOrWhiteSpace($k)) {
                [Environment]::SetEnvironmentVariable($k, $v, "Process")
            }
        }
    }
}


Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Dr. Eman Ameen Pharmacy Management System - Status" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

docker compose ps

$apiPort = 8000
if ($env:API_PORT) { $apiPort = $env:API_PORT }
Write-Host ""
Write-Host "Checking health endpoint at http://localhost:$apiPort/health..." -ForegroundColor Yellow
try {
    $res = Invoke-RestMethod -Uri "http://localhost:$apiPort/health" -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[ONLINE] API Status: $($res.status) | App: $($res.app) | Env: $($res.env)" -ForegroundColor Green
} catch {
    Write-Host "[OFFLINE] Could not reach backend API at http://localhost:$apiPort/health" -ForegroundColor Red
}
