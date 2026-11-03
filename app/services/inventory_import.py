import hashlib
import io
import json
import logging
import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

import openpyxl
from fastapi import HTTPException, status
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.inventory_import import InventoryImportSession
from app.models.medicine import Medicine, MedicineBatch, MedicinePackageUnit
from app.models.purchase import Purchase, PurchaseItem, PurchaseStatus
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.inventory_import import (
    BatchPreviewItem,
    DuplicateBatchItem,
    DuplicateNameItem,
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewReport,
    ImportSummary,
    MedicinePreviewItem,
    PriceAnomalyItem,
    QuarantineBatchItem,
)

logger = logging.getLogger("pharmacy.inventory_import")

# Supplier name normalization dictionary (e.g. OCR typos in Arabic)
SUPPLIER_NORMALIZATIONS = {
    "مخزن المنzلة للأدوية والمستلزمات الطبية": "مخزن المنزلة للأدوية والمستلزمات الطبية",
    "دكتورة ايمان اسكندرية/الجديدة": "دكتورة ايمان اسكندرية / الجديدة",
    "دكتورة ايمان احمد امين - الميزانية": "دكتورة ايمان احمد امين - الميزانية",
}


def normalize_supplier_name(name: str) -> str:
    cleaned = (name or "").strip()
    return SUPPLIER_NORMALIZATIONS.get(cleaned, cleaned)


def parse_expiry_date(val: Any) -> tuple[Optional[date], bool, bool]:
    """
    Returns: (parsed_date, is_expired, is_unspecified)
    Cutoff review date: today
    """
    if val is None:
        return None, False, True

    s = str(val).strip()
    if not s or s.lower() in ("unspecified", "none", "null", "nan"):
        return None, False, True

    parsed: Optional[date] = None
    if isinstance(val, (datetime, date)):
        parsed = val.date() if isinstance(val, datetime) else val
    elif isinstance(val, str):
        # Match YYYY-MM-DD or YYYY-MM
        match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s)
        if match:
            y, m, d = int(match.group(1)), int(match.group(2)), int(match.group(3))
            try:
                parsed = date(y, m, d)
            except ValueError:
                parsed = None
        else:
            match_ym = re.match(r"^(\d{4})-(\d{1,2})$", s)
            if match_ym:
                y, m = int(match_ym.group(1)), int(match_ym.group(2))
                try:
                    parsed = date(y, m, 1)
                except ValueError:
                    parsed = None

    if parsed is None:
        return None, False, True

    today = date.today()
    is_expired = parsed < today
    return parsed, is_expired, False


def calculate_pricing(
    gross_price_raw: Any,
    discount_raw: Any,
    qty_raw: Any,
    recorded_net_raw: Any,
) -> tuple[float, float, float, float, float, bool]:
    """
    Calculates: (gross_price, discount, unit_cost, expected_net, recorded_net, price_discrepancy)
    In Egyptian pharma wholesale:
      Gross Price = Official Public Retail Price
      Discount = Pharmacy wholesale discount percentage (e.g. 30%)
      Unit Cost = Gross Price * (1 - Discount / 100)
      Expected Net Total = Unit Cost * Qty
    """
    try:
        gross = float(gross_price_raw or 0.0)
    except (ValueError, TypeError):
        gross = 0.0

    try:
        disc = float(discount_raw or 0.0)
    except (ValueError, TypeError):
        disc = 0.0

    try:
        qty = int(qty_raw or 0)
    except (ValueError, TypeError):
        qty = 0

    try:
        rec_net = float(recorded_net_raw or 0.0)
    except (ValueError, TypeError):
        rec_net = 0.0

    unit_cost = round(gross * (1.0 - (disc / 100.0)), 2)
    expected_net = round(unit_cost * qty, 2)
    # Price discrepancy threshold: 0.15 EGP
    price_discrepancy = abs(rec_net - expected_net) > 0.15

    return gross, disc, unit_cost, expected_net, rec_net, price_discrepancy


