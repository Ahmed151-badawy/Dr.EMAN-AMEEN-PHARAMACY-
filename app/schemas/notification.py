import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.notification import NotificationSeverity, NotificationType


class NotificationOut(BaseModel):
    """Full notification response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: NotificationType
    severity: NotificationSeverity
    title: str
    message: str
    related_medicine_id: uuid.UUID | None
    related_batch_id: uuid.UUID | None
    is_read: bool
    is_resolved: bool
    created_at: datetime
    updated_at: datetime


class AlertCheckResult(BaseModel):
    """Response for POST /notifications/run-checks."""
    created: int
    resolved: int
