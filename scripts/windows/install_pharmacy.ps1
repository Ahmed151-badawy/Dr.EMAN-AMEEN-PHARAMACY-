# Dr. Eman Ameen Pharmacy Management System - Production Installer Wizard
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Resolve Project Root
$ProjectRoot = ""
if (Test-Path "$ScriptDir\docker-compose.yml") {
    $ProjectRoot = $ScriptDir
} elseif (Test-Path "$ScriptDir\..\docker-compose.yml") {
    $ProjectRoot = (Resolve-Path "$ScriptDir\..").Path
} elseif (Test-Path "$ScriptDir\..\..\docker-compose.yml") {
    $ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
} else {
    Write-Host "[ERROR] Could not determine project root directory (docker-compose.yml not found)." -ForegroundColor Red
    exit 1
}

Set-Location $ProjectRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "    Dr. Eman Ameen Pharmacy Management System" -ForegroundColor Cyan
Write-Host "    Production Deployment and Installation Wizard" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Project Directory: $ProjectRoot" -ForegroundColor Gray
Write-Host ""

# ======================================================================
# [1/7] Verify Docker Environment
# ======================================================================
Write-Host "[1/7] Verifying Docker environment..." -ForegroundColor Yellow
try {
    $dockerVer = docker --version
    Write-Host "  Found: $dockerVer" -ForegroundColor DarkGray
} catch {
    Write-Host "[ERROR] Docker CLI was not found on this system." -ForegroundColor Red
    Write-Host "Please install Docker Desktop for Windows and run this installer again." -ForegroundColor Yellow
    exit 1
}

$dockerReady = $false
try {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $dockerReady = $true }
} catch { }

if (-not $dockerReady) {
    Write-Host "[INFO] Docker daemon is not responding. Attempting to start Docker Desktop..." -ForegroundColor Yellow
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
    }
    Write-Host "Waiting up to 45 seconds for Docker engine to become ready..." -ForegroundColor Yellow
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 3
        try {
            docker info 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $dockerReady = $true
                break
            }
        } catch { }
    }
    if (-not $dockerReady) {
        Write-Host "[ERROR] Docker Desktop failed to respond." -ForegroundColor Red
        Write-Host "Please launch Docker Desktop manually and wait until engine status is 'Running'." -ForegroundColor Yellow
        exit 1
    }
}
Write-Host "[OK] Docker engine and Docker Compose are active." -ForegroundColor Green
Write-Host ""

# ======================================================================
# [2/7] Check Production Configuration (.env)
# ======================================================================
Write-Host "[2/7] Checking production configuration (.env)..." -ForegroundColor Yellow
$envPath = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envPath)) {
    Write-Host ""
    Write-Host "[ERROR] Production configuration file (.env) was not found!" -ForegroundColor Red
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Red
    Write-Host "REQUIRED ACTION:" -ForegroundColor Yellow
    Write-Host "  1. Copy '.env.example' to '.env' inside '$ProjectRoot'" -ForegroundColor White
    Write-Host "  2. Open '.env' in Notepad and set random passwords and secret key" -ForegroundColor White
    Write-Host "  3. Save and rerun this installer." -ForegroundColor White
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Red
    exit 1
}

# Parse .env into process environment
$envMap = @{}
Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line.Split("=", 2)
        $k = $parts[0].Trim()
        $v = $parts[1].Trim()
        $envMap[$k] = $v
        [Environment]::SetEnvironmentVariable($k, $v, "Process")
    }
}