def parse_and_validate_workbook(
    file_bytes: bytes,
    filename: str,
    db: Session,
    current_user: User,
) -> ImportPreviewReport:
    """
    Stage A: Preview and validation.
    Reads Medicines and Medicine Batches sheets, validates columns, data types,
    detects anomalies, duplicate candidates, and quarantine conditions.
    Does NOT modify medicines, batches, or inventory stock.
    """
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read Excel workbook: {str(exc)}",
        )

    # 1. Validate Sheet presence
    required_sheets = ["Medicines", "Medicine Batches"]
    missing_sheets = [s for s in required_sheets if s not in wb.sheetnames]
    if missing_sheets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required sheets in workbook: {missing_sheets}",
        )

    ws_med = wb["Medicines"]
    ws_bat = wb["Medicine Batches"]

    # 2. Locate header row in Medicines sheet
    med_header_idx = None
    med_headers: list[str] = []
    for r_idx, row in enumerate(ws_med.iter_rows(min_row=1, max_row=10, values_only=True), 1):
        row_strs = [str(c).strip() if c is not None else "" for c in row]
        if "Medicine ID" in row_strs:
            med_header_idx = r_idx
            med_headers = row_strs
            break

    if med_header_idx is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not find header row containing 'Medicine ID' in 'Medicines' sheet.",
        )

    med_col_map = {h: i for i, h in enumerate(med_headers) if h}

    # 3. Locate header row in Medicine Batches sheet
    bat_header_idx = None
    bat_headers: list[str] = []
    for r_idx, row in enumerate(ws_bat.iter_rows(min_row=1, max_row=10, values_only=True), 1):
        row_strs = [str(c).strip() if c is not None else "" for c in row]
        if "Batch ID" in row_strs:
            bat_header_idx = r_idx
            bat_headers = row_strs
            break

    if bat_header_idx is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not find header row containing 'Batch ID' in 'Medicine Batches' sheet.",
        )

    bat_col_map = {h: i for i, h in enumerate(bat_headers) if h}

    # 4. Fetch existing medicines from database for duplicate/linkage detection
    existing_meds = db.scalars(select(Medicine)).all()
    existing_by_sku = {m.sku: m for m in existing_meds if m.sku}
    existing_by_name = {m.name.strip().lower(): m for m in existing_meds if m.name}
    existing_by_barcode = {m.barcode.strip(): m for m in existing_meds if m.barcode}

    # 5. Parse Medicines sheet
    medicines_preview: list[MedicinePreviewItem] = []
    med_id_to_name: dict[str, str] = {}
    med_id_set = set()
    name_ar_counts: dict[str, list[str]] = {}
    name_en_counts: dict[str, list[str]] = {}
    raw_medicines_data = []

    for row in ws_med.iter_rows(min_row=med_header_idx + 1, values_only=True):
        if not any(c is not None for c in row):
            continue

        med_id = str(row[med_col_map.get("Medicine ID", 0)] or "").strip()
        if not med_id:
            continue

        med_id_set.add(med_id)
        name_ar = str(row[med_col_map.get("Arabic Name", 1)] or "").strip() or None
        name_en = str(row[med_col_map.get("English Brand Name", 2)] or "").strip()
        ingredient = str(row[med_col_map.get("Active Ingredient", 3)] or "").strip() or None
        strength = str(row[med_col_map.get("Strength", 4)] or "").strip() or None
        form = str(row[med_col_map.get("Dosage Form", 5)] or "").strip() or None
        pkg = str(row[med_col_map.get("Package Description", 6)] or "").strip() or None
        barcode = str(row[med_col_map.get("Barcode", 7)] or "").strip() or None
        status_val = str(row[med_col_map.get("Verification Status", 8)] or "Verified").strip()
        notes = str(row[med_col_map.get("Notes", 9)] or "").strip() or None

        med_id_to_name[med_id] = name_en or (name_ar or med_id)

        warnings: list[str] = []
        is_valid = True

        if not name_en:
            is_valid = False
            warnings.append("Missing English Brand Name (required for database catalog)")

        if status_val.lower() == "needs verification":
            warnings.append("Marked 'Needs Verification' in master catalog")

        if strength and strength.lower() == "unspecified":
            warnings.append("Strength is unspecified")

        if ingredient and ingredient.lower() == "unspecified":
            warnings.append("Active ingredient is unspecified")

        # Existing DB match detection
        existing_match_id = None
        existing_match_type = None

        if med_id in existing_by_sku:
            existing_match_id = existing_by_sku[med_id].id
            existing_match_type = "sku"
        elif barcode and barcode in existing_by_barcode:
            existing_match_id = existing_by_barcode[barcode].id
            existing_match_type = "barcode"
        elif name_en and name_en.lower() in existing_by_name:
            existing_match_id = existing_by_name[name_en.lower()].id
            existing_match_type = "name"

        if existing_match_id:
            warnings.append(f"Matches existing medicine in database by {existing_match_type}")

        # Duplicate tracking within file
        if name_ar:
            name_ar_counts.setdefault(name_ar, []).append(med_id)
        if name_en:
            name_en_counts.setdefault(name_en.lower(), []).append(med_id)

        item = MedicinePreviewItem(
            medicine_id=med_id,
            name=name_en,
            name_ar=name_ar,
            generic_name=ingredient if ingredient and ingredient.lower() != "unspecified" else None,
            strength=strength if strength and strength.lower() != "unspecified" else None,
            dosage_form=form,
            package_description=pkg,
            barcode=barcode,
            verification_status=status_val,
            notes=notes,
            is_valid=is_valid,
            validation_warnings=warnings,
            existing_match_id=existing_match_id,
            existing_match_type=existing_match_type,
        )
        medicines_preview.append(item)

        raw_medicines_data.append(
            {
                "medicine_id": med_id,
                "name": name_en,
                "name_ar": name_ar,
                "generic_name": ingredient,
                "strength": strength,
                "dosage_form": form,
                "package_description": pkg,
                "barcode": barcode,
                "verification_status": status_val,
                "notes": notes,
            }
        )

    # 6. Parse Medicine Batches sheet
    batches_preview: list[BatchPreviewItem] = []
    price_anomalies: list[PriceAnomalyItem] = []
    quarantined_batches: list[QuarantineBatchItem] = []
    duplicate_batch_groups: dict[tuple[str, str, str], list[dict]] = {}
    raw_batches_data = []

    for row in ws_bat.iter_rows(min_row=bat_header_idx + 1, values_only=True):
        if not any(c is not None for c in row):
            continue

        batch_id = str(row[bat_col_map.get("Batch ID", 0)] or "").strip()
        if not batch_id:
            continue

        med_id = str(row[bat_col_map.get("Medicine ID", 1)] or "").strip()
        batch_num = str(row[bat_col_map.get("Batch Number", 2)] or "").strip() or None
        exp_raw = row[bat_col_map.get("Expiry Date", 3)]
        qty_raw = row[bat_col_map.get("Invoice Quantity", 4)]
        p_unit = str(row[bat_col_map.get("Purchase Unit", 5)] or "Pack").strip()
        p_price_raw = row[bat_col_map.get("Purchase Price", 6)]
        disc_raw = row[bat_col_map.get("Discount (%)", 7)]
        net_raw = row[bat_col_map.get("Net Purchase Price", 8)]
        inv_num = str(row[bat_col_map.get("Invoice Number", 9)] or "").strip() or None
        inv_date_raw = row[bat_col_map.get("Invoice Date", 10)]
        supplier_raw = str(row[bat_col_map.get("Supplier", 11)] or "").strip()

        # Normalization
        norm_supplier = normalize_supplier_name(supplier_raw)
        inv_date_str = str(inv_date_raw).strip() if inv_date_raw is not None else None
        if inv_date_str and inv_date_str.lower() == "unspecified":
            inv_date_str = None

        parsed_exp, is_exp, is_unspec_exp = parse_expiry_date(exp_raw)
        exp_str = parsed_exp.isoformat() if parsed_exp else None

        gross, disc, unit_cost, expected_net, rec_net, has_price_disc = calculate_pricing(
            p_price_raw, disc_raw, qty_raw, net_raw
        )

        try:
            inv_qty = int(qty_raw or 0)
        except (ValueError, TypeError):
            inv_qty = 0

        warnings: list[str] = []
        is_valid = True
        is_quarantined = False

        # FK validation
        if med_id not in med_id_set:
            is_valid = False
            is_quarantined = True
            warnings.append(f"Referenced Medicine ID '{med_id}' not found in Medicines catalog")
            quarantined_batches.append(
                QuarantineBatchItem(
                    batch_id=batch_id,
                    medicine_id=med_id,
                    batch_number=batch_num,
                    expiry_date=exp_str,
                    reason=f"Orphaned: Medicine ID '{med_id}' not in catalog",
                )
            )

        # Expiry validation
        if is_unspec_exp:
            is_valid = False
            is_quarantined = True
            warnings.append("Expiry date is missing or unspecified (cannot insert into database)")
            quarantined_batches.append(
                QuarantineBatchItem(
                    batch_id=batch_id,
                    medicine_id=med_id,
                    batch_number=batch_num,
                    expiry_date=None,
                    reason="Expiry date missing/unspecified",
                )
            )
        elif is_exp:
            is_quarantined = True
            warnings.append(f"Expired batch ({exp_str}) — quarantine recommended")
            quarantined_batches.append(
                QuarantineBatchItem(
                    batch_id=batch_id,
                    medicine_id=med_id,
                    batch_number=batch_num,
                    expiry_date=exp_str,
                    reason="Already expired as of today",
                )
            )

        # Price discrepancy tracking & automatic quarantine
        if has_price_disc:
            is_valid = False
            is_quarantined = True
            warnings.append(
                f"Net price mismatch: recorded {rec_net:.2f} != expected {expected_net:.2f} (quarantined)"
            )
            price_anomalies.append(
                PriceAnomalyItem(
                    batch_id=batch_id,
                    medicine_id=med_id,
                    batch_number=batch_num,
                    invoice_quantity=inv_qty,
                    purchase_price=gross,
                    discount_percent=disc,
                    recorded_net_price=rec_net,
                    expected_net_price=expected_net,
                    invoice_number=inv_num,
                    discrepancy_amount=round(rec_net - expected_net, 2),
                )
            )
            quarantined_batches.append(
                QuarantineBatchItem(
                    batch_id=batch_id,
                    medicine_id=med_id,
                    batch_number=batch_num,
                    expiry_date=exp_str,
                    reason=f"Price discrepancy: recorded {rec_net:.2f} != expected {expected_net:.2f}",
                )
            )

        # Duplicate batch tracking (med_id, batch_num, expiry)
        if batch_num and exp_str:
            key = (med_id, batch_num.strip(), exp_str)
            duplicate_batch_groups.setdefault(key, []).append(
                {
                    "batch_id": batch_id,
                    "invoice_number": inv_num or "N/A",
                    "quantity": inv_qty,
                }
            )

        med_name = med_id_to_name.get(med_id, "Unknown Medicine")

        batch_item = BatchPreviewItem(
            batch_id=batch_id,
            medicine_id=med_id,
            medicine_name=med_name,
            batch_number=batch_num,
            expiry_date=exp_str,
            is_expired=is_exp,
            is_expiry_unspecified=is_unspec_exp,
            invoice_quantity=inv_qty,
            purchase_unit=p_unit,
            gross_price=gross,
            discount_percent=disc,
            calculated_unit_cost=unit_cost,
            recorded_net_price=rec_net,
            expected_net_price=expected_net,
            price_discrepancy=has_price_disc,
            invoice_number=inv_num,
            invoice_date=inv_date_str,
            supplier_name=supplier_raw,
            normalized_supplier_name=norm_supplier,
            is_valid=is_valid,
            is_quarantined=is_quarantined,
            validation_warnings=warnings,
        )
        batches_preview.append(batch_item)

        raw_batches_data.append(
            {
                "batch_id": batch_id,
                "medicine_id": med_id,
                "batch_number": batch_num,
                "expiry_date": exp_str,
                "is_expired": is_exp,
                "is_expiry_unspecified": is_unspec_exp,
                "invoice_quantity": inv_qty,
                "purchase_unit": p_unit,
                "gross_price": gross,
                "discount_percent": disc,
                "unit_cost": unit_cost,
                "recorded_net_price": rec_net,
                "expected_net_price": expected_net,
                "invoice_number": inv_num,
                "invoice_date": inv_date_str,
                "normalized_supplier_name": norm_supplier,
                "is_valid": is_valid,
                "is_quarantined": is_quarantined,
            }
        )

    # 7. Compile duplicate batch candidates
    duplicate_batches: list[DuplicateBatchItem] = []
    for (m_id, b_num, exp_d), group in duplicate_batch_groups.items():
        if len(group) > 1:
            duplicate_batches.append(
                DuplicateBatchItem(
                    medicine_id=m_id,
                    batch_number=b_num,
                    expiry_date=exp_d,
                    batch_ids=[g["batch_id"] for g in group],
                    invoice_numbers=[g["invoice_number"] for g in group],
                    total_quantity=sum(g["quantity"] for g in group),
                )
            )

    # 8. Compile duplicate name candidates
    duplicate_names: list[DuplicateNameItem] = []
    for name_str, m_ids in name_ar_counts.items():
        if len(m_ids) > 1:
            matched_items = [m for m in medicines_preview if m.medicine_id in m_ids]
            duplicate_names.append(
                DuplicateNameItem(
                    matched_by="Arabic Name",
                    matched_name=name_str,
                    medicine_ids=m_ids,
                    names=[m.name for m in matched_items],
                    strengths=[m.strength or "Unspecified" for m in matched_items],
                    dosage_forms=[m.dosage_form or "Unspecified" for m in matched_items],
                )
            )

    # 9. Summary metrics
    valid_meds_count = sum(1 for m in medicines_preview if m.is_valid)
    flagged_meds_count = sum(1 for m in medicines_preview if m.validation_warnings)
    valid_batches_count = sum(1 for b in batches_preview if b.is_valid and not b.is_quarantined)
    quarantined_batches_count = len(quarantined_batches)

    summary = ImportSummary(
        total_medicines=len(medicines_preview),
        valid_medicines=valid_meds_count,
        flagged_medicines=flagged_meds_count,
        duplicate_name_candidates=len(duplicate_names),
        total_batches=len(batches_preview),
        valid_batches=valid_batches_count,
        quarantined_batches=quarantined_batches_count,
        duplicate_batch_candidates=len(duplicate_batches),
        price_anomalies=len(price_anomalies),
        status="READY_FOR_SELECTIVE_IMPORT",
    )

    session_id = uuid.uuid4()
    now = datetime.now()

    report = ImportPreviewReport(
        session_id=session_id,
        filename=filename,
        file_hash=file_hash,
        uploaded_at=now,
        summary=summary,
        medicines_preview=medicines_preview,
        batches_preview=batches_preview,
        price_anomalies=price_anomalies,
        duplicate_batches=duplicate_batches,
        duplicate_names=duplicate_names,
        quarantined_batches=quarantined_batches,
        validation_errors=[],
    )

    # 10. Persist Session into database
    import_session = InventoryImportSession(
        id=session_id,
        filename=filename,
        file_hash=file_hash,
        status="previewed",
        uploaded_by=current_user.id if current_user else None,
        total_medicines=len(medicines_preview),
        valid_medicines=valid_meds_count,
        flagged_medicines=flagged_meds_count,
        total_batches=len(batches_preview),
        valid_batches=valid_batches_count,
        quarantined_batches=quarantined_batches_count,
        report_json=report.model_dump_json(),
        raw_data_json=json.dumps(
            {"medicines": raw_medicines_data, "batches": raw_batches_data},
            ensure_ascii=False,
        ),
    )
    db.add(import_session)
    db.commit()

    return report


