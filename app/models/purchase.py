import enum
from typing import TYPE_CHECKING
import uuid

from sqlalchemy import Numeric, Integer, ForeignKey, CheckConstraint, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import str_enum
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.medicine import Medicine, MedicineBatch
    from app.models.supplier import Supplier


class PurchaseStatus(str, enum.Enum):
    ORDERED = "ordered"
    RECEIVED = "received"
    CANCELLED = "cancelled"


class Purchase(Base, TimestampMixin):
    """A restocking order/delivery from a supplier. Receiving a purchase is
    what creates new MedicineBatch rows and feeds inventory_movements."""

    __tablename__ = "purchases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    status: Mapped[PurchaseStatus] = mapped_column(
        str_enum(PurchaseStatus, "purchase_status"),
        nullable=False,
        default=PurchaseStatus.ORDERED,
    )
    # Free-text notes: invoice number, delivery note reference, etc.
    notes: Mapped[str | None] = mapped_column(String(500))

    supplier: Mapped["Supplier"] = relationship(back_populates="purchases")
    items: Mapped[list["PurchaseItem"]] = relationship(
        back_populates="purchase", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="ck_purchase_total_nonneg"),
    )


class PurchaseItem(Base, TimestampMixin):
    __tablename__ = "purchase_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    purchase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="RESTRICT"), nullable=False
    )
    # Set once the delivery is received and a batch is created for it.
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicine_batches.id", ondelete="SET NULL")
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    package_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicine_package_units.id", ondelete="SET NULL"), nullable=True
    )
    unit_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    conversion_factor: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=1.0)
    base_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    total_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    purchase: Mapped["Purchase"] = relationship(back_populates="items")
    medicine: Mapped["Medicine"] = relationship()
    batch: Mapped["MedicineBatch"] = relationship()
    package_unit: Mapped["MedicinePackageUnit | None"] = relationship()

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_purchase_item_qty_positive"),
        CheckConstraint("conversion_factor > 0", name="ck_purchase_item_conversion_factor_positive"),
        CheckConstraint("base_quantity > 0", name="ck_purchase_item_base_qty_positive"),
        CheckConstraint("unit_price >= 0", name="ck_purchase_item_price_nonneg"),
    )
