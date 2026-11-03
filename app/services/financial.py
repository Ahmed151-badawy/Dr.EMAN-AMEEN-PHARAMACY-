import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select, func, case, or_, and_
from sqlalchemy.orm import Session, joinedload

from app.models.credit import (
    CreditTransactionType,
    CustomerCreditTransaction,
    CustomerPayment,
)
from app.models.customer import Customer
from app.models.financial import (
    Expense,
    ExpenseCategory,
    FinancialPaymentMethod,
    SupplierPayment,
)
from app.models.medicine import MedicineBatch
from app.models.purchase import Purchase
from app.models.sale import PaymentMethod, Sale, SaleItem, SaleReturn, SaleStatus
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.financial import (
    DailyFinancialOut,
    ExpenseCategoryBreakdownOut,
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseUpdate,
    FinancialSummaryOut,
    PeriodComparisonOut,
    SupplierPaymentCreate,
)


def calculate_credit_receivables(db: Session) -> Decimal:
    """Authoritatively computes total uncollected customer credit debt."""
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
    )
    res = db.scalar(stmt)
    return Decimal(str(res or 0)).quantize(Decimal("0.01"))


def calculate_inventory_value(db: Session) -> Decimal:
    """Authoritatively computes current total inventory valuation at cost (batch purchase prices)."""
    stmt = select(
        func.coalesce(
            func.sum(MedicineBatch.quantity * MedicineBatch.purchase_price),
            Decimal("0.00"),
        )
    ).where(MedicineBatch.quantity > 0)
    res = db.scalar(stmt)
    return Decimal(str(res or 0)).quantize(Decimal("0.01"))


