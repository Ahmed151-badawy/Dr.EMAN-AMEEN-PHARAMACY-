import io
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
import openpyxl

try:
    import pytest
except ImportError:
    class RaisesContext:
        def __init__(self, expected_exc):
            self.expected_exc = expected_exc
            self.value = None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            if exc_type is None:
                raise AssertionError(f"Expected {self.expected_exc.__name__} was not raised")
            if issubclass(exc_type, self.expected_exc):
                self.value = exc_val
                return True
            return False

    class DummyPytest:
        @staticmethod
        def fixture(f):
            return f

        @staticmethod
        def raises(exc):
            return RaisesContext(exc)

        @staticmethod
        def skip(reason):
            print(f"  [SKIPPED] {reason}")

    pytest = DummyPytest()

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.core.database import Base
from app.models.audit_log import AuditLog
from app.models.inventory_import import InventoryImportSession
from app.models.medicine import Medicine, MedicineBatch, MedicinePackageUnit
from app.models.supplier import Supplier
from app.models.user import User, UserRole
from app.schemas.inventory_import import ImportCommitRequest
from app.services import inventory_import as import_service


@pytest.fixture
def test_db():
    """Isolated in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    # Seed an admin user
    admin_user = User(
        id=uuid.uuid4(),
        username="test_admin",
        full_name="Test Administrator",
        password_hash="fakehash",
        role=UserRole.ADMIN,
        is_active=True,
    )
    session.add(admin_user)
    session.commit()

    try:
        yield session, admin_user
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def create_sample_workbook(
    medicines_data=None,
    batches_data=None,
    omit_med_sheet=False,
    omit_batch_sheet=False,
    omit_med_headers=False,
) -> bytes:
    """Helper to generate in-memory Excel files for test cases."""
    wb = openpyxl.Workbook()
    # default active sheet
    ws_default = wb.active

    if not omit_med_sheet:
        ws_med = wb.create_sheet(title="Medicines")
        if not omit_med_headers:
            # Metadata rows
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

    if not omit_batch_sheet:
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


# ===========================================================================
# Unit & Integration Tests for Phase 2 Import Workflow
# ===========================================================================

def test_valid_excel_preview(test_db):
    """Test previewing a standard, valid Excel workbook."""
    db, admin = test_db
    med_rows = [
        ["MED-0001", "بنادول اكسترا", "Panadol Extra", "Paracetamol", "500mg", "Tablet", "Box", None, "Verified", "Note"],
        ["MED-0002", "كومتركس", "Comtrex", "Paracetamol + Pseudoephedrine", "Unspecified", "Tablet", "Box", None, "Verified", "Note"],
    ]
    bat_rows = [
        ["BAT-0001", "MED-0001", "B1001", "2028-12-01", 10, "Pack", 100.0, 30.0, 700.0, "INV-101", "2026-08-01", "مخزن المنزلة", None],
        ["BAT-0002", "MED-0002", "B1002", "2029-06-01", 5, "Pack", 80.0, 25.0, 300.0, "INV-102", "2026-08-02", "مخزن المنزلة", None],
    ]
    excel_bytes = create_sample_workbook(med_rows, bat_rows)

    report = import_service.parse_and_validate_workbook(excel_bytes, "test.xlsx", db, admin)

    assert report.summary.total_medicines == 2
    assert report.summary.valid_medicines == 2
    assert report.summary.total_batches == 2
    assert report.summary.valid_batches == 2
    assert report.summary.quarantined_batches == 0
    assert report.summary.price_anomalies == 0

    # Verify session persisted in DB
    session_row = db.get(InventoryImportSession, report.session_id)
    assert session_row is not None
    assert session_row.status == "previewed"
    assert session_row.total_medicines == 2


def test_missing_required_sheet(test_db):
    """Test that missing required sheet raises 400 Bad Request."""
    db, admin = test_db
    excel_bytes = create_sample_workbook(omit_batch_sheet=True)

    with pytest.raises(HTTPException) as exc_info:
        import_service.parse_and_validate_workbook(excel_bytes, "test.xlsx", db, admin)
    assert exc_info.value.status_code == 400
    assert "Missing required sheets" in str(exc_info.value.detail)


def test_missing_header_row(test_db):
    """Test that missing header row raises 400 Bad Request."""
    db, admin = test_db
    excel_bytes = create_sample_workbook(omit_med_headers=True)

    with pytest.raises(HTTPException) as exc_info:
        import_service.parse_and_validate_workbook(excel_bytes, "test.xlsx", db, admin)
    assert exc_info.value.status_code == 400
    assert "Could not find header row" in str(exc_info.value.detail)


def test_unspecified_expiry_quarantine(test_db):
    """Test that batches with 'Unspecified' expiry are quarantined."""
    db, admin = test_db
    med_rows = [["MED-0001", "دواء", "Medicine A", "Active A", "500mg", "Tablet", "Box", None, "Verified", ""]]
    bat_rows = [
        ["BAT-0001", "MED-0001", "B01", "Unspecified", 5, "Pack", 50.0, 20.0, 200.0, "INV-1", "2026-08-01", "Supplier A", None]
    ]
    excel_bytes = create_sample_workbook(med_rows, bat_rows)

    report = import_service.parse_and_validate_workbook(excel_bytes, "test.xlsx", db, admin)
    assert report.summary.quarantined_batches == 1
    assert len(report.quarantined_batches) == 1
    assert "Expiry date missing/unspecified" in report.quarantined_batches[0].reason
    assert report.batches_preview[0].is_quarantined is True


def test_expired_batches_quarantine(test_db):
    """Test that past expiry dates are detected and quarantined."""
    db, admin = test_db
    past_date = (date.today() - timedelta(days=100)).isoformat()
    med_rows = [["MED-0001", "دواء", "Medicine Expired", "Active", "10mg", "Tablet", "Box", None, "Verified", ""]]
    bat_rows = [
        ["BAT-0001", "MED-0001", "B_OLD", past_date, 2, "Pack", 40.0, 10.0, 72.0, "INV-1", "2026-01-01", "Supplier A", None]
    ]
    excel_bytes = create_sample_workbook(med_rows, bat_rows)

    report = import_service.parse_and_validate_workbook(excel_bytes, "test.xlsx", db, admin)
    assert report.batches_preview[0].is_expired is True
    assert len(report.quarantined_batches) == 1
    assert "Already expired" in report.quarantined_batches[0].reason


def test_price_anomaly_detection(test_db):
    """Test detecting price discrepancy between recorded net total and formula."""
    db, admin = test_db
    med_rows = [["MED-0001", "دواء", "Medicine P", "Active", "10mg", "Tablet", "Box", None, "Verified", ""]]
    # Qty=5, Gross=100, Disc=30% -> Net unit cost = 70.00 -> Expected net = 350.00.
    # Recorded net is 150.00 (mismatch!)
    bat_rows = [
        ["BAT-0001", "MED-0001", "B01", "2028-01-01", 5, "Pack", 100.0, 30.0, 150.0, "INV-1", "2026-08-01", "Supplier A", None]
    ]
    excel_bytes = create_sample_workbook(med_rows, bat_rows)

    report = import_service.parse_and_validate_workbook(excel_bytes, "test.xlsx", db, admin)
    assert report.summary.price_anomalies == 1
    assert len(report.price_anomalies) == 1
    anomaly = report.price_anomalies[0]
    assert anomaly.recorded_net_price == 150.0
    assert anomaly.expected_net_price == 350.0
    assert anomaly.discrepancy_amount == -200.0
    assert report.batches_preview[0].is_quarantined is True
    assert report.summary.quarantined_batches == 1


def test_orphaned_batch_detection(test_db):
    """Test that a batch referencing a non-existent medicine is quarantined."""
    db, admin = test_db
    med_rows = [["MED-0001", "دواء", "Medicine A", "Active", "10mg", "Tablet", "Box", None, "Verified", ""]]
    bat_rows = [
        ["BAT-0001", "MED-9999", "B01", "2028-01-01", 5, "Pack", 100.0, 30.0, 350.0, "INV-1", "2026-08-01", "Supplier A", None]
    ]
    excel_bytes = create_sample_workbook(med_rows, bat_rows)

    report = import_service.parse_and_validate_workbook(excel_bytes, "test.xlsx", db, admin)
    assert report.summary.quarantined_batches == 1
    assert "Orphaned" in report.quarantined_batches[0].reason
    assert report.batches_preview[0].is_valid is False


def test_duplicate_candidates_detection(test_db):
    """Test grouping of duplicate Arabic names and duplicate batch lines."""
    db, admin = test_db
    med_rows = [
        ["MED-0001", "اسبوسيد ٧٥", "Aspocid 75 Tablets", "Aspirin", "75mg", "Tablet", "Box", None, "Verified", ""],
        ["MED-0002", "اسبوسيد ٧٥", "Aspocid 75 Chewable", "Aspirin", "75mg", "Chewable Tablet", "Box", None, "Verified", ""],
    ]
    bat_rows = [
        ["BAT-0001", "MED-0001", "LOT_X", "2028-05-01", 2, "Pack", 30.0, 20.0, 48.0, "INV-1", "2026-08-01", "Supp", None],
        ["BAT-0002", "MED-0001", "LOT_X", "2028-05-01", 3, "Pack", 30.0, 20.0, 72.0, "INV-2", "2026-08-05", "Supp", None],
    ]
    excel_bytes = create_sample_workbook(med_rows, bat_rows)

    report = import_service.parse_and_validate_workbook(excel_bytes, "test.xlsx", db, admin)
    assert report.summary.duplicate_name_candidates == 1
    assert report.duplicate_names[0].matched_name == "اسبوسيد ٧٥"
    assert report.summary.duplicate_batch_candidates == 1
    assert report.duplicate_batches[0].batch_number == "LOT_X"
    assert report.duplicate_batches[0].total_quantity == 5


def test_controlled_commit_and_zero_stock_safety(test_db):
    """
    CRITICAL SAFETY TEST:
    Verifies that controlled commit:
      1. Creates Medicine records with non-null prices.
      2. Creates default MedicinePackageUnit.
      3. Creates Suppliers.
      4. Initializes ALL MedicineBatch records with quantity = 0.
      5. Creates AuditLog entry.
    """
    db, admin = test_db
    med_rows = [
        ["MED-0001", "زنكوديرم", "Zincoderm Cream", "Zinc Oxide", "Unspecified", "Cream", "Tube", None, "Verified", ""]
    ]
    # Invoice quantity = 15. Gross price = 70. Discount = 30%. Unit cost = 49.00
    bat_rows = [
        ["BAT-0001", "MED-0001", "AB1026", "2029-07-01", 15, "Pack", 70.0, 30.0, 735.0, "INV-18692", "2026-08-26", "مخزن المنزلة للأدوية والمستلزمات الطبية", None]
    ]
    excel_bytes = create_sample_workbook(med_rows, bat_rows)

    preview = import_service.parse_and_validate_workbook(excel_bytes, "zincoderm.xlsx", db, admin)

    commit_req = ImportCommitRequest(
        session_id=preview.session_id,
        approved_medicine_ids=["MED-0001"],
        approved_batch_ids=["BAT-0001"],
    )

    commit_res = import_service.commit_approved_import(db, commit_req, admin)

    assert commit_res.status == "committed"
    assert commit_res.medicines_created == 1
    assert commit_res.batches_created == 1
    assert commit_res.suppliers_created == 1
    assert commit_res.purchases_created == 1
    assert commit_res.purchase_items_created == 1
    assert commit_res.audit_log_id is not None

    # Check Medicine in Database
    med = db.scalar(select(Medicine).where(Medicine.sku == "MED-0001"))
    assert med is not None
    assert med.name == "Zincoderm Cream"
    assert med.selling_price == Decimal("70.00")  # Gross price assigned to selling price
    assert med.purchase_price == Decimal("49.00") # Calculated unit net cost assigned to purchase price

    # Check Packaging Unit in Database
    pkg = db.scalar(select(MedicinePackageUnit).where(MedicinePackageUnit.medicine_id == med.id))
    assert pkg is not None
    assert pkg.is_base_unit is True
    assert pkg.selling_price == Decimal("70.00")

    # Check Batch in Database - QUANTITY MUST BE 0!
    batch = db.scalar(select(MedicineBatch).where(MedicineBatch.medicine_id == med.id))
    assert batch is not None
    assert batch.batch_number == "AB1026"
    assert batch.expiry_date == date(2029, 7, 1)
    assert batch.purchase_price == Decimal("49.00")
    # STRICT SAFETY CHECK:
    assert batch.quantity == 0, "Batch quantity must strictly be 0 on import; opening stock handled in Phase 3!"

    # Check Supplier created
    supp = db.get(Supplier, batch.supplier_id)
    assert supp is not None
    assert supp.name == "مخزن المنزلة للأدوية والمستلزمات الطبية"

    # Check Historical Purchase and PurchaseItem preserved!
    from app.models.purchase import Purchase, PurchaseItem
    purchase = db.scalar(select(Purchase).where(Purchase.supplier_id == supp.id))
    assert purchase is not None
    assert "INV-18692" in purchase.notes
    assert purchase.total_amount == Decimal("735.00")

    p_item = db.scalar(select(PurchaseItem).where(PurchaseItem.purchase_id == purchase.id))
    assert p_item is not None
    assert p_item.quantity == 15  # Historical invoice quantity preserved!
    assert p_item.unit_price == Decimal("49.00")
    assert p_item.total_price == Decimal("735.00")

    # Check Audit Log created
    audit = db.get(AuditLog, commit_res.audit_log_id)
    assert audit is not None
    assert audit.action == "INVENTORY_IMPORT_COMMIT"
    assert audit.user_id == admin.id


def test_idempotency_prevents_duplicate_commit(test_db):
    """Test that a committed session cannot be recommitted."""
    db, admin = test_db
    med_rows = [["MED-0001", "دواء", "Medicine Single", "Active", "10mg", "Tablet", "Box", None, "Verified", ""]]
    bat_rows = [["BAT-0001", "MED-0001", "B01", "2028-01-01", 5, "Pack", 100.0, 30.0, 350.0, "INV-1", "2026-08-01", "Supp", None]]
    excel_bytes = create_sample_workbook(med_rows, bat_rows)

    preview = import_service.parse_and_validate_workbook(excel_bytes, "single.xlsx", db, admin)
    req = ImportCommitRequest(
        session_id=preview.session_id,
        approve_all_verified_medicines=True,
        approve_all_valid_batches=True,
    )
    res = import_service.commit_approved_import(db, req, admin)
    assert res.status == "committed"

    # Second commit attempt MUST fail with 409 Conflict
    with pytest.raises(HTTPException) as exc_info:
        import_service.commit_approved_import(db, req, admin)
    assert exc_info.value.status_code == 409
    assert "already been fully committed" in str(exc_info.value.detail)


def test_real_workbook_preview_accuracy(test_db):
    """
    Integration test against actual Pharmacy_Inventory_Master.xlsx.
    Verifies that all 2,109 medicines and 2,219 batches parse accurately,
    and expected anomaly counts match the workbook pre-audit.
    """
    db, admin = test_db
    real_file_path = "F:/Pharmacy-Deployment/Pharmacy_Inventory_Master.xlsx"
    if not os.path.exists(real_file_path):
        pytest.skip("Pharmacy_Inventory_Master.xlsx not present on disk")

    with open(real_file_path, "rb") as fp:
        real_bytes = fp.read()

    report = import_service.parse_and_validate_workbook(real_bytes, "Pharmacy_Inventory_Master.xlsx", db, admin)

    assert report.summary.total_medicines == 2109
    assert report.summary.total_batches == 2219
    # Verify pre-audited findings:
    # 6 price anomalies
    assert report.summary.price_anomalies == 6
    # 37 unspecified expiry dates + 4 expired dates = 41 quarantined
    assert report.summary.quarantined_batches >= 41
    # 100% of medicines have names
    assert report.summary.valid_medicines == 2109


if __name__ == "__main__":
    print("=== Running Inventory Import Test Suite (Isolated SQLite DB) ===")
    import sys
    test_funcs = [
        test_valid_excel_preview,
        test_missing_required_sheet,
        test_missing_header_row,
        test_unspecified_expiry_quarantine,
        test_expired_batches_quarantine,
        test_price_anomaly_detection,
        test_orphaned_batch_detection,
        test_duplicate_candidates_detection,
        test_controlled_commit_and_zero_stock_safety,
        test_idempotency_prevents_duplicate_commit,
        test_real_workbook_preview_accuracy,
    ]

    passed = 0
    failed = 0
    for fn in test_funcs:
        # Create fresh isolated database fixture for each test
        engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(bind=engine)
        TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        session = TestingSessionLocal()
        admin_user = User(
            id=uuid.uuid4(),
            username="test_admin",
            full_name="Test Administrator",
            password_hash="fakehash",
            role=UserRole.ADMIN,
            is_active=True,
        )
        session.add(admin_user)
        session.commit()

        try:
            fn((session, admin_user))
            print(f"  [PASS] {fn.__name__}")
            passed += 1
        except Exception as exc:
            print(f"  [FAIL] {fn.__name__}: {exc}")
            import traceback
            traceback.print_exc()
            failed += 1
        finally:
            session.close()
            Base.metadata.drop_all(bind=engine)

    print(f"\nTest Results: {passed} passed, {failed} failed.")
    if failed > 0:
        sys.exit(1)
    else:
        print("ALL TESTS PASSED SUCCESSFULLY!")

