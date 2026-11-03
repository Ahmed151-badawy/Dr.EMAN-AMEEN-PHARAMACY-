# Dr. Eman Ameen Pharmacy Management System
## Production Deployment Guide & Operations Manual

---

## 1. System Overview

The **Dr. Eman Ameen Pharmacy Management System** is an offline-first, high-reliability enterprise application designed specifically for on-premise execution at Dr. Eman Ameen Pharmacy (المأمورية - الميزانية - دمياط).

### Tech Stack:
- **Backend**: FastAPI (Python 3.12) with SQLAlchemy 2.0 ORM, Alembic migrations, and Pydantic v2 validation.
- **Database**: PostgreSQL 16 (Alpine) with persistent Docker volume `pharmacy_pgdata`.
- **Frontend**: React 18, TypeScript, Vite, Vanilla CSS design tokens, Lucide icons, TanStack Query, and Nginx production web server.
- **Security**: JWT OAuth2 authentication, argon2/bcrypt password hashing, immutable financial credit ledger, strict RBAC, and primary owner staff-management protection.

---

## 2. Windows Pharmacy PC Setup & Automatic Startup

### Prerequisites:
1. Dedicated Windows 10/11 64-bit PC.
2. [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) installed with WSL2 backend.
3. Available local network ports: `80` (Frontend), `8000` (Backend API), `5432` (PostgreSQL).

### Configuring Docker Desktop Automatic Startup (Permanent Fix):
1. Run the automatic setup tool:
   ```cmd
   python scripts\windows\setup_windows_autostart.py
   ```
   This performs three vital actions:
   - Sets `"AutoStart": true` in Docker's internal `%APPDATA%\Docker\settings-store.json`.
   - Adds the quoted path `"C:\Program Files\Docker\Docker\Docker Desktop.exe"` to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
   - Creates a fail-safe shortcut in Windows Startup folder (`shell:startup`).

2. In Docker Desktop Settings:
   - Open **Docker Desktop Settings** $\rightarrow$ **General**.
   - Check **"Start Docker Desktop when you log in"**.
   - Check **"Use the WSL 2 based engine"**.
   - Click **Apply & restart**.

### Creating 1-Click Desktop Shortcut:
Run `scripts\windows\create_desktop_shortcut.bat`. This automatically places a shortcut named **"Dr. Eman Ameen Pharmacy"** on the Windows Desktop targeting `launch_pharmacy.bat`.

### Normal Daily Staff Workflow:
1. Turn on the PC and log in to Windows.
2. Double-click the **"Dr. Eman Ameen Pharmacy"** shortcut on the Desktop.
3. The launcher automatically ensures Docker Desktop is active, verifies container health, waits for the backend `/health` endpoint to be green, and opens the application at `http://localhost` in a dedicated, maximized browser window (`--start-maximized`).
4. Pharmacy staff logs in and performs daily operations.


---

## 3. Production Docker Architecture

### Service Startup Order & Health Checks:
```
PostgreSQL (pharmacy_db)
    │ (pg_isready check - interval 5s, retries 10)
    ▼
FastAPI Backend (pharmacy_api)
    │ (curl http://localhost:8000/health - interval 5s, retries 10)
    ▼
Nginx Frontend (pharmacy_frontend)
    │ (serves production build on port 80 & proxies API requests)
    ▼
Application Available at http://localhost
```

### Container Policies:
- All services configured with `restart: unless-stopped` to ensure automatic recovery after system reboots or transient crashes.
- PostgreSQL data persisted across container lifecycles in named volume `pharmacy_pgdata`.

---

## 4. Administrator Tools & Maintenance Scripts

All operational scripts reside in `scripts/windows/`:

| Script | Purpose | Safety |
|---|---|---|
| `start_pharmacy.bat` | Starts all production containers in background | Safe |
| `stop_pharmacy.bat` | Gracefully terminates containers | Safe (Preserves data) |
| `restart_pharmacy.bat` | Safely restarts the entire stack | Safe (Preserves data) |
| `status_pharmacy.bat` | Queries container status & `/health` endpoint | Read-Only |
| `backup_database.bat` | Generates timestamped SQL dump in `backups/` | Read-Only |
| `restore_database.bat` | Interactively restores a selected backup file | Overwrites DB with backup |
| `run_migrations.bat` | Executes `alembic upgrade head` inside container | Upgrades schema |
| `launch_pharmacy.bat` | Verifies health and opens browser in maximized window | Desktop shortcut target |
| `create_desktop_shortcut.bat` | Creates the 1-click Windows Desktop shortcut | Safe |
| `setup_windows_autostart.py` | Configures Registry, Docker settings & Startup shortcut | Safe |

