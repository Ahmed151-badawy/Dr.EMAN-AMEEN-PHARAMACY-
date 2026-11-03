import { apiRequest } from "./client";
import {
  DailyFinancialBreakdown,
  Expense,
  ExpenseCategory,
  ExpenseCategoryBreakdown,
  FinancialPeriodComparison,
  FinancialSummary,
  SupplierPayment,
  FinancialPaymentMethod,
} from "../../types";

export interface ExpenseCreatePayload {
  category_id: string;
  amount: number;
  expense_date: string;
  payment_method: FinancialPaymentMethod;
  description: string;
  notes?: string | null;
}

export interface ExpenseUpdatePayload {
  category_id?: string;
  amount?: number;
  expense_date?: string;
  payment_method?: FinancialPaymentMethod;
  description?: string;
  notes?: string | null;
}

export interface ExpenseCategoryCreatePayload {
  name: string;
  name_ar: string;
  description?: string | null;
}

export interface ExpenseCategoryUpdatePayload {
  name?: string;
  name_ar?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface SupplierPaymentCreatePayload {
  supplier_id: string;
  purchase_id?: string | null;
  amount: number;
  payment_date: string;
  payment_method: FinancialPaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
}

export interface FinancialDateFilters {
  start_date?: string;
  end_date?: string;
}

export interface ExpenseFilters extends FinancialDateFilters {
  category_id?: string;
  payment_method?: FinancialPaymentMethod;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SupplierPaymentFilters extends FinancialDateFilters {
  supplier_id?: string;
  purchase_id?: string;
  limit?: number;
  offset?: number;
}

export const financialApi = {
  getSummary: async (filters: FinancialDateFilters = {}): Promise<FinancialSummary> => {
    return apiRequest<FinancialSummary>("/financial/summary", {
      params: filters as Record<string, any>,
    });
  },

  getDailyBreakdown: async (filters: FinancialDateFilters = {}): Promise<DailyFinancialBreakdown[]> => {
    return apiRequest<DailyFinancialBreakdown[]>("/financial/daily", {
      params: filters as Record<string, any>,
    });
  },

  getPeriodComparison: async (period: "today" | "this_week" | "this_month" = "this_month"): Promise<FinancialPeriodComparison> => {
    return apiRequest<FinancialPeriodComparison>("/financial/comparison", {
      params: { period },
    });
  },

  getExpenseBreakdown: async (filters: FinancialDateFilters = {}): Promise<ExpenseCategoryBreakdown[]> => {
    return apiRequest<ExpenseCategoryBreakdown[]>("/financial/expense-breakdown", {
      params: filters as Record<string, any>,
    });
  },

  listCategories: async (activeOnly: boolean = true): Promise<ExpenseCategory[]> => {
    return apiRequest<ExpenseCategory[]>("/financial/expense-categories", {
      params: { active_only: activeOnly },
    });
  },

  createCategory: async (payload: ExpenseCategoryCreatePayload): Promise<ExpenseCategory> => {
    return apiRequest<ExpenseCategory>("/financial/expense-categories", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateCategory: async (id: string, payload: ExpenseCategoryUpdatePayload): Promise<ExpenseCategory> => {
    return apiRequest<ExpenseCategory>(`/financial/expense-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  listExpenses: async (filters: ExpenseFilters = {}): Promise<Expense[]> => {
    return apiRequest<Expense[]>("/financial/expenses", {
      params: filters as Record<string, any>,
    });
  },

  createExpense: async (payload: ExpenseCreatePayload): Promise<Expense> => {
    return apiRequest<Expense>("/financial/expenses", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateExpense: async (id: string, payload: ExpenseUpdatePayload): Promise<Expense> => {
    return apiRequest<Expense>(`/financial/expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteExpense: async (id: string): Promise<void> => {
    return apiRequest<void>(`/financial/expenses/${id}`, {
      method: "DELETE",
    });
  },

  listSupplierPayments: async (filters: SupplierPaymentFilters = {}): Promise<SupplierPayment[]> => {
    return apiRequest<SupplierPayment[]>("/financial/supplier-payments", {
      params: filters as Record<string, any>,
    });
  },

  createSupplierPayment: async (payload: SupplierPaymentCreatePayload): Promise<SupplierPayment> => {
    return apiRequest<SupplierPayment>("/financial/supplier-payments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
