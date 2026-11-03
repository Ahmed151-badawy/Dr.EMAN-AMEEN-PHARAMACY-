import io
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.audit_log import AuditLog
from app.models.customer import Customer
from app.models.inventory_movement import InventoryMovement, MovementReason
from app.models.medicine import Medicine, MedicineBatch
from app.models.sale import Sale, SaleItem, SaleReturn
from app.models.user import User


def sanitize_excel_value(val: Any) -> Any:
    """
    Guards against formula injection vulnerabilities in spreadsheet exports.
    Prepends a single apostrophe (') to string values starting with '=', '+', '-', '@', tab, or carriage return.
    """
    if val is None:
        return "-"
    if isinstance(val, (int, float, Decimal)):
        return val
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d %H:%M:%S") if isinstance(val, datetime) else val.strftime("%Y-%m-%d")

    s = str(val).strip()
    if not s:
        return "-"
    if s.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{s}"
    return s


def get_schedule_display(schedule: str | None) -> tuple[str, str]:
    """Returns bilingual (English, Arabic) labels for controlled schedules."""
    schedules = {
        "schedule_1": ("Schedule I (Narcotics)", "جدول 1 مخدرات"),
        "schedule_2": ("Schedule II (Psychotropics)", "جدول 2 مؤثرات عقلية"),
        "schedule_3": ("Schedule III (Restricted Prescription)", "جدول 3 أدوية لا تصرف إلا بتذكرة"),
        "unscheduled_controlled": ("Special Controlled", "مراقبة خاصة أخرى"),
    }
    if not schedule:
        return ("Controlled (Unspecified)", "دواء مراقب")
    return schedules.get(schedule, (schedule, schedule))