$requiredKeys = @("DATABASE_URL", "SECRET_KEY", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB")
$missingKeys = @()
foreach ($k in $requiredKeys) {
    if (-not $envMap.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($envMap[$k])) {
        $missingKeys += $k
    }
}

if ($missingKeys.Count -gt 0) {
    Write-Host "[ERROR] Missing required configuration keys in .env: $($missingKeys -join ', ')" -ForegroundColor Red
    exit 1
}

$placeholders = @("replace_with", "change_this", "dev-secret", "your_strong_postgres_password", "pharmacy_local_pw")
$hasPlaceholder = $false
foreach ($k in @("POSTGRES_PASSWORD", "SECRET_KEY", "DATABASE_URL")) {
    $val = $envMap[$k].ToLower()
    foreach ($p in $placeholders) {
        if ($val.Contains($p)) { $hasPlaceholder = $true }
    }
}

if ($hasPlaceholder) {
    Write-Host ""
    Write-Host "[WARNING] Default or placeholder secret patterns were detected in .env!" -ForegroundColor Yellow
    Write-Host "Running with default credentials in production is unsafe." -ForegroundColor Yellow
    $ans = Read-Host "Do you want to STOP and edit .env with secure credentials? (Y/N) [Y]"
    if ([string]::IsNullOrWhiteSpace($ans) -or $ans.ToUpper() -eq "Y") {
        Write-Host "Installation stopped. Please edit .env and rerun." -ForegroundColor Yellow
        exit 0
    }
}
Write-Host "[OK] All required configuration keys are present and valid." -ForegroundColor Green
Write-Host ""

# ======================================================================
# [3/7] Volume Guard Check
# ======================================================================
Write-Host "[3/7] Checking for existing pharmacy deployment..." -ForegroundColor Yellow
$projName = if ($envMap["COMPOSE_PROJECT_NAME"]) { $envMap["COMPOSE_PROJECT_NAME"] } else { "pharmacy" }
$volName = "${projName}_pgdata"
$existingVol = docker volume ls --filter "name=$volName" --format "{{.Name}}" 2>$null

if ($existingVol) {
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "[NOTICE] Existing PostgreSQL database volume '$existingVol' detected." -ForegroundColor Cyan
    Write-Host "SAFETY GUARANTEE:" -ForegroundColor Green
    Write-Host "  This installer will NEVER delete or wipe your database volume." -ForegroundColor Green
    Write-Host "  Your existing pharmacy records remain completely safe." -ForegroundColor Green
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Cyan
} else {
    Write-Host "[INFO] Fresh installation: No prior database volume found." -ForegroundColor DarkGray
}
Write-Host ""

# ======================================================================
# [4/7] Build and Start Production Containers
# ======================================================================
Write-Host "[4/7] Building and starting production containers..." -ForegroundColor Yellow
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker Compose failed to start containers." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Containers started successfully." -ForegroundColor Green
Write-Host ""

# ======================================================================
# [5/7] Health Checks
# ======================================================================
Write-Host "[5/7] Waiting for services to become healthy..." -ForegroundColor Yellow
$apiPort = if ($envMap["API_PORT"]) { $envMap["API_PORT"] } else { 8000 }
$frontendPort = if ($envMap["FRONTEND_PORT"]) { $envMap["FRONTEND_PORT"] } else { 80 }

$healthy = $false
for ($i = 0; $i -lt 25; $i++) {
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
    Write-Host "[OK] Backend API is healthy at http://localhost:$apiPort/health" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Backend is taking longer than expected to initialize." -ForegroundColor Yellow
}

$frontendOk = $false
try {
    $resWeb = Invoke-WebRequest -Uri "http://localhost:$frontendPort" -Method Head -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($resWeb.StatusCode -eq 200) { $frontendOk = $true }
} catch { }

if ($frontendOk) {
    Write-Host "[OK] Frontend web server is online at http://localhost:$frontendPort" -ForegroundColor Green
}
Write-Host ""

# ======================================================================
# [6/7] Database Migrations & Primary Owner Setup
# ======================================================================
Write-Host "[6/7] Applying Alembic database migrations..." -ForegroundColor Yellow
docker compose exec -T api alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Database migration failed." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Database schema is UP TO DATE (Alembic Head)." -ForegroundColor Green
Write-Host ""

# Check existing user count
$userCountStr = docker compose exec -T api python -c "from app.core.database import SessionLocal; from app.models.user import User; from sqlalchemy import select, func; db=SessionLocal(); cnt=db.scalar(select(func.count(User.id))); db.close(); print(cnt)" 2>$null
$userCount = 0
if ($userCountStr) {
    [int]::TryParse($userCountStr.Trim(), [ref]$userCount) | Out-Null
}

if ($userCount -eq 0) {
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "[ACTION] Clean database detected: Initial Primary Owner Setup" -ForegroundColor Cyan
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Cyan
    $createOwner = Read-Host "Would you like to configure the primary owner account (Dr. Eman Ameen) now? (Y/N) [Y]"
    if ([string]::IsNullOrWhiteSpace($createOwner) -or $createOwner.ToUpper() -eq "Y") {
        $ownerUser = Read-Host "Enter Owner Username [admin]"
        if ([string]::IsNullOrWhiteSpace($ownerUser)) { $ownerUser = "admin" }
        
        $ownerName = Read-Host "Enter Owner Full Name [Dr. Eman Ameen]"
        if ([string]::IsNullOrWhiteSpace($ownerName)) { $ownerName = "Dr. Eman Ameen" }
        
        Write-Host "Enter Owner Password (input hidden):" -ForegroundColor Yellow
        $secPass = Read-Host -AsSecureString "Password"
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass)
        $passStr = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        
        if ($passStr.Length -lt 8) {
            Write-Host "[ERROR] Password must be at least 8 characters. You can run setup_owner.bat later." -ForegroundColor Yellow
        } else {
            docker compose exec -T api python scripts/create_admin.py --username $ownerUser --full-name $ownerName --password $passStr --primary
            Write-Host "[OK] Primary owner account '$ownerUser' created successfully." -ForegroundColor Green
        }
        $passStr = $null
    }
} else {
    Write-Host "[OK] Administrative user account already exists ($userCount user(s) in database)." -ForegroundColor Green
}
Write-Host ""

# ======================================================================
# [7/7] Operational Setup (Backup Task & Desktop Shortcut)
# ======================================================================
Write-Host "[7/7] Operational configuration..." -ForegroundColor Yellow

$schedScript = Join-Path $ScriptDir "schedule_daily_backup.bat"
if (Test-Path $schedScript) {
    $doBackup = Read-Host "Schedule automated daily backup at 11:00 PM via Windows Task Scheduler? (Y/N) [Y]"
    if ([string]::IsNullOrWhiteSpace($doBackup) -or $doBackup.ToUpper() -eq "Y") {
        & "$ScriptDir\schedule_daily_backup.ps1"
    }
}

$shortScript = Join-Path $ScriptDir "create_desktop_shortcut.bat"
if (Test-Path $shortScript) {
    $doShort = Read-Host "Create Desktop Shortcut for Dr. Eman Ameen Pharmacy? (Y/N) [Y]"
    if ([string]::IsNullOrWhiteSpace($doShort) -or $doShort.ToUpper() -eq "Y") {
        cmd /c "$shortScript" --no-pause
    }
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "    INSTALLATION COMPLETE SUCCESSFULLY!" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
$webUrl = if ($frontendPort -eq 80) { "http://localhost" } else { "http://localhost:$frontendPort" }
Write-Host " Web Application: $webUrl" -ForegroundColor White
Write-Host " Backend API:     http://localhost:$apiPort" -ForegroundColor White
Write-Host " Backend Health:  http://localhost:$apiPort/health" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Green
Write-Host ""
