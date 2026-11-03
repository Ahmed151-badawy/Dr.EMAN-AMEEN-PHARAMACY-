# Dr. Eman Ameen Pharmacy — Backup & Disaster Recovery Guide

## 1. Overview & Architecture

The **Dr. Eman Ameen Pharmacy Management System** stores all critical clinical, financial, customer credit, and pharmaceutical inventory records inside a PostgreSQL 16 container named `pharmacy_db`, persisted in the named Docker volume `pharmacy_pgdata`.

To guarantee operational resilience and prevent data loss, the system provides automated, verified, and rotating backup routines designed for offline single-PC deployment.

---

## 2. Backup Location & Filename Format

- **Directory**: `backups/` (located in the project root)
- **File Pattern**: `pharmacy_db_backup_YYYY-MM-DD_HH-mm-ss.sql`
  - Example: `backups\pharmacy_db_backup_2026-10-12_22-01-14.sql`
- **Format**: Plain SQL dump generated via PostgreSQL `pg_dump` with transaction safety, complete DDL schema, sequences, constraints, and data COPY statements.

---

## 3. How to Create a Manual Backup

### Option A: Standard Windows Desktop / Explorer
1. Navigate to `scripts\windows\` in the pharmacy system folder.
2. Double-click `backup_database.bat`.
3. A command window appears, displaying real-time progress:
   - `[1/3] Generating database dump...`
   - `[2/3] Dump verification passed!`
   - `[3/3] Applying 30-day backup retention policy...`
4. Review the final success message with file size and location, then press any key to close.

### Option B: Command Line (Unattended Mode)
To run a manual backup without waiting for interactive input:
```cmd
scripts\windows\backup_database.bat --no-pause
```
Exit code `0` indicates complete success. Exit code `1` indicates an error.

---

## 4. How to Verify Backup Success

Every valid backup satisfies the following criteria:
1. **Exit Code**: The script exited with code `0`.
2. **File Size**: The generated file in `backups/` is non-empty (>0 bytes, typically ~400KB+ depending on transaction volume).
3. **Integrity Verification**: The first and last lines contain PostgreSQL dump markers:
   - Header: `-- PostgreSQL database dump`
   - Footer: `-- PostgreSQL database dump complete`
4. **Temporary File Cleanup**: No stray `.tmp` files remain in `backups/`. (The backup script only moves `.tmp` to `.sql` upon successful validation).

---

## 5. Automated Daily Backup (Windows Task Scheduler)

The system is configured to execute automated daily backups every night at **11:00 PM (23:00 local time)**.

### Initial Task Setup:
Run the scheduling script as Administrator:
```cmd
scripts\windows\schedule_daily_backup.bat
```
This registers the Windows Scheduled Task **`PharmacyDailyBackup`** configured to invoke `backup_database.bat --no-pause`.

### Inspecting Scheduled Task Status:
To verify the task status and last run result in PowerShell or CMD:
```cmd
schtasks /query /tn "PharmacyDailyBackup" /v /fo list
```

Key fields to check:
- `Status`: Should show `Ready`
- `Last Result`: `0` indicates the last backup succeeded
- `Next Run Time`: Should indicate `11:00:00 PM` of the upcoming day
- `Task To Run`: Points to `...\scripts\windows\backup_database.bat --no-pause`

### Testing the Scheduled Task on Demand:
```cmd
schtasks /run /tn "PharmacyDailyBackup"
```
Wait 5 seconds, then verify that a new `.sql` file appeared in `backups/`.

---

## 6. Retention Policy

- **Retention Window**: 30 days.
- **Rules**:
  - Only files matching `pharmacy_db_backup_*.sql` in `backups/` are subject to rotation.
  - Manual pre-migration or milestone backups (e.g. `pre_medicine_master_upgrade_backup_*.sql`) are **never deleted**.
  - The **newest valid backup is always preserved**, even if older than 30 days or if system time was temporarily misconfigured.

---

## 7. How to Restore Safely

> [!WARNING]
> Restoring a backup overwrites all data in the active database. Always create a fresh backup before performing a restore.

### Standard Interactive Restoration:
1. Ensure the pharmacy system is running:
   ```cmd
   scripts\windows\start_pharmacy.bat
   ```
2. Double-click or run:
   ```cmd
   scripts\windows\restore_database.bat
   ```
3. Enter the path to the backup file (relative or absolute, with or without quotes):
   ```
   backups\pharmacy_db_backup_2026-10-12_21-54-20.sql
   ```
4. Type `yes` when prompted for confirmation.
5. Wait for the confirmation message:
   ```
   ======================================================================
   Database restoration completed successfully!
   ======================================================================
   ```
6. Restart the application to refresh database connections:
   ```cmd
   scripts\windows\restart_pharmacy.bat
   ```

---

## 8. Troubleshooting & Handling Failures

### If a Backup Fails:
- **Safety guarantee**: Incomplete temporary files (`.tmp`) are automatically deleted. Existing `.sql` backups are never overwritten or deleted during a failure.
- **Check Docker Desktop**: Ensure Docker Desktop is active and container `pharmacy_db` is running:
  ```cmd
  docker inspect -f "{{.State.Running}}" pharmacy_db
  ```
- **Check Disk Space**: Ensure the drive has adequate free space.
- **Check Database Health**: Run `docker exec pharmacy_db pg_isready -U pharmacy -d pharmacy_db`.

### If a Scheduled Task Reports Last Result != 0:
- Verify file permissions on `scripts\windows\backup_database.bat`.
- Ensure the user account configured in Task Scheduler has access to Docker Desktop.
- Re-run `scripts\windows\schedule_daily_backup.bat` with administrator privileges.

---

## 9. Destructive Commands to NEVER Run

> [!CAUTION]
> The following commands will cause permanent data loss or service disruption and must **NEVER** be run against production:

1. **`docker compose down -v`** or **`docker compose -f docker-compose.prod.yml down -v`**
   - The `-v` flag deletes named Docker volumes (`pharmacy_pgdata`), destroying the entire live database! Always use `down` without `-v`, or use `scripts\windows\stop_pharmacy.bat`.
2. **`docker volume rm pharmacy_pgdata`**
   - Directly deletes the underlying storage volume.
3. **`DROP DATABASE pharmacy_db;`**
   - Permanently deletes the active database.
4. **`TRUNCATE` or unrestricted `DELETE FROM` statements**
   - Empties patient, inventory, or financial ledger tables.
