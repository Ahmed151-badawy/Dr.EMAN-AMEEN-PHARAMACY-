@echo off
TITLE Running Database Migrations
echo ======================================================================
echo Applying Pending Alembic Migrations to Production Database...
echo ======================================================================

cd /d "%~dp0\..\.."
docker compose exec -T api alembic upgrade head

if %ERRORLEVEL% equ 0 (
    echo [OK] Database schema is UP TO DATE.
) else (
    echo [ERROR] Migration failed!
)
if /i not "%~1"=="--no-pause" pause
