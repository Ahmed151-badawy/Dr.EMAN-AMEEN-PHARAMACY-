import uuid
from dataclasses import dataclass
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.credit import (
    CreditStatus,
    CreditTransactionType,
    CustomerCreditTransaction,
)
from app.models.inventory_movement import MovementReason
from app.models.medicine import Medicine, MedicineBatch, MedicinePackageUnit
from app.models.sale import Sale, SaleItem, SaleReturn, SaleStatus, PaymentMethod
from app.models.user import User
from app.schemas.sale import SaleCreate, SaleReturnCreate
from app.services.credit import calculate_customer_balance
from app.services.inventory import record_movement
from app.core.controlled_policy import validate_controlled_sale_compliance


@dataclass
class _Allocation:
    medicine: Medicine
    batch: MedicineBatch
    package_unit: MedicinePackageUnit | None
    unit_name: str
    conversion_factor: Decimal
    quantity: int
    base_quantity: int
    unit_price: Decimal
    total_price: Decimal


def _allocate_fefo_item(
    db: Session, medicine_id: uuid.UUID, quantity: int, package_unit_id: uuid.UUID | None = None
) -> list[_Allocation]:
    """
    Lock and reserve stock for one cart line, supporting packaging units.
    Converts selling unit quantity to base unit quantity, then allocates in FEFO order.
    """
    medicine = db.get(Medicine, medicine_id)
    if medicine is None or not medicine.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Medicine {medicine_id} not found or inactive",
        )

    package_unit: MedicinePackageUnit | None = None
    if package_unit_id is not None:
        package_unit = db.get(MedicinePackageUnit, package_unit_id)
        if package_unit is None or package_unit.medicine_id != medicine_id or not package_unit.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid or inactive packaging unit for medicine '{medicine.name}'",
            )
        if not package_unit.allow_selling:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Packaging unit '{package_unit.unit_name_en}' is not configured for retail selling",
            )
        conversion_factor = Decimal(str(package_unit.conversion_factor))
        unit_price = Decimal(str(package_unit.selling_price))
        unit_name = package_unit.unit_name_en
    else:
        # Default unit resolution
        default_unit = next(
            (u for u in medicine.package_units if u.is_default_dispense and u.is_active and u.allow_selling),
            None,
        )
        if default_unit is None:
            default_unit = next(
                (u for u in medicine.package_units if u.is_base_unit and u.is_active and u.allow_selling),
                None,
            )
        if default_unit is not None:
            package_unit = default_unit
            conversion_factor = Decimal(str(default_unit.conversion_factor))
            unit_price = Decimal(str(default_unit.selling_price))
            unit_name = default_unit.unit_name_en
        else:
            conversion_factor = Decimal("1.0")
            unit_price = Decimal(str(medicine.selling_price))
            unit_name = medicine.base_unit_name or "Unit"

    raw_base_quantity = Decimal(str(quantity)) * conversion_factor
    if raw_base_quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity requested must result in at least 1 base unit",
        )
    if raw_base_quantity != Decimal(int(raw_base_quantity)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported fractional base quantity: {quantity} x {conversion_factor} = {raw_base_quantity}. "
                "Sales must result in a whole number of base inventory units to prevent stock under-deduction."
            ),
        )
    base_quantity_needed = int(raw_base_quantity)

    batches = db.scalars(
        select(MedicineBatch)
        .where(MedicineBatch.medicine_id == medicine_id, MedicineBatch.quantity > 0)
        .order_by(MedicineBatch.expiry_date.asc())
        .with_for_update()
    ).all()

    remaining_base = base_quantity_needed
    allocations: list[_Allocation] = []
    line_total = (Decimal(str(quantity)) * unit_price).quantize(Decimal("0.01"))

    for batch in batches:
        if remaining_base <= 0:
            break
        take_base = min(batch.quantity, remaining_base)
        
        # Calculate proportional selling quantity and price for this batch allocation
        if base_quantity_needed == take_base and not allocations:
            # Entire line fulfilled by this single batch (most common case)
            alloc_qty = quantity
            alloc_price = line_total
        else:
            # Proportional split across batches
            ratio = Decimal(str(take_base)) / Decimal(str(base_quantity_needed))
            alloc_qty = max(1, int(round(Decimal(str(quantity)) * ratio)))
            alloc_price = (line_total * ratio).quantize(Decimal("0.01"))

        allocations.append(
            _Allocation(
                medicine=medicine,
                batch=batch,
                package_unit=package_unit,
                unit_name=unit_name,
                conversion_factor=conversion_factor,
                quantity=alloc_qty,
                base_quantity=take_base,
                unit_price=unit_price,
                total_price=alloc_price,
            )
        )
        remaining_base -= take_base

    if remaining_base > 0:
        available_base = base_quantity_needed - remaining_base
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Insufficient stock for '{medicine.name}': requested {quantity} {unit_name} "
                f"({base_quantity_needed} base units), only {available_base} base units available"
            ),
        )

    # Adjust rounding discrepancy on total_price if split across batches
    if len(allocations) > 1:
        sum_alloc = sum((a.total_price for a in allocations), Decimal("0.00"))
        diff = line_total - sum_alloc
        if diff != Decimal("0.00"):
            allocations[-1].total_price += diff

    return allocations


