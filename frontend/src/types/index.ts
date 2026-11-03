export type UserRole = "admin" | "pharmacist" | "cashier" | "inventory_manager";

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  is_primary_admin?: boolean;
  created_at: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface DrugFamily {
  id: string;
  name_en: string;
  name_ar: string;
  code?: string | null;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DosageForm {
  id: string;
  name_en: string;
  name_ar: string;
  code?: string | null;
  category?: string | null;
  subtype?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProductSubcategory {
  id: string;
  category_id: string;
  name_en: string;
  name_ar: string;
  code?: string | null;
  description?: string | null;
  is_active: boolean;
}

export interface ProductCategory {
  id: string;
  name_en: string;
  name_ar: string;
  code: string;
  description?: string | null;
  is_active: boolean;
  subcategories: ProductSubcategory[];
}

export interface ActiveIngredient {
  id: string;
  name_en: string;
  name_ar?: string | null;
  normalized_name: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MedicineActiveIngredient {
  id?: string;
  medicine_id?: string;
  active_ingredient_id: string;
  strength_value?: number | null;
  strength_unit?: string | null;
  display_strength?: string | null;
  active_ingredient?: ActiveIngredient | null;
}

export interface MedicinePackageUnit {
  id?: string;
  medicine_id?: string;
  unit_name_en: string;
  unit_name_ar: string;
  conversion_factor: number;
  selling_price: number;
  purchase_price?: number;
  barcode?: string | null;
  is_base_unit: boolean;
  is_default_dispense: boolean;
  allow_selling: boolean;
  is_active?: boolean;
}

export interface Medicine {
  id: string;
  name: string;
  name_ar?: string | null;
  generic_name?: string | null;
  barcode?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  dosage?: string | null;
  form?: string | null;
  drug_family_id?: string | null;
  dosage_form_id?: string | null;
  strength?: string | null;
  base_unit_name?: string;
  product_type?: "medicine" | "general" | string;
  category_id?: string | null;
  category_rel?: ProductCategory | null;
  subcategory_id?: string | null;
  subcategory_rel?: ProductSubcategory | null;
  sku?: string | null;
  selling_price: number;
  purchase_price: number;
  minimum_stock: number;
  requires_prescription: boolean;
  is_controlled?: boolean;
  controlled_schedule?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  total_stock?: number;
  drug_family?: DrugFamily | null;
  dosage_form?: DosageForm | null;
  active_ingredients?: MedicineActiveIngredient[];
  package_units?: MedicinePackageUnit[];
}

export interface MedicineBatch {
  id: string;
  medicine_id: string;
  batch_number?: string | null;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  supplier_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LowStockItem {
  medicine_id: string;
  medicine_name: string;
  barcode?: string | null;
  current_stock: number;
  minimum_stock: number;
}

export interface ExpiringItem {
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number?: string | null;
  expiry_date: string;
  quantity: number;
  days_until_expiry: number;
  is_expired: boolean;
  severity: "critical" | "warning";
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  credit_status?: CreditStatus;
  credit_limit?: number;
  payment_terms_days?: number | null;
  created_at: string;
}

export interface CustomerStats {
  customer_id: string;
  total_visits: number;
  total_spent: number;
  average_basket_value: number;
  first_purchase_date?: string | null;
  last_purchase_date?: string | null;
  top_medicines: Array<{
    medicine_id: string;
    medicine_name: string;
    total_quantity: number;
    total_spent: number;
  }>;
}

export interface SaleReturn {
  id: string;
  sale_item_id: string;
  quantity: number;
  reason?: string | null;
  restocked: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contact_person?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = "cash" | "card" | "wallet" | "insurance" | "credit";
export type CreditStatus = "disabled" | "active" | "suspended";
export type CreditTransactionType = "credit_sale" | "payment" | "return" | "adjustment";
export type CustomerPaymentMethod = "cash" | "card" | "wallet" | "bank_transfer";

export interface CustomerCreditAccount {
  credit_status: CreditStatus;
  credit_limit: number;
  payment_terms_days?: number | null;
  outstanding_balance: number;
  available_credit: number;
}

export interface CustomerCreditAccountUpdatePayload {
  credit_status?: CreditStatus;
  credit_limit?: number;
  payment_terms_days?: number | null;
}

export interface CustomerPaymentCreatePayload {
  amount: number;
  payment_method: CustomerPaymentMethod;
  notes?: string | null;
}

export interface CustomerPayment {
  id: string;
  customer_id: string;
  amount: number;
  payment_method: CustomerPaymentMethod;
  notes?: string | null;
  user_id?: string | null;
  created_at: string;
}

export interface CustomerCreditTransaction {
  id: string;
  customer_id: string;
  transaction_type: CreditTransactionType;
  amount: number;
  balance_after: number | null;
  sale_id?: string | null;
  payment_id?: string | null;
  return_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface CustomerReceivable {
  customer_id: string;
  customer_name: string;
  customer_phone?: string | null;
  credit_status: CreditStatus;
  credit_limit: number;
  outstanding_balance: number;
  available_credit: number;
}

export type SaleStatus = "completed" | "partially_returned" | "returned" | "void";

export interface SaleItem {
  id: string;
  sale_id?: string;
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number?: string | null;
  package_unit_id?: string | null;
  unit_name?: string | null;
  conversion_factor?: number;
  base_quantity?: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  medicine_name_snapshot?: string | null;
  classification_snapshot?: string | null;
  controlled_schedule_snapshot?: string | null;
  batch_number_snapshot?: string | null;
}

export interface Sale {
  id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  user_id?: string | null;
  user_full_name?: string | null;
  total_amount: number;
  discount: number;
  payment_method: PaymentMethod;
  status: SaleStatus;
  has_controlled_medicine?: boolean;
  purchaser_name?: string | null;
  purchaser_id_number?: string | null;
  purchaser_phone?: string | null;
  prescription_reference?: string | null;
  doctor_name?: string | null;
  doctor_license?: string | null;
  prescription_date?: string | null;
  created_at: string;
  items?: SaleItem[];
}

export interface ControlledTransactionItem {
  transaction_id: string;
  item_id: string;
  timestamp: string;
  type: "sale" | "return" | "adjustment" | string;
  type_display_en: string;
  type_display_ar: string;
  medicine_id: string;
  medicine_name: string;
  medicine_name_ar?: string | null;
  classification: string;
  schedule?: string | null;
  schedule_display_en: string;
  schedule_display_ar: string;
  batch_number?: string | null;
  quantity: number;
  package_unit: string;
  conversion_factor: number;
  base_quantity: number;
  unit_price: number;
  total_price: number;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  purchaser_name?: string | null;
  purchaser_id_number?: string | null;
  purchaser_phone?: string | null;
  prescription_reference?: string | null;
  doctor_name?: string | null;
  doctor_license?: string | null;
  prescription_date?: string | null;
  user_id?: string | null;
  user_full_name?: string | null;
  user_role?: string | null;
  original_reference?: string | null;
  notes?: string | null;
}

export interface ControlledReportSummary {
  total_records: number;
  total_sales_base_quantity: number;
  total_returns_base_quantity: number;
  total_adjustments_base_quantity: number;
  net_dispensed_base_quantity: number;
}

export interface ControlledReportResponse {
  records: ControlledTransactionItem[];
  total_count: number;
  page: number;
  limit: number;
  summary: ControlledReportSummary;
}

export interface ControlledReportFilters {
  start_date?: string;
  end_date?: string;
  medicine_id?: string;
  controlled_schedule?: string;
  transaction_type?: string;
  customer_id?: string;
  user_id?: string;
  invoice_ref?: string;
  page?: number;
  limit?: number;
}

export type PurchaseStatus = "ordered" | "received" | "cancelled";

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  medicine_id: string;
  medicine_name?: string | null;
  batch_id?: string | null;
  package_unit_id?: string | null;
  unit_name?: string | null;
  conversion_factor?: number;
  base_quantity?: number;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Purchase {
  id: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  user_id?: string | null;
  total_amount: number;
  status: PurchaseStatus;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
  items?: PurchaseItem[];
}

export type NotificationType =
  | "low_stock"
  | "expiring_soon"
  | "expired"
  | "stockout_predicted"
  | "reorder_suggested";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface Notification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  related_medicine_id?: string | null;
  related_batch_id?: string | null;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
  updated_at?: string | null;
}

export type ForecastMethod =
  | "moving_average"
  | "weighted_moving_average"
  | "exponential_smoothing"
  | "ml_model";

export interface DemandForecast {
  id: string;
  medicine_id: string;
  medicine_name?: string | null;
  method: ForecastMethod;
  forecast_date: string;
  predicted_daily_demand: number;
  predicted_stockout_date?: string | null;
  days_until_stockout?: number | null;
  current_stock?: number | null;
  recommended_reorder_qty?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface DailyDemandPoint {
  date: string;
  quantity_sold: number;
}

export interface MedicineForecastDetail {
  forecast: DemandForecast;
  history: DailyDemandPoint[];
}

export interface InventoryMovement {
  id: string;
  medicine_id: string;
  medicine_name?: string | null;
  batch_id?: string | null;
  batch_number?: string | null;
  quantity_change: number;
  reason: string;
  reference_type?: string | null;
  reference_id?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Financial & Profitability Management
// ---------------------------------------------------------------------------

export type FinancialPaymentMethod = "cash" | "card" | "bank_transfer" | "check" | "other";

export interface ExpenseCategory {
  id: string;
  name: string;
  name_ar: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Expense {
  id: string;
  category_id: string;
  category_name?: string | null;
  category_name_ar?: string | null;
  amount: number;
  expense_date: string;
  payment_method: FinancialPaymentMethod;
  description: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ExpenseCategoryBreakdown {
  category_id: string;
  category_name: string;
  category_name_ar: string;
  total_amount: number;
  percentage: number;
}

export interface FinancialSummary {
  start_date: string;
  end_date: string;
  sales_invoiced: number;
  returns_amount: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  operating_expenses: number;
  net_profit: number;
  net_margin_pct: number;
  direct_paid_sales: number;
  customer_payments_collected: number;
  direct_return_refunds: number;
  cash_inflow: number;
  supplier_payments: number;
  cash_outflow: number;
  net_cash_flow: number;
  credit_receivables: number;
  inventory_value: number;
}

export interface DailyFinancialBreakdown {
  date: string;
  sales_revenue?: number;
  sales?: number;
  sales_returns?: number;
  returns?: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  operating_expenses?: number;
  expenses?: number;
  net_profit: number;
  cash_inflow?: number;
  cash_in?: number;
  cash_outflow?: number;
  cash_out?: number;
  net_cash_flow: number;
}

export interface FinancialPeriodComparison {
  current_start_date?: string | null;
  current_end_date?: string | null;
  previous_start_date?: string | null;
  previous_end_date?: string | null;
  current_net_sales: number;
  previous_net_sales: number;
  sales_growth_pct: number;
  current_gross_profit: number;
  previous_gross_profit: number;
  profit_growth_pct: number;
  gross_profit_growth_pct: number;
  current_net_profit: number;
  previous_net_profit: number;
  net_profit_growth_pct: number;
  current_expenses: number;
  previous_expenses: number;
  expense_growth_pct: number;
  current_cash_flow: number;
  previous_cash_flow: number;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  supplier_name?: string | null;
  purchase_id?: string | null;
  amount: number;
  payment_date: string;
  payment_method: FinancialPaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}