---

## 5. Backup & Disaster Recovery Strategy

Detailed manual and recovery runbook available in [`docs/BACKUP_AND_RECOVERY_GUIDE.md`](docs/BACKUP_AND_RECOVERY_GUIDE.md).

### Automated Daily Backup:
- **Frequency**: Automated daily execution at 11:00 PM via Windows Task Scheduler (`PharmacyDailyBackup`).
- **Initial Setup**: Run `scripts\windows\schedule_daily_backup.bat` as Administrator.
- **Verification**: Run `schtasks /query /tn "PharmacyDailyBackup" /v /fo list` to confirm `Last Result: 0`.

### Manual Backup:
- **Execution**: Run `scripts\windows\backup_database.bat` (or pass `--no-pause` in scripts).
- **Output**: `backups\pharmacy_db_backup_YYYY-MM-DD_HH-mm-ss.sql`.
- **Validation**: Verified non-empty SQL dump with pre-validation temporary file `.tmp` handling.
- **Retention**: Automated 30-day rotation; newest valid backup is always preserved. Copy backups to an external USB flash drive weekly.

### Restoration Procedure:
1. Ensure the system is running: `scripts\windows\start_pharmacy.bat`.
2. Run `scripts\windows\restore_database.bat`.
3. Provide the path to the backup file (e.g. `backups\pharmacy_db_backup_2026-10-12_22-01-14.sql`).
4. Type `yes` to confirm.
5. The script restores all schema definitions, sequences, tables, constraints, and data.
6. Run `scripts\windows\restart_pharmacy.bat` to reload application state.

> [!CAUTION]
> Never run `docker compose down -v` in production. The `-v` flag deletes the named volume `pharmacy_pgdata` and destroys the database! Use `stop_pharmacy.bat` instead.

---

## 6. Security, RBAC & Primary Owner Protection

### Primary Owner Rule:
- **Owner Account**: Dr. Eman Ameen (`is_primary_admin = true`).
- **Protection Guard**: The primary owner account cannot be deactivated, deleted, or demoted from `ADMIN`.
- **Staff Authority**: Only the primary owner has permission to create, edit, change roles, reset passwords, or deactivate pharmacy staff accounts.
- **Role Permissions**:
  - `Admin`: Full system access, configuration, forecasting, financials.
  - `Pharmacist`: POS, medicines, customer credit views, inventory intelligence.
  - `Cashier`: POS sales, credit sales, payment recording, customer creation.
  - `Inventory Manager`: Batches, purchases, supplier management, write-offs.

---

## 7. Professional Receipt Printing (Thermal 80mm & A4)

The system features dedicated receipt generation in [`frontend/src/utils/receiptPrinter.ts`](file:///f:/DR.EMAN%20AMEEN%20PHARMACY/frontend/src/utils/receiptPrinter.ts):
- **Header**:
  - Arabic: *"صيدلية د. إيمان أمين / رعاية صيدلانية متكاملة - خدمة 24 ساعة / المأمورية - الميزانية-دمياط"*
  - English: *"DR. EMAN AMEEN PHARMACY / Comprehensive Pharmaceutical Care / Al-Mamouria - Al-Mezania, Damietta, Egypt"*
- **Format**: Clean thermal layout (80mm width) and standard A4 with zero browser navigation or application UI artifacts.
- **Financial Details**: Items table, subtotal, discount, total in EGP, payment method badge, and post-sale outstanding credit balance (for credit sales).

---

## 8. Emergency Recovery Runbook

### If the application does not open:
1. Open Docker Desktop and verify it is running.
2. Run `scripts\windows\status_pharmacy.bat` to check container and API health.
3. If containers are stopped, run `scripts\windows\start_pharmacy.bat`.
4. If issues persist, run `scripts\windows\restart_pharmacy.bat`.
5. Check backend logs: `docker logs pharmacy_api`.
6. Check database logs: `docker logs pharmacy_db`.
