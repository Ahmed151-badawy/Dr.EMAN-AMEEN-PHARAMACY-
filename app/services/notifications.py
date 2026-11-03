"""
Phase 6 - Inventory Intelligence: Notification Service
=======================================================
Rule-based alert generation (no ML). Calls the existing inventory helpers
and creates / resolves Notification rows idempotently.

Public API
----------
run_inventory_alert_checks(db) -> dict
    Orchestrates all three checks; returns {"created": int, "resolved": int}.

check_low_stock(db) -> tuple[int, int]
check_expiring_batches(db) -> tuple[int, int]
check_expired_batches(db) -> tuple[int, int]
    Each returns (created_count, resolved_count).
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.medicine import MedicineBatch, Medicine
from app.models.notification import (
    Notification,
    NotificationSeverity,
    NotificationType,
)
from app.services.inventory import (
    get_expiring_batches,
    get_low_stock_medicines,
)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _active_notification(
    db: Session,
    *,
    ntype: NotificationType,
    medicine_id: Optional[uuid.UUID],
    batch_id: Optional[uuid.UUID],
) -> Notification | None:
    """Return the single unresolved notification matching (type, medicine, batch).

    The composite key uniquely identifies what the alert is about:
      - LOW_STOCK:     (LOW_STOCK,    medicine_id, None)
      - EXPIRING_SOON: (EXPIRING_SOON, medicine_id, batch_id)
      - EXPIRED:       (EXPIRED,       medicine_id, batch_id)
    """
    stmt = select(Notification).where(
        Notification.type == ntype,
        Notification.is_resolved.is_(False),
    )
    if medicine_id is not None:
        stmt = stmt.where(Notification.related_medicine_id == medicine_id)
    else:
        stmt = stmt.where(Notification.related_medicine_id.is_(None))

    if batch_id is not None:
        stmt = stmt.where(Notification.related_batch_id == batch_id)
    else:
        stmt = stmt.where(Notification.related_batch_id.is_(None))

    return db.scalar(stmt)


def _create_notification(
    db: Session,
    *,
    ntype: NotificationType,
    severity: NotificationSeverity,
    title: str,
    message: str,
    medicine_id: Optional[uuid.UUID] = None,
    batch_id: Optional[uuid.UUID] = None,
) -> Notification:
    """Insert a new Notification row. Caller must commit."""
    n = Notification(
        type=ntype,
        severity=severity,
        title=title,
        message=message,
        related_medicine_id=medicine_id,
        related_batch_id=batch_id,
        is_read=False,
        is_resolved=False,
    )
    db.add(n)
    return n


def _resolve_stale(
    db: Session,
    *,
    ntype: NotificationType,
    still_active_ids: set[uuid.UUID],
    id_field: str,
) -> int:
    """Resolve all unresolved notifications of `ntype` whose referenced ID
    is not in `still_active_ids`.

    `id_field` must be either 'related_medicine_id' or 'related_batch_id'.
    Returns the number of notifications resolved.
    """
    col = getattr(Notification, id_field)
    active_rows = db.scalars(
        select(Notification).where(
            Notification.type == ntype,
            Notification.is_resolved.is_(False),
        )
    ).all()
    count = 0
    for n in active_rows:
        if getattr(n, id_field) not in still_active_ids:
            n.is_resolved = True
            count += 1
    return count


# ---------------------------------------------------------------------------
# Public check functions
# ---------------------------------------------------------------------------

def check_low_stock(db: Session) -> tuple[int, int]:
    """
    Compare each active medicine's total stock against its minimum_stock.

    Severity rules
    --------------
    stock == 0                  -> CRITICAL
    0 < stock <= minimum_stock  -> WARNING

    Idempotency
    -----------
    If an unresolved LOW_STOCK notification already exists for a medicine, no
    new notification is created (severity/message are updated in-place if the
    stock level changes between runs).
    If a medicine's stock is now above its minimum, any active LOW_STOCK
    notification is resolved.
    """
    created = 0
    resolved = 0
    low_stock_items = get_low_stock_medicines(db)
    low_medicine_ids: set[uuid.UUID] = {item["medicine_id"] for item in low_stock_items}

    for item in low_stock_items:
        med_id: uuid.UUID = item["medicine_id"]
        current: int = item["current_stock"]
        minimum: int = item["minimum_stock"]
        name: str = item["name"]

        severity = (
            NotificationSeverity.CRITICAL
            if current == 0
            else NotificationSeverity.WARNING
        )
        title = f"Low Stock: {name}"
        message = (
            f"{name} has {current} unit(s) remaining (minimum: {minimum})."
            + (" Stock is ZERO — immediate action required." if current == 0 else "")
        )

        existing = _active_notification(
            db, ntype=NotificationType.LOW_STOCK, medicine_id=med_id, batch_id=None
        )
        if existing is None:
            _create_notification(
                db,
                ntype=NotificationType.LOW_STOCK,
                severity=severity,
                title=title,
                message=message,
                medicine_id=med_id,
            )
            created += 1
        else:
            # Escalate / de-escalate severity as stock changes between runs
            existing.severity = severity
            existing.title = title
            existing.message = message

    # Resolve for medicines that are now above minimum
    resolved += _resolve_stale(
        db,
        ntype=NotificationType.LOW_STOCK,
        still_active_ids=low_medicine_ids,
        id_field="related_medicine_id",
    )

    db.commit()
    return created, resolved


def check_expiring_batches(db: Session) -> tuple[int, int]:
    """
    Check batches expiring within EXPIRY_WARNING_DAYS (default 60).

    Severity rules
    --------------
    days_left <= EXPIRY_CRITICAL_DAYS (14) -> CRITICAL
    days_left <= 30                        -> WARNING
    days_left <= EXPIRY_WARNING_DAYS (60)  -> INFO

    Idempotency
    -----------
    Deduplication key: (EXPIRING_SOON, medicine_id, batch_id).
    Severity is updated in-place if the batch approaches its expiry between runs.
    Notifications for batches that no longer qualify (quantity sold/written to 0,
    or past the warning horizon for some other reason) are resolved.
    """
    created = 0
    resolved = 0

    expiring = get_expiring_batches(db)  # already filtered by EXPIRY_WARNING_DAYS
    expiring_batch_ids: set[uuid.UUID] = {item["batch_id"] for item in expiring}

    for item in expiring:
        batch_id: uuid.UUID = item["batch_id"]
        med_id: uuid.UUID = item["medicine_id"]
        med_name: str = item["medicine_name"]
        days_left: int = item["days_left"]
        batch_number: str | None = item["batch_number"]
        expiry_date: date = item["expiry_date"]

        if days_left <= settings.EXPIRY_CRITICAL_DAYS:
            severity = NotificationSeverity.CRITICAL
        elif days_left <= 30:
            severity = NotificationSeverity.WARNING
        else:
            severity = NotificationSeverity.INFO

        batch_label = batch_number or str(batch_id)[:8]
        title = f"Expiring Soon: {med_name} (Batch {batch_label})"
        message = (
            f"Batch {batch_label} of {med_name} expires on {expiry_date} "
            f"({days_left} day(s) remaining). Quantity: {item['quantity']}."
        )

        existing = _active_notification(
            db,
            ntype=NotificationType.EXPIRING_SOON,
            medicine_id=med_id,
            batch_id=batch_id,
        )
        if existing is None:
            _create_notification(
                db,
                ntype=NotificationType.EXPIRING_SOON,
                severity=severity,
                title=title,
                message=message,
                medicine_id=med_id,
                batch_id=batch_id,
            )
            created += 1
        else:
            # Severity can escalate as expiry date approaches
            existing.severity = severity
            existing.title = title
            existing.message = message

    # Resolve EXPIRING_SOON for batches that no longer qualify
    resolved += _resolve_stale(
        db,
        ntype=NotificationType.EXPIRING_SOON,
        still_active_ids=expiring_batch_ids,
        id_field="related_batch_id",
    )

    db.commit()
    return created, resolved


def check_expired_batches(db: Session) -> tuple[int, int]:
    """
    Find batches where expiry_date < today and quantity > 0.
    These are CRITICAL EXPIRED alerts indicating stock that must be written off.

    Idempotency
    -----------
    Deduplication key: (EXPIRED, medicine_id, batch_id).
    Once the batch quantity reaches 0 (written off), the notification is resolved.
    """
    created = 0
    resolved = 0
    today = date.today()

    expired_rows = db.execute(
        select(MedicineBatch, Medicine.name)
        .join(Medicine, Medicine.id == MedicineBatch.medicine_id)
        .where(MedicineBatch.expiry_date < today, MedicineBatch.quantity > 0)
        .order_by(MedicineBatch.expiry_date.asc())
    ).all()

    expired_batch_ids: set[uuid.UUID] = set()
    for batch, med_name in expired_rows:
        expired_batch_ids.add(batch.id)
        days_expired = (today - batch.expiry_date).days
        batch_label = batch.batch_number or str(batch.id)[:8]
        title = f"Expired Stock: {med_name} (Batch {batch_label})"
        message = (
            f"Batch {batch_label} of {med_name} expired {days_expired} day(s) ago "
            f"(expiry: {batch.expiry_date}). Quantity remaining: {batch.quantity}. "
            f"Please write off this stock."
        )
        existing = _active_notification(
            db,
            ntype=NotificationType.EXPIRED,
            medicine_id=batch.medicine_id,
            batch_id=batch.id,
        )
        if existing is None:
            _create_notification(
                db,
                ntype=NotificationType.EXPIRED,
                severity=NotificationSeverity.CRITICAL,
                title=title,
                message=message,
                medicine_id=batch.medicine_id,
                batch_id=batch.id,
            )
            created += 1
        else:
            # Update message in case quantity changed since last run
            existing.title = title
            existing.message = message

    # Resolve EXPIRED notifications whose batches are now at zero
    resolved += _resolve_stale(
        db,
        ntype=NotificationType.EXPIRED,
        still_active_ids=expired_batch_ids,
        id_field="related_batch_id",
    )

    db.commit()
    return created, resolved


def run_inventory_alert_checks(db: Session) -> dict:
    """
    Orchestrate all three inventory alert checks in one call.

    Returns {"created": int, "resolved": int}.

    Designed to be called from:
      - POST /notifications/run-checks  (manual trigger via API)
      - A future scheduler / cron job
      - Docker HEALTHCHECK or startup hook
    """
    total_created = 0
    total_resolved = 0

    for check_fn in (check_low_stock, check_expiring_batches, check_expired_batches):
        c, r = check_fn(db)
        total_created += c
        total_resolved += r

    return {"created": total_created, "resolved": total_resolved}
