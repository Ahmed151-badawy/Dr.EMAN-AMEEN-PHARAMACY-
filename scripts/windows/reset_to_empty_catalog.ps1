# Dr. Eman Ameen Pharmacy Management System - Reset to Empty Catalog
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $ProjectRoot

Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host " RESET DATABASE TO EMPTY CATALOG (PRESERVE OWNER: DR. EMAN AMEEN)" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host "WARNING: This will purge all medicines, suppliers, customers, and sales." -ForegroundColor Red
Write-Host "ONLY the Primary Administrator (Dr. Eman Ameen) will be preserved." -ForegroundColor Red
$confirm = Read-Host "Type 'yes' to proceed"

if ($confirm.ToLower() -ne "yes") {
    Write-Host "Reset cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host "Executing clean purge inside api container..." -ForegroundColor Cyan
docker compose cp "$ProjectRoot\scripts\clean_empty_catalog.py" api:/code/scripts/clean_empty_catalog.py 2>$null
docker compose exec -T api python scripts/clean_empty_catalog.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Database successfully reset to an empty catalog!" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Reset script failed." -ForegroundColor Red
}
