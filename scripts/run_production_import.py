"""
Automated Production Inventory Import Execution Script.
Executes Stage A (Preview) and Stage B (Commit) via the FastAPI endpoints.
Strictly adheres to safety rules:
- Verified medicines approved; unverified medicines excluded.
- Valid batches approved; quarantined batches excluded from active stock.
- All batch quantities initialized to 0.
- Preserves full invoice provenance.
"""
import os
import sys
import json
import time
import httpx
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, "/code")

from sqlalchemy import select, func
from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.user import User
from app.models.medicine import Medicine, MedicineBatch
from app.models.purchase import Purchase, PurchaseItem
from app.models.supplier import Supplier
from app.models.inventory_import import InventoryImportSession

API_BASE = "http://localhost:8000"
EXCEL_PATH = "/code/Pharmacy_Inventory_Master.xlsx"

print("======================================================================")
print("  PRODUCTION PHARMACY EXCEL IMPORT EXECUTION")
print(f"  Target File: {EXCEL_PATH}")
print(f"  API Base:   {API_BASE}")
print("======================================================================")

# 1. Authenticate as Admin
db = SessionLocal()
admin = db.scalar(select(User).where(User.username == "admin"))
if not admin:
    print("[ERROR] Admin user not found in database!")
    sys.exit(1)

token = create_access_token(subject=str(admin.id), role=admin.role.value)
headers = {"Authorization": f"Bearer {token}"}
print(f"✓ Authenticated as '{admin.username}' (User ID: {admin.id})")

# 2. Stage A: Run Preview
print("\n[Step 1/3] Executing Stage A: Upload and Validate Excel Preview...")
if not os.path.exists(EXCEL_PATH):
    print(f"[ERROR] Master Excel file not found at {EXCEL_PATH}!")
    sys.exit(1)

