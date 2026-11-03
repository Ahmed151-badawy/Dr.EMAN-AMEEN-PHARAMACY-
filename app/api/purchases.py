import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.medicine import Medicine
from app.models.purchase import Purchase, PurchaseItem, PurchaseStatus
from app.models.supplier import Supplier
from app.models.user import User, UserRole
from app.schemas.purchase import (
    PurchaseCreate,
    PurchaseItemOut,
    PurchaseOut,
    PurchaseSummary,
    ReceivePurchaseIn,
)
from app.services import purchases as purchase_service

router = APIRouter(prefix="/purchases", tags=["purchases"])

# Cashiers don't place or receive orders.
CAN_MANAGE = (UserRole.ADMIN, UserRole.PHARMACIST, UserRole.INVENTORY_MANAGER)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_purchase_or_404(db: Session, purchase_id: uuid.UUID) -> Purchase:
    purchase = db.get(Purchase, purchase_id)
    if purchase is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
    return purchase


def _resolve_supplier_name(db: Session, supplier_id: uuid.UUID | None) -> str | None:
    if supplier_id is None:
        return None
    s = db.get(Supplier, supplier_id)
    return s.name if s else None


def _to_purchase_out(db: Session, purchase: Purchase) -> PurchaseOut:
    """Assemble a full PurchaseOut — resolves supplier name and medicine names."""
    items_out = []
    for item in purchase.items:
        med = db.get(Medicine, item.medicine_id)
        items_out.append(
            PurchaseItemOut(
                id=item.id,
                purchase_id=item.purchase_id,
                medicine_id=item.medicine_id,
                medicine_name=med.name if med else "Unknown",
                batch_id=item.batch_id,
                package_unit_id=item.package_unit_id,
                unit_name=item.unit_name,
                conversion_factor=item.conversion_factor,
                base_quantity=item.base_quantity,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_price=item.total_price,
            )
        )

    return PurchaseOut(
        id=purchase.id,
        supplier_id=purchase.supplier_id,
        supplier_name=_resolve_supplier_name(db, purchase.supplier_id),
        user_id=purchase.user_id,
        total_amount=purchase.total_amount,
        status=purchase.status,
        notes=purchase.notes,
        created_at=purchase.created_at,
        updated_at=purchase.updated_at,
        items=items_out,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=PurchaseOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def create_purchase(
    payload: PurchaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a purchase order (status=ORDERED). Does not affect inventory —
    stock enters the system only when the order is received via
    POST /purchases/{id}/receive.
    """
    purchase = purchase_service.create_purchase(db, payload, current_user)
    return _to_purchase_out(db, purchase)


@router.get("", response_model=list[PurchaseSummary])
def list_purchases(
    supplier_id: uuid.UUID | None = Query(None, description="Filter by supplier"),
    purchase_status: PurchaseStatus | None = Query(None, alias="status", description="Filter by status"),
    limit: int = Query(100, ge=1, le=500, description="Max results returned"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    stmt = select(Purchase)
    if supplier_id:
        stmt = stmt.where(Purchase.supplier_id == supplier_id)
    if purchase_status:
        stmt = stmt.where(Purchase.status == purchase_status)
    stmt = stmt.order_by(Purchase.created_at.desc()).offset(offset).limit(limit)

    purchases = db.scalars(stmt).all()

    # Batch-resolve supplier names.
    supplier_ids = {p.supplier_id for p in purchases if p.supplier_id}
    supplier_names: dict[uuid.UUID, str] = {}
    if supplier_ids:
        for s in db.scalars(select(Supplier).where(Supplier.id.in_(supplier_ids))):
            supplier_names[s.id] = s.name

    return [
        PurchaseSummary(
            id=p.id,
            supplier_id=p.supplier_id,
            supplier_name=supplier_names.get(p.supplier_id),
            total_amount=p.total_amount,
            status=p.status,
            created_at=p.created_at,
        )
        for p in purchases
    ]


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get_purchase(
    purchase_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    purchase = _get_purchase_or_404(db, purchase_id)
    return _to_purchase_out(db, purchase)


@router.post(
    "/{purchase_id}/receive",
    response_model=PurchaseOut,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def receive_purchase(
    purchase_id: uuid.UUID,
    payload: ReceivePurchaseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Receive a purchase order:
    - Creates one MedicineBatch per line item.
    - Increases batch quantity (stock is now available for sale).
    - Writes a PURCHASE_RECEIVED row to inventory_movements.
    - Links each PurchaseItem to its new batch via batch_id.
    - Changes purchase status from ORDERED to RECEIVED.

    All of the above happens in a single atomic transaction. If anything
    fails, the database is unchanged.
    """
    purchase = purchase_service.receive_purchase(db, purchase_id, payload, current_user)
    return _to_purchase_out(db, purchase)
