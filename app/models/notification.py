import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import str_enum
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.medicine import Medicine, MedicineBatch


class NotificationType(str, enum.Enum):
    LOW_STOCK = "low_stock"
    EXPIRING_SOON = "expiring_soon"
    EXPIRED = "expired"
    STOCKOUT_PREDICTED = "stockout_predicted"
    REORDER_SUGGESTED = "reorder_suggested"


class NotificationSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    type: Mapped[NotificationType] = mapped_column(
        str_enum(NotificationType, "notification_type"), nullable=False
    )
    severity: Mapped[NotificationSeverity] = mapped_column(
        str_enum(NotificationSeverity, "notification_severity"),
        nullable=False,
        default=NotificationSeverity.INFO,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)

    # Medicine-level reference (used by LOW_STOCK and as the parent for batch alerts)
    related_medicine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="CASCADE")
    )
    # Batch-level reference (used by EXPIRING_SOON and EXPIRED for per-batch dedup)
    related_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicine_batches.id", ondelete="SET NULL")
    )

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Lifecycle flag: True once the underlying condition is no longer active.
    # Resolved notifications remain visible in history but do not count as
    # "active" for duplicate-prevention purposes.
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    related_medicine: Mapped["Medicine"] = relationship(foreign_keys=[related_medicine_id])
    related_batch: Mapped["MedicineBatch"] = relationship(foreign_keys=[related_batch_id])