def get_financial_summary(
    db: Session, start_date: date, end_date: date
) -> FinancialSummaryOut:
    """
    Computes complete financial KPIs and reconciliation metrics for the period [start_date, end_date].
    Uses deterministic Decimal arithmetic and actual batch acquisition costs for COGS.
    """
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )

    # 1. Fetch Sales in period
    sales = (
        db.scalars(
            select(Sale)
            .options(
                joinedload(Sale.items).joinedload(SaleItem.batch)
            )
            .where(
                func.date(Sale.created_at) >= start_date,
                func.date(Sale.created_at) <= end_date,
                Sale.status != SaleStatus.VOID,
            )
        )
        .unique()
        .all()
    )

    gross_sales = Decimal("0.00")
    total_discounts = Decimal("0.00")
    sales_invoiced = Decimal("0.00")
    sold_cogs = Decimal("0.00")
    direct_paid_sales = Decimal("0.00")

    for sale in sales:
        s_total = Decimal(str(sale.total_amount))
        s_discount = Decimal(str(sale.discount))
        gross_sales += (s_total + s_discount)
        total_discounts += s_discount
        sales_invoiced += s_total

        # Direct cash inflows (non-credit checkouts)
        if sale.payment_method != PaymentMethod.CREDIT:
            direct_paid_sales += s_total

        # COGS of items sold in this sale (in base units)
        for item in sale.items:
            qty = item.base_quantity if item.base_quantity is not None else item.quantity
            b_cost = Decimal(str(item.batch.purchase_price)) if item.batch else Decimal("0.00")
            sold_cogs += (Decimal(str(qty)) * b_cost)

    # 2. Fetch Returns in period
    returns = (
        db.scalars(
            select(SaleReturn)
            .options(
                joinedload(SaleReturn.sale_item).joinedload(SaleItem.sale),
                joinedload(SaleReturn.sale_item).joinedload(SaleItem.batch),
            )
            .where(
                func.date(SaleReturn.created_at) >= start_date,
                func.date(SaleReturn.created_at) <= end_date,
            )
        )
        .unique()
        .all()
    )

    returns_amount = Decimal("0.00")
    returned_cogs = Decimal("0.00")
    direct_return_refunds = Decimal("0.00")

    for ret in returns:
        s_item = ret.sale_item
        if not s_item or not s_item.sale:
            continue
        sale = s_item.sale
        qty = Decimal(str(ret.quantity))

        # Recompute proportional effective unit price (matching sale return logic)
        subtotal = sum((Decimal(str(it.total_price)) for it in sale.items), Decimal("0.00"))
        if subtotal > Decimal("0.00") and Decimal(str(sale.discount)) > Decimal("0.00"):
            eff_unit = (Decimal(str(s_item.unit_price)) * Decimal(str(sale.total_amount)) / subtotal).quantize(Decimal("0.01"))
            ret_val = (eff_unit * qty).quantize(Decimal("0.01"))
        else:
            ret_val = (Decimal(str(s_item.unit_price)) * qty).quantize(Decimal("0.01"))

        returns_amount += ret_val

        # Returned batch cost in base units
        ret_conv = Decimal(str(s_item.conversion_factor or 1.0))
        ret_base_qty = Decimal(str(ret.quantity)) * ret_conv
        b_cost = Decimal(str(s_item.batch.purchase_price)) if s_item.batch else Decimal("0.00")
        returned_cogs += (ret_base_qty * b_cost)

        # Cash refund disbursed if original sale was non-credit
        if sale.payment_method != PaymentMethod.CREDIT:
            direct_return_refunds += ret_val

    # 3. Customer debt payments collected in period
    credit_payments = db.scalar(
        select(func.coalesce(func.sum(CustomerPayment.amount), Decimal("0.00"))).where(
            func.date(CustomerPayment.created_at) >= start_date,
            func.date(CustomerPayment.created_at) <= end_date,
        )
    )
    customer_payments_collected = Decimal(str(credit_payments or 0)).quantize(Decimal("0.01"))

    # 4. Operating expenses in period
    expenses_val = db.scalar(
        select(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).where(
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date,
        )
    )
    operating_expenses = Decimal(str(expenses_val or 0)).quantize(Decimal("0.01"))

    # 5. Supplier payments disbursed in period
    supp_payments_val = db.scalar(
        select(func.coalesce(func.sum(SupplierPayment.amount), Decimal("0.00"))).where(
            SupplierPayment.payment_date >= start_date,
            SupplierPayment.payment_date <= end_date,
        )
    )
    supplier_payments = Decimal(str(supp_payments_val or 0)).quantize(Decimal("0.01"))

    # 6. Final KPIs
    net_sales = (sales_invoiced - returns_amount).quantize(Decimal("0.01"))
    if net_sales < Decimal("0.00"):
        net_sales = Decimal("0.00")

    cogs = (sold_cogs - returned_cogs).quantize(Decimal("0.01"))
    if cogs < Decimal("0.00"):
        cogs = Decimal("0.00")

    gross_profit = (net_sales - cogs).quantize(Decimal("0.01"))
    gross_margin_pct = (
        ((gross_profit / net_sales) * Decimal("100.00")).quantize(Decimal("0.01"))
        if net_sales > Decimal("0.00")
        else Decimal("0.00")
    )

    net_profit = (gross_profit - operating_expenses).quantize(Decimal("0.01"))
    net_margin_pct = (
        ((net_profit / net_sales) * Decimal("100.00")).quantize(Decimal("0.01"))
        if net_sales > Decimal("0.00")
        else Decimal("0.00")
    )

    cash_inflow = (
        direct_paid_sales + customer_payments_collected - direct_return_refunds
    ).quantize(Decimal("0.01"))
    if cash_inflow < Decimal("0.00"):
        cash_inflow = Decimal("0.00")

    cash_outflow = (operating_expenses + supplier_payments).quantize(Decimal("0.01"))
    net_cash_flow = (cash_inflow - cash_outflow).quantize(Decimal("0.01"))

    credit_receivables = calculate_credit_receivables(db)
    inventory_value = calculate_inventory_value(db)

    return FinancialSummaryOut(
        start_date=start_date,
        end_date=end_date,
        gross_sales=gross_sales.quantize(Decimal("0.01")),
        sales_invoiced=sales_invoiced.quantize(Decimal("0.01")),
        discounts=total_discounts.quantize(Decimal("0.01")),
        sales_revenue=sales_invoiced.quantize(Decimal("0.01")),
        returns_amount=returns_amount.quantize(Decimal("0.01")),
        net_sales=net_sales,
        cogs=cogs,
        gross_profit=gross_profit,
        gross_margin_pct=gross_margin_pct,
        operating_expenses=operating_expenses,
        net_profit=net_profit,
        net_margin_pct=net_margin_pct,
        direct_paid_sales=direct_paid_sales.quantize(Decimal("0.01")),
        customer_payments_collected=customer_payments_collected.quantize(Decimal("0.01")),
        direct_return_refunds=direct_return_refunds.quantize(Decimal("0.01")),
        cash_inflow=cash_inflow,
        supplier_payments=supplier_payments.quantize(Decimal("0.01")),
        cash_outflow=cash_outflow,
        net_cash_flow=net_cash_flow,
        credit_receivables=credit_receivables,
        inventory_value=inventory_value,
    )


