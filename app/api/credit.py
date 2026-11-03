import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.credit import (
    CustomerCreditAccountOut,
    CustomerCreditAccountUpdate,
    CustomerCreditTransactionOut,
    CustomerPaymentCreate,
    CustomerPaymentOut,
    CustomerReceivableOut,
)
from app.services import credit as credit_service

router = APIRouter(tags=["customer-credit"])


@router.get(
    "/customers/credit/receivables",
    response_model=list[CustomerReceivableOut],
)
def list_receivables(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """List all customers with active credit configurations or balances."""
    return credit_service.list_receivables(db, limit=limit, offset=offset)


@router.get(
    "/customers/{customer_id}/credit",
    response_model=CustomerCreditAccountOut,
)
def get_customer_credit_account(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Retrieve customer credit account status, limit, balance, and available credit."""
    _, summary = credit_service.get_customer_credit_summary(db, customer_id)
    return summary


@router.patch(
    "/customers/{customer_id}/credit",
    response_model=CustomerCreditAccountOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def update_customer_credit_account(
    customer_id: uuid.UUID,
    payload: CustomerCreditAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-only: update customer credit limit, credit status, and payment terms."""
    return credit_service.update_customer_credit_account(
        db, customer_id, payload, current_user
    )


@router.get(
    "/customers/{customer_id}/credit/transactions",
    response_model=list[CustomerCreditTransactionOut],
)
def list_customer_credit_transactions(
    customer_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Retrieve append-only financial ledger entries for a customer."""
    return credit_service.list_customer_credit_transactions(
        db, customer_id, limit=limit, offset=offset
    )


@router.get(
    "/customers/{customer_id}/credit/payments",
    response_model=list[CustomerPaymentOut],
)
def list_customer_payments(
    customer_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Retrieve payment records for a customer."""
    return credit_service.list_customer_payments(
        db, customer_id, limit=limit, offset=offset
    )


@router.post(
    "/customers/{customer_id}/credit/payments",
    response_model=CustomerPaymentOut,
    status_code=status.HTTP_201_CREATED,
)
def record_customer_payment(
    customer_id: uuid.UUID,
    payload: CustomerPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Record a customer payment against their outstanding credit balance.
    Creates CustomerPayment and appends a PAYMENT transaction to the ledger.
    """
    return credit_service.record_customer_payment(
        db, customer_id, payload, current_user
    )
