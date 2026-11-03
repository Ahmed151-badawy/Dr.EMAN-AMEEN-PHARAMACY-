import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.customer import Customer
from app.models.sale import Sale
from app.models.user import User
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerStats, CustomerUpdate
from app.schemas.sale import SaleSummary
from app.services.customers import get_customer_stats

router = APIRouter(prefix="/customers", tags=["customers"])


def _get_customer_or_404(db: Session, customer_id: uuid.UUID) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Any authenticated staff member can register a customer — this happens
    routinely at the register, not just from an admin screen."""
    if payload.phone:
        existing = db.scalar(select(Customer).where(Customer.phone == payload.phone))
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A customer with this phone number already exists",
            )

    customer = Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("", response_model=list[CustomerOut])
def list_customers(
    q: str | None = Query(None, description="Search by name or phone"),
    limit: int = Query(100, ge=1, le=500, description="Max results returned"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    stmt = select(Customer)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Customer.name.ilike(like), Customer.phone.ilike(like)))
    stmt = stmt.order_by(Customer.name).offset(offset).limit(limit)
    return db.scalars(stmt).all()


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    return _get_customer_or_404(db, customer_id)


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    customer = _get_customer_or_404(db, customer_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}/stats", response_model=CustomerStats)
def customer_stats(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Visit count, total spend, average basket, and top-purchased
    medicines — the 'customer statistics' screen from the audit."""
    _get_customer_or_404(db, customer_id)
    return get_customer_stats(db, customer_id)


@router.get("/{customer_id}/sales", response_model=list[SaleSummary])
def customer_purchase_history(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """The 'search Ahmed, see his purchase history' view from the audit."""
    customer = _get_customer_or_404(db, customer_id)
    sales = db.scalars(
        select(Sale).where(Sale.customer_id == customer_id).order_by(Sale.created_at.desc())
    ).all()
    return [
        SaleSummary(
            id=s.id,
            customer_id=s.customer_id,
            customer_name=customer.name,
            total_amount=s.total_amount,
            discount=s.discount,
            payment_method=s.payment_method,
            status=s.status,
            created_at=s.created_at,
        )
        for s in sales
    ]