def get_daily_breakdown(
    db: Session, start_date: date, end_date: date
) -> list[DailyFinancialOut]:
    """Generates daily reconciled financial rows for table and charts."""
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )

    # Pre-populate day buckets
    days: dict[date, dict[str, Decimal]] = {}
    curr = start_date
    while curr <= end_date:
        days[curr] = {
            "sales": Decimal("0.00"),
            "direct_sales": Decimal("0.00"),
            "returns": Decimal("0.00"),
            "direct_returns": Decimal("0.00"),
            "sold_cogs": Decimal("0.00"),
            "ret_cogs": Decimal("0.00"),
            "expenses": Decimal("0.00"),
            "supp_payments": Decimal("0.00"),
            "cust_payments": Decimal("0.00"),
        }
        curr += timedelta(days=1)

    # 1. Sales
    sales = (
        db.scalars(
            select(Sale)
            .options(
                joinedload(Sale.items).joinedload(SaleItem.batch)
            )
            .where(
                func.date(Sale.created_at) >= start_date,
                func.date(Sale.created_at) <= end_date,
                Sale.status != SaleStatus.VOID,
            )
        )
        .unique()
        .all()
    )

    for sale in sales:
        d = sale.created_at.date()
        if d in days:
            s_val = Decimal(str(sale.total_amount))
            days[d]["sales"] += s_val
            if sale.payment_method != PaymentMethod.CREDIT:
                days[d]["direct_sales"] += s_val
            for it in sale.items:
                c = Decimal(str(it.batch.purchase_price)) if it.batch else Decimal("0.00")
                days[d]["sold_cogs"] += (Decimal(str(it.quantity)) * c)

    # 2. Returns
    returns = (
        db.scalars(
            select(SaleReturn)
            .options(
                joinedload(SaleReturn.sale_item).joinedload(SaleItem.sale),
                joinedload(SaleReturn.sale_item).joinedload(SaleItem.batch),
            )
            .where(
                func.date(SaleReturn.created_at) >= start_date,
                func.date(SaleReturn.created_at) <= end_date,
            )
        )
        .unique()
        .all()
    )

    for ret in returns:
        d = ret.created_at.date()
        if d in days and ret.sale_item and ret.sale_item.sale:
            s_item = ret.sale_item
            sale = s_item.sale
            qty = Decimal(str(ret.quantity))

            subtotal = sum((Decimal(str(it.unit_price)) * it.quantity for it in sale.items), Decimal("0.00"))
            if subtotal > Decimal("0.00") and Decimal(str(sale.discount)) > Decimal("0.00"):
                eff_unit = (Decimal(str(s_item.unit_price)) * Decimal(str(sale.total_amount)) / subtotal).quantize(Decimal("0.01"))
                r_val = (eff_unit * qty).quantize(Decimal("0.01"))
            else:
                r_val = (Decimal(str(s_item.unit_price)) * qty).quantize(Decimal("0.01"))

            days[d]["returns"] += r_val
            c = Decimal(str(s_item.batch.purchase_price)) if s_item.batch else Decimal("0.00")
            days[d]["ret_cogs"] += (qty * c)
            if sale.payment_method != PaymentMethod.CREDIT:
                days[d]["direct_returns"] += r_val

    # 3. Customer Payments
    payments = db.execute(
        select(
            func.date(CustomerPayment.created_at).label("d"),
            func.sum(CustomerPayment.amount).label("amt"),
        )
        .where(
            func.date(CustomerPayment.created_at) >= start_date,
            func.date(CustomerPayment.created_at) <= end_date,
        )
        .group_by(func.date(CustomerPayment.created_at))
    ).all()
    for row in payments:
        if row.d in days:
            days[row.d]["cust_payments"] += Decimal(str(row.amt or 0))

    # 4. Expenses
    exps = db.execute(
        select(
            Expense.expense_date.label("d"),
            func.sum(Expense.amount).label("amt"),
        )
        .where(
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date,
        )
        .group_by(Expense.expense_date)
    ).all()
    for row in exps:
        if row.d in days:
            days[row.d]["expenses"] += Decimal(str(row.amt or 0))

    # 5. Supplier Payments
    supps = db.execute(
        select(
            SupplierPayment.payment_date.label("d"),
            func.sum(SupplierPayment.amount).label("amt"),
        )
        .where(
            SupplierPayment.payment_date >= start_date,
            SupplierPayment.payment_date <= end_date,
        )
        .group_by(SupplierPayment.payment_date)
    ).all()
    for row in supps:
        if row.d in days:
            days[row.d]["supp_payments"] += Decimal(str(row.amt or 0))

    # Format result
    result: list[DailyFinancialOut] = []
    for d in sorted(days.keys()):
        bucket = days[d]
        net_sales = max(Decimal("0.00"), bucket["sales"] - bucket["returns"]).quantize(Decimal("0.01"))
        cogs = max(Decimal("0.00"), bucket["sold_cogs"] - bucket["ret_cogs"]).quantize(Decimal("0.01"))
        gross_profit = (net_sales - cogs).quantize(Decimal("0.01"))
        expenses = bucket["expenses"].quantize(Decimal("0.01"))
        net_profit = (gross_profit - expenses).quantize(Decimal("0.01"))

        cash_in = max(
            Decimal("0.00"),
            bucket["direct_sales"] + bucket["cust_payments"] - bucket["direct_returns"],
        ).quantize(Decimal("0.01"))
        cash_out = (expenses + bucket["supp_payments"]).quantize(Decimal("0.01"))
        net_cash_flow = (cash_in - cash_out).quantize(Decimal("0.01"))

        result.append(
            DailyFinancialOut(
                date=d,
                sales=bucket["sales"].quantize(Decimal("0.01")),
                sales_revenue=bucket["sales"].quantize(Decimal("0.01")),
                returns=bucket["returns"].quantize(Decimal("0.01")),
                sales_returns=bucket["returns"].quantize(Decimal("0.01")),
                net_sales=net_sales,
                cogs=cogs,
                gross_profit=gross_profit,
                expenses=expenses,
                operating_expenses=expenses,
                net_profit=net_profit,
                cash_in=cash_in,
                cash_inflow=cash_in,
                cash_out=cash_out,
                cash_outflow=cash_out,
                net_cash_flow=net_cash_flow,
            )
        )

    return result


