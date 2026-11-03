@echo off
TITLE Create Shortcuts - Dr. Eman Ameen Pharmacy
cd /d "%~dp0"
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set "WORK_DIR=%%~fI"
set "TARGET_BAT=%SCRIPT_DIR%launch_pharmacy.bat"

:: Locate icon file
set "ICON_PATH=%WORK_DIR%\pharmacy.ico"
if not exist "%ICON_PATH%" set "ICON_PATH=%SCRIPT_DIR%pharmacy.ico"
if not exist "%ICON_PATH%" set "ICON_PATH=%WORK_DIR%\frontend\public\favicon.ico"

echo ======================================================================
echo Creating Desktop and Folder Shortcuts for Dr. Eman Ameen Pharmacy...
echo ======================================================================
echo Target:   %TARGET_BAT%
echo Icon:     %ICON_PATH%
echo WorkDir:  %WORK_DIR%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktopPath = [System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Dr. Eman Ameen Pharmacy.lnk'); " ^
  "$folderPath  = [System.IO.Path]::Combine('%WORK_DIR%', 'Dr. Eman Ameen Pharmacy.lnk'); " ^
  "foreach ($lnkPath in @($desktopPath, $folderPath)) { " ^
  "  $s = $ws.CreateShortcut($lnkPath); " ^
  "  $s.TargetPath = '%TARGET_BAT%'; " ^
  "  $s.WorkingDirectory = '%WORK_DIR%'; " ^
  "  if (Test-Path '%ICON_PATH%') { $s.IconLocation = '%ICON_PATH%,0' }; " ^
  "  $s.Description = 'Dr. Eman Ameen Pharmacy Management System'; " ^
  "  $s.Save(); " ^
  "}"

if %ERRORLEVEL% equ 0 (
    echo [OK] Shortcuts created successfully on Desktop and in deployment folder.
) else (
    echo [ERROR] Failed to create shortcuts.
)

if /i not "%~1"=="--no-pause" pause
