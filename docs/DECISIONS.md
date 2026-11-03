# Architectural and Operational Decisions (DECISIONS.md)
**Dr. Eman Ameen Pharmacy Management System — Production Deployment Package**  
**Document Revision:** 2.0 (Post-Audit Hardening)  
**Date:** 2026-10-24  

---

## 1. Greenfield Initialization & Zero Business Data
* **Context:** The production system must be deployed on a new pharmacy workstation without inheriting historical test transactions, dummy customers, or development suppliers from `F:\DR.EMAN AMEEN PHARMACY`.
* **Decision:** The deployment package is built strictly from clean structural assets. Database volume starts completely uninitialized. Migrations run via `alembic upgrade head` populating only essential regulatory lookups (`dosage_forms`: 44 rows, `drug_families`: 13 rows, `product_categories`: 11 rows).
* **Consequence:** Active ingredients start empty (= 0 rows). When adding medicines with active ingredients, the operator must first populate the active ingredient catalog via `POST /medicines/active-ingredients`. This intentional separation ensures zero synthetic data in clinical production records.

---

## 2. Explicit Stable Volume Naming & Volume Guards
* **Context:** Default Docker Compose volume naming uses `<project_directory>_pgdata`. If the directory is renamed or moved, Docker creates a brand-new volume, causing apparent data loss.
* **Decision:** The database volume is explicitly named in `docker-compose.yml`:
  ```yaml
  volumes:
    pgdata:
      name: ${COMPOSE_PROJECT_NAME:-pharmacy}_pgdata
  ```
  Management scripts distinguish between **First Install** (initializing database and running migrations) and **Normal Start/Restart** (`docker compose up -d` or `docker compose restart`), preserving volume data across machine reboots.
* **Safety Rule:** Production scripts NEVER run `docker compose down -v` or remove volumes.

---

## 3. Cryptographic Secret & Database Password Generation
* **Context:** Shipping hardcoded database passwords or JWT secret keys (`SECRET_KEY`) represents a critical security hazard. Printing secrets to console or unencrypted logs leaks credentials.
* **Decision:**
  - `POSTGRES_PASSWORD` and `SECRET_KEY` are generated randomly per installation using cryptographically secure random sources (`secrets.token_hex(32)` / `secrets.token_urlsafe(24)` in Python or `[System.Security.Cryptography.RandomNumberGenerator]` in PowerShell).
  - Credentials are written strictly to `.env` with restrictive file permissions.
  - **Never Print Secrets:** Management scripts, deployment automation, and test runners strictly redact passwords and tokens as `[REDACTED]`.

---

## 4. Multi-Worker Login Rate Limiting
* **Context:** Fast-brute-force attacks against `POST /auth/login` must be prevented without requiring an external Redis server. The API server runs Uvicorn with `--workers 2`.
* **Decision:** Implemented a sliding-window rate limiter in `app/api/auth.py` backed by container filesystem state (`/tmp/failed_logins.json` with file locking).
  - Maximum failed attempts: 5 per client IP within a 60-second window.
  - 6th attempt triggers immediate `HTTP 429 Too Many Requests`.
  - Shared across all Uvicorn worker processes. Successful authentication clears the failure counter for that IP.

---

## 5. PostgreSQL-Level Audit Log Immutability Gap & Recommendation
* **Context:** Ministry of Health regulations mandate that regulatory audit logs (`audit_logs`) must be strictly tamper-evident and append-only.
* **Empirical Audit Finding:** While the application API strictly prohibits `UPDATE` and `DELETE` on audit endpoints, direct SQL execution by the PostgreSQL database owner user currently succeeds (`UPDATE 1`, `DELETE 1`).
* **Decision & Mitigation:**
  - Document this architectural reality plainly in `VALIDATION-REPORT.md`.
  - In production, restrict the web application to a dedicated non-superuser role without `DELETE` or `UPDATE` privileges on `audit_logs`:
    ```sql
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM pharmacy_user;
    ```
  - For total database-level immutability, deploy a `BEFORE UPDATE OR DELETE` trigger that raises an unbypassable exception.

---

## 6. Official Timezone Standard: Africa/Cairo
* **Context:** Timestamping controlled medicine sales, prescriptions, and financial transactions in UTC or host-variable timezones causes regulatory non-compliance during Ministry of Health audits.
* **Decision:** Explicitly configure `TZ=Africa/Cairo` across both PostgreSQL container (`db`) and FastAPI backend (`api`) via `docker-compose.yml` and `.env`. All logs, backups, and audit trails reflect official Egyptian local time.

---

## 7. Container Restart Policy & Auto-Start
* **Context:** Workstations at pharmacies may experience sudden power outages or routine reboots.
* **Decision:** All services specify `restart: unless-stopped`. Windows autostart is facilitated via `scripts/windows/setup_windows_autostart.py`, configuring Docker Desktop and system services to resume operation on workstation boot.

---

## 8. Automated Daily Backups & Restore Safeguard
* **Context:** Hardware failures or ransomware can destroy pharmacy records. Restoring a backup by accident could overwrite valid recent transactions.
* **Decision:**
  - Automated backups enforce a **30-day retention policy** (`backup_database.ps1`), removing dumps older than 30 days.
  - Every backup validates dump integrity (verifying PostgreSQL header `SET` and dump markers; minimum threshold > 1 KB).
  - `restore_database.ps1` **automatically generates a pre-restore safety snapshot** of the live database before overwriting, guaranteeing that rollbacks can be recovered.

---

## 9. Plain HTTP over Local Area Network (LAN) Warning
* **Context:** The application default configuration serves plain HTTP on port 80/8083.
* **Security Notice:** If workstations on the pharmacy LAN access the web interface over plain HTTP (`http://192.168.x.x`):
  - Passwords, JWT tokens, customer national IDs, and controlled medicine records travel in plaintext across the local network.
  - Susceptible to ARP spoofing, packet sniffing, and session hijacking.
* **Recommendation:** For multi-computer setups, terminate TLS via a reverse proxy (Nginx or Caddy) with a local or internal HTTPS certificate.

---

## 10. Arabic User Guide Status
* **Context:** Automated headless browser screenshot capture was blocked in this environment due to external network constraints (Playwright CDN driver download returning HTTP 404).
* **Decision:** In adherence to strict auditing integrity, the Arabic user guide (`docs/ar/USER-GUIDE-AR.md`) is watermarked as **"مسودة غير مدققة (Unverified Draft)"** on page 1. It contains complete ASCII workflow representations, table-by-table schema explanations, and official Decree 44 & 242 regulatory steps.
