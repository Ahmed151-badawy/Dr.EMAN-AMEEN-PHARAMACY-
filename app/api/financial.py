import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.financial import FinancialPaymentMethod
from app.models.user import User, UserRole
from app.schemas.financial import (
    DailyFinancialOut,
    ExpenseCategoryBreakdownOut,
    ExpenseCategoryCreate,
    ExpenseCategoryOut,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseOut,
    ExpenseUpdate,
    FinancialSummaryOut,
    PeriodComparisonOut,
    SupplierPaymentCreate,
    SupplierPaymentOut,
)
from app.services import financial as financial_service

router = APIRouter(prefix="/financial", tags=["Financial Management & Profitability"])


def _default_dates(start_date: date | None, end_date: date | None) -> tuple[date, date]:
    today = date.today()
    e_date = end_date if end_date else today
    s_date = start_date if start_date else (today - timedelta(days=30))
    return s_date, e_date


@router.get("/summary", response_model=FinancialSummaryOut)
def get_financial_summary(
    start_date: date | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST)),
):
    s_date, e_date = _default_dates(start_date, end_date)
    return financial_service.get_financial_summary(db, s_date, e_date)


@router.get("/daily", response_model=list[DailyFinancialOut])
def get_daily_financials(
    start_date: date | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST)),
):
    s_date, e_date = _default_dates(start_date, end_date)
    return financial_service.get_daily_breakdown(db, s_date, e_date)


@router.get("/comparison", response_model=PeriodComparisonOut)
def get_period_comparison(
    start_date: date | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST)),
):
    s_date, e_date = _default_dates(start_date, end_date)
    return financial_service.get_period_comparison(db, s_date, e_date)


@router.get("/expense-breakdown", response_model=list[ExpenseCategoryBreakdownOut])
def get_expense_breakdown(
    start_date: date | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST)),
):
    s_date, e_date = _default_dates(start_date, end_date)
    return financial_service.get_expense_category_breakdown(db, s_date, e_date)


@router.get("/profitability", response_model=FinancialSummaryOut)
def get_profitability(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST)),
):
    s_date, e_date = _default_dates(start_date, end_date)
    return financial_service.get_financial_summary(db, s_date, e_date)


@router.get("/cash-flow", response_model=FinancialSummaryOut)
def get_cash_flow(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST)),
):
    s_date, e_date = _default_dates(start_date, end_date)
    return financial_service.get_financial_summary(db, s_date, e_date)


# ---------------------------------------------------------------------------
# Expense Categories
# ---------------------------------------------------------------------------

@router.get("/expense-categories", response_model=list[ExpenseCategoryOut])
def list_expense_categories(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST)),
):
    return financial_service.list_expense_categories(db, active_only=active_only)


@router.post("/expense-categories", response_model=ExpenseCategoryOut, status_code=status.HTTP_201_CREATED)
def create_expense_category(
    payload: ExpenseCategoryCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN)),
):
    return financial_service.create_expense_category(db, payload)


@router.patch("/expense-categories/{category_id}", response_model=ExpenseCategoryOut)
def update_expense_category(
    category_id: uuid.UUID,
    payload: ExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN)),
):
    return financial_service.update_expense_category(db, category_id, payload)


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

@router.get("/expenses", response_model=list[ExpenseOut])
def list_expenses(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    category_id: uuid.UUID | None = Query(None),
    payment_method: FinancialPaymentMethod | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST)),
):
    expenses = financial_service.list_expenses(
        db,
        start_date=start_date,
        end_date=end_date,
        category_id=category_id,
        payment_method=payment_method,
        search=search,
        limit=limit,
        offset=offset,
    )
    result = []
    for exp in expenses:
        result.append(
            ExpenseOut(
                id=exp.id,
                category_id=exp.category_id,
                category_name=exp.category.name if exp.category else None,
                category_name_ar=exp.category.name_ar if exp.category else None,
                amount=Decimal(str(exp.amount)),
                expense_date=exp.expense_date,
                payment_method=exp.payment_method,
                description=exp.description,
                notes=exp.notes,
                created_by=exp.created_by,
                created_by_name=exp.user.full_name if exp.user else None,
                created_at=exp.created_at,
                updated_at=exp.updated_at,
            )
        )
    return result


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
):
    exp = financial_service.create_expense(db, payload, current_user)
    return ExpenseOut(
        id=exp.id,
        category_id=exp.category_id,
        category_name=exp.category.name if exp.category else None,
        category_name_ar=exp.category.name_ar if exp.category else None,
        amount=Decimal(str(exp.amount)),
        expense_date=exp.expense_date,
        payment_method=exp.payment_method,
        description=exp.description,
        notes=exp.notes,
        created_by=exp.created_by,
        created_by_name=current_user.full_name,
        created_at=exp.created_at,
        updated_at=exp.updated_at,
    )