def get_period_comparison(
    db: Session, start_date: date, end_date: date
) -> PeriodComparisonOut:
    """Compares current period performance against equivalent preceding period."""
    duration_days = (end_date - start_date).days + 1
    prev_end = start_date - timedelta(days=1)
    prev_start = prev_end - timedelta(days=duration_days - 1)

    curr_summary = get_financial_summary(db, start_date, end_date)
    prev_summary = get_financial_summary(db, prev_start, prev_end)

    def calc_growth(curr: Decimal, prev: Decimal) -> Decimal:
        if prev == Decimal("0.00"):
            return Decimal("100.00") if curr > Decimal("0.00") else Decimal("0.00")
        return (((curr - prev) / prev) * Decimal("100.00")).quantize(Decimal("0.01"))

    return PeriodComparisonOut(
        current_start_date=start_date,
        current_end_date=end_date,
        previous_start_date=prev_start,
        previous_end_date=prev_end,
        current_net_sales=curr_summary.net_sales,
        previous_net_sales=prev_summary.net_sales,
        sales_growth_pct=calc_growth(curr_summary.net_sales, prev_summary.net_sales),
        current_gross_profit=curr_summary.gross_profit,
        previous_gross_profit=prev_summary.gross_profit,
        profit_growth_pct=calc_growth(curr_summary.gross_profit, prev_summary.gross_profit),
        gross_profit_growth_pct=calc_growth(curr_summary.gross_profit, prev_summary.gross_profit),
        current_net_profit=curr_summary.net_profit,
        previous_net_profit=prev_summary.net_profit,
        net_profit_growth_pct=calc_growth(curr_summary.net_profit, prev_summary.net_profit),
        current_expenses=curr_summary.operating_expenses,
        previous_expenses=prev_summary.operating_expenses,
        expense_growth_pct=calc_growth(curr_summary.operating_expenses, prev_summary.operating_expenses),
        current_cash_flow=curr_summary.net_cash_flow,
        previous_cash_flow=prev_summary.net_cash_flow,
    )


