# Dr. Eman Ameen Pharmacy Management System — Production Deployment Guide

## 1. Package Overview & Architecture

This deployment package is a self-contained, minimal, and portable production distribution designed specifically for deploying the **Dr. Eman Ameen Pharmacy Management System** on the pharmacy workstation.

### Architecture Stack
- **Web Frontend**: React 18, TypeScript, Vite, Tailwind CSS, served via high-performance Nginx Alpine on `http://localhost` (Port 80).
- **Backend API**: FastAPI (Python 3.12), SQLAlchemy 2.0 async/sync engine, Uvicorn ASGI server with 2 workers on `http://localhost:8000`.
- **Database Engine**: PostgreSQL 16 Alpine running in an isolated Docker container (`pharmacy_db`) with volume persistence (`pharmacy_pgdata`).
- **Database Security**: Port 5432 is **not published** to the host network. All database communication occurs strictly within Docker's internal bridge network.
- **Automation & Operations**: Native Windows scripts (`.bat`) for autostart, automated daily backups with 30-day retention, one-click restoration, health monitoring, and desktop shortcut integration.

---

## 2. Directory Structure

```text
F:\Pharmacy-Deployment\
├── .dockerignore                  # Docker build exclusion rules
├── .env.example                   # Production environment template (no real secrets)
├── alembic.ini                    # Database migration configuration
├── docker-compose.prod.yml        # Production multi-container orchestration
├── Dockerfile                     # FastAPI backend production image definition
├── install_pharmacy.bat           # Master automated installation & verification wizard
├── README_DEPLOYMENT.md           # This document
├── requirements.txt               # Backend production Python dependencies
├── alembic/                       # Database schema migrations (Alembic versions)
│   ├── env.py
│   ├── script.py.mako
│   └── versions/                  # All production schema migrations
├── app/                           # Backend application source code
│   ├── main.py
│   ├── api/                       # REST endpoints (auth, medicines, sales, inventory, etc.)
│   ├── core/                      # Config, security, database session management
│   ├── models/                    # SQLAlchemy database models
│   ├── schemas/                   # Pydantic data validation schemas
│   └── services/                  # Business logic & forecasting algorithms
├── backups/                       # Destination folder for automated & manual backups
│   └── README.txt
├── docs/                          # In-depth operational guides
│   ├── BACKUP_AND_RECOVERY_GUIDE.md
│   └── DEPLOYMENT_GUIDE.md
├── frontend/                      # Frontend web application
│   ├── .dockerignore
│   ├── Dockerfile                 # Multi-stage production build (Node 20 builder -> Nginx Alpine)
│   ├── nginx.conf                 # Nginx reverse proxy & client routing
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   ├── src/                       # React TypeScript frontend source code
│   ├── public/
│   └── dist/                      # Pre-compiled static assets
└── scripts/                       # Operational & maintenance utilities
    ├── create_admin.py            # Idempotent admin account bootstrap script
    └── windows/                   # Windows operational batch scripts
        ├── backup_database.bat    # Atomic database backup with 30-day rotation
        ├── create_desktop_shortcut.bat # Creates desktop shortcut with custom icon
        ├── install_pharmacy.bat   # Windows installer (mirror copy)
        ├── launch_pharmacy.bat    # Launches Docker, waits for health, opens browser maximized
        ├── restart_pharmacy.bat   # Graceful stack restart
        ├── restore_database.bat   # Verified interactive database restoration
        ├── run_migrations.bat     # Executes Alembic migrations inside container
        ├── schedule_daily_backup.bat # Registers nightly Task Scheduler job (11:00 PM)
        ├── setup_windows_autostart.py# Configures automatic boot startup
        ├── start_pharmacy.bat     # Starts production stack and verifies health
        ├── status_pharmacy.bat    # Displays container health, logs, and disk status
        └── stop_pharmacy.bat      # Graceful shutdown of pharmacy containers
```