@router.get("/expenses/{expense_id}", response_model=ExpenseOut)
def get_expense(
    expense_id: uuid.UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST)),
):
    exp = db.get(financial_service.Expense, expense_id)
    if not exp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found"
        )
    return ExpenseOut(
        id=exp.id,
        category_id=exp.category_id,
        category_name=exp.category.name if exp.category else None,
        category_name_ar=exp.category.name_ar if exp.category else None,
        amount=Decimal(str(exp.amount)),
        expense_date=exp.expense_date,
        payment_method=exp.payment_method,
        description=exp.description,
        notes=exp.notes,
        created_by=exp.created_by,
        created_by_name=exp.user.full_name if exp.user else None,
        created_at=exp.created_at,
        updated_at=exp.updated_at,
    )


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: uuid.UUID,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
):
    exp = financial_service.update_expense(db, expense_id, payload, current_user)
    return ExpenseOut(
        id=exp.id,
        category_id=exp.category_id,
        category_name=exp.category.name if exp.category else None,
        category_name_ar=exp.category.name_ar if exp.category else None,
        amount=Decimal(str(exp.amount)),
        expense_date=exp.expense_date,
        payment_method=exp.payment_method,
        description=exp.description,
        notes=exp.notes,
        created_by=exp.created_by,
        created_by_name=exp.user.full_name if exp.user else None,
        created_at=exp.created_at,
        updated_at=exp.updated_at,
    )


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
):
    financial_service.delete_expense(db, expense_id, current_user)
    return None


# ---------------------------------------------------------------------------
# Supplier Payments
# ---------------------------------------------------------------------------

@router.get("/supplier-payments", response_model=list[SupplierPaymentOut])
def list_supplier_payments(
    supplier_id: uuid.UUID | None = Query(None),
    purchase_id: uuid.UUID | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.INVENTORY_MANAGER)),
):
    payments = financial_service.list_supplier_payments(
        db,
        supplier_id=supplier_id,
        purchase_id=purchase_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
    result = []
    for sp in payments:
        result.append(
            SupplierPaymentOut(
                id=sp.id,
                supplier_id=sp.supplier_id,
                supplier_name=sp.supplier.name if sp.supplier else None,
                purchase_id=sp.purchase_id,
                amount=Decimal(str(sp.amount)),
                payment_date=sp.payment_date,
                payment_method=sp.payment_method,
                reference_number=sp.reference_number,
                notes=sp.notes,
                created_by=sp.created_by,
                created_at=sp.created_at,
            )
        )
    return result


@router.post("/supplier-payments", response_model=SupplierPaymentOut, status_code=status.HTTP_201_CREATED)
def create_supplier_payment(
    payload: SupplierPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.INVENTORY_MANAGER)),
):
    sp = financial_service.create_supplier_payment(db, payload, current_user)
    return SupplierPaymentOut(
        id=sp.id,
        supplier_id=sp.supplier_id,
        supplier_name=sp.supplier.name if sp.supplier else None,
        purchase_id=sp.purchase_id,
        amount=Decimal(str(sp.amount)),
        payment_date=sp.payment_date,
        payment_method=sp.payment_method,
        reference_number=sp.reference_number,
        notes=sp.notes,
        created_by=sp.created_by,
        created_at=sp.created_at,
    )