def get_expense_category_breakdown(
    db: Session, start_date: date, end_date: date
) -> list[ExpenseCategoryBreakdownOut]:
    """Provides categorized breakdown of operating expenses with percentage distribution."""
    total_expenses = (
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).where(
                Expense.expense_date >= start_date,
                Expense.expense_date <= end_date,
            )
        )
        or Decimal("0.00")
    )
    total_dec = Decimal(str(total_expenses))

    rows = (
        db.execute(
            select(
                ExpenseCategory.id,
                ExpenseCategory.name,
                ExpenseCategory.name_ar,
                func.coalesce(func.sum(Expense.amount), Decimal("0.00")).label("amt"),
            )
            .join(Expense, Expense.category_id == ExpenseCategory.id)
            .where(
                Expense.expense_date >= start_date,
                Expense.expense_date <= end_date,
            )
            .group_by(ExpenseCategory.id, ExpenseCategory.name, ExpenseCategory.name_ar)
            .order_by(func.sum(Expense.amount).desc())
        )
        .all()
    )

    result = []
    for r in rows:
        amt = Decimal(str(r.amt)).quantize(Decimal("0.01"))
        pct = (
            ((amt / total_dec) * Decimal("100.00")).quantize(Decimal("0.01"))
            if total_dec > Decimal("0.00")
            else Decimal("0.00")
        )
        result.append(
            ExpenseCategoryBreakdownOut(
                category_id=r.id,
                category_name=r.name,
                category_name_ar=r.name_ar,
                total_amount=amt,
                percentage=pct,
            )
        )

    return result


# ---------------------------------------------------------------------------
# Expense & Category CRUD
# ---------------------------------------------------------------------------

def list_expense_categories(db: Session, active_only: bool = True) -> list[ExpenseCategory]:
    stmt = select(ExpenseCategory)
    if active_only:
        stmt = stmt.where(ExpenseCategory.is_active.is_(True))
    return list(db.scalars(stmt.order_by(ExpenseCategory.name.asc())).all())


