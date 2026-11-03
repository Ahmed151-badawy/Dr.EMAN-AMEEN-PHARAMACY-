import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.sale import PaymentMethod, SaleStatus


class SaleItemRequest(BaseModel):
    """One line the cashier scanned/added to the cart. Batch selection is
    automatic (FEFO)."""

    medicine_id: uuid.UUID
    quantity: int = Field(gt=0)
    package_unit_id: uuid.UUID | None = None


class SaleCreate(BaseModel):
    customer_id: uuid.UUID | None = None  # null = walk-in / no customer on file
    payment_method: PaymentMethod = PaymentMethod.CASH
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    items: list[SaleItemRequest] = Field(min_length=1)

    # Controlled Medicines Audit Trail & Purchaser Attribution
    purchaser_name: str | None = Field(default=None, max_length=150)
    purchaser_id_number: str | None = Field(default=None, max_length=50)
    purchaser_phone: str | None = Field(default=None, max_length=30)
    prescription_reference: str | None = Field(default=None, max_length=100)
    doctor_name: str | None = Field(default=None, max_length=150)
    doctor_license: str | None = Field(default=None, max_length=50)
    prescription_date: date | None = None


class SaleItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    medicine_id: uuid.UUID
    medicine_name: str
    batch_id: uuid.UUID
    batch_number: str | None
    package_unit_id: uuid.UUID | None = None
    unit_name: str | None = None
    conversion_factor: Decimal = Decimal("1.0")
    base_quantity: int = 1
    quantity: int
    unit_price: Decimal
    total_price: Decimal

    # Historical Immutable Snapshots
    medicine_name_snapshot: str | None = None
    classification_snapshot: str | None = None
    controlled_schedule_snapshot: str | None = None
    batch_number_snapshot: str | None = None


class SaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID | None
    customer_name: str | None
    user_id: uuid.UUID | None
    user_full_name: str | None = None
    total_amount: Decimal
    discount: Decimal
    payment_method: PaymentMethod
    status: SaleStatus
    created_at: datetime
    items: list[SaleItemOut]

    # Controlled Medicines Audit Trail & Purchaser Attribution
    has_controlled_medicine: bool = False
    purchaser_name: str | None = None
    purchaser_id_number: str | None = None
    purchaser_phone: str | None = None
    prescription_reference: str | None = None
    doctor_name: str | None = None
    doctor_license: str | None = None
    prescription_date: date | None = None


class SaleSummary(BaseModel):
    """Lightweight version for list views — no line items."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID | None
    customer_name: str | None
    user_id: uuid.UUID | None = None
    user_full_name: str | None = None
    total_amount: Decimal
    discount: Decimal
    payment_method: PaymentMethod
    status: SaleStatus
    has_controlled_medicine: bool = False
    purchaser_name: str | None = None
    created_at: datetime


class SaleReturnCreate(BaseModel):
    sale_item_id: uuid.UUID
    quantity: int = Field(gt=0)
    reason: str | None = None
    restock: bool = True


class SaleReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sale_item_id: uuid.UUID
    quantity: int
    reason: str | None
    restocked: bool
    created_at: datetime