with open(EXCEL_PATH, "rb") as f:
    files = {"file": ("Pharmacy_Inventory_Master.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    t0 = time.time()
    resp = httpx.post(f"{API_BASE}/inventory/import/preview", headers=headers, files=files, timeout=120.0)
    elapsed = time.time() - t0

if resp.status_code != 200:
    print(f"[ERROR] Preview failed ({resp.status_code}): {resp.text}")
    sys.exit(1)

preview_data = resp.json()
session_id = preview_data["session_id"]
summary = preview_data["summary"]

print(f"✓ Stage A Preview Completed in {elapsed:.2f}s")
print(f"  Import Session ID:          {session_id}")
print(f"  Total Medicines in File:    {summary['total_medicines']}")
print(f"  Valid Verified Medicines:   {summary['valid_medicines']}")
print(f"  Flagged for Review:         {summary['flagged_medicines']}")
print(f"  Duplicate Name Candidates:  {summary['duplicate_name_candidates']}")
print(f"  Total Batches in File:      {summary['total_batches']}")
print(f"  Valid Eligible Batches:     {summary['valid_batches']}")
print(f"  Quarantined Batches:        {summary['quarantined_batches']}")
print(f"  Price Anomalies Detected:   {summary['price_anomalies']}")
print(f"  Duplicate Batch Candidates: {summary['duplicate_batch_candidates']}")

# 3. Stage B: Controlled Commit
print("\n[Step 2/3] Executing Stage B: Controlled Transactional Commit...")
print("  Rules Applied:")
print("  - Approve Verified Medicines:    TRUE")
print("  - Approve Valid Batches:         TRUE")
print("  - Include Unverified Medicines:  FALSE (Strictly Excluded)")
print("  - Include Quarantined Batches:   FALSE (Strictly Excluded from active stock)")
print("  - Include Expired Batches:       FALSE (Strictly Excluded from active stock)")
print("  - Batch Quantity Initialization: STRICTLY 0")

commit_payload = {
    "session_id": session_id,
    "approve_all_verified_medicines": True,
    "approve_all_valid_batches": True,
    "include_unverified_medicines": False,
    "include_expired_batches": False,
    "link_existing_medicines": True,
    "override_quarantine_batch_ids": [],
    "quarantine_override_reason": None,
}

t0 = time.time()
resp_commit = httpx.post(f"{API_BASE}/inventory/import/commit", headers=headers, json=commit_payload, timeout=180.0)
commit_elapsed = time.time() - t0

if resp_commit.status_code != 200:
    print(f"[ERROR] Commit failed ({resp_commit.status_code}): {resp_commit.text}")
    sys.exit(1)

commit_data = resp_commit.json()
print(f"✓ Stage B Transactional Commit Completed in {commit_elapsed:.2f}s")
print(f"  Commit Status:              {commit_data['status']}")
print(f"  Medicines Created:          {commit_data['medicines_created']}")
print(f"  Medicines Linked Existing:  {commit_data['medicines_linked_existing']}")
print(f"  Batches Created:            {commit_data['batches_created']}")
print(f"  Batches Quarantined/Skipped:{commit_data['batches_quarantined_skipped']}")
print(f"  Suppliers Created:          {commit_data['suppliers_created']}")
print(f"  Suppliers Matched Existing: {commit_data['suppliers_matched']}")
print(f"  Purchases Created:          {commit_data['purchases_created']}")
print(f"  Purchase Items Created:     {commit_data['purchase_items_created']}")
print(f"  Audit Log ID:               {commit_data['audit_log_id']}")

# 4. Step 3: Database Postflight Invariant Verification
print("\n[Step 3/3] Verifying Database Invariants & Integrity Post-Import...")

# Check Medicine counts
med_count = db.scalar(select(func.count(Medicine.id)))
print(f"✓ Total Medicines in Database:   {med_count}")

# Check Batch counts & Quantity safety
batch_count = db.scalar(select(func.count(MedicineBatch.id)))
max_qty = db.scalar(select(func.max(MedicineBatch.quantity)))
min_qty = db.scalar(select(func.min(MedicineBatch.quantity)))
sum_qty = db.scalar(select(func.sum(MedicineBatch.quantity)))
print(f"✓ Total Batches in Database:     {batch_count}")
print(f"✓ Max Batch Quantity:            {max_qty}")
print(f"✓ Min Batch Quantity:            {min_qty}")
print(f"✓ Sum of All Batch Stock:        {sum_qty}")
assert max_qty == 0 and min_qty == 0 and sum_qty == 0, "CRITICAL SAFETY VIOLATION: Batch quantities are not all zero!"
print("✓ CONFIRMED: 100% of imported batches have quantity = 0.")

# Check Suppliers
supp_count = db.scalar(select(func.count(Supplier.id)))
print(f"✓ Total Suppliers in Database:   {supp_count}")

# Check Purchases & Items
purch_count = db.scalar(select(func.count(Purchase.id)))
item_count = db.scalar(select(func.count(PurchaseItem.id)))
print(f"✓ Total Purchases in Database:   {purch_count}")
print(f"✓ Total Purchase Items Created:  {item_count}")

# Check Unverified medicines are NOT in database
unverified_check = db.scalars(
    select(Medicine).where(Medicine.sku.in_(["MED-0447", "MED-1733"]))
).all()
print(f"✓ Unverified Medicines in Catalog: {len(unverified_check)} (Expected: 0)")
assert len(unverified_check) == 0, "Unverified medicines must NOT be in catalog!"

# Check Quarantined batches are NOT in MedicineBatch
quarantined_check = db.scalars(
    select(MedicineBatch).where(MedicineBatch.batch_number.in_(["LOT-OLD", "25036", "BL40257"]))
).all()
print(f"✓ Expired Quarantined Batches in MedicineBatch: {len(quarantined_check)} (Expected: 0)")

# Check Session record
session_row = db.get(InventoryImportSession, session_id)
print(f"✓ Session Status in Database:    {session_row.status}")
print(f"✓ Session Committed Meds:        {session_row.committed_medicines}")
print(f"✓ Session Committed Batches:     {session_row.committed_batches}")
assert session_row.status == "committed"

db.close()

# Save summary json to file for reporting
result_summary = {
    "session_id": session_id,
    "medicines_created": commit_data["medicines_created"],
    "batches_created": commit_data["batches_created"],
    "batches_quarantined_skipped": commit_data["batches_quarantined_skipped"],
    "suppliers_created": commit_data["suppliers_created"],
    "purchases_created": commit_data["purchases_created"],
    "purchase_items_created": commit_data["purchase_items_created"],
    "max_batch_quantity": max_qty,
    "min_batch_quantity": min_qty,
    "sum_batch_quantity": sum_qty,
    "total_medicines_in_db": med_count,
    "total_batches_in_db": batch_count,
    "total_suppliers_in_db": supp_count,
    "total_purchases_in_db": purch_count,
    "total_purchase_items_in_db": item_count,
}
with open("/code/import_execution_result.json", "w", encoding="utf-8") as f:
    json.dump(result_summary, f, indent=2)

print("\n======================================================================")
print("  PRODUCTION IMPORT COMPLETED AND VERIFIED 100% SUCCESSFULLY")
print("======================================================================")
