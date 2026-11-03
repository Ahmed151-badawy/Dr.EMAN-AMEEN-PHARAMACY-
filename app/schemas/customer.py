import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.credit import CreditStatus


class CustomerCreate(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    date_of_birth: date | None = None


class CustomerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    date_of_birth: date | None = None


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: str | None
    email: str | None
    address: str | None
    date_of_birth: date | None
    credit_status: CreditStatus = CreditStatus.DISABLED
    credit_limit: Decimal = Decimal("0.00")
    payment_terms_days: int | None = 30
    created_at: datetime


class TopMedicineItem(BaseModel):
    medicine_id: uuid.UUID
    medicine_name: str
    total_quantity: int
    total_spent: Decimal


class CustomerStats(BaseModel):
    """
    Purchase-behavior summary for one customer. total_spent reflects
    invoiced sale totals (net of discounts) — since this system doesn't
    currently track a monetary refund amount on returns, total_spent is not
    reduced by returns. Treat it as "amount invoiced," not "net revenue."
    """

    customer_id: uuid.UUID
    total_visits: int
    total_spent: Decimal
    average_basket_value: Decimal
    first_purchase_date: datetime | None
    last_purchase_date: datetime | None
    top_medicines: list[TopMedicineItem]
