import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.inventory_movement import MovementReason
from app.models.purchase import PurchaseStatus


# ---------------------------------------------------------------------------
# Purchase creation
# ---------------------------------------------------------------------------

class PurchaseItemRequest(BaseModel):
    """One line item on a purchase order."""

    medicine_id: uuid.UUID
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    package_unit_id: uuid.UUID | None = None
    batch_number: str | None = None
    expiry_date: date | None = None


class PurchaseCreate(BaseModel):
    supplier_id: uuid.UUID | None = None
    notes: str | None = None
    items: list[PurchaseItemRequest] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Purchase receiving
# ---------------------------------------------------------------------------

class ReceiveItemIn(BaseModel):
    """Per-item detail supplied at receive time."""

    purchase_item_id: uuid.UUID
    expiry_date: date
    batch_number: str | None = None


class ReceivePurchaseIn(BaseModel):
    """Body for POST /purchases/{id}/receive."""

    items: list[ReceiveItemIn] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Write-off
# ---------------------------------------------------------------------------

# Allowed reasons for a manual write-off (subset of MovementReason).
WRITE_OFF_REASONS = {
    MovementReason.EXPIRY_WRITE_OFF,
    MovementReason.DAMAGE_WRITE_OFF,
    MovementReason.MANUAL_ADJUSTMENT,
    MovementReason.STOCK_TAKE_CORRECTION,
}


class WriteOffRequest(BaseModel):
    batch_id: uuid.UUID
    quantity: int = Field(gt=0, description="Units to remove from this batch")
    reason: MovementReason = Field(
        description=(
            "Must be one of: expiry_write_off, damage_write_off, "
            "manual_adjustment, stock_take_correction"
        )
    )
    notes: str | None = Field(default=None, max_length=255)


# ---------------------------------------------------------------------------
# Output schemas
# ---------------------------------------------------------------------------

class PurchaseItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    purchase_id: uuid.UUID
    medicine_id: uuid.UUID
    medicine_name: str          # resolved by the router/service
    batch_id: uuid.UUID | None  # None until the purchase is received
    package_unit_id: uuid.UUID | None = None
    unit_name: str | None = None
    conversion_factor: Decimal = Decimal("1.0")
    base_quantity: int = 1
    quantity: int
    unit_price: Decimal
    total_price: Decimal


class PurchaseOut(BaseModel):
    """Full purchase response including line items."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    supplier_id: uuid.UUID | None
    supplier_name: str | None   # resolved by router/service
    user_id: uuid.UUID | None
    total_amount: Decimal
    status: PurchaseStatus
    notes: str | None
    created_at: datetime
    updated_at: datetime
    items: list[PurchaseItemOut]


class PurchaseSummary(BaseModel):
    """Lightweight version for list views — no line items."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    supplier_id: uuid.UUID | None
    supplier_name: str | None
    total_amount: Decimal
    status: PurchaseStatus
    created_at: datetime


# ---------------------------------------------------------------------------
# Inventory movement output
# ---------------------------------------------------------------------------

class InventoryMovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    medicine_id: uuid.UUID
    medicine_name: str | None   # resolved by router
    batch_id: uuid.UUID | None
    quantity_change: int
    reason: MovementReason
    reference_type: str | None
    reference_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: datetime