def create_sale(db: Session, payload: SaleCreate, cashier: User) -> Sale:
    """
    Process full checkout with multi-unit packaging support.
    Validates, reserves stock in base units atomically, creates sale items with
    immutable unit snapshot, decrements batch base quantities, and writes movements.
    """
    customer: Customer | None = None
    current_credit_balance: Decimal = Decimal("0.00")

    if payload.payment_method == PaymentMethod.CREDIT:
        if payload.customer_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer is required for credit sales. Walk-in customers cannot purchase on credit.",
            )

        customer = db.scalar(
            select(Customer).where(Customer.id == payload.customer_id).with_for_update()
        )
        if customer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found"
            )

        if customer.credit_status != CreditStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Customer credit account is {customer.credit_status.value}. Active credit account is required.",
            )

        current_credit_balance = calculate_customer_balance(db, customer.id)
    elif payload.customer_id is not None:
        if db.get(Customer, payload.customer_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found"
            )

    # Pass 1: validate and reserve (row-locked) allocations for every cart line
    all_allocations: list[_Allocation] = []
    for item in payload.items:
        all_allocations.extend(
            _allocate_fefo_item(db, item.medicine_id, item.quantity, item.package_unit_id)
        )

    subtotal = sum((a.total_price for a in all_allocations), Decimal("0.00"))
    if payload.discount > subtotal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Discount cannot exceed the sale subtotal",
        )
    total_amount = subtotal - payload.discount

    # For credit sales, validate credit limit against authoritative balance
    if payload.payment_method == PaymentMethod.CREDIT and customer is not None:
        if current_credit_balance + total_amount > customer.credit_limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Credit limit exceeded: current debt ({current_credit_balance}) + "
                    f"new sale ({total_amount}) exceeds credit limit ({customer.credit_limit})"
                ),
            )

    has_controlled_meds = any(bool(alloc.medicine.is_controlled) for alloc in all_allocations)
    if has_controlled_meds:
        controlled_schedules = [
            str(alloc.medicine.controlled_schedule)
            for alloc in all_allocations
            if alloc.medicine.is_controlled and alloc.medicine.controlled_schedule
        ]
        validate_controlled_sale_compliance(
            schedules=controlled_schedules,
            purchaser_name=payload.purchaser_name,
            purchaser_id_number=payload.purchaser_id_number,
            purchaser_phone=payload.purchaser_phone,
            prescription_reference=payload.prescription_reference,
            doctor_name=payload.doctor_name,
            has_customer=bool(payload.customer_id),
        )

    sale = Sale(
        customer_id=payload.customer_id,
        user_id=cashier.id,
        total_amount=total_amount,
        discount=payload.discount,
        payment_method=payload.payment_method,
        status=SaleStatus.COMPLETED,
        has_controlled_medicine=has_controlled_meds,
        purchaser_name=payload.purchaser_name,
        purchaser_id_number=payload.purchaser_id_number,
        purchaser_phone=payload.purchaser_phone,
        prescription_reference=payload.prescription_reference,
        doctor_name=payload.doctor_name,
        doctor_license=payload.doctor_license,
        prescription_date=payload.prescription_date,
    )
    db.add(sale)
    db.flush()

    # Pass 2: persist sale items with authoritative unit snapshot and deduct base inventory
    for alloc in all_allocations:
        sale_item = SaleItem(
            sale_id=sale.id,
            medicine_id=alloc.medicine.id,
            batch_id=alloc.batch.id,
            package_unit_id=alloc.package_unit.id if alloc.package_unit else None,
            unit_name=alloc.unit_name,
            conversion_factor=alloc.conversion_factor,
            base_quantity=alloc.base_quantity,
            quantity=alloc.quantity,
            unit_price=alloc.unit_price,
            total_price=alloc.total_price,
            medicine_name_snapshot=alloc.medicine.name,
            classification_snapshot="controlled" if alloc.medicine.is_controlled else "ordinary",
            controlled_schedule_snapshot=alloc.medicine.controlled_schedule if alloc.medicine.is_controlled else None,
            batch_number_snapshot=alloc.batch.batch_number,
        )
        db.add(sale_item)

        # Base inventory deduction
        alloc.batch.quantity -= alloc.base_quantity

        record_movement(
            db,
            medicine_id=alloc.medicine.id,
            batch_id=alloc.batch.id,
            quantity_change=-alloc.base_quantity,
            reason=MovementReason.SALE,
            reference_type="sale",
            reference_id=sale.id,
            created_by=cashier.id,
        )

    # Append to Customer Credit Ledger if CREDIT sale
    if payload.payment_method == PaymentMethod.CREDIT and customer is not None:
        new_credit_balance = current_credit_balance + total_amount
        credit_tx = CustomerCreditTransaction(
            customer_id=customer.id,
            transaction_type=CreditTransactionType.CREDIT_SALE,
            amount=total_amount,
            balance_after=new_credit_balance,
            sale_id=sale.id,
            notes=f"Credit sale #{str(sale.id)[:8]}",
            created_by=cashier.id,
        )
        db.add(credit_tx)

    db.commit()
    db.refresh(sale)
    return sale


