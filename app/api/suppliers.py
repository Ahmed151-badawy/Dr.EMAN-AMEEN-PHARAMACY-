import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.supplier import Supplier
from app.models.user import User, UserRole
from app.schemas.supplier import SupplierCreate, SupplierOut, SupplierUpdate

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

# Cashiers don't manage supplier records; everyone who can manage inventory can.
CAN_MANAGE = (UserRole.ADMIN, UserRole.PHARMACIST, UserRole.INVENTORY_MANAGER)


def _get_supplier_or_404(db: Session, supplier_id: uuid.UUID) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


@router.post(
    "",
    response_model=SupplierOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    """Register a new supplier. Name uniqueness is not enforced at the DB
    level (two branches of the same company may be registered), but the
    phone number should be unique when supplied."""
    if payload.phone:
        clash = db.scalar(select(Supplier).where(Supplier.phone == payload.phone))
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A supplier with this phone number already exists",
            )

    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("", response_model=list[SupplierOut])
def list_suppliers(
    q: str | None = Query(None, description="Search by name, phone, or contact person"),
    active_only: bool = Query(True, description="Hide deactivated suppliers"),
    limit: int = Query(100, ge=1, le=500, description="Max results returned"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    stmt = select(Supplier)
    if active_only:
        stmt = stmt.where(Supplier.is_active.is_(True))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Supplier.name.ilike(like),
                Supplier.phone.ilike(like),
                Supplier.contact_person.ilike(like),
            )
        )
    stmt = stmt.order_by(Supplier.name).offset(offset).limit(limit)
    return db.scalars(stmt).all()


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(
    supplier_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    return _get_supplier_or_404(db, supplier_id)


@router.patch(
    "/{supplier_id}",
    response_model=SupplierOut,
    dependencies=[Depends(require_roles(*CAN_MANAGE))],
)
def update_supplier(
    supplier_id: uuid.UUID,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
):
    supplier = _get_supplier_or_404(db, supplier_id)

    changes = payload.model_dump(exclude_unset=True)

    # Guard duplicate phone when updating.
    if "phone" in changes and changes["phone"]:
        clash = db.scalar(
            select(Supplier).where(
                Supplier.phone == changes["phone"],
                Supplier.id != supplier_id,
            )
        )
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another supplier already uses this phone number",
            )

    for field, value in changes.items():
        setattr(supplier, field, value)

    db.commit()
    db.refresh(supplier)
    return supplier
