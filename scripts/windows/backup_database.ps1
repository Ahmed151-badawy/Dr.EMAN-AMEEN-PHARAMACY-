# Dr. Eman Ameen Pharmacy Management System - Automated Database Backup Script
param(
    [string]$BackupDir = "",
    [int]$RetentionDays = 30
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


if ([string]::IsNullOrWhiteSpace($BackupDir)) {
    $BackupDir = Join-Path $ProjectRoot "backups"
}

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$tempFile = Join-Path $BackupDir "pharmacy_db_backup_$timestamp.tmp"
$finalFile = Join-Path $BackupDir "pharmacy_db_backup_$timestamp.sql"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Dr. Eman Ameen Pharmacy - Database Backup" -ForegroundColor Cyan
Write-Host " Timestamp: $timestamp" -ForegroundColor Cyan
Write-Host " Target:    $finalFile" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Identify running database container via compose
$dbContainer = docker compose ps -q db
if (-not $dbContainer) {
    Write-Host "[ERROR] Database container is not running or unreachable." -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Generating consistent pg_dump..." -ForegroundColor Yellow
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' | Out-File -FilePath $tempFile -Encoding utf8

if (-not (Test-Path $tempFile)) {
    Write-Host "[ERROR] Temporary backup file was not created." -ForegroundColor Red
    exit 1
}

$fileSize = (Get-Item $tempFile).Length
if ($fileSize -lt 1024) {
    Write-Host "[ERROR] Backup dump is unusually small ($fileSize bytes). Possible database error." -ForegroundColor Red
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "[2/3] Verifying backup integrity..." -ForegroundColor Yellow
$headContent = Get-Content -Path $tempFile -TotalCount 15
$isValidSql = $false
foreach ($line in $headContent) {
    if ($line -match "PostgreSQL database dump" -or $line -match "SET ") {
        $isValidSql = $true
        break
    }
}

if (-not $isValidSql) {
    Write-Host "[ERROR] Backup file does not contain valid PostgreSQL dump header." -ForegroundColor Red
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    exit 1
}

Move-Item -Path $tempFile -Destination $finalFile -Force
Write-Host "[SUCCESS] Verified backup saved to: $finalFile ($fileSize bytes)" -ForegroundColor Green

# 3. Apply retention policy
Write-Host "[3/3] Enforcing $RetentionDays-day backup retention policy..." -ForegroundColor Yellow
$cutoffDate = (Get-Date).AddDays(-$RetentionDays)
$oldFiles = Get-ChildItem -Path $BackupDir -Filter "pharmacy_db_backup_*.sql" | Where-Object { $_.LastWriteTime -lt $cutoffDate }
foreach ($old in $oldFiles) {
    Write-Host "  Removing expired backup: $($old.Name)" -ForegroundColor DarkGray
    Remove-Item $old.FullName -Force -ErrorAction SilentlyContinue
}

Write-Host "Backup operation completed successfully." -ForegroundColor Green
