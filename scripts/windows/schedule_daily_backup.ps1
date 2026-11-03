# Dr. Eman Ameen Pharmacy Management System - Task Scheduler Configuration
param(
    [string]$TaskTime = "23:00"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Configuring Automated Daily Backup Task" -ForegroundColor Cyan
Write-Host " Task Name: DrEmanAmeenPharmacy_DailyBackup" -ForegroundColor Cyan
Write-Host " Daily Execution Time: $TaskTime" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$batPath = Join-Path $ScriptDir "backup_database.bat"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$batPath`" --no-pause"
$trigger = New-ScheduledTaskTrigger -Daily -At $TaskTime
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

try {
    Register-ScheduledTask -TaskName "DrEmanAmeenPharmacy_DailyBackup" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host "[SUCCESS] Daily backup scheduled task registered successfully." -ForegroundColor Green
    Write-Host "To view task in Task Scheduler: taskschd.msc" -ForegroundColor White
} catch {
    Write-Host "[ERROR] Failed to register scheduled task: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Ensure you run this script as Administrator." -ForegroundColor Yellow
}