---

## 3. Pre-Requisites for the Pharmacy Workstation

Before starting the installation, ensure the pharmacy workstation satisfies:

1. **Operating System**: Windows 10 (Build 19041+) 64-bit or Windows 11.
2. **Hardware**:
   - Processor: 64-bit x86/x64 processor with Second Level Address Translation (SLAT).
   - Memory: Minimum 8 GB RAM (16 GB recommended).
   - Disk Space: Minimum 20 GB free disk space.
3. **Virtualization**: Hardware Virtualization enabled in BIOS/UEFI (VT-x / AMD-V).
4. **Software**:
   - **Docker Desktop for Windows** (version 4.25 or newer) installed with the WSL 2 backend.
   - Google Chrome or Microsoft Edge installed.

---

## 4. Fresh Installation Procedure (New Pharmacy PC)

### Step 1: Copy Deployment Package
Copy the entire `Pharmacy-Deployment` directory to the target drive (e.g. `C:\Pharmacy-Deployment` or `F:\Pharmacy-Deployment`).

### Step 2: Configure Production Secrets (`.env`)
1. In the deployment folder, make a copy of `.env.example`:
   ```cmd
   copy .env.example .env
   ```
2. Open `.env` in Notepad:
   ```cmd
   notepad .env
   ```
3. Set your private secrets:
   - Generate a cryptographically strong 64-character secret key for `SECRET_KEY`. In PowerShell:
     ```powershell
     powershell -Command "[BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('-','').ToLower()"
     ```
   - Choose a strong alphanumeric password for `POSTGRES_PASSWORD` (e.g. `P#armacy2026!Sec_Eman`).
   - Update `DATABASE_URL` so the password matches `POSTGRES_PASSWORD`:
     `DATABASE_URL=postgresql+psycopg2://pharmacy:YOUR_PASSWORD@db:5432/pharmacy_db`
   - Set `ENV=production`.
4. Save and close `.env`. Restrict file permissions so only administrative users can access it.

### Step 3: Run the Master Installer
Right-click `install_pharmacy.bat` and select **Run as administrator** (or double-click it).

The installer will:
1. Verify Docker Desktop and Docker Compose are running.
2. Validate that required `.env` variables exist without exposing secrets to the screen.
3. Check for any pre-existing containers or database volumes.
4. Build and start the production containers without touching volume data.
5. Poll `http://localhost:8000/health` until the backend is fully healthy.
6. Apply all Alembic database migrations up to `head`.
7. Prompt to bootstrap the primary administrator account if no users exist.
8. Prompt to register the automated nightly backup job in Windows Task Scheduler (11:00 PM).
9. Create the desktop shortcut with the pharmacy icon.

---

## 5. Migration & Existing Data Restoration Procedure

If you are migrating an existing pharmacy database or upgrading an active installation, follow this procedure to guarantee zero data loss.

### Safety Principles
- **Never delete volumes**: Never use `docker compose down -v` or `docker volume rm pharmacy_pgdata`.
- **Pre-migration backup**: Always create and verify a fresh backup of the source database before beginning.

### Step 1: Export Verified Backup from Source System
1. On the source workstation, run:
   ```cmd
   scripts\windows\backup_database.bat
   ```
2. Confirm the resulting `.sql` file in `backups/` is non-empty (>0 bytes) and contains valid SQL table schemas and COPY blocks.

