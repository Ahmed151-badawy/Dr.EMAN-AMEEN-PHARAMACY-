# Primary Owner Account Bootstrap & RBAC Protections

The Dr. Eman Ameen Pharmacy Management System features hard architectural safeguards protecting the primary pharmacy owner (`is_primary_admin = true`).

---

## 1. Owner Identity Specification
- **Full Name:** `Dr. Eman Ameen`
- **Username:** `admin`
- **System Role:** `admin`
- **Privilege Flag:** `is_primary_admin = true`
- **Password:** Configured strictly at first launch by the operator. Never hardcoded, guessed, or stored in code repositories.

---

## 2. Hard Architectural Protections in Code
The following invariants are strictly enforced in `app/api/users.py` and `app/api/deps.py`:
1. **Exclusive Staff Account Management:** Only the primary owner can create, update, deactivate, or delete other pharmacy staff accounts (`require_primary_admin`).
2. **Undeletable:** The primary administrator account cannot be deleted by any endpoint (`HTTP 400: Cannot delete primary owner`).
3. **Undeactivatable:** The primary administrator account cannot be deactivated (`HTTP 400: Cannot deactivate primary owner`).
4. **Undemotable:** The primary administrator's role cannot be changed from `admin` to any other role (`HTTP 400: Cannot demote primary owner`).
5. **No Secondary Privilege Escalation:** When creating users via `POST /users`, the backend hardcodes `is_primary_admin = False`. Secondary administrators can never usurp owner authority.

---

## 3. Unattended / Automated Bootstrap (For DevOps & Testing)
For automated setup scripts or isolated testing, the script supports passing a one-time environment variable:
```powershell
$env:OWNER_INITIAL_PASSWORD = "YourSecurePassword123"
.\scripts\windows\setup_owner.ps1
```
The script unsets the environment variable immediately upon completion.
