import uuid
from datetime import date
from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.report import ControlledReportResponse, ControlledReportSummaryOut, ControlledTransactionItemOut
from app.services import reports as reports_service

router = APIRouter(prefix="/reports", tags=["reports"])

# Only licensed Pharmacists and Administrators are permitted to access controlled substance records
CAN_VIEW_CONTROLLED_REPORTS = (UserRole.ADMIN, UserRole.PHARMACIST)


@router.get(
    "/controlled-medicines",
    response_model=ControlledReportResponse,
    dependencies=[Depends(require_roles(*CAN_VIEW_CONTROLLED_REPORTS))],
)
def get_controlled_medicines_report(
    start_date: date | None = Query(None, description="Start date (inclusive)"),
    end_date: date | None = Query(None, description="End date (inclusive)"),
    medicine_id: uuid.UUID | None = Query(None, description="Filter by specific medicine"),
    controlled_schedule: str | None = Query(None, description="Filter by controlled schedule"),
    transaction_type: str | None = Query(None, description="Transaction type: all, sale, return, adjustment"),
    customer_id: uuid.UUID | None = Query(None, description="Filter by customer account"),
    user_id: uuid.UUID | None = Query(None, description="Filter by employee"),
    invoice_ref: str | None = Query(None, description="Invoice or transaction reference filter"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=500, description="Page size"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offset = (page - 1) * limit
    records, total_count, summary = reports_service.query_controlled_transactions(
        db=db,
        start_date=start_date,
        end_date=end_date,
        medicine_id=medicine_id,
        controlled_schedule=controlled_schedule,
        transaction_type=transaction_type,
        customer_id=customer_id,
        user_id=user_id,
        invoice_ref=invoice_ref,
        limit=limit,
        offset=offset,
    )

    return ControlledReportResponse(
        records=[ControlledTransactionItemOut(**r) for r in records],
        total_count=total_count,
        page=page,
        limit=limit,
        summary=ControlledReportSummaryOut(**summary),
    )


@router.get(
    "/controlled-medicines/export-excel",
    dependencies=[Depends(require_roles(*CAN_VIEW_CONTROLLED_REPORTS))],
)
def export_controlled_medicines_excel(
    request: Request,
    start_date: date | None = Query(None, description="Start date (inclusive)"),
    end_date: date | None = Query(None, description="End date (inclusive)"),
    medicine_id: uuid.UUID | None = Query(None, description="Filter by specific medicine"),
    controlled_schedule: str | None = Query(None, description="Filter by controlled schedule"),
    transaction_type: str | None = Query(None, description="Transaction type: all, sale, return, adjustment"),
    customer_id: uuid.UUID | None = Query(None, description="Filter by customer account"),
    user_id: uuid.UUID | None = Query(None, description="Filter by employee"),
    invoice_ref: str | None = Query(None, description="Invoice or transaction reference filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Fetch all records without pagination up to safety cap 10,000
    records, total_count, summary = reports_service.query_controlled_transactions(
        db=db,
        start_date=start_date,
        end_date=end_date,
        medicine_id=medicine_id,
        controlled_schedule=controlled_schedule,
        transaction_type=transaction_type,
        customer_id=customer_id,
        user_id=user_id,
        invoice_ref=invoice_ref,
        limit=10000,
        offset=0,
    )

    filters = {
        "start_date": start_date,
        "end_date": end_date,
        "medicine_id": str(medicine_id) if medicine_id else None,
        "controlled_schedule": controlled_schedule,
        "transaction_type": transaction_type,
        "customer_id": str(customer_id) if customer_id else None,
        "user_id": str(user_id) if user_id else None,
        "invoice_ref": invoice_ref,
    }

    # Generate Excel binary
    excel_bytes = reports_service.generate_controlled_medicines_excel(
        records=records,
        summary=summary,
        filters=filters,
        exported_by=current_user,
    )

    # Log immutable audit event
    client_ip = request.client.host if request.client else None
    reports_service.log_report_export_audit(
        db=db,
        user=current_user,
        action="EXPORT_CONTROLLED_MEDICINES_REPORT",
        filters=filters,
        record_count=total_count,
        ip_address=client_ip,
    )

    filename = f"controlled_medicines_audit_{date.today().isoformat()}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )
