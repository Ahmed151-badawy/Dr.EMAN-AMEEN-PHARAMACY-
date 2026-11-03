import uuid
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field

from app.models.financial import FinancialPaymentMethod


class ExpenseCategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    name_ar: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=255)


class ExpenseCategoryCreate(ExpenseCategoryBase):
    pass


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    name_ar: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=255)
    is_active: bool | None = None


class ExpenseCategoryOut(ExpenseCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ExpenseBase(BaseModel):
    category_id: uuid.UUID
    amount: Decimal = Field(..., gt=Decimal("0.00"), max_digits=10, decimal_places=2)
    expense_date: date
    payment_method: FinancialPaymentMethod = FinancialPaymentMethod.CASH
    description: str = Field(..., min_length=1, max_length=255)
    notes: str | None = Field(None, max_length=500)


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    amount: Decimal | None = Field(None, gt=Decimal("0.00"), max_digits=10, decimal_places=2)
    expense_date: date | None = None
    payment_method: FinancialPaymentMethod | None = None
    description: str | None = Field(None, min_length=1, max_length=255)
    notes: str | None = Field(None, max_length=500)


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID
    category_name: str | None = None
    category_name_ar: str | None = None
    amount: Decimal
    expense_date: date
    payment_method: FinancialPaymentMethod
    description: str
    notes: str | None = None
    created_by: uuid.UUID | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class SupplierPaymentCreate(BaseModel):
    supplier_id: uuid.UUID
    purchase_id: uuid.UUID | None = None
    amount: Decimal = Field(..., gt=Decimal("0.00"), max_digits=10, decimal_places=2)
    payment_date: date
    payment_method: FinancialPaymentMethod = FinancialPaymentMethod.CASH
    reference_number: str | None = Field(None, max_length=100)
    notes: str | None = Field(None, max_length=500)


class SupplierPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    supplier_id: uuid.UUID
    supplier_name: str | None = None
    purchase_id: uuid.UUID | None = None
    amount: Decimal
    payment_date: date
    payment_method: FinancialPaymentMethod
    reference_number: str | None = None
    notes: str | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime


class FinancialSummaryOut(BaseModel):
    start_date: date
    end_date: date
    gross_sales: Decimal
    sales_invoiced: Decimal = Decimal("0.00")
    discounts: Decimal
    sales_revenue: Decimal
    returns_amount: Decimal
    net_sales: Decimal
    cogs: Decimal
    gross_profit: Decimal
    gross_margin_pct: Decimal
    operating_expenses: Decimal
    net_profit: Decimal
    net_margin_pct: Decimal
    direct_paid_sales: Decimal = Decimal("0.00")
    customer_payments_collected: Decimal = Decimal("0.00")
    direct_return_refunds: Decimal = Decimal("0.00")
    cash_inflow: Decimal
    supplier_payments: Decimal = Decimal("0.00")
    cash_outflow: Decimal
    net_cash_flow: Decimal
    credit_receivables: Decimal
    inventory_value: Decimal


class DailyFinancialOut(BaseModel):
    date: date
    sales: Decimal
    sales_revenue: Decimal = Decimal("0.00")
    returns: Decimal
    sales_returns: Decimal = Decimal("0.00")
    net_sales: Decimal
    cogs: Decimal
    gross_profit: Decimal
    expenses: Decimal
    operating_expenses: Decimal = Decimal("0.00")
    net_profit: Decimal
    cash_in: Decimal
    cash_inflow: Decimal = Decimal("0.00")
    cash_out: Decimal
    cash_outflow: Decimal = Decimal("0.00")
    net_cash_flow: Decimal


class PeriodComparisonOut(BaseModel):
    current_start_date: date | None = None
    current_end_date: date | None = None
    previous_start_date: date | None = None
    previous_end_date: date | None = None
    current_net_sales: Decimal
    previous_net_sales: Decimal
    sales_growth_pct: Decimal
    current_gross_profit: Decimal
    previous_gross_profit: Decimal
    profit_growth_pct: Decimal
    gross_profit_growth_pct: Decimal = Decimal("0.00")
    current_net_profit: Decimal
    previous_net_profit: Decimal
    net_profit_growth_pct: Decimal
    current_expenses: Decimal = Decimal("0.00")
    previous_expenses: Decimal = Decimal("0.00")
    expense_growth_pct: Decimal = Decimal("0.00")
    current_cash_flow: Decimal
    previous_cash_flow: Decimal


class ExpenseCategoryBreakdownOut(BaseModel):
    category_id: uuid.UUID
    category_name: str
    category_name_ar: str
    total_amount: Decimal
    percentage: Decimal
