"""
Phase 6 - Notification API
===========================
GET  /notifications                 - List with filters (type, severity, unread, resolved)
PATCH /notifications/{id}/read      - Mark one notification as read
PATCH /notifications/read-all       - Mark all unread as read
POST  /notifications/run-checks     - Trigger inventory alert scan (admin / inventory manager)
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.notification import Notification, NotificationSeverity, NotificationType
from app.models.user import User, UserRole
from app.schemas.notification import AlertCheckResult, NotificationOut
from app.services.notifications import run_inventory_alert_checks

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Only admins and inventory managers may trigger a scan manually
CAN_RUN_CHECKS = (UserRole.ADMIN, UserRole.INVENTORY_MANAGER)


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    unread: bool | None = Query(None, description="True = unread only, False = read only"),
    resolved: bool | None = Query(
        False,
        description="False (default) = active only, True = resolved only, None = all",
    ),
    type: NotificationType | None = Query(None, description="Filter by notification type"),
    severity: NotificationSeverity | None = Query(None, description="Filter by severity"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """
    List notifications.

    Default behaviour returns only **active (unresolved)** notifications, newest first.
    Pass `?resolved=true` to see the history of resolved alerts.
    Pass `?resolved=` (empty) or omit for all.
    """
    stmt = select(Notification)

    if resolved is not None:
        stmt = stmt.where(Notification.is_resolved.is_(resolved))
    if unread is not None:
        stmt = stmt.where(Notification.is_read.is_(not unread))
    if type is not None:
        stmt = stmt.where(Notification.type == type)
    if severity is not None:
        stmt = stmt.where(Notification.severity == severity)

    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    return db.scalars(stmt).all()


@router.patch("/read-all", status_code=status.HTTP_200_OK)
def mark_all_read(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Mark every unread notification as read."""
    unread = db.scalars(
        select(Notification).where(Notification.is_read.is_(False))
    ).all()
    for n in unread:
        n.is_read = True
    db.commit()
    return {"marked_read": len(unread)}


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_one_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Mark a single notification as read."""
    n = db.get(Notification, notification_id)
    if n is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n


@router.post(
    "/run-checks",
    response_model=AlertCheckResult,
    dependencies=[Depends(require_roles(*CAN_RUN_CHECKS))],
    status_code=status.HTTP_200_OK,
)
def run_checks(
    db: Session = Depends(get_db),
):
    """
    Manually trigger the full inventory alert scan.

    Checks: low stock, expiring batches, expired batches.
    Returns the number of notifications created and resolved.

    Restricted to ADMIN and INVENTORY_MANAGER roles.
    In production this will also be called automatically by the scheduler.
    """
    result = run_inventory_alert_checks(db)
    return result
