# Production Deployment Guide: Dr. Eman Ameen Pharmacy Management System

This guide provides instructions for deploying the system on a **new pharmacy workstation (Windows 10/11 64-bit)** with an empty catalog.

---

## 1. System Requirements & Prerequisites
- **Operating System:** Windows 10 Pro / Enterprise (Build 19041+) or Windows 11 64-bit.
- **Hardware:**
  - Minimum 8 GB RAM (16 GB recommended).
  - 4-core Intel Core i5 / AMD Ryzen 5 or higher.
  - At least 50 GB free NVMe/SSD disk space.
- **Prerequisites Installed:**
  - **Docker Desktop for Windows** (WSL 2 backend enabled).
  - Google Chrome or Microsoft Edge web browser.
  - POS thermal receipt printer (USB / Network ESC/POS).
  - 1D/2D Barcode scanner (USB HID keyboard emulation).

---

## 2. Directory Layout & Placement
1. Extract the package directly to a dedicated local directory on the target workstation (e.g., `C:\Pharmacy-System` or `D:\Pharmacy-System`).
2. Ensure the directory path contains no spaces or special non-ASCII characters.

```text
Pharmacy-System\
├── docker-compose.yml       # Production Compose definition (isolated network)
├── Dockerfile               # Backend Dockerfile
├── requirements.txt         # Production backend dependencies
├── alembic.ini              # Database migration configuration
├── .env.example             # Configuration template
├── app\                    # FastAPI backend source code
├── alembic\                # Schema migrations up to head (c7d8e9f0a1b2)
├── frontend\               # React + Vite production build & Nginx config
├── scripts\                # Bootstrap and administrative scripts
│   ├── create_admin.py     # Owner initialization script
│   └── windows\            # PowerShell & .bat operational utilities
├── docs\                   # Operational documentation
└── backups\                # Default directory for verified SQL database dumps
```

---

## 3. Installation Steps
1. Open PowerShell as Administrator.
2. Navigate to the installation directory:
   ```powershell
   cd C:\Pharmacy-System
   ```
3. Copy the environment configuration template:
   ```powershell
   Copy-Item .env.example .env
   ```
4. Open `.env` with a text editor (e.g. Notepad) and configure:
   - `POSTGRES_PASSWORD`: Choose a strong password.
   - `DATABASE_URL`: Ensure the password matches `POSTGRES_PASSWORD`.
   - `SECRET_KEY`: Generate a random 64-hex key:
     ```powershell
     docker run --rm python:3.12-slim python -c "import secrets; print(secrets.token_hex(32))"
     ```
5. Follow `docs/FIRST-START.md` for initialization and owner setup.
