import uuid
from datetime import date, timedelta

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.inventory_movement import InventoryMovement, MovementReason
from app.models.medicine import Medicine, MedicineBatch


def get_total_stock(db: Session, medicine_id: uuid.UUID) -> int:
    """Sum of quantity across all batches of a medicine."""
    total = db.scalar(
        select(func.coalesce(func.sum(MedicineBatch.quantity), 0)).where(
            MedicineBatch.medicine_id == medicine_id
        )
    )
    return int(total or 0)


def get_fefo_batches(db: Session, medicine_id: uuid.UUID) -> list[MedicineBatch]:
    """
    Batches with stock remaining, ordered First-Expiry-First-Out: the batch
    expiring soonest comes first. This is the order dispensing should always
    follow so we don't end up with unsold near-expired stock while newer
    batches get sold first.
    """
    return list(
        db.scalars(
            select(MedicineBatch)
            .where(MedicineBatch.medicine_id == medicine_id, MedicineBatch.quantity > 0)
            .order_by(MedicineBatch.expiry_date.asc())
        )
    )


def record_movement(
    db: Session,
    *,
    medicine_id: uuid.UUID,
    batch_id: uuid.UUID | None,
    quantity_change: int,
    reason: MovementReason,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
) -> InventoryMovement:
    """
    Append-only write to the inventory ledger. Callers are responsible for
    also updating MedicineBatch.quantity in the same transaction — this
    function only records *why* it changed, it doesn't apply the change
    itself, so it can be called for both increases and decreases uniformly.
    """
    movement = InventoryMovement(
        medicine_id=medicine_id,
        batch_id=batch_id,
        quantity_change=quantity_change,
        reason=reason,
        reference_type=reference_type,
        reference_id=reference_id,
        created_by=created_by,
    )
    db.add(movement)
    return movement


def get_low_stock_medicines(db: Session) -> list[dict]:
    """
    Rule-based (non-AI) low stock check: total stock across all batches vs.
    the medicine's minimum_stock. This must keep working even if the AI
    forecasting service (Phase 7) is unavailable.
    """
    medicines = db.scalars(select(Medicine).where(Medicine.is_active.is_(True))).all()
    results = []
    for med in medicines:
        total = get_total_stock(db, med.id)
        if total <= med.minimum_stock:
            results.append(
                {
                    "medicine_id": med.id,
                    "name": med.name,
                    "current_stock": total,
                    "minimum_stock": med.minimum_stock,
                }
            )
    return results


def get_expiring_batches(db: Session, within_days: int | None = None) -> list[dict]:
    """
    Rule-based expiry check: batches expiring within `within_days` (defaults
    to settings.EXPIRY_WARNING_DAYS). Flags severity as "critical" inside
    settings.EXPIRY_CRITICAL_DAYS, "warning" otherwise.
    """
    horizon = within_days if within_days is not None else settings.EXPIRY_WARNING_DAYS
    cutoff = date.today() + timedelta(days=horizon)

    rows = db.execute(
        select(MedicineBatch, Medicine.name)
        .join(Medicine, Medicine.id == MedicineBatch.medicine_id)
        .where(MedicineBatch.quantity > 0, MedicineBatch.expiry_date <= cutoff)
        .order_by(MedicineBatch.expiry_date.asc())
    ).all()

    results = []
    for batch, medicine_name in rows:
        days_left = (batch.expiry_date - date.today()).days
        severity = "critical" if days_left <= settings.EXPIRY_CRITICAL_DAYS else "warning"
        results.append(
            {
                "batch_id": batch.id,
                "medicine_id": batch.medicine_id,
                "medicine_name": medicine_name,
                "batch_number": batch.batch_number,
                "expiry_date": batch.expiry_date,
                "days_left": days_left,
                "quantity": batch.quantity,
                "severity": severity,
            }
        )
    return results