def commit_approved_import(
    db: Session,
    request: ImportCommitRequest,
    current_user: User,
) -> ImportCommitResponse:
    """
    Stage B: Controlled transactional import.
    Imports ONLY records approved by the user.
    Maintains relational links between Medicines, Batches, PackagingUnits, and Suppliers.
    Initializes ALL batch quantities to 0 (Opening stock is handled in Phase 3).
    Guarantees idempotency and rollback safety.
    """
    session = db.get(InventoryImportSession, request.session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Import session {request.session_id} not found.",
        )

    if session.status == "committed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Import session {request.session_id} has already been fully committed.",
        )

    if not session.raw_data_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session data is empty or missing.",
        )

    raw_data = json.loads(session.raw_data_json)
    medicines_list: list[dict] = raw_data.get("medicines", [])
    batches_list: list[dict] = raw_data.get("batches", [])

    # Strict approval enforcement: require explicit list or explicit approve-all boolean
    if not request.approved_medicine_ids and not request.approve_all_verified_medicines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit medicine approval required. Provide 'approved_medicine_ids' list or set 'approve_all_verified_medicines=True'.",
        )

    if not request.approved_batch_ids and not request.approve_all_valid_batches:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit batch approval required. Provide 'approved_batch_ids' list or set 'approve_all_valid_batches=True'.",
        )

    # Determine approved medicine IDs
    if request.approved_medicine_ids is not None:
        approved_med_ids_set = set(request.approved_medicine_ids)
    else:
        # approve_all_verified_medicines is True: take all Verified medicines
        approved_med_ids_set = {
            m["medicine_id"]
            for m in medicines_list
            if m.get("verification_status", "").lower() == "verified"
        }

    # Determine approved batch IDs
    if request.approved_batch_ids is not None:
        approved_batch_ids_set = set(request.approved_batch_ids)
    else:
        # approve_all_valid_batches is True: take all non-quarantined batches
        approved_batch_ids_set = {
            b["batch_id"] for b in batches_list if not b.get("is_quarantined")
        }

    # Quarantine override verification:
    override_quarantine_set = set(request.override_quarantine_batch_ids or [])
    if override_quarantine_set:
        if (
            not request.quarantine_override_reason
            or len(request.quarantine_override_reason.strip()) < 10
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid explanation (minimum 10 characters) is required when overriding quarantined batches.",
            )

    medicines_created = 0
    medicines_linked_existing = 0
    batches_created = 0
    batches_skipped = 0
    suppliers_created = 0
    suppliers_matched = 0
    errors: list[str] = []

    try:
        # Step 1: Resolve / Create Suppliers
        supplier_map: dict[str, uuid.UUID] = {}
        unique_suppliers = {
            b["normalized_supplier_name"]
            for b in batches_list
            if b.get("normalized_supplier_name")
        }

        for supp_name in unique_suppliers:
            existing_supp = db.scalar(
                select(Supplier).where(func.lower(Supplier.name) == supp_name.lower())
            )
            if existing_supp:
                supplier_map[supp_name] = existing_supp.id
                suppliers_matched += 1
            else:
                new_supp = Supplier(name=supp_name, is_active=True)
                db.add(new_supp)
                db.flush()
                supplier_map[supp_name] = new_supp.id
                suppliers_created += 1

        # Step 2: Index Batch Prices per Medicine deterministically
        # Only non-quarantined batches with gross_price > 0 are considered.
        # Verified ISO dates (YYYY-MM-DD) are sorted newest to oldest.
        # Missing or placeholder dates sort to the bottom so they NEVER determine latest price.
        med_price_map: dict[str, tuple[float, float]] = {}
        valid_pricing_batches = [
            b
            for b in batches_list
            if not b.get("is_quarantined")
            and not b.get("is_expiry_unspecified")
            and not b.get("is_expired")
            and not b.get("price_discrepancy")
            and b.get("gross_price", 0.0) > 0
        ]

        def invoice_date_sort_key(b: dict) -> tuple[int, str, str]:
            d_str = str(b.get("invoice_date") or "").strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}$", d_str):
                return (1, d_str, str(b.get("batch_id") or ""))
            return (0, "", str(b.get("batch_id") or ""))

        sorted_pricing_batches = sorted(
            valid_pricing_batches, key=invoice_date_sort_key, reverse=True
        )
        for b in sorted_pricing_batches:
            m_id = b["medicine_id"]
            if m_id not in med_price_map:
                med_price_map[m_id] = (b.get("gross_price", 0.0), b.get("unit_cost", 0.0))

        # Step 3: Import Approved Medicines
        med_uuid_map: dict[str, uuid.UUID] = {}
        existing_meds = db.scalars(select(Medicine)).all()
        existing_by_sku = {m.sku: m for m in existing_meds if m.sku}
        existing_by_name = {m.name.strip().lower(): m for m in existing_meds if m.name}

        for m_data in medicines_list:
            med_code = m_data["medicine_id"]

            # Filter check: must be explicitly approved
            if med_code not in approved_med_ids_set:
                continue

            # Block unverified medicines unless explicit override flag is true
            if (
                not request.include_unverified_medicines
                and m_data.get("verification_status", "").lower() == "needs verification"
            ):
                continue

            # Check if exists
            existing_med = None
            if med_code in existing_by_sku:
                existing_med = existing_by_sku[med_code]
            elif (
                request.link_existing_medicines
                and m_data["name"]
                and m_data["name"].strip().lower() in existing_by_name
            ):
                existing_med = existing_by_name[m_data["name"].strip().lower()]

            if existing_med:
                med_uuid_map[med_code] = existing_med.id
                medicines_linked_existing += 1
                continue

            # Determine prices (using only valid non-quarantined batches)
            gross_sp, unit_pp = med_price_map.get(med_code, (0.0, 0.0))

            new_med = Medicine(
                name=m_data["name"],
                name_ar=m_data.get("name_ar"),
                generic_name=m_data.get("generic_name"),
                strength=m_data.get("strength"),
                form=m_data.get("dosage_form"),
                base_unit_name=m_data.get("package_description") or "Unit",
                sku=med_code,
                barcode=m_data.get("barcode"),
                selling_price=Decimal(str(gross_sp)),
                purchase_price=Decimal(str(unit_pp)),
                minimum_stock=10,
                is_active=True,
                product_type="medicine",
            )
            db.add(new_med)
            db.flush()

            med_uuid_map[med_code] = new_med.id
            medicines_created += 1

            # Create default packaging unit for base dispensing
            base_pkg_unit = MedicinePackageUnit(
                medicine_id=new_med.id,
                unit_name_en=new_med.base_unit_name,
                unit_name_ar="وحدة",
                conversion_factor=Decimal("1.0"),
                selling_price=Decimal(str(gross_sp)),
                purchase_price=Decimal(str(unit_pp)),
                is_base_unit=True,
                is_default_dispense=True,
                allow_selling=True,
                is_active=True,
            )
            db.add(base_pkg_unit)

        # Step 4: Import Approved Batches & Group Invoices
        invoice_groups: dict[tuple[uuid.UUID, str, str | None], list[dict]] = {}

        for b_data in batches_list:
            bat_code = b_data["batch_id"]
            med_code = b_data["medicine_id"]

            # Relational gating: Must resolve to an imported or linked medicine
            target_med_id = med_uuid_map.get(med_code)
            if not target_med_id:
                batches_skipped += 1
                continue

            supp_id = supplier_map.get(b_data.get("normalized_supplier_name", ""))
            inv_num = b_data.get("invoice_number") or "Unspecified"
            inv_date_str = b_data.get("invoice_date")

            is_quarantined = (
                b_data.get("is_quarantined", False)
                or b_data.get("is_expired", False)
                or b_data.get("is_expiry_unspecified", False)
            )
            is_unspec_exp = b_data.get("is_expiry_unspecified", False)
            is_exp = b_data.get("is_expired", False)
            is_in_approved_batches = bat_code in approved_batch_ids_set
            override_ok = bat_code in override_quarantine_set

            batch_uuid: uuid.UUID | None = None
            should_create_batch = False

            # Quarantine security check:
            # If batch is quarantined, it CANNOT be committed to MedicineBatch unless explicitly overridden with valid reason
            if is_in_approved_batches:
                if is_quarantined and not override_ok:
                    batches_skipped += 1
                elif is_unspec_exp and not override_ok:
                    batches_skipped += 1
                elif is_exp and not request.include_expired_batches and not override_ok:
                    batches_skipped += 1
                else:
                    should_create_batch = True
            else:
                batches_skipped += 1

            if should_create_batch:
                exp_str = b_data.get("expiry_date")
                try:
                    exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
                    # Create Batch strictly with quantity = 0 (Opening stock is recorded in Phase 3)
                    new_batch = MedicineBatch(
                        medicine_id=target_med_id,
                        batch_number=b_data.get("batch_number"),
                        expiry_date=exp_date,
                        quantity=0,  # CRITICAL SAFETY: Opening stock is recorded strictly via stocktake in Phase 3
                        purchase_price=Decimal(str(b_data.get("unit_cost", 0.0))),
                        supplier_id=supp_id,
                    )
                    db.add(new_batch)
                    db.flush()
                    batch_uuid = new_batch.id
                    batches_created += 1
                except (ValueError, TypeError):
                    batches_skipped += 1
                    batch_uuid = None

            # Historical invoice preservation:
            # Record PurchaseItem for ALL invoice lines where the medicine exists in the catalog.
            # Active batches link batch_uuid; quarantined batches link batch_id=None.
            # Zero financial or delivery provenance is lost!
            inv_key = (supp_id, inv_num, inv_date_str)
            invoice_groups.setdefault(inv_key, []).append(
                {
                    "batch_id": batch_uuid,
                    "medicine_id": target_med_id,
                    "data": b_data,
                    "is_quarantined": is_quarantined and not override_ok,
                }
            )

        # Step 5: Preserve Historical Purchase Orders and Line Items
        purchases_created = 0
        purchase_items_created = 0

        for (supp_id, inv_num, inv_date_str), items in invoice_groups.items():
            parsed_inv_date = None
            if inv_date_str:
                try:
                    parsed_inv_date = datetime.strptime(inv_date_str, "%Y-%m-%d")
                except (ValueError, TypeError):
                    parsed_inv_date = None

            total_inv_amount = sum(
                Decimal(
                    str(
                        it["data"].get("recorded_net_price")
                        or it["data"].get("expected_net_price", 0.0)
                    )
                )
                for it in items
            )

            supp_name = items[0]["data"].get("normalized_supplier_name", "Supplier")
            is_placeholder_inv = "unspecified" in str(inv_num).lower()

            if is_placeholder_inv:
                notes_text = f"Excel Migration - Unidentified Invoice Document [{inv_num}] ({supp_name}) - Review Required"
            else:
                notes_text = f"Excel Migration - Invoice #{inv_num} ({supp_name})"

            purchase = Purchase(
                supplier_id=supp_id,
                user_id=current_user.id if current_user else None,
                total_amount=total_inv_amount,
                status=PurchaseStatus.RECEIVED,
                notes=notes_text[:500],
                created_at=parsed_inv_date if parsed_inv_date else datetime.now(),
            )
            db.add(purchase)
            db.flush()
            purchases_created += 1

            for it in items:
                b_data = it["data"]
                qty = max(1, int(b_data.get("invoice_quantity", 1)))
                unit_cost = Decimal(str(b_data.get("unit_cost", 0.0)))
                line_total = Decimal(
                    str(
                        b_data.get("recorded_net_price")
                        or b_data.get("expected_net_price", 0.0)
                    )
                )
                p_unit = b_data.get("purchase_unit") or "Pack"
                if it.get("is_quarantined"):
                    unit_desc = f"{p_unit} [Excel Row: {b_data.get('batch_id')}] (QUARANTINED)"
                else:
                    unit_desc = f"{p_unit} [Excel Row: {b_data.get('batch_id')}]"

                p_item = PurchaseItem(
                    purchase_id=purchase.id,
                    medicine_id=it["medicine_id"],
                    batch_id=it["batch_id"],
                    quantity=qty,
                    base_quantity=qty,
                    unit_name=unit_desc[:50],
                    conversion_factor=Decimal("1.0"),
                    unit_price=unit_cost,
                    total_price=line_total,
                )
                db.add(p_item)
                purchase_items_created += 1

        # Step 6: Create Audit Log Entry
        audit_log = AuditLog(
            user_id=current_user.id if current_user else None,
            action="INVENTORY_IMPORT_COMMIT",
            details=(
                f"Import Session {session.id} ({session.filename}): "
                f"Created {medicines_created} medicines, linked {medicines_linked_existing} existing; "
                f"Created {batches_created} batches (all initialized to qty=0); "
                f"Preserved {purchases_created} historical purchases with {purchase_items_created} items. "
                f"Suppliers: {suppliers_created} created, {suppliers_matched} matched."
            )[:1000],
        )
        db.add(audit_log)
        db.flush()

        # Update Session status
        session.status = "committed"
        session.committed_medicines = medicines_created + medicines_linked_existing
        session.committed_batches = batches_created
        db.commit()

        return ImportCommitResponse(
            session_id=session.id,
            status="committed",
            medicines_created=medicines_created,
            medicines_linked_existing=medicines_linked_existing,
            batches_created=batches_created,
            batches_quarantined_skipped=batches_skipped,
            suppliers_created=suppliers_created,
            suppliers_matched=suppliers_matched,
            purchases_created=purchases_created,
            purchase_items_created=purchase_items_created,
            audit_log_id=audit_log.id,
            committed_at=datetime.now(),
            errors=errors,
        )

    except Exception as exc:
        db.rollback()
        logger.exception("Inventory import commit failed; rolled back transaction.")
        session.status = "failed"
        session.error_message = str(exc)
        try:
            db.commit()
        except Exception:
            db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import transaction failed and was rolled back cleanly: {str(exc)}",
        )

