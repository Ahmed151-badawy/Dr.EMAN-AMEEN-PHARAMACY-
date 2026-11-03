import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.credit import CreditStatus, CreditTransactionType, CustomerPaymentMethod


class CustomerCreditAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    credit_status: CreditStatus
    credit_limit: Decimal
    payment_terms_days: int | None
    outstanding_balance: Decimal
    available_credit: Decimal


class CustomerCreditAccountUpdate(BaseModel):
    credit_status: CreditStatus | None = None
    credit_limit: Decimal | None = Field(None, ge=0)
    payment_terms_days: int | None = Field(None, ge=0)


class CustomerPaymentCreate(BaseModel):
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    payment_method: CustomerPaymentMethod = CustomerPaymentMethod.CASH
    notes: str | None = None


class CustomerPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    amount: Decimal
    payment_method: CustomerPaymentMethod
    notes: str | None
    user_id: uuid.UUID | None
    created_at: datetime


class CustomerCreditTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    transaction_type: CreditTransactionType
    amount: Decimal
    balance_after: Decimal | None
    sale_id: uuid.UUID | None
    payment_id: uuid.UUID | None
    return_id: uuid.UUID | None
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime


class CustomerReceivableOut(BaseModel):
    customer_id: uuid.UUID
    customer_name: str
    customer_phone: str | None
    credit_status: CreditStatus
    credit_limit: Decimal
    outstanding_balance: Decimal
    available_credit: Decimal
