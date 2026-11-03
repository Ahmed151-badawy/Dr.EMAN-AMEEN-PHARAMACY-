# First-Start & Initialization Procedure

This document specifies the exact procedure to initialize a new, empty pharmacy catalog and bootstrap the primary administrator.

---

## Step 1: Start Application Containers
1. Ensure Docker Desktop is running and healthy.
2. In the installation root folder, run:
   ```cmd
   scripts\windows\start_pharmacy.bat
   ```
   *(Or in PowerShell: `.\scripts\windows\start_pharmacy.ps1`)*
3. The script will:
   - Build and start `db`, `api`, and `frontend` containers.
   - Wait for backend health status (`http://localhost:8000/health`).

---

## Step 2: Bootstrap Primary Owner Account
1. Double-click or execute:
   ```cmd
   scripts\windows\setup_owner.bat
   ```
2. The interactive script will:
   - Run database migrations (`alembic upgrade head`) to construct all tables and seed reference data.
   - Prompt the operator interactively for a secure password (input masked).
   - Create the permanent primary administrator:
     - **Full Name:** `Dr. Eman Ameen`
     - **Username:** `admin`
     - **Role:** `admin` (`is_primary_admin = true`)
3. The password is immediately cleared from memory upon creation.

---

## Step 3: Launch System & Log In
1. Double-click `scripts\windows\launch_pharmacy.bat` (or use the Desktop shortcut).
2. The browser opens to `http://localhost`.
3. Log in using username `admin` and the password configured in Step 2.
4. Verify the system status:
   - Catalog medicines = 0.
   - Dosage forms, drug families, product categories, and expense categories are available in dropdown menus.