def create_return(db: Session, payload: SaleReturnCreate, user: User) -> SaleReturn:
    """
    Process sale return. Return quantity is expressed in original selling units.
    Restores base units to the batch using the authoritative sale_item conversion_factor snapshot.
    """
    sale_item = db.scalar(
        select(SaleItem).where(SaleItem.id == payload.sale_item_id).with_for_update()
    )
    if sale_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Sale item not found"
        )

    already_returned = db.scalar(
        select(func.coalesce(func.sum(SaleReturn.quantity), 0)).where(
            SaleReturn.sale_item_id == sale_item.id
        )
    )
    available_to_return = sale_item.quantity - int(already_returned or 0)

    if payload.quantity > available_to_return:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot return {payload.quantity} units — only "
                f"{available_to_return} of this line item remain un-returned"
            ),
        )

    sale_return = SaleReturn(
        sale_item_id=sale_item.id,
        quantity=payload.quantity,
        reason=payload.reason,
        restocked=payload.restock,
    )
    db.add(sale_return)
    db.flush()

    if payload.restock:
        batch = db.get(MedicineBatch, sale_item.batch_id)
        # Restore stock using authoritative historical conversion factor snapshot
        conv_factor = Decimal(str(sale_item.conversion_factor or 1.0))
        raw_restock = Decimal(str(payload.quantity)) * conv_factor
        if raw_restock != Decimal(int(raw_restock)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported fractional restock quantity: {raw_restock}. Must be a whole number of base units.",
            )
        base_units_to_restock = int(raw_restock)
        batch.quantity += base_units_to_restock
        record_movement(
            db,
            medicine_id=sale_item.medicine_id,
            batch_id=sale_item.batch_id,
            quantity_change=base_units_to_restock,
            reason=MovementReason.SALE_RETURN,
            reference_type="sale_return",
            reference_id=sale_return.id,
            created_by=user.id,
        )

    # Recompute the parent sale's status based on total returned vs. sold
    sale = db.get(Sale, sale_item.sale_id)
    total_sold = db.scalar(
        select(func.coalesce(func.sum(SaleItem.quantity), 0))
        .where(SaleItem.sale_id == sale.id)
    )
    total_returned = db.scalar(
        select(func.coalesce(func.sum(SaleReturn.quantity), 0))
        .select_from(SaleReturn)
        .join(SaleItem, SaleItem.id == SaleReturn.sale_item_id)
        .where(SaleItem.sale_id == sale.id)
    )
    if total_returned >= total_sold:
        sale.status = SaleStatus.RETURNED
    elif total_returned > 0:
        sale.status = SaleStatus.PARTIALLY_RETURNED

    # If this was a CREDIT sale, adjust customer credit ledger atomically
    if sale.payment_method == PaymentMethod.CREDIT and sale.customer_id is not None:
        subtotal = sum((Decimal(str(it.total_price)) for it in sale.items), Decimal("0.00"))
        if subtotal > Decimal("0.00") and sale.discount > Decimal("0.00"):
            unit_effective_price = (Decimal(str(sale_item.unit_price)) * Decimal(str(sale.total_amount)) / subtotal).quantize(Decimal("0.01"))
            return_amount = (unit_effective_price * Decimal(str(payload.quantity))).quantize(Decimal("0.01"))
        else:
            return_amount = (Decimal(str(sale_item.unit_price)) * Decimal(str(payload.quantity))).quantize(Decimal("0.01"))

        customer = db.scalar(
            select(Customer).where(Customer.id == sale.customer_id).with_for_update()
        )
        if customer is not None:
            current_bal = calculate_customer_balance(db, customer.id)
            new_bal = max(Decimal("0.00"), current_bal - return_amount)
            credit_tx = CustomerCreditTransaction(
                customer_id=customer.id,
                transaction_type=CreditTransactionType.RETURN,
                amount=return_amount,
                balance_after=new_bal,
                sale_id=sale.id,
                return_id=sale_return.id,
                notes=f"Credit return for sale #{str(sale.id)[:8]} ({payload.quantity} {sale_item.unit_name or 'unit'}(s))",
                created_by=user.id,
            )
            db.add(credit_tx)

    db.commit()
    db.refresh(sale_return)
    return sale_return
