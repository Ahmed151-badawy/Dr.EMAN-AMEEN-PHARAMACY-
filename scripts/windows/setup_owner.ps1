# Dr. Eman Ameen Pharmacy Management System - Primary Owner Account Bootstrap
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $ProjectRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Dr. Eman Ameen Pharmacy - Primary Owner Account Setup" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "This script bootstraps the sole primary owner administrator account." -ForegroundColor White
Write-Host "Owner Full Name: Dr. Eman Ameen" -ForegroundColor White
Write-Host "Owner Username:  admin" -ForegroundColor White
Write-Host "Role:            Primary Administrator (is_primary_admin = true)" -ForegroundColor White
Write-Host ""

# Verify API container is running
$apiContainer = docker compose ps -q api
if (-not $apiContainer) {
    Write-Host "[ERROR] API container is not active. Please start the system first using start_pharmacy.bat." -ForegroundColor Red
    exit 1
}

# Prompt operator interactively for secure password if not provided via environment variable
$ownerPassword = $env:OWNER_INITIAL_PASSWORD
if ([string]::IsNullOrWhiteSpace($ownerPassword)) {
    Write-Host "Please enter the password for the primary administrator account (input hidden):" -ForegroundColor Yellow
    $securePass = Read-Host -AsSecureString "Password"
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
    $ownerPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    
    $confirmPass = Read-Host -AsSecureString "Confirm Password"
    $bstr2 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmPass)
    $confirmStr = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr2)
    
    if ($ownerPassword -ne $confirmStr) {
        Write-Host "[ERROR] Passwords do not match. Bootstrap aborted." -ForegroundColor Red
        exit 1
    }
}

if ($ownerPassword.Length -lt 8) {
    Write-Host "[ERROR] Password must be at least 8 characters long." -ForegroundColor Red
    exit 1
}

Write-Host "Applying database migrations to head revision..." -ForegroundColor Cyan
docker compose exec -T api alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to apply Alembic migrations." -ForegroundColor Red
    exit 1
}

Write-Host "Creating primary owner account..." -ForegroundColor Cyan
docker compose exec -T api python scripts/create_admin.py --username admin --full-name "Dr. Eman Ameen" --password $ownerPassword --primary

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host " Primary Owner Account (admin) Created Successfully!" -ForegroundColor Green
    Write-Host " You may now log in to the web interface using this password." -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Owner bootstrap script failed with exit code $LASTEXITCODE." -ForegroundColor Red
}

# Clear variable from memory
$ownerPassword = $null
$env:OWNER_INITIAL_PASSWORD = $null