def create_expense_category(db: Session, payload: ExpenseCategoryCreate) -> ExpenseCategory:
    existing = db.scalar(
        select(ExpenseCategory).where(
            or_(
                func.lower(ExpenseCategory.name) == payload.name.lower().strip(),
                ExpenseCategory.name_ar == payload.name_ar.strip(),
            )
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An expense category with this name already exists",
        )

    cat = ExpenseCategory(
        name=payload.name.strip(),
        name_ar=payload.name_ar.strip(),
        description=payload.description.strip() if payload.description else None,
        is_active=True,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def update_expense_category(
    db: Session, category_id: uuid.UUID, payload: ExpenseCategoryUpdate
) -> ExpenseCategory:
    cat = db.get(ExpenseCategory, category_id)
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Expense category not found"
        )

    if payload.name is not None:
        cat.name = payload.name.strip()
    if payload.name_ar is not None:
        cat.name_ar = payload.name_ar.strip()
    if payload.description is not None:
        cat.description = payload.description.strip()
    if payload.is_active is not None:
        cat.is_active = payload.is_active

    db.commit()
    db.refresh(cat)
    return cat


def list_expenses(
    db: Session,
    start_date: date | None = None,
    end_date: date | None = None,
    category_id: uuid.UUID | None = None,
    payment_method: FinancialPaymentMethod | None = None,
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Expense]:
    stmt = select(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.user),
    )
    if start_date:
        stmt = stmt.where(Expense.expense_date >= start_date)
    if end_date:
        stmt = stmt.where(Expense.expense_date <= end_date)
    if category_id:
        stmt = stmt.where(Expense.category_id == category_id)
    if payment_method:
        stmt = stmt.where(Expense.payment_method == payment_method)
    if search:
        s = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Expense.description.ilike(s),
                Expense.notes.ilike(s),
            )
        )

    return list(
        db.scalars(
            stmt.order_by(Expense.expense_date.desc(), Expense.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )


def create_expense(db: Session, payload: ExpenseCreate, user: User) -> Expense:
    cat = db.get(ExpenseCategory, payload.category_id)
    if not cat or not cat.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Valid and active expense category required",
        )

    expense = Expense(
        category_id=payload.category_id,
        amount=payload.amount,
        expense_date=payload.expense_date,
        payment_method=payload.payment_method,
        description=payload.description.strip(),
        notes=payload.notes.strip() if payload.notes else None,
        created_by=user.id,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


def update_expense(
    db: Session, expense_id: uuid.UUID, payload: ExpenseUpdate, user: User
) -> Expense:
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found"
        )

    if payload.category_id is not None:
        cat = db.get(ExpenseCategory, payload.category_id)
        if not cat or not cat.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category"
            )
        expense.category_id = payload.category_id

    if payload.amount is not None:
        expense.amount = payload.amount
    if payload.expense_date is not None:
        expense.expense_date = payload.expense_date
    if payload.payment_method is not None:
        expense.payment_method = payload.payment_method
    if payload.description is not None:
        expense.description = payload.description.strip()
    if payload.notes is not None:
        expense.notes = payload.notes.strip()

    db.commit()
    db.refresh(expense)
    return expense


def delete_expense(db: Session, expense_id: uuid.UUID, user: User) -> None:
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found"
        )
    db.delete(expense)
    db.commit()


# ---------------------------------------------------------------------------
# Supplier Payments CRUD
# ---------------------------------------------------------------------------

def list_supplier_payments(
    db: Session,
    supplier_id: uuid.UUID | None = None,
    purchase_id: uuid.UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[SupplierPayment]:
    stmt = select(SupplierPayment).options(
        joinedload(SupplierPayment.supplier),
        joinedload(SupplierPayment.purchase),
    )
    if supplier_id:
        stmt = stmt.where(SupplierPayment.supplier_id == supplier_id)
    if purchase_id:
        stmt = stmt.where(SupplierPayment.purchase_id == purchase_id)
    if start_date:
        stmt = stmt.where(SupplierPayment.payment_date >= start_date)
    if end_date:
        stmt = stmt.where(SupplierPayment.payment_date <= end_date)

    return list(
        db.scalars(
            stmt.order_by(SupplierPayment.payment_date.desc(), SupplierPayment.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )


def create_supplier_payment(
    db: Session, payload: SupplierPaymentCreate, user: User
) -> SupplierPayment:
    supplier = db.get(Supplier, payload.supplier_id)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found"
        )

    if payload.purchase_id:
        purchase = db.get(Purchase, payload.purchase_id)
        if not purchase:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found"
            )

    sp = SupplierPayment(
        supplier_id=payload.supplier_id,
        purchase_id=payload.purchase_id,
        amount=payload.amount,
        payment_date=payload.payment_date,
        payment_method=payload.payment_method,
        reference_number=payload.reference_number.strip() if payload.reference_number else None,
        notes=payload.notes.strip() if payload.notes else None,
        created_by=user.id,
    )
    db.add(sp)
    db.commit()
    db.refresh(sp)
    return sp
