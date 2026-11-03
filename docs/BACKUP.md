# Backup Policy & Procedures

Regulatory authorities (Egyptian Drug Authority / Ministry of Health) mandate complete data preservation for pharmaceutical transactions and scheduled medicine logs.

---

## 1. Automated Daily Backups
The system includes an automated backup utility that:
1. Performs consistent, atomic database dumps using `pg_dump` with `--clean --if-exists --no-owner`.
2. Validates backup size and SQL header integrity.
3. Implements an automatic **30-day retention policy** (removing older backups).

### Manual Backup Execution:
Double-click `scripts\windows\backup_database.bat` or run:
```powershell
.\scripts\windows\backup_database.ps1
```

### Scheduling Daily Backups:
Open PowerShell as Administrator and run:
```powershell
.\scripts\windows\schedule_daily_backup.ps1 -TaskTime "23:00"
```
This registers a high-priority scheduled task (`DrEmanAmeenPharmacy_DailyBackup`) in Windows Task Scheduler.

---

## 2. 3-2-1 Off-Site Backup Recommendation
> [!IMPORTANT]
> A backup on the same hard drive does not protect against physical hardware failure, fire, or theft.
> 
> **Recommended Practice:**
> - Keep daily backups in `.\backups`.
> - Configure an automated sync (e.g. daily USB flash drive copy or encrypted cloud storage drive) to maintain a secondary copy on a separate physical device.
