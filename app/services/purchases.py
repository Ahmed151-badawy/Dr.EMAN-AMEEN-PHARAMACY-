"""
Purchase service — Phase 5B/5C/5D with multi-unit packaging support.

Responsibilities:
  create_purchase    — validate medicines, compute total, persist purchase + items with unit snapshots.
  receive_purchase   — atomic: create batches in base units, increase stock, write ledger entries,
                       update purchase status ORDERED → RECEIVED.
  write_off_stock    — controlled deduction from a single batch with full ledger entry.
"""

import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.inventory_movement import MovementReason
from app.models.medicine import Medicine, MedicineBatch, MedicinePackageUnit
from app.models.purchase import Purchase, PurchaseItem, PurchaseStatus
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.purchase import (
    PurchaseCreate,
    ReceivePurchaseIn,
    WRITE_OFF_REASONS,
    WriteOffRequest,
)
from app.services.inventory import record_movement


# ---------------------------------------------------------------------------
# 5B: Create purchase order
# ---------------------------------------------------------------------------

def create_purchase(db: Session, payload: PurchaseCreate, user: User) -> Purchase:
    """
    Persist a purchase order (status=ORDERED). Does NOT touch inventory —
    stock only enters the system when the order is received (Phase 5C).
    """
    # Validate supplier if supplied.
    if payload.supplier_id is not None:
        if db.get(Supplier, payload.supplier_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Supplier not found",
            )

    # Validate all medicines exist and are active before writing anything.
    medicine_cache: dict[uuid.UUID, Medicine] = {}
    for req in payload.items:
        if req.medicine_id not in medicine_cache:
            med = db.get(Medicine, req.medicine_id)
            if med is None or not med.is_active:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Medicine {req.medicine_id} not found or inactive",
                )
            medicine_cache[req.medicine_id] = med

    # Compute the total.
    total_amount = sum(
        Decimal(str(req.unit_price)) * req.quantity for req in payload.items
    )

    purchase = Purchase(
        supplier_id=payload.supplier_id,
        user_id=user.id,
        total_amount=total_amount,
        notes=payload.notes,
        status=PurchaseStatus.ORDERED,
    )
    db.add(purchase)
    db.flush()  # get purchase.id for items FK

    for req in payload.items:
        med = medicine_cache[req.medicine_id]
        pkg_unit = None
        conv_factor = Decimal("1.0")
        unit_name = med.base_unit_name or "Unit"

        if req.package_unit_id:
            pkg_unit = db.get(MedicinePackageUnit, req.package_unit_id)
            if pkg_unit and pkg_unit.medicine_id == req.medicine_id:
                conv_factor = Decimal(str(pkg_unit.conversion_factor))
                unit_name = pkg_unit.unit_name_en

        base_qty = int(Decimal(str(req.quantity)) * conv_factor)

        item = PurchaseItem(
            purchase_id=purchase.id,
            medicine_id=req.medicine_id,
            batch_id=None,               # filled in when received
            package_unit_id=pkg_unit.id if pkg_unit else None,
            unit_name=unit_name,
            conversion_factor=conv_factor,
            base_quantity=base_qty,
            quantity=req.quantity,
            unit_price=Decimal(str(req.unit_price)),
            total_price=Decimal(str(req.unit_price)) * req.quantity,
        )
        db.add(item)

    db.commit()
    db.refresh(purchase)
    return purchase


# ---------------------------------------------------------------------------
# 5C: Receive purchase — the critical atomic workflow
# ---------------------------------------------------------------------------

def receive_purchase(
    db: Session,
    purchase_id: uuid.UUID,
    payload: ReceivePurchaseIn,
    user: User,
) -> Purchase:
    """
    Receive a purchase order:
      1. Validate the purchase exists and is still ORDERED.
      2. Validate every supplied purchase_item_id belongs to this purchase.
      3. For each item: create a MedicineBatch in base units, add quantity, write PURCHASE_RECEIVED
         movement, link batch back to PurchaseItem.
      4. Mark purchase RECEIVED.
    """
    # 1. Fetch and validate purchase.
    purchase = db.get(Purchase, purchase_id)
    if purchase is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")

    if purchase.status == PurchaseStatus.RECEIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This purchase has already been received",
        )
    if purchase.status == PurchaseStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot receive a cancelled purchase",
        )

    # 2. Index the purchase's items by ID and validate the payload references.
    purchase_items_by_id: dict[uuid.UUID, PurchaseItem] = {
        item.id: item for item in purchase.items
    }

    # Check all supplied item IDs actually belong to this purchase.
    supplied_ids = {ri.purchase_item_id for ri in payload.items}
    unknown = supplied_ids - purchase_items_by_id.keys()
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"purchase_item_id(s) not found on this purchase: {[str(u) for u in unknown]}",
        )

    # 3. For each supplied item, create a batch and record the movement.
    for receive_item in payload.items:
        pi = purchase_items_by_id[receive_item.purchase_item_id]

        if pi.batch_id is not None:
            # This item was already received (e.g. partial receive attempted twice).
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Purchase item {pi.id} has already been received (batch already created)",
            )

        conv_factor = Decimal(str(pi.conversion_factor or 1.0))
        base_unit_cost = (pi.unit_price / conv_factor).quantize(Decimal("0.01"))

        # Create the MedicineBatch for this delivery lot in base units
        batch = MedicineBatch(
            medicine_id=pi.medicine_id,
            batch_number=receive_item.batch_number,
            expiry_date=receive_item.expiry_date,
            quantity=pi.base_quantity,
            purchase_price=base_unit_cost,
            supplier_id=purchase.supplier_id,
        )
        db.add(batch)
        db.flush()  # get batch.id before writing movement + linking item

        # Record the ledger entry in base units
        record_movement(
            db,
            medicine_id=pi.medicine_id,
            batch_id=batch.id,
            quantity_change=pi.base_quantity,
            reason=MovementReason.PURCHASE_RECEIVED,
            reference_type="purchase",
            reference_id=purchase.id,
            created_by=user.id,
        )

        # Link the batch back to the purchase item so we know where stock came from.
        pi.batch_id = batch.id

    # 4. Mark the purchase received.
    purchase.status = PurchaseStatus.RECEIVED

    db.commit()
    db.refresh(purchase)
    return purchase


# ---------------------------------------------------------------------------
# 5D: Inventory write-off
# ---------------------------------------------------------------------------

def write_off_stock(db: Session, payload: WriteOffRequest, user: User) -> None:
    """
    Deduct stock from a specific batch for reasons like expiry, damage, or a
    stock-take correction. Writes the appropriate InventoryMovement and
    decrements MedicineBatch.quantity atomically.
    """
    if payload.reason not in WRITE_OFF_REASONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid write-off reason '{payload.reason.value}'. "
                f"Allowed: {[r.value for r in WRITE_OFF_REASONS]}"
            ),
        )

    batch = db.get(MedicineBatch, payload.batch_id)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine batch not found",
        )

    if batch.quantity < payload.quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Insufficient stock: requested to write off {payload.quantity} "
                f"but batch only has {batch.quantity} units"
            ),
        )

    batch.quantity -= payload.quantity

    record_movement(
        db,
        medicine_id=batch.medicine_id,
        batch_id=batch.id,
        quantity_change=-payload.quantity,
        reason=payload.reason,
        reference_type="write_off",
        reference_id=None,
        created_by=user.id,
    )

    db.commit()
