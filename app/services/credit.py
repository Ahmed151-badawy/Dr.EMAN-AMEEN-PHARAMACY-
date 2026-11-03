import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select, func, case, or_
from sqlalchemy.orm import Session

from app.models.credit import (
    CreditStatus,
    CreditTransactionType,
    CustomerCreditTransaction,
    CustomerPayment,
)
from app.models.customer import Customer
from app.models.user import User
from app.schemas.credit import (
    CustomerCreditAccountOut,
    CustomerCreditAccountUpdate,
    CustomerPaymentCreate,
    CustomerReceivableOut,
)


def calculate_customer_balance(db: Session, customer_id: uuid.UUID) -> Decimal:
    """
    Authoritatively derives the customer's current outstanding balance (debt)
    by summing all append-only transactions in the credit ledger.
    CREDIT_SALE: + amount (increases debt)
    ADJUSTMENT: + amount (increases debt)
    PAYMENT: - amount (reduces debt)
    RETURN: - amount (reduces debt)
    """
    stmt = select(
        func.coalesce(
            func.sum(
                case(
                    (
                        CustomerCreditTransaction.transaction_type
                        == CreditTransactionType.CREDIT_SALE,
                        CustomerCreditTransaction.amount,
                    ),
                    (
                        CustomerCreditTransaction.transaction_type
                        == CreditTransactionType.ADJUSTMENT,
                        CustomerCreditTransaction.amount,
                    ),
                    (
                        CustomerCreditTransaction.transaction_type
                        == CreditTransactionType.PAYMENT,
                        -CustomerCreditTransaction.amount,
                    ),
                    (
                        CustomerCreditTransaction.transaction_type
                        == CreditTransactionType.RETURN,
                        -CustomerCreditTransaction.amount,
                    ),
                    else_=Decimal("0.00"),
                )
            ),
            Decimal("0.00"),
        )
    ).where(CustomerCreditTransaction.customer_id == customer_id)

    raw_balance = db.scalar(stmt)
    return Decimal(str(raw_balance or "0.00"))


def get_customer_credit_summary(
    db: Session, customer_id: uuid.UUID, lock_customer: bool = False
) -> tuple[Customer, CustomerCreditAccountOut]:
    """
    Retrieves the customer's credit profile and computes their current
    outstanding balance and available credit. If lock_customer is True,
    locks the Customer row using SELECT ... FOR UPDATE.
    """
    stmt = select(Customer).where(Customer.id == customer_id)
    if lock_customer:
        stmt = stmt.with_for_update()

    customer = db.scalar(stmt)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found"
        )

    outstanding = calculate_customer_balance(db, customer_id)
    available = max(Decimal("0.00"), customer.credit_limit - outstanding)

    summary = CustomerCreditAccountOut(
        credit_status=customer.credit_status,
        credit_limit=customer.credit_limit,
        payment_terms_days=customer.payment_terms_days,
        outstanding_balance=outstanding,
        available_credit=available,
    )
    return customer, summary


def update_customer_credit_account(
    db: Session,
    customer_id: uuid.UUID,
    payload: CustomerCreditAccountUpdate,
    _admin_user: User,
) -> CustomerCreditAccountOut:
    """
    Admin-only: update credit limit, credit status (active/suspended/disabled),
    and payment terms days.
    """
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id).with_for_update()
    )
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found"
        )

    if payload.credit_status is not None:
        customer.credit_status = payload.credit_status
    if payload.credit_limit is not None:
        customer.credit_limit = payload.credit_limit
    if payload.payment_terms_days is not None:
        customer.payment_terms_days = payload.payment_terms_days

    db.commit()
    db.refresh(customer)

    _, summary = get_customer_credit_summary(db, customer.id)
    return summary


def record_customer_payment(
    db: Session,
    customer_id: uuid.UUID,
    payload: CustomerPaymentCreate,
    cashier: User,
) -> CustomerPayment:
    """
    Record a payment against a customer's outstanding balance:
    1. Row-lock the Customer row to serialize concurrent transactions.
    2. Authoritatively calculate current outstanding balance.
    3. Validate payment amount > 0 and <= outstanding balance.
    4. Persist CustomerPayment and append PAYMENT transaction to ledger atomically.
    """
    if payload.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount must be greater than zero",
        )

    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id).with_for_update()
    )
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found"
        )

    current_balance = calculate_customer_balance(db, customer_id)
    if current_balance <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer has no outstanding balance to pay",
        )

    if payload.amount > current_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Payment amount ({payload.amount}) exceeds customer's "
                f"current outstanding balance ({current_balance})"
            ),
        )

    # 1. Create Payment record
    payment = CustomerPayment(
        customer_id=customer.id,
        amount=payload.amount,
        payment_method=payload.payment_method,
        notes=payload.notes,
        user_id=cashier.id,
    )
    db.add(payment)
    db.flush()

    # 2. Append to immutable Credit Ledger
    new_balance = current_balance - payload.amount
    ledger_entry = CustomerCreditTransaction(
        customer_id=customer.id,
        transaction_type=CreditTransactionType.PAYMENT,
        amount=payload.amount,
        balance_after=new_balance,
        payment_id=payment.id,
        notes=payload.notes,
        created_by=cashier.id,
    )
    db.add(ledger_entry)

    db.commit()
    db.refresh(payment)
    return payment


def list_customer_credit_transactions(
    db: Session,
    customer_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
) -> list[CustomerCreditTransaction]:
    """Retrieve chronologically ordered ledger entries for a customer."""
    stmt = (
        select(CustomerCreditTransaction)
        .where(CustomerCreditTransaction.customer_id == customer_id)
        .order_by(CustomerCreditTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def list_customer_payments(
    db: Session,
    customer_id: uuid.UUID,
    limit: int = 100,
    offset: int = 0,
) -> list[CustomerPayment]:
    """Retrieve payment history for a customer."""
    stmt = (
        select(CustomerPayment)
        .where(CustomerPayment.customer_id == customer_id)
        .order_by(CustomerPayment.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def list_receivables(
    db: Session,
    limit: int = 100,
    offset: int = 0,
) -> list[CustomerReceivableOut]:
    """
    List all customers with active credit accounts or non-zero outstanding balances.
    """
    customers = db.scalars(
        select(Customer)
        .where(
            or_(
                Customer.credit_status != CreditStatus.DISABLED,
                Customer.credit_limit > 0,
            )
        )
        .order_by(Customer.name)
        .offset(offset)
        .limit(limit)
    ).all()

    receivables: list[CustomerReceivableOut] = []
    for cust in customers:
        bal = calculate_customer_balance(db, cust.id)
        avail = max(Decimal("0.00"), cust.credit_limit - bal)
        receivables.append(
            CustomerReceivableOut(
                customer_id=cust.id,
                customer_name=cust.name,
                customer_phone=cust.phone,
                credit_status=cust.credit_status,
                credit_limit=cust.credit_limit,
                outstanding_balance=bal,
                available_credit=avail,
            )
        )

    return receivables
