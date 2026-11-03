import enum
import uuid
from datetime import date

from sqlalchemy import String, Numeric, Boolean, Date, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import str_enum
from app.models.mixins import TimestampMixin


class FinancialPaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    WALLET = "wallet"
    BANK_TRANSFER = "bank_transfer"


class ExpenseCategory(Base, TimestampMixin):
    """Categories for pharmacy operating expenses (Rent, Electricity, Salaries, etc.)."""

    __tablename__ = "expense_categories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name_ar: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    expenses: Mapped[list["Expense"]] = relationship(back_populates="category")

    def __repr__(self) -> str:
        return f"<ExpenseCategory {self.name}>"


class Expense(Base, TimestampMixin):
    """Pharmacy operating expense transaction (Rent, Utilities, Wages, Maintenance, etc.)."""

    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("expense_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    payment_method: Mapped[FinancialPaymentMethod] = mapped_column(
        str_enum(FinancialPaymentMethod, "financial_payment_method"),
        nullable=False,
        default=FinancialPaymentMethod.CASH,
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    category: Mapped["ExpenseCategory"] = relationship(back_populates="expenses")
    user: Mapped["User"] = relationship("User")

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_expense_amount_positive"),
    )

    def __repr__(self) -> str:
        return f"<Expense {self.description}: {self.amount}>"


class SupplierPayment(Base, TimestampMixin):
    """Payment disbursement made to a pharmaceutical supplier."""

    __tablename__ = "supplier_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    purchase_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purchases.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    payment_method: Mapped[FinancialPaymentMethod] = mapped_column(
        str_enum(FinancialPaymentMethod, "financial_payment_method"),
        nullable=False,
        default=FinancialPaymentMethod.CASH,
    )
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    supplier: Mapped["Supplier"] = relationship("Supplier")
    purchase: Mapped["Purchase"] = relationship("Purchase")
    user: Mapped["User"] = relationship("User")

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_supplier_payment_amount_positive"),
    )

    def __repr__(self) -> str:
        return f"<SupplierPayment supplier={self.supplier_id}: {self.amount}>"
