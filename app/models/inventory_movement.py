import enum
import uuid

from sqlalchemy import Integer, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import str_enum
from app.models.mixins import TimestampMixin


class MovementReason(str, enum.Enum):
    PURCHASE_RECEIVED = "purchase_received"
    SALE = "sale"
    SALE_RETURN = "sale_return"
    EXPIRY_WRITE_OFF = "expiry_write_off"
    DAMAGE_WRITE_OFF = "damage_write_off"
    MANUAL_ADJUSTMENT = "manual_adjustment"
    STOCK_TAKE_CORRECTION = "stock_take_correction"


class InventoryMovement(Base, TimestampMixin):
    """
    Append-only ledger of every stock change. Never update quantity on a
    Medicine/MedicineBatch without writing a corresponding row here — this
    table is both the audit trail and the training data for demand
    forecasting (Phase 7).
    """

    __tablename__ = "inventory_movements"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicine_batches.id", ondelete="SET NULL")
    )
    # Positive = stock added, negative = stock removed.
    quantity_change: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[MovementReason] = mapped_column(
        str_enum(MovementReason, "movement_reason"), nullable=False
    )
    # Loose reference to the originating record (sale, purchase, etc.) so we
    # don't need a separate FK column per possible source table.
    reference_type: Mapped[str | None] = mapped_column(String(50))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    medicine: Mapped["Medicine"] = relationship()
    batch: Mapped["MedicineBatch"] = relationship()

    def __repr__(self) -> str:
        return f"<InventoryMovement {self.reason} {self.quantity_change:+d}>"
