from datetime import date
import enum
from typing import TYPE_CHECKING
import uuid

from sqlalchemy import String, Numeric, Integer, ForeignKey, CheckConstraint, Boolean, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import str_enum
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.medicine import Medicine, MedicineBatch, MedicinePackageUnit
    from app.models.user import User


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    WALLET = "wallet"
    INSURANCE = "insurance"
    CREDIT = "credit"


class SaleStatus(str, enum.Enum):
    COMPLETED = "completed"
    PARTIALLY_RETURNED = "partially_returned"
    RETURNED = "returned"
    VOID = "void"


class Sale(Base, TimestampMixin):
    __tablename__ = "sales"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        str_enum(PaymentMethod, "payment_method"), nullable=False, default=PaymentMethod.CASH
    )
    status: Mapped[SaleStatus] = mapped_column(
        str_enum(SaleStatus, "sale_status"), nullable=False, default=SaleStatus.COMPLETED
    )

    # Controlled Medicines Audit Trail & Purchaser Attribution
    has_controlled_medicine: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    purchaser_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    purchaser_id_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    purchaser_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    prescription_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    doctor_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    doctor_license: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prescription_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    customer: Mapped["Customer"] = relationship(back_populates="sales")
    user: Mapped["User | None"] = relationship()
    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="ck_sale_total_nonneg"),
        CheckConstraint("discount >= 0", name="ck_sale_discount_nonneg"),
    )

    def __repr__(self) -> str:
        return f"<Sale {self.id} total={self.total_amount}>"


class SaleItem(Base, TimestampMixin):
    __tablename__ = "sale_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales.id", ondelete="CASCADE"), nullable=False
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="RESTRICT"), nullable=False
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicine_batches.id", ondelete="RESTRICT"), nullable=False
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

    # Immutable Historical Transaction Snapshots
    medicine_name_snapshot: Mapped[str | None] = mapped_column(String(200), nullable=True)
    classification_snapshot: Mapped[str | None] = mapped_column(String(50), nullable=True)
    controlled_schedule_snapshot: Mapped[str | None] = mapped_column(String(50), nullable=True)
    batch_number_snapshot: Mapped[str | None] = mapped_column(String(100), nullable=True)

    sale: Mapped["Sale"] = relationship(back_populates="items")
    medicine: Mapped["Medicine"] = relationship()
    batch: Mapped["MedicineBatch"] = relationship()
    package_unit: Mapped["MedicinePackageUnit | None"] = relationship()

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_sale_item_qty_positive"),
        CheckConstraint("conversion_factor > 0", name="ck_sale_item_conversion_factor_positive"),
        CheckConstraint("base_quantity > 0", name="ck_sale_item_base_qty_positive"),
        CheckConstraint("unit_price >= 0", name="ck_sale_item_price_nonneg"),
    )


class SaleReturn(Base, TimestampMixin):
    """Return-to-stock record, linked back to the original sale line item."""

    __tablename__ = "sale_returns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sale_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sale_items.id", ondelete="CASCADE"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255))
    restocked: Mapped[bool] = mapped_column(default=True)

    sale_item: Mapped["SaleItem"] = relationship()

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_sale_return_qty_positive"),
    )
