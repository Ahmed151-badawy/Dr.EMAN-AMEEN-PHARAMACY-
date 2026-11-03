import uuid
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.inventory_import import InventoryImportSession
from app.models.inventory_movement import InventoryMovement, MovementReason
from app.models.medicine import Medicine, MedicineBatch
from app.models.user import User, UserRole
from app.schemas.inventory_import import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewReport,
    ImportSessionSummaryOut,
)
from app.schemas.purchase import InventoryMovementOut, WriteOffRequest
from app.services import inventory_import as import_service
from app.services import purchases as purchase_service

router = APIRouter(prefix="/inventory", tags=["inventory"])

# Write-offs are a privileged destructive operation.
CAN_WRITE_OFF = (UserRole.ADMIN, UserRole.PHARMACIST, UserRole.INVENTORY_MANAGER)


@router.get("/movements", response_model=list[InventoryMovementOut])
def list_movements(
    medicine_id: uuid.UUID | None = Query(None, description="Filter by medicine"),
    batch_id: uuid.UUID | None = Query(None, description="Filter by batch"),
    reason: MovementReason | None = Query(None, description="Filter by movement reason"),
    from_date: date | None = Query(None, description="Inclusive start date"),
    to_date: date | None = Query(None, description="Inclusive end date"),
    reference_type: str | None = Query(None, description="e.g. 'sale', 'purchase', 'write_off'"),
    limit: int = Query(200, ge=1, le=1000, description="Max rows returned"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """
    Inventory movement ledger — every stock change ever recorded.
    The same table feeds demand forecasting (Phase 7), so it is append-only
    and never modified retroactively.
    """
    stmt = select(InventoryMovement)

    if medicine_id:
        stmt = stmt.where(InventoryMovement.medicine_id == medicine_id)
    if batch_id:
        stmt = stmt.where(InventoryMovement.batch_id == batch_id)
    if reason:
        stmt = stmt.where(InventoryMovement.reason == reason)
    if reference_type:
        stmt = stmt.where(InventoryMovement.reference_type == reference_type)
    if from_date:
        stmt = stmt.where(InventoryMovement.created_at >= datetime.combine(from_date, time.min))
    if to_date:
        stmt = stmt.where(InventoryMovement.created_at <= datetime.combine(to_date, time.max))

    stmt = stmt.order_by(InventoryMovement.created_at.desc()).limit(limit)

    movements = db.scalars(stmt).all()

    # Batch-resolve medicine names to avoid N+1.
    med_ids = {m.medicine_id for m in movements}
    med_names: dict[uuid.UUID, str] = {}
    if med_ids:
        for med in db.scalars(select(Medicine).where(Medicine.id.in_(med_ids))):
            med_names[med.id] = med.name

    return [
        InventoryMovementOut(
            id=mv.id,
            medicine_id=mv.medicine_id,
            medicine_name=med_names.get(mv.medicine_id),
            batch_id=mv.batch_id,
            quantity_change=mv.quantity_change,
            reason=mv.reason,
            reference_type=mv.reference_type,
            reference_id=mv.reference_id,
            created_by=mv.created_by,
            created_at=mv.created_at,
        )
        for mv in movements
    ]


@router.post(
    "/write-off",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(*CAN_WRITE_OFF))],
)
def write_off(
    payload: WriteOffRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Write off stock from a specific batch.

    Allowed reasons:
    - expiry_write_off       — batch has expired
    - damage_write_off       — units are damaged / unsellable
    - manual_adjustment      — general correction
    - stock_take_correction  — physical count differs from system

    The operation is atomic: the batch quantity and ledger entry are always
    written together. Will 409 if there is insufficient stock.
    """
    purchase_service.write_off_stock(db, payload, current_user)
    # 204 No Content — no response body.


# ---------------------------------------------------------------------------
# Excel Inventory Import Workflow (Phase 2)
# ---------------------------------------------------------------------------

CAN_IMPORT = (UserRole.ADMIN, UserRole.PHARMACIST, UserRole.INVENTORY_MANAGER)


@router.post(
    "/import/preview",
    response_model=ImportPreviewReport,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(*CAN_IMPORT))],
)
async def preview_inventory_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stage A: Preview and validate Excel inventory file.
    Does NOT modify the database or production stock.
    Returns comprehensive validation report including duplicate candidates,
    quarantine items, and price anomalies.
    """
    if not (file.filename and file.filename.endswith((".xlsx", ".xlsm"))):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a valid Excel (.xlsx) file.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    return import_service.parse_and_validate_workbook(
        file_bytes=content,
        filename=file.filename,
        db=db,
        current_user=current_user,
    )


@router.post(
    "/import/commit",
    response_model=ImportCommitResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(*CAN_IMPORT))],
)
def commit_inventory_import(
    payload: ImportCommitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stage B: Controlled transactional commit of approved inventory records.
    Only approved records are imported.
    Medicines are created first, followed by batches.
    ALL batch quantities are strictly initialized to 0 (opening stock handled in Phase 3).
    Operation is idempotent and fully atomic.
    """
    return import_service.commit_approved_import(
        db=db,
        request=payload,
        current_user=current_user,
    )


@router.get(
    "/import/sessions",
    response_model=list[ImportSessionSummaryOut],
    dependencies=[Depends(require_roles(*CAN_IMPORT))],
)
def list_import_sessions(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """List recent import sessions with status and metrics."""
    return db.scalars(
        select(InventoryImportSession)
        .order_by(InventoryImportSession.created_at.desc())
        .limit(limit)
    ).all()


@router.get(
    "/import/sessions/{session_id}",
    response_model=ImportPreviewReport,
    dependencies=[Depends(require_roles(*CAN_IMPORT))],
)
def get_import_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Retrieve full preview report for a specific import session."""
    session = db.get(InventoryImportSession, session_id)
    if not session or not session.report_json:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import session or report not found.",
        )
    import json
    return json.loads(session.report_json)
