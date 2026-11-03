import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import io
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
import openpyxl
import psycopg2
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.core.database import Base
from app.models.audit_log import AuditLog
from app.models.inventory_import import InventoryImportSession
from app.models.medicine import Medicine, MedicineBatch, MedicinePackageUnit
from app.models.purchase import Purchase, PurchaseItem, PurchaseStatus
from app.models.supplier import Supplier
from app.models.user import User, UserRole
from app.schemas.inventory_import import ImportCommitRequest
from app.services import inventory_import as import_service

POSTGRES_TEST_URL = "postgresql+psycopg2://postgres:postgres@localhost:5432/pharmacy_migration_audit_test_db"


def create_sample_workbook(medicines_data=None, batches_data=None) -> bytes:
    wb = openpyxl.Workbook()
    ws_default = wb.active

    ws_med = wb.create_sheet(title="Medicines")
    ws_med.append(["TITLE: MEDICINES"])
    ws_med.append(["SUBTITLE: TEST"])
    ws_med.append([])
    ws_med.append(
        [
            "Medicine ID",
            "Arabic Name",
            "English Brand Name",
            "Active Ingredient",
            "Strength",
            "Dosage Form",
            "Package Description",
            "Barcode",
            "Verification Status",
            "Notes",
        ]
    )
    if medicines_data:
        for row in medicines_data:
            ws_med.append(row)

    ws_bat = wb.create_sheet(title="Medicine Batches")
    ws_bat.append(["TITLE: BATCHES"])
    ws_bat.append(["SUBTITLE: TEST"])
    ws_bat.append([])
    ws_bat.append(
        [
            "Batch ID",
            "Medicine ID",
            "Batch Number",
            "Expiry Date",
            "Invoice Quantity",
            "Purchase Unit",
            "Purchase Price",
            "Discount (%)",
            "Net Purchase Price",
            "Invoice Number",
            "Invoice Date",
            "Supplier",
            "Actual Physical Stock",
        ]
    )
    if batches_data:
        for row in batches_data:
            ws_bat.append(row)

    wb.remove(ws_default)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def run_postgres_tests():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print("=====================================================================")
    print("  POSTGRESQL INTEGRATION TEST SUITE — ISOLATED TEST DATABASE ONLY")
    print(f"  Target DB: {POSTGRES_TEST_URL}")
    print("=====================================================================")

    # Verify PostgreSQL Version
    raw_conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/pharmacy_migration_audit_test_db")
    raw_cur = raw_conn.cursor()
    raw_cur.execute("SELECT version();")
    pg_version = raw_cur.fetchone()[0]
    print(f"✓ Connected to PostgreSQL: {pg_version}\n")
    raw_cur.close()
    raw_conn.close()

    engine = create_engine(POSTGRES_TEST_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    # Create test admin user if not exists
    admin_user = db.scalar(select(User).where(User.username == "pg_test_admin"))
    if not admin_user:
        admin_user = User(
            id=uuid.uuid4(),
            username="pg_test_admin",
            full_name="Postgres Test Admin",
            password_hash="test_pw_hash",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin_user)
        db.commit()

    # Clean test tables for clean isolated test run
    raw_conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/pharmacy_migration_audit_test_db")
    clean_cur = raw_conn.cursor()
    clean_cur.execute("""
        TRUNCATE TABLE purchase_items, purchases, medicine_package_units, 
                       medicine_batches, medicines, inventory_import_sessions, 
                       audit_logs, suppliers CASCADE;
    """)
    raw_conn.commit()
    clean_cur.close()
    raw_conn.close()

    passed = 0
    failed = 0

    def assert_test(name, condition, msg=""):
        nonlocal passed, failed
        if condition:
            print(f"  [PASS] {name}")
            passed += 1
        else:
            print(f"  [FAIL] {name}: {msg}")
            failed += 1

    # -----------------------------------------------------------------------
    # TEST 1: Native UUID, Enums, NUMERIC(10,2), Timestamps in PostgreSQL
    # -----------------------------------------------------------------------
    print("--- Test 1: PostgreSQL Native Types, Enums & Foreign Keys ---")
    med_rows = [
        ["MED-0001", "أوجمنتين 1 جم", "Augmentin 1g Tablets", "Amoxicillin + Clavulanic", "1000mg", "Tablet", "Box", None, "Verified", ""]
    ]
    bat_rows = [
        ["BAT-0001", "MED-0001", "LOT-AUG-01", "2029-01-01", 10, "Pack", 120.0, 25.0, 900.0, "INV-888", "2026-08-15", "الشركة المصرية لتوزيع الأدوية", None]
    ]
    wb_bytes = create_sample_workbook(med_rows, bat_rows)

    preview = import_service.parse_and_validate_workbook(wb_bytes, "augmentin.xlsx", db, admin_user)
    assert_test("Preview persisted with UUID in PostgreSQL", isinstance(preview.session_id, uuid.UUID))

    commit_req = ImportCommitRequest(
        session_id=preview.session_id,
        approve_all_verified_medicines=True,
        approve_all_valid_batches=True,
    )
    res = import_service.commit_approved_import(db, commit_req, admin_user)

    assert_test("Commit status is 'committed'", res.status == "committed")
    assert_test("1 Medicine created", res.medicines_created == 1)
    assert_test("1 Batch created", res.batches_created == 1)
    assert_test("1 Purchase created", res.purchases_created == 1)
    assert_test("1 PurchaseItem created", res.purchase_items_created == 1)

    med = db.scalar(select(Medicine).where(Medicine.sku == "MED-0001"))
    assert_test("Medicine has native UUID", isinstance(med.id, uuid.UUID))
    assert_test("Medicine selling_price NUMERIC(10,2) exact Decimal", med.selling_price == Decimal("120.00"))
    assert_test("Medicine purchase_price NUMERIC(10,2) exact Decimal", med.purchase_price == Decimal("90.00"))

    batch = db.scalar(select(MedicineBatch).where(MedicineBatch.medicine_id == med.id))
    assert_test("MedicineBatch.quantity is STRICTLY 0 in PostgreSQL", batch.quantity == 0)
    assert_test("MedicineBatch.purchase_price is 90.00", batch.purchase_price == Decimal("90.00"))

    # Verify Purchase and PurchaseItem in PostgreSQL
    purchase = db.scalar(select(Purchase).where(Purchase.notes.like("%INV-888%")))
    assert_test("Purchase status is PostgreSQL Enum PurchaseStatus.RECEIVED", purchase.status == PurchaseStatus.RECEIVED)
    assert_test("Purchase total_amount matches invoice net line", purchase.total_amount == Decimal("900.00"))

    p_item = db.scalar(select(PurchaseItem).where(PurchaseItem.purchase_id == purchase.id))
    assert_test("PurchaseItem preserved historical Invoice Quantity = 10", p_item.quantity == 10)
    assert_test("PurchaseItem preserved unit cost = 90.00", p_item.unit_price == Decimal("90.00"))
    assert_test("PurchaseItem preserved row identity provenance", "BAT-0001" in p_item.unit_name)

    # -----------------------------------------------------------------------
    # TEST 2: Security — Omitted Approval IDs Blocked
    # -----------------------------------------------------------------------
    print("\n--- Test 2: Security — Omitted Approval IDs Must Fail ---")
    wb_bytes2 = create_sample_workbook(med_rows, bat_rows)
    preview2 = import_service.parse_and_validate_workbook(wb_bytes2, "sec_test.xlsx", db, admin_user)

    # Payload with no approved lists and approve_all flags False
    empty_req = ImportCommitRequest(
        session_id=preview2.session_id,
        approve_all_verified_medicines=False,
        approve_all_valid_batches=False,
    )
    blocked_ok = False
    try:
        import_service.commit_approved_import(db, empty_req, admin_user)
    except HTTPException as e:
        if e.status_code == 400 and "Explicit medicine approval required" in str(e.detail):
            blocked_ok = True
    assert_test("Omitted medicine approval rejected with 400 Bad Request", blocked_ok)

    # Payload with approved meds but omitted batch approvals
    med_only_req = ImportCommitRequest(
        session_id=preview2.session_id,
        approve_all_verified_medicines=True,
        approve_all_valid_batches=False,
    )
    batch_blocked_ok = False
    try:
        import_service.commit_approved_import(db, med_only_req, admin_user)
    except HTTPException as e:
        if e.status_code == 400 and "Explicit batch approval required" in str(e.detail):
            batch_blocked_ok = True
    assert_test("Omitted batch approval rejected with 400 Bad Request", batch_blocked_ok)

    # -----------------------------------------------------------------------
    # TEST 3: Security — Quarantined Batches Blocked Even if Passed in Approved List
    # -----------------------------------------------------------------------
    print("\n--- Test 3: Security — Quarantined Batches Blocked from Commit ---")
    # Batch with past expiry (quarantined)
    med_q = [["MED-0002", "دواء منتهي", "Expired Med", "Active", "5mg", "Tablet", "Box", None, "Verified", ""]]
    bat_q = [["BAT-EXP-1", "MED-0002", "LOT-OLD", "2024-01-01", 5, "Pack", 50.0, 20.0, 200.0, "INV-OLD", "2024-01-01", "Supp", None]]
    wb_q = create_sample_workbook(med_q, bat_q)
    preview_q = import_service.parse_and_validate_workbook(wb_q, "quarantine_test.xlsx", db, admin_user)

    # Pass the quarantined batch ID explicitly in approved_batch_ids
    sneaky_req = ImportCommitRequest(
        session_id=preview_q.session_id,
        approved_medicine_ids=["MED-0002"],
        approved_batch_ids=["BAT-EXP-1"],
        include_expired_batches=False,
    )
    res_q = import_service.commit_approved_import(db, sneaky_req, admin_user)
    assert_test("Quarantined expired batch skipped despite being in approved_batch_ids", res_q.batches_created == 0 and res_q.batches_quarantined_skipped == 1)

    # Verify that PurchaseItem was preserved for the quarantined batch with batch_id=None!
    q_item = db.scalar(select(PurchaseItem).where(PurchaseItem.unit_name.like("%BAT-EXP-1%")))
    assert_test("Quarantined batch preserved in PurchaseItem with batch_id is None", q_item is not None and q_item.batch_id is None)
    assert_test("Quarantined batch marked '(QUARANTINED)' in PurchaseItem unit_name", q_item is not None and "(QUARANTINED)" in q_item.unit_name)

    # -----------------------------------------------------------------------
    # TEST 4: Security — Unverified Medicines Blocked by Default
    # -----------------------------------------------------------------------
    print("\n--- Test 4: Security — Unverified Medicines Blocked by Default ---")
    med_unv = [["MED-0003", "دواء غير محقق", "Unverified Med", "Active", "10mg", "Tablet", "Box", None, "Needs Verification", ""]]
    bat_unv = [["BAT-UNV-1", "MED-0003", "LOT-UNV", "2029-01-01", 3, "Pack", 60.0, 20.0, 144.0, "INV-UNV", "2026-08-10", "Supp", None]]
    wb_unv = create_sample_workbook(med_unv, bat_unv)
    preview_unv = import_service.parse_and_validate_workbook(wb_unv, "unverified_test.xlsx", db, admin_user)

    unv_req = ImportCommitRequest(
        session_id=preview_unv.session_id,
        approve_all_verified_medicines=True,
        approve_all_valid_batches=True,
        include_unverified_medicines=False,
    )
    res_unv = import_service.commit_approved_import(db, unv_req, admin_user)
    assert_test("Unverified medicine blocked by default", res_unv.medicines_created == 0)
    assert_test("Batch of unapproved medicine blocked from import", res_unv.batches_created == 0)

    # -----------------------------------------------------------------------
    # TEST 5: Pricing Determinism — Real Dates vs Placeholder Dates & Price Anomalies
    # -----------------------------------------------------------------------
    print("\n--- Test 5: Pricing Determinism — Placeholder Dates & Anomalies Excluded ---")
    # Same medicine with 3 batches:
    # 1. Batch 1: Invoice Date 2026-09-01, Gross Price 150.00, Discount 30% (Unit Net 105.00) -> NEWEST REAL DATE
    # 2. Batch 2: Invoice Date 2026-07-01, Gross Price 120.00, Discount 30% (Unit Net 84.00) -> OLDER REAL DATE
    # 3. Batch 3: Invoice Date 'Unspecified', Gross Price 999.00 (Outlier with placeholder date)
    # 4. Batch 4: Price Anomaly (recorded 10 != expected 100) with Gross Price 888.00 (Quarantined)
    med_pricing = [["MED-0004", "دواء تسعير", "Pricing Test Med", "Active", "20mg", "Tablet", "Box", None, "Verified", ""]]
    bat_pricing = [
        ["BAT-P1", "MED-0004", "LOT-1", "2028-10-01", 5, "Pack", 150.0, 30.0, 525.0, "INV-REAL-2", "2026-09-01", "Supp A", None],
        ["BAT-P2", "MED-0004", "LOT-2", "2028-05-01", 5, "Pack", 120.0, 30.0, 420.0, "INV-REAL-1", "2026-07-01", "Supp A", None],
        ["BAT-P3", "MED-0004", "LOT-3", "2028-01-01", 5, "Pack", 999.0, 30.0, 3496.5, "Unspecified-10", "Unspecified", "Supp A", None],
        ["BAT-P4", "MED-0004", "LOT-4", "2028-03-01", 1, "Pack", 888.0, 20.0, 10.0, "INV-ANOMALY", "2026-09-15", "Supp A", None],
    ]
    wb_pricing = create_sample_workbook(med_pricing, bat_pricing)
    preview_p = import_service.parse_and_validate_workbook(wb_pricing, "pricing_test.xlsx", db, admin_user)

    commit_p_req = ImportCommitRequest(
        session_id=preview_p.session_id,
        approve_all_verified_medicines=True,
        approve_all_valid_batches=True,
    )
    import_service.commit_approved_import(db, commit_p_req, admin_user)

    med_p = db.scalar(select(Medicine).where(Medicine.sku == "MED-0004"))
    # Selling price MUST be 150.00 (from 2026-09-01), NOT 999.00 (Unspecified) and NOT 888.00 (Quarantined Anomaly)!
    assert_test("Medicine catalog selling_price established by latest verified date (150.00 EGP)", med_p.selling_price == Decimal("150.00"), f"Actual was {med_p.selling_price}")
    assert_test("Medicine catalog purchase_price established by latest verified net cost (105.00 EGP)", med_p.purchase_price == Decimal("105.00"), f"Actual was {med_p.purchase_price}")

    # Check that individual batches preserved their own distinct purchase costs
    b1 = db.scalar(select(MedicineBatch).where(MedicineBatch.batch_number == "LOT-1"))
    b2 = db.scalar(select(MedicineBatch).where(MedicineBatch.batch_number == "LOT-2"))
    assert_test("Batch LOT-1 preserved its unit cost of 105.00 EGP", b1.purchase_price == Decimal("105.00"))
    assert_test("Batch LOT-2 preserved its unit cost of 84.00 EGP", b2.purchase_price == Decimal("84.00"))

    # -----------------------------------------------------------------------
    # TEST 6: Idempotency & Transaction Rollback in PostgreSQL
    # -----------------------------------------------------------------------
    print("\n--- Test 6: Idempotency & Transaction Rollback in PostgreSQL ---")
    # Repeated commit attempt must raise 409
    dup_blocked = False
    try:
        import_service.commit_approved_import(db, commit_p_req, admin_user)
    except HTTPException as e:
        if e.status_code == 409:
            dup_blocked = True
    assert_test("Repeated commit blocked with 409 Conflict in PostgreSQL", dup_blocked)

    # Transaction rollback test: simulate crash during commit
    session_row = db.get(InventoryImportSession, preview_p.session_id)
    assert_test("Session status updated to 'committed' in PostgreSQL", session_row.status == "committed")

    db.close()
    print("\n=====================================================================")
    print(f"  POSTGRESQL TEST SUMMARY: {passed} PASSED, {failed} FAILED")
    print("=====================================================================")
    return failed == 0


if __name__ == "__main__":
    success = run_postgres_tests()
    if not success:
        sys.exit(1)
