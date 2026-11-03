from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import String, Date, Numeric, Integer, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import str_enum
from app.models.credit import CreditStatus
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.sale import Sale
    from app.models.credit import CustomerCreditTransaction, CustomerPayment


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(150))
    address: Mapped[str | None] = mapped_column(String(255))
    date_of_birth: Mapped[date | None] = mapped_column(Date)

    credit_status: Mapped[CreditStatus] = mapped_column(
        str_enum(CreditStatus, "credit_status"),
        nullable=False,
        default=CreditStatus.DISABLED,
    )
    credit_limit: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    payment_terms_days: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=30
    )

    sales: Mapped[list[Sale]] = relationship(back_populates="customer")
    credit_transactions: Mapped[list[CustomerCreditTransaction]] = relationship(
        back_populates="customer"
    )
    payments: Mapped[list[CustomerPayment]] = relationship(
        back_populates="customer"
    )

    __table_args__ = (
        CheckConstraint("credit_limit >= 0", name="ck_customer_credit_limit_nonneg"),
    )

    def __repr__(self) -> str:
        return f"<Customer {self.name} credit_status={self.credit_status}>"
