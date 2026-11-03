from __future__ import annotations

import enum
import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import String, Numeric, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import str_enum
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.user import User
    from app.models.sale import Sale, SaleReturn


class CreditStatus(str, enum.Enum):
    DISABLED = "disabled"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class CreditTransactionType(str, enum.Enum):
    CREDIT_SALE = "credit_sale"
    PAYMENT = "payment"
    RETURN = "return"
    ADJUSTMENT = "adjustment"


class CustomerPaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    WALLET = "wallet"
    BANK_TRANSFER = "bank_transfer"


class CustomerPayment(Base, TimestampMixin):
    """Represents a payment received from a customer towards their credit balance."""

    __tablename__ = "customer_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_method: Mapped[CustomerPaymentMethod] = mapped_column(
        str_enum(CustomerPaymentMethod, "customer_payment_method"),
        nullable=False,
        default=CustomerPaymentMethod.CASH,
    )
    notes: Mapped[str | None] = mapped_column(String(255))
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    customer: Mapped[Customer] = relationship(back_populates="payments")
    user: Mapped[User | None] = relationship()
    credit_transactions: Mapped[list[CustomerCreditTransaction]] = relationship(
        back_populates="payment"
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_customer_payment_amount_pos"),
    )

    def __repr__(self) -> str:
        return f"<CustomerPayment {self.id} customer={self.customer_id} amount={self.amount}>"


class CustomerCreditTransaction(Base, TimestampMixin):
    """
    Append-only financial transaction ledger.
    Every credit sale, payment, return, or adjustment appends a row here.
    The customer's current outstanding balance is derived from this ledger.
    """

    __tablename__ = "customer_credit_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    transaction_type: Mapped[CreditTransactionType] = mapped_column(
        str_enum(CreditTransactionType, "credit_transaction_type"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    balance_after: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    sale_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales.id", ondelete="SET NULL"), index=True
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customer_payments.id", ondelete="SET NULL"),
        index=True,
    )
    return_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sale_returns.id", ondelete="SET NULL"),
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    customer: Mapped[Customer] = relationship(back_populates="credit_transactions")
    sale: Mapped[Sale | None] = relationship()
    payment: Mapped[CustomerPayment | None] = relationship(
        back_populates="credit_transactions"
    )
    sale_return: Mapped[SaleReturn | None] = relationship()
    user: Mapped[User | None] = relationship()

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_credit_tx_amount_pos"),
    )

    def __repr__(self) -> str:
        return (
            f"<CreditTx {self.id} type={self.transaction_type} "
            f"amount={self.amount} balance_after={self.balance_after}>"
        )
