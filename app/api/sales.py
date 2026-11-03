import uuid
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.customer import Customer
from app.models.medicine import Medicine
from app.models.medicine import MedicineBatch
from app.models.sale import Sale, SaleItem
from app.models.user import User, UserRole
from app.schemas.sale import (
    SaleCreate,
    SaleItemOut,
    SaleOut,
    SaleReturnCreate,
    SaleReturnOut,
    SaleSummary,
)
from app.services import sales as sales_service

router = APIRouter(prefix="/sales", tags=["sales"])

# Inventory managers don't operate the register; everyone who touches a sale
# needs to also be allowed to process a return.
CAN_SELL = (UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)


def _mask_id_number(raw_id: str | None, current_user: User | None, sale: Sale) -> str | None:
    if not raw_id:
        return None
    # Admin, Pharmacist, or the clerk who conducted the sale can view the full ID
    if current_user and (current_user.role in (UserRole.ADMIN, UserRole.PHARMACIST) or current_user.id == sale.user_id):
        return raw_id
    # Otherwise mask National ID for privacy / compliance
    s = raw_id.strip()
    if len(s) > 4:
        return s[:3] + ("*" * (len(s) - 5)) + s[-2:]
    return "***REDACTED***"


def _to_sale_out(db: Session, sale: Sale, current_user: User | None = None) -> SaleOut:
    customer_name = None
    if sale.customer_id:
        customer = db.get(Customer, sale.customer_id)
        customer_name = customer.name if customer else None

    user_full_name = None
    if sale.user_id:
        user = db.get(User, sale.user_id)
        user_full_name = user.full_name if user else None

    items = db.scalars(
        select(SaleItem)
        .options(selectinload(SaleItem.medicine), selectinload(SaleItem.batch))
        .where(SaleItem.sale_id == sale.id)
    ).all()

    return SaleOut(
        id=sale.id,
        customer_id=sale.customer_id,
        customer_name=customer_name,
        user_id=sale.user_id,
        user_full_name=user_full_name,
        total_amount=sale.total_amount,
        discount=sale.discount,
        payment_method=sale.payment_method,
        status=sale.status,
        created_at=sale.created_at,
        has_controlled_medicine=bool(sale.has_controlled_medicine),
        purchaser_name=sale.purchaser_name,
        purchaser_id_number=_mask_id_number(sale.purchaser_id_number, current_user, sale),
        purchaser_phone=sale.purchaser_phone,
        prescription_reference=sale.prescription_reference,
        doctor_name=sale.doctor_name,
        doctor_license=sale.doctor_license,
        prescription_date=sale.prescription_date,
        items=[
            SaleItemOut(
                id=i.id,
                medicine_id=i.medicine_id,
                medicine_name=i.medicine_name_snapshot or (i.medicine.name if i.medicine else "Unknown"),
                batch_id=i.batch_id,
                batch_number=i.batch_number_snapshot or (i.batch.batch_number if i.batch else None),
                package_unit_id=i.package_unit_id,
                unit_name=i.unit_name,
                conversion_factor=i.conversion_factor,
                base_quantity=i.base_quantity,
                quantity=i.quantity,
                unit_price=i.unit_price,
                total_price=i.total_price,
                medicine_name_snapshot=i.medicine_name_snapshot,
                classification_snapshot=i.classification_snapshot,
                controlled_schedule_snapshot=i.controlled_schedule_snapshot,
                batch_number_snapshot=i.batch_number_snapshot,
            )
            for i in items
        ],
    )


@router.post(
    "",
    response_model=SaleOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_SELL))],
)
def checkout(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    POS checkout. Stock is drawn FEFO (soonest-expiring batch first),
    automatically split across batches if needed, and every unit sold is
    logged to inventory_movements. All-or-nothing: if any line item can't be
    fully filled, the whole sale is rejected (409) with no partial stock
    deduction.
    """
    sale = sales_service.create_sale(db, payload, current_user)
    return _to_sale_out(db, sale, current_user)


@router.get("", response_model=list[SaleSummary])
def list_sales(
    customer_id: uuid.UUID | None = None,
    has_controlled_medicine: bool | None = None,
    from_date: date | None = Query(None, description="Inclusive start date"),
    to_date: date | None = Query(None, description="Inclusive end date"),
    limit: int = Query(100, ge=1, le=500, description="Max results returned"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    stmt = select(Sale)
    if customer_id:
        stmt = stmt.where(Sale.customer_id == customer_id)
    if has_controlled_medicine is not None:
        stmt = stmt.where(Sale.has_controlled_medicine == has_controlled_medicine)
    if from_date:
        stmt = stmt.where(Sale.created_at >= datetime.combine(from_date, time.min))
    if to_date:
        stmt = stmt.where(Sale.created_at <= datetime.combine(to_date, time.max))
    stmt = stmt.order_by(Sale.created_at.desc()).offset(offset).limit(limit)

    sales = db.scalars(stmt).all()

    # Batch-fetch customer and user names instead of one query per row.
    customer_ids = {s.customer_id for s in sales if s.customer_id}
    names = {}
    if customer_ids:
        for c in db.scalars(select(Customer).where(Customer.id.in_(customer_ids))):
            names[c.id] = c.name

    user_ids = {s.user_id for s in sales if s.user_id}
    user_names = {}
    if user_ids:
        for u in db.scalars(select(User).where(User.id.in_(user_ids))):
            user_names[u.id] = u.full_name

    return [
        SaleSummary(
            id=s.id,
            customer_id=s.customer_id,
            customer_name=names.get(s.customer_id),
            user_id=s.user_id,
            user_full_name=user_names.get(s.user_id),
            total_amount=s.total_amount,
            discount=s.discount,
            payment_method=s.payment_method,
            status=s.status,
            has_controlled_medicine=bool(s.has_controlled_medicine),
            purchaser_name=s.purchaser_name,
            created_at=s.created_at,
        )
        for s in sales
    ]


@router.get("/{sale_id}", response_model=SaleOut)
def get_sale(
    sale_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    sale = db.get(Sale, sale_id)
    if sale is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sale not found")
    return _to_sale_out(db, sale, _current_user)


@router.post(
    "/returns",
    response_model=SaleReturnOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_SELL))],
)
def process_return(
    payload: SaleReturnCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return part or all of a sale line item. Restocks the originating
    batch by default (restock=false for damaged/unsellable returns)."""
    return sales_service.create_return(db, payload, current_user)
