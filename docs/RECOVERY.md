# Disaster Recovery & Database Restoration Guide

Follow this guide if the pharmacy computer fails or if data needs to be restored from an authenticated backup.

---

## 1. Pre-Restoration Safeguards
Before restoring any backup:
1. Ensure the system containers are running (`start_pharmacy.bat`).
2. When running `restore_database.bat`, the system **automatically takes a safety snapshot** of the current database before applying the restoration file.

---

## 2. Restoration Steps
1. Locate the backup file (e.g. `backups\pharmacy_db_backup_2026-10-24_12-00-00.sql`).
2. Run:
   ```cmd
   scripts\windows\restore_database.bat "C:\Path\To\Backup.sql"
   ```
3. Type `yes` when prompted to confirm.
4. The script streams the SQL dump into `psql` within the database container.
5. Once completed, restart the system to refresh application caches:
   ```cmd
   scripts\windows\restart_pharmacy.bat
   ```

---

## 3. Post-Restoration Verification
1. Open `http://localhost` and log in as `admin`.
2. Verify total medicines, customer balances, and recent sales history.
3. Check `Audit Logs` under Controlled Medicines to verify audit snapshot continuity.