def query_controlled_transactions(
    db: Session,
    start_date: date | None = None,
    end_date: date | None = None,
    medicine_id: uuid.UUID | None = None,
    controlled_schedule: str | None = None,
    transaction_type: str | None = None,  # "all", "sale", "return", "adjustment"
    customer_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    invoice_ref: str | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int, dict[str, Any]]:
    """
    Fetches controlled medicine audit records from sales, returns, and inventory movements.
    Returns (records, total_count, summary_metrics).
    """
    results: list[dict[str, Any]] = []

    # -------------------------------------------------------------------------
    # 1. Controlled Sales Line Items
    # -------------------------------------------------------------------------
    if transaction_type in (None, "all", "sale"):
        sale_stmt = (
            select(SaleItem, Sale, Medicine, MedicineBatch, Customer, User)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .join(Medicine, Medicine.id == SaleItem.medicine_id)
            .outerjoin(MedicineBatch, MedicineBatch.id == SaleItem.batch_id)
            .outerjoin(Customer, Customer.id == Sale.customer_id)
            .outerjoin(User, User.id == Sale.user_id)
            .where(
                or_(
                    SaleItem.classification_snapshot == "controlled",
                    Medicine.is_controlled == True,
                    Sale.has_controlled_medicine == True,
                )
            )
        )

        if start_date:
            sale_stmt = sale_stmt.where(Sale.created_at >= datetime.combine(start_date, time.min))
        if end_date:
            sale_stmt = sale_stmt.where(Sale.created_at <= datetime.combine(end_date, time.max))
        if medicine_id:
            sale_stmt = sale_stmt.where(SaleItem.medicine_id == medicine_id)
        if controlled_schedule:
            sale_stmt = sale_stmt.where(
                or_(
                    SaleItem.controlled_schedule_snapshot == controlled_schedule,
                    Medicine.controlled_schedule == controlled_schedule,
                )
            )
        if customer_id:
            sale_stmt = sale_stmt.where(Sale.customer_id == customer_id)
        if user_id:
            sale_stmt = sale_stmt.where(Sale.user_id == user_id)
        if invoice_ref:
            sale_stmt = sale_stmt.where(func.cast(Sale.id, func.text()).ilike(f"%{invoice_ref.strip()}%"))

        sale_rows = db.execute(sale_stmt).all()
        for s_item, sale, med, batch, cust, emp in sale_rows:
            sched = s_item.controlled_schedule_snapshot or med.controlled_schedule
            en_sched, ar_sched = get_schedule_display(sched)

            results.append({
                "transaction_id": str(sale.id),
                "item_id": str(s_item.id),
                "timestamp": sale.created_at,
                "type": "sale",
                "type_display_en": "Sale / Dispense",
                "type_display_ar": "صرف / بيع",
                "medicine_id": str(med.id),
                "medicine_name": s_item.medicine_name_snapshot or med.name,
                "medicine_name_ar": med.name_ar,
                "classification": "controlled",
                "schedule": sched,
                "schedule_display_en": en_sched,
                "schedule_display_ar": ar_sched,
                "batch_number": s_item.batch_number_snapshot or (batch.batch_number if batch else None),
                "quantity": s_item.quantity,
                "package_unit": s_item.unit_name or med.base_unit_name or "Unit",
                "conversion_factor": float(s_item.conversion_factor),
                "base_quantity": s_item.base_quantity,
                "unit_price": float(s_item.unit_price),
                "total_price": float(s_item.total_price),
                "customer_id": str(cust.id) if cust else None,
                "customer_name": cust.name if cust else None,
                "customer_phone": cust.phone if cust else None,
                "purchaser_name": sale.purchaser_name,
                "purchaser_id_number": sale.purchaser_id_number,
                "purchaser_phone": sale.purchaser_phone,
                "prescription_reference": sale.prescription_reference,
                "doctor_name": sale.doctor_name,
                "doctor_license": sale.doctor_license,
                "prescription_date": sale.prescription_date,
                "user_id": str(emp.id) if emp else None,
                "user_full_name": emp.full_name if emp else None,
                "user_role": emp.role.value if emp else None,
                "original_reference": None,
                "notes": None,
            })

    # -------------------------------------------------------------------------
    # 2. Controlled Sale Returns
    # -------------------------------------------------------------------------
    if transaction_type in (None, "all", "return"):
        return_stmt = (
            select(SaleReturn, SaleItem, Sale, Medicine, MedicineBatch, Customer, User)
            .join(SaleItem, SaleItem.id == SaleReturn.sale_item_id)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .join(Medicine, Medicine.id == SaleItem.medicine_id)
            .outerjoin(MedicineBatch, MedicineBatch.id == SaleItem.batch_id)
            .outerjoin(Customer, Customer.id == Sale.customer_id)
            .outerjoin(User, User.id == Sale.user_id)
            .where(
                or_(
                    SaleItem.classification_snapshot == "controlled",
                    Medicine.is_controlled == True,
                    Sale.has_controlled_medicine == True,
                )
            )
        )

        if start_date:
            return_stmt = return_stmt.where(SaleReturn.created_at >= datetime.combine(start_date, time.min))
        if end_date:
            return_stmt = return_stmt.where(SaleReturn.created_at <= datetime.combine(end_date, time.max))
        if medicine_id:
            return_stmt = return_stmt.where(SaleItem.medicine_id == medicine_id)
        if controlled_schedule:
            return_stmt = return_stmt.where(
                or_(
                    SaleItem.controlled_schedule_snapshot == controlled_schedule,
                    Medicine.controlled_schedule == controlled_schedule,
                )
            )
        if customer_id:
            return_stmt = return_stmt.where(Sale.customer_id == customer_id)
        if user_id:
            return_stmt = return_stmt.where(Sale.user_id == user_id)
        if invoice_ref:
            return_stmt = return_stmt.where(func.cast(Sale.id, func.text()).ilike(f"%{invoice_ref.strip()}%"))

        return_rows = db.execute(return_stmt).all()
        for s_return, s_item, sale, med, batch, cust, emp in return_rows:
            sched = s_item.controlled_schedule_snapshot or med.controlled_schedule
            en_sched, ar_sched = get_schedule_display(sched)
            conv = float(s_item.conversion_factor or 1.0)
            base_ret_qty = int(round(s_return.quantity * conv))

            results.append({
                "transaction_id": str(s_return.id),
                "item_id": str(s_item.id),
                "timestamp": s_return.created_at,
                "type": "return",
                "type_display_en": "Sale Return",
                "type_display_ar": "مرتجع مبيعات",
                "medicine_id": str(med.id),
                "medicine_name": s_item.medicine_name_snapshot or med.name,
                "medicine_name_ar": med.name_ar,
                "classification": "controlled",
                "schedule": sched,
                "schedule_display_en": en_sched,
                "schedule_display_ar": ar_sched,
                "batch_number": s_item.batch_number_snapshot or (batch.batch_number if batch else None),
                "quantity": s_return.quantity,
                "package_unit": s_item.unit_name or med.base_unit_name or "Unit",
                "conversion_factor": conv,
                "base_quantity": base_ret_qty,
                "unit_price": float(s_item.unit_price),
                "total_price": float(Decimal(str(s_item.unit_price)) * Decimal(str(s_return.quantity))),
                "customer_id": str(cust.id) if cust else None,
                "customer_name": cust.name if cust else None,
                "customer_phone": cust.phone if cust else None,
                "purchaser_name": sale.purchaser_name,
                "purchaser_id_number": sale.purchaser_id_number,
                "purchaser_phone": sale.purchaser_phone,
                "prescription_reference": sale.prescription_reference,
                "doctor_name": sale.doctor_name,
                "doctor_license": sale.doctor_license,
                "prescription_date": sale.prescription_date,
                "user_id": str(emp.id) if emp else None,
                "user_full_name": emp.full_name if emp else None,
                "user_role": emp.role.value if emp else None,
                "original_reference": str(sale.id),
                "notes": s_return.reason,
            })

    # -------------------------------------------------------------------------
    # 3. Controlled Inventory Adjustments / Write-Offs
    # -------------------------------------------------------------------------
    if transaction_type in (None, "all", "adjustment"):
        adj_stmt = (
            select(InventoryMovement, Medicine, MedicineBatch, User)
            .join(Medicine, Medicine.id == InventoryMovement.medicine_id)
            .outerjoin(MedicineBatch, MedicineBatch.id == InventoryMovement.batch_id)
            .outerjoin(User, User.id == InventoryMovement.created_by)
            .where(
                Medicine.is_controlled == True,
                InventoryMovement.reason.in_([
                    MovementReason.DAMAGE_WRITE_OFF,
                    MovementReason.EXPIRY_WRITE_OFF,
                    MovementReason.MANUAL_ADJUSTMENT,
                    MovementReason.STOCK_TAKE_CORRECTION,
                ]),
            )
        )

        if start_date:
            adj_stmt = adj_stmt.where(InventoryMovement.created_at >= datetime.combine(start_date, time.min))
        if end_date:
            adj_stmt = adj_stmt.where(InventoryMovement.created_at <= datetime.combine(end_date, time.max))
        if medicine_id:
            adj_stmt = adj_stmt.where(InventoryMovement.medicine_id == medicine_id)
        if controlled_schedule:
            adj_stmt = adj_stmt.where(Medicine.controlled_schedule == controlled_schedule)
        if user_id:
            adj_stmt = adj_stmt.where(InventoryMovement.created_by == user_id)

        adj_rows = db.execute(adj_stmt).all()
        for mov, med, batch, emp in adj_rows:
            sched = med.controlled_schedule
            en_sched, ar_sched = get_schedule_display(sched)

            results.append({
                "transaction_id": str(mov.id),
                "item_id": str(mov.id),
                "timestamp": mov.created_at,
                "type": "adjustment",
                "type_display_en": f"Adjustment ({mov.reason.value})",
                "type_display_ar": f"تسوية مخزنية ({mov.reason.value})",
                "medicine_id": str(med.id),
                "medicine_name": med.name,
                "medicine_name_ar": med.name_ar,
                "classification": "controlled",
                "schedule": sched,
                "schedule_display_en": en_sched,
                "schedule_display_ar": ar_sched,
                "batch_number": batch.batch_number if batch else None,
                "quantity": abs(mov.quantity_change),
                "package_unit": med.base_unit_name or "Unit",
                "conversion_factor": 1.0,
                "base_quantity": abs(mov.quantity_change),
                "unit_price": float(med.selling_price),
                "total_price": float(med.selling_price * abs(mov.quantity_change)),
                "customer_id": None,
                "customer_name": None,
                "customer_phone": None,
                "purchaser_name": None,
                "purchaser_id_number": None,
                "purchaser_phone": None,
                "prescription_reference": None,
                "doctor_name": None,
                "doctor_license": None,
                "prescription_date": None,
                "user_id": str(emp.id) if emp else None,
                "user_full_name": emp.full_name if emp else None,
                "user_role": emp.role.value if emp else None,
                "original_reference": mov.reference_type,
                "notes": f"{mov.reason.value}: {mov.quantity_change:+d} base units",
            })

    # Sort in reverse chronological order
    results.sort(key=lambda x: x["timestamp"], reverse=True)

    # Compute authoritative summary totals across the matched dataset
    total_count = len(results)
    total_sales_base_qty = sum(r["base_quantity"] for r in results if r["type"] == "sale")
    total_returns_base_qty = sum(r["base_quantity"] for r in results if r["type"] == "return")
    total_adjustments_base_qty = sum(r["base_quantity"] for r in results if r["type"] == "adjustment")
    net_dispensed_base_qty = total_sales_base_qty - total_returns_base_qty

    summary = {
        "total_records": total_count,
        "total_sales_base_quantity": total_sales_base_qty,
        "total_returns_base_quantity": total_returns_base_qty,
        "total_adjustments_base_quantity": total_adjustments_base_qty,
        "net_dispensed_base_quantity": net_dispensed_base_qty,
    }

    # Slice for pagination if limit is specified
    paginated_results = results[offset : offset + limit]
    return paginated_results, total_count, summary