### Step 2: Transfer Backup to Target Workstation
Follow the [Secure Baseline Backup Transfer Procedure](#6-secure-baseline-backup-transfer-procedure) below to place the file in the `backups/` directory of the target machine.

### Step 3: Start the Production Stack
Run `install_pharmacy.bat`. The installer will detect the fresh installation, start the stack, and apply migrations.

### Step 4: Restore the Database
Execute the restore script on the target workstation:
```cmd
scripts\windows\restore_database.bat
```
1. When prompted, enter the path to the backup file, e.g.:
   `backups\pharmacy_db_backup_2026-10-12_21-00-00.sql`
2. Confirm the file size is verified.
3. Type `yes` to confirm restoration.
4. The script safely imports the backup via `psql -U pharmacy -d pharmacy_db`.

### Step 5: Verify Schema & Data Integrity
Run Alembic migrations to apply any schema upgrades:
```cmd
scripts\windows\run_migrations.bat
```
Log in to the web interface at `http://localhost` and verify:
- Primary owner account login.
- Medicine catalog and batch inventory.
- Historical sales and purchase invoices.
- System notifications.

---

## 6. Secure Baseline Backup Transfer Procedure

To transfer a verified database backup between workstations without risking confidentiality or tampering:

1. **Physical Transfer (Encrypted USB Flash Drive)**:
   - Use a dedicated, BitLocker-encrypted USB drive.
   - Copy the verified `.sql` backup file directly from `backups/`.
   - Never upload unencrypted pharmacy database backups to public cloud storage, unencrypted email, or messaging apps.
2. **Checksum Verification**:
   - Compute SHA-256 hash on the source machine:
     ```powershell
     Get-FileHash -Algorithm SHA256 "backups\pharmacy_db_backup_YYYY-MM-DD_HH-mm-ss.sql"
     ```
   - On the destination machine, compute the hash of the transferred file and verify both strings match exactly before restoration:
     ```powershell
     Get-FileHash -Algorithm SHA256 "backups\transferred_backup.sql"
     ```
3. **Secure Erasure from Transfer Media**:
   - After restoration is completed and verified, securely delete the backup from the USB transfer media.

---

## 7. Daily Operations & Maintenance

| Action | Script / Command | Description |
|---|---|---|
| **Launch System** | `scripts\windows\launch_pharmacy.bat` | Starts Docker if needed, starts containers, waits for health, and opens maximized browser. |
| **Stop System** | `scripts\windows\stop_pharmacy.bat` | Gracefully stops all containers without deleting data. |
| **Restart System** | `scripts\windows\restart_pharmacy.bat` | Gracefully restarts the application stack. |
| **Check Status** | `scripts\windows\status_pharmacy.bat` | Shows container states, recent logs, and backup folder stats. |
| **Manual Backup** | `scripts\windows\backup_database.bat` | Creates a timestamped `.sql` dump with 30-day retention. |
| **Restore Database** | `scripts\windows\restore_database.bat` | Restores database from a selected `.sql` backup file. |
| **Run Migrations** | `scripts\windows\run_migrations.bat` | Upgrades database schema to the latest Alembic revision. |
| **Schedule Backup** | `scripts\windows\schedule_daily_backup.bat` | Sets up automated 11:00 PM Windows Task Scheduler job. |
| **Desktop Shortcut**| `scripts\windows\create_desktop_shortcut.bat` | Creates a Desktop shortcut pointing to `launch_pharmacy.bat`. |

---

## 8. Rollback Procedure

If a deployment or update fails or exhibits unexpected behavior, execute the following rollback steps:

1. **Stop Application Stack**:
   ```cmd
   scripts\windows\stop_pharmacy.bat
   ```
2. **Revert to Last Known Good Configuration**:
   - If configuration in `.env` was changed, restore the previous `.env` backup.
3. **Restore Database from Pre-Deployment Backup**:
   - Start the database container only:
     ```cmd
     docker compose -f docker-compose.prod.yml up -d db
     ```
   - Run the restoration script:
     ```cmd
     scripts\windows\restore_database.bat backups\pre_deployment_backup.sql --yes
     ```
4. **Re-launch Pharmacy Stack**:
   ```cmd
   scripts\windows\start_pharmacy.bat
   ```
5. **Verify System Health**:
   - Open `http://localhost:8000/health` (must return `{"status":"healthy"}`).
   - Open `http://localhost` and confirm normal operations.
