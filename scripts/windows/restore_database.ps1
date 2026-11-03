# Dr. Eman Ameen Pharmacy Management System - Database Restore Script
param(
    [string]$BackupFile = "",
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
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


Write-Host "======================================================================" -ForegroundColor Red
Write-Host " RESTORING DR. EMAN AMEEN PHARMACY DATABASE" -ForegroundColor Red
Write-Host "======================================================================" -ForegroundColor Red

if ([string]::IsNullOrWhiteSpace($BackupFile)) {
    $BackupFile = Read-Host "Enter the path to the .sql backup file to restore"
}

$BackupFile = $BackupFile.Trim('"').Trim("'")
if (-not (Test-Path $BackupFile)) {
    Write-Host "[ERROR] Backup file does not exist: '$BackupFile'" -ForegroundColor Red
    exit 1
}

$fileSize = (Get-Item $BackupFile).Length
if ($fileSize -eq 0) {
    Write-Host "[ERROR] Backup file is empty (0 bytes): '$BackupFile'" -ForegroundColor Red
    exit 1
}

$dbContainer = docker compose ps -q db
if (-not $dbContainer) {
    Write-Host "[ERROR] Database container is not running. Please start the system before restoring." -ForegroundColor Red
    exit 1
}

$dbUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "pharmacy" }
$dbName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "pharmacy_db" }

if (-not $Force) {
    Write-Host ""
    Write-Host "WARNING: Restoring will overwrite all existing data in '$dbName' with '$BackupFile' ($fileSize bytes)!" -ForegroundColor Yellow
    $confirm = Read-Host "Are you sure you want to proceed? Type 'yes' to confirm"
    if ($confirm.ToLower() -ne "yes") {
        Write-Host "Database restoration cancelled by user." -ForegroundColor Yellow
        exit 0
    }
}

# Pre-restore automated safeguard backup
Write-Host "Creating safety snapshot of current database state before restoration..." -ForegroundColor Cyan
$preRestoreDir = Join-Path $ProjectRoot "backups"
& "$ScriptDir\backup_database.ps1" -BackupDir $preRestoreDir

Write-Host "Restoring database from '$BackupFile'..." -ForegroundColor Cyan
Get-Content -Path $BackupFile -Raw | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host " Database restoration completed successfully!" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Database restore failed with exit code $LASTEXITCODE." -ForegroundColor Red
    exit 1
}