def generate_controlled_medicines_excel(
    records: list[dict[str, Any]],
    summary: dict[str, Any],
    filters: dict[str, Any],
    exported_by: User,
) -> bytes:
    """
    Creates an Excel spreadsheet (.xlsx) with:
    - Official bilingual header and pharmacy branding
    - Comprehensive metadata & filter audit block
    - Formula injection protection on all string cells
    - Clean RTL worksheet styling, borders, and column formatting
    - Reconciled summary totals
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Controlled Medicines Audit"
    ws.views.sheetView[0].rightToLeft = True

    # Styling definitions
    font_title = Font(name="Calibri", size=15, bold=True, color="1B365D")
    font_subtitle = Font(name="Calibri", size=12, bold=True, color="475569")
    font_meta_label = Font(name="Calibri", size=10, bold=True, color="334155")
    font_meta_val = Font(name="Calibri", size=10, color="0F172A")
    font_header = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    font_data = Font(name="Calibri", size=10, color="000000")
    font_total = Font(name="Calibri", size=11, bold=True, color="1E293B")

    fill_header = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")  # Deep Blue
    fill_alt_row = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    fill_summary = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

    thin_border_side = Side(border_style="thin", color="CBD5E1")
    border_data = Border(
        left=thin_border_side,
        right=thin_border_side,
        top=thin_border_side,
        bottom=thin_border_side,
    )
    border_total = Border(
        top=Side(border_style="medium", color="475569"),
        bottom=Side(border_style="double", color="1E293B"),
    )

    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    align_left = Alignment(horizontal="left", vertical="center", wrap_text=True)
    align_right = Alignment(horizontal="right", vertical="center", wrap_text=True)

    # 1. Header Banner
    ws.merge_cells("A1:R1")
    ws["A1"] = "Dr. Eman Ameen Pharmacy — Controlled Medicines Audit & Dispensing Register"
    ws["A1"].font = font_title
    ws["A1"].alignment = align_center

    ws.merge_cells("A2:R2")
    ws["A2"] = "صيدلية د. إيمان أمين — سجل حركة وصرف الأدوية المراقبة والجدول"
    ws["A2"].font = font_subtitle
    ws["A2"].alignment = align_center

    # 2. Metadata Block
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    period_str = f"{filters.get('start_date') or 'All Time'} to {filters.get('end_date') or 'Present'}"

    metadata = [
        ("Generation Timestamp / وقت الاستخراج:", now_str, "Exported By / المسؤول عن الاستخراج:", f"{exported_by.full_name} ({exported_by.role.value})"),
        ("Reporting Period / الفترة المغطاة:", period_str, "Schedule Filter / تصنيف الجدول:", filters.get("controlled_schedule") or "All Schedules / كل الجداول"),
        ("Transaction Type / نوع المعاملة:", filters.get("transaction_type") or "All / الكل", "Total Records / إجمالي المعاملات:", summary.get("total_records", 0)),
    ]

    row_idx = 4
    for label1, val1, label2, val2 in metadata:
        ws.cell(row=row_idx, column=1, value=label1).font = font_meta_label
        ws.cell(row=row_idx, column=3, value=sanitize_excel_value(val1)).font = font_meta_val
        ws.cell(row=row_idx, column=6, value=label2).font = font_meta_label
        ws.cell(row=row_idx, column=9, value=sanitize_excel_value(val2)).font = font_meta_val
        row_idx += 1

    row_idx += 1  # Spacing row

    # 3. Columns Definition (Bilingual Headers)
    columns = [
        ("#", 6),
        ("التاريخ والوقت\nDate & Time", 20),
        ("نوع الحركة\nType", 14),
        ("رقم المعاملة\nTransaction Ref", 16),
        ("اسم الدواء\nMedicine Name", 26),
        ("الاسم بالعربية\nArabic Name", 24),
        ("الجدول الرقابي\nSchedule", 22),
        ("رقم التشغيلة\nBatch #", 14),
        ("الكمية\nQty", 10),
        ("وحدة البيع\nPackage Unit", 14),
        ("معامل التحويل\nConv. Factor", 13),
        ("الوحدات الأساسية\nBase Units", 14),
        ("اسم المشتري\nPurchaser Name", 22),
        ("إثبات الشخصية\nPurchaser ID", 18),
        ("هاتف المشتري\nPurchaser Phone", 16),
        ("رقم الروشتة\nPrescription Ref", 18),
        ("الطبيب المعالج\nDoctor Name", 20),
        ("الصيدلي المسؤول\nEmployee", 20),
    ]

    header_row = row_idx
    for col_idx, (col_name, col_width) in enumerate(columns, start=1):
        cell = ws.cell(row=header_row, column=col_idx, value=col_name)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = align_center
        cell.border = border_data
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = col_width

    ws.row_dimensions[header_row].height = 36

    # 4. Data Rows
    row_idx = header_row + 1
    for i, r in enumerate(records, start=1):
        row_fill = fill_alt_row if (i % 2 == 0) else None

        values = [
            i,
            r["timestamp"].strftime("%Y-%m-%d %H:%M:%S") if isinstance(r["timestamp"], datetime) else str(r["timestamp"]),
            r["type_display_ar"],
            r["transaction_id"][:8],
            sanitize_excel_value(r["medicine_name"]),
            sanitize_excel_value(r["medicine_name_ar"]),
            f"{r['schedule_display_ar']} ({r['schedule_display_en']})",
            sanitize_excel_value(r["batch_number"]),
            r["quantity"],
            sanitize_excel_value(r["package_unit"]),
            r["conversion_factor"],
            r["base_quantity"],
            sanitize_excel_value(r["purchaser_name"]),
            sanitize_excel_value(r["purchaser_id_number"]),
            sanitize_excel_value(r["purchaser_phone"]),
            sanitize_excel_value(r["prescription_reference"]),
            sanitize_excel_value(r["doctor_name"]),
            sanitize_excel_value(r["user_full_name"]),
        ]

        for col_idx, val in enumerate(values, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = font_data
            cell.border = border_data
            if row_fill:
                cell.fill = row_fill

            # Alignment according to data type
            if col_idx in (1, 3, 4, 8, 9, 11, 12):
                cell.alignment = align_center
            elif col_idx in (14, 15, 16):
                cell.alignment = align_center
            else:
                cell.alignment = align_right

        ws.row_dimensions[row_idx].height = 22
        row_idx += 1

    # 5. Authoritative Summary Block at the Bottom
    row_idx += 1
    ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=11)
    tot_label = ws.cell(row=row_idx, column=1, value="إجمالي الصرف والمنصرف بالوحدات الأساسية / Total Dispensed (Base Units):")
    tot_label.font = font_total
    tot_label.alignment = align_right
    tot_val = ws.cell(row=row_idx, column=12, value=summary.get("total_sales_base_quantity", 0))
    tot_val.font = font_total
    tot_val.alignment = align_center
    tot_val.border = border_total
    for c in range(1, 13):
        ws.cell(row=row_idx, column=c).fill = fill_summary

    row_idx += 1
    ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=11)
    ret_label = ws.cell(row=row_idx, column=1, value="إجمالي المرتجع بالوحدات الأساسية / Total Returned (Base Units):")
    ret_label.font = font_total
    ret_label.alignment = align_right
    ret_val = ws.cell(row=row_idx, column=12, value=summary.get("total_returns_base_quantity", 0))
    ret_val.font = font_total
    ret_val.alignment = align_center
    ret_val.border = border_total
    for c in range(1, 13):
        ws.cell(row=row_idx, column=c).fill = fill_summary

    row_idx += 1
    ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=11)
    net_label = ws.cell(row=row_idx, column=1, value="صافي حركة الأدوية المراقبة (الوحدات الأساسية) / Net Controlled Movement:")
    net_label.font = font_total
    net_label.alignment = align_right
    net_val = ws.cell(row=row_idx, column=12, value=summary.get("net_dispensed_base_quantity", 0))
    net_val.font = font_total
    net_val.alignment = align_center
    net_val.border = border_total
    for c in range(1, 13):
        ws.cell(row=row_idx, column=c).fill = fill_summary

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def log_report_export_audit(
    db: Session,
    user: User,
    action: str,
    filters: dict[str, Any],
    record_count: int,
    ip_address: str | None = None,
) -> AuditLog:
    """Records an immutable security audit event whenever a report is previewed or exported."""
    details = (
        f"Exported controlled medicines report. Records: {record_count}. "
        f"Filters: start_date={filters.get('start_date')}, end_date={filters.get('end_date')}, "
        f"schedule={filters.get('controlled_schedule')}, type={filters.get('transaction_type')}"
    )
    log_entry = AuditLog(
        user_id=user.id,
        action=action,
        details=details[:1000],
        ip_address=ip_address,
    )
    db.add(log_entry)
    db.commit()
    return log_entry
