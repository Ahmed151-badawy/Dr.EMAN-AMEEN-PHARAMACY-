import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  CreditCard,
  Building2,
  Wallet,
  Plus,
  Trash2,
  Edit2,
  FileSpreadsheet,
  Printer,
  Calendar,
  CheckCircle2,
  Layers,
  Search,
  X,
  PieChart as PieChartIcon,
  BarChart3,
  Landmark,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  financialApi,
  ExpenseCreatePayload,
  ExpenseUpdatePayload,
  ExpenseCategoryCreatePayload,
  SupplierPaymentCreatePayload,
  FinancialDateFilters,
} from "../services/api/financial";
import { suppliersApi } from "../services/api/suppliers";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import {
  Expense,
  FinancialPaymentMethod,
} from "../types";

export const Financial: React.FC = () => {
  const { t, direction, language } = useI18n();
  const { user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "admin";
  const canRecordPayments = user?.role === "admin" || user?.role === "pharmacist";

  // Tab State
  const [activeTab, setActiveTab] = useState<
    "overview" | "expenses" | "categories" | "supplierPayments"
  >("overview");

  // Date Preset Filters
  const [preset, setPreset] = useState<
    "today" | "thisWeek" | "thisMonth" | "last7Days" | "last30Days" | "custom"
  >("thisMonth");

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => today.toISOString().split("T")[0], [today]);

  const getDateRange = (selectedPreset: string): { start_date: string; end_date: string } => {
    const end = new Date();
    const start = new Date();

    if (selectedPreset === "today") {
      // today only
    } else if (selectedPreset === "thisWeek") {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
    } else if (selectedPreset === "thisMonth") {
      start.setDate(1);
    } else if (selectedPreset === "last7Days") {
      start.setDate(end.getDate() - 6);
    } else if (selectedPreset === "last30Days") {
      start.setDate(end.getDate() - 29);
    }

    return {
      start_date: start.toISOString().split("T")[0],
      end_date: end.toISOString().split("T")[0],
    };
  };

  const [customStartDate, setCustomStartDate] = useState(todayStr);
  const [customEndDate, setCustomEndDate] = useState(todayStr);

  const activeDates: FinancialDateFilters = useMemo(() => {
    if (preset === "custom") {
      return { start_date: customStartDate, end_date: customEndDate };
    }
    return getDateRange(preset);
  }, [preset, customStartDate, customEndDate]);

  // Comparison period mapping
  const comparisonPeriodParam = useMemo(() => {
    if (preset === "today") return "today";
    if (preset === "thisWeek") return "this_week";
    return "this_month";
  }, [preset]);

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  // 1. Financial Summary
  const { data: summary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["financial", "summary", activeDates.start_date, activeDates.end_date],
    queryFn: () => financialApi.getSummary(activeDates),
  });

  // 2. Daily Breakdown
  const { data: dailyBreakdown, isLoading: isLoadingDaily } = useQuery({
    queryKey: ["financial", "daily", activeDates.start_date, activeDates.end_date],
    queryFn: () => financialApi.getDailyBreakdown(activeDates),
  });

  // 3. Growth Comparison
  const { data: comparison } = useQuery({
    queryKey: ["financial", "comparison", comparisonPeriodParam],
    queryFn: () => financialApi.getPeriodComparison(comparisonPeriodParam),
    enabled: preset === "today" || preset === "thisWeek" || preset === "thisMonth",
  });

  // 4. Expense Breakdown
  const { data: expenseBreakdown } = useQuery({
    queryKey: ["financial", "expense-breakdown", activeDates.start_date, activeDates.end_date],
    queryFn: () => financialApi.getExpenseBreakdown(activeDates),
  });

  // 5. Expense Categories
  const { data: categories = [] } = useQuery({
    queryKey: ["financial", "categories"],
    queryFn: () => financialApi.listCategories(false),
  });

  // 6. Expense List
  const [expenseSearch, setExpenseSearch] = useState("");
  const [selectedExpenseCat, setSelectedExpenseCat] = useState<string>("all");
  const { data: expensesList = [], isLoading: isLoadingExpenses } = useQuery({
    queryKey: [
      "financial",
      "expenses",
      activeDates.start_date,
      activeDates.end_date,
      selectedExpenseCat,
      expenseSearch,
    ],
    queryFn: () =>
      financialApi.listExpenses({
        start_date: activeDates.start_date,
        end_date: activeDates.end_date,
        category_id: selectedExpenseCat === "all" ? undefined : selectedExpenseCat,
        search: expenseSearch ? expenseSearch : undefined,
      }),
  });

  // 7. Suppliers & Purchase Orders (for supplier payments)
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", "list"],
    queryFn: () => suppliersApi.list(),
  });

  const { data: supplierPayments = [], isLoading: isLoadingPayments } = useQuery({
    queryKey: ["financial", "supplier-payments", activeDates.start_date, activeDates.end_date],
    queryFn: () => financialApi.listSupplierPayments(activeDates),
  });

  // -------------------------------------------------------------------------
  // Modals & Forms State
  // -------------------------------------------------------------------------

  // Expense Modal
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseCreatePayload>({
    category_id: "",
    amount: 0,
    expense_date: todayStr,
    payment_method: "cash",
    description: "",
    notes: "",
  });

  // Category Modal
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catForm, setCatForm] = useState<ExpenseCategoryCreatePayload>({
    name: "",
    name_ar: "",
    description: "",
  });

  // Supplier Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<SupplierPaymentCreatePayload>({
    supplier_id: "",
    purchase_id: undefined,
    amount: 0,
    payment_date: todayStr,
    payment_method: "bank_transfer",
    reference_number: "",
    notes: "",
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const createExpenseMutation = useMutation({
    mutationFn: (payload: ExpenseCreatePayload) => financialApi.createExpense(payload),
    onSuccess: () => {
      success(t("financial.alerts.expenseCreated"));
      setIsExpenseModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ExpenseUpdatePayload }) =>
      financialApi.updateExpense(id, payload),
    onSuccess: () => {
      success(t("financial.alerts.expenseUpdated"));
      setIsExpenseModalOpen(false);
      setEditingExpenseId(null);
      queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => financialApi.deleteExpense(id),
    onSuccess: () => {
      success(t("financial.alerts.expenseDeleted"));
      queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (payload: ExpenseCategoryCreatePayload) =>
      financialApi.createCategory(payload),
    onSuccess: () => {
      success(t("financial.alerts.categoryCreated"));
      setIsCatModalOpen(false);
      setCatForm({ name: "", name_ar: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["financial", "categories"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: (payload: SupplierPaymentCreatePayload) =>
      financialApi.createSupplierPayment(payload),
    onSuccess: () => {
      success(t("financial.alerts.paymentCreated"));
      setIsPaymentModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // -------------------------------------------------------------------------
  // Helpers & Formatting
  // -------------------------------------------------------------------------

  const formatCurrency = (val: number | undefined | null) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const handleExportCsv = () => {
    if (!dailyBreakdown || dailyBreakdown.length === 0) {
      error(t("common.noResults"));
      return;
    }

    const headers = [
      t("financial.table.date"),
      t("financial.table.sales"),
      t("financial.table.returns"),
      t("financial.table.netSales"),
      t("financial.table.cogs"),
      t("financial.table.grossProfit"),
      t("financial.table.expenses"),
      t("financial.table.netProfit"),
      t("financial.table.cashIn"),
      t("financial.table.cashOut"),
      t("financial.table.netCash"),
    ];

    const rows = dailyBreakdown.map((d) => [
      d.date,
      d.sales_revenue ?? d.sales ?? 0,
      d.sales_returns ?? d.returns ?? 0,
      d.net_sales ?? 0,
      d.cogs ?? 0,
      d.gross_profit ?? 0,
      d.operating_expenses ?? d.expenses ?? 0,
      d.net_profit ?? 0,
      d.cash_inflow ?? d.cash_in ?? 0,
      d.cash_outflow ?? d.cash_out ?? 0,
      d.net_cash_flow ?? 0,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `financial_report_${activeDates.start_date}_to_${activeDates.end_date}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleOpenEditExpense = (exp: Expense) => {
    setEditingExpenseId(exp.id);
    setExpenseForm({
      category_id: exp.category_id,
      amount: exp.amount,
      expense_date: exp.expense_date,
      payment_method: exp.payment_method,
      description: exp.description,
      notes: exp.notes || "",
    });
    setIsExpenseModalOpen(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header & Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            <Landmark size={28} color="var(--color-primary)" />
            {t("financial.title")}
          </h1>
          <p
            style={{
              color: "var(--color-text-muted)",
              fontSize: "0.9rem",
              marginTop: "0.25rem",
            }}
          >
            {t("financial.subtitle")}
          </p>
        </div>

        {/* Global Financial Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          {isAdmin && (
            <Button
              variant="primary"
              onClick={() => {
                setEditingExpenseId(null);
                setExpenseForm({
                  category_id: categories.length > 0 ? categories[0].id : "",
                  amount: 0,
                  expense_date: todayStr,
                  payment_method: "cash",
                  description: "",
                  notes: "",
                });
                setIsExpenseModalOpen(true);
              }}
              leftIcon={<Plus size={16} />}
            >
              {t("financial.expenses.addExpense")}
            </Button>
          )}

          {canRecordPayments && (
            <Button
              variant="secondary"
              onClick={() => {
                setPaymentForm({
                  supplier_id: suppliers.length > 0 ? suppliers[0].id : "",
                  purchase_id: undefined,
                  amount: 0,
                  payment_date: todayStr,
                  payment_method: "bank_transfer",
                  reference_number: "",
                  notes: "",
                });
                setIsPaymentModalOpen(true);
              }}
              leftIcon={<Wallet size={16} />}
            >
              {t("financial.supplierPayments.addPayment")}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleExportCsv}
            leftIcon={<FileSpreadsheet size={16} />}
          >
            {t("financial.table.exportCsv")}
          </Button>

          <Button
            variant="outline"
            onClick={handlePrint}
            leftIcon={<Printer size={16} />}
          >
            {t("financial.table.printReport")}
          </Button>
        </div>
      </div>

      {/* Period Filter Bar */}
      <Card
        style={{
          padding: "0.85rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <Calendar size={18} color="var(--color-primary)" style={{ marginInlineEnd: "0.4rem" }} />
          {(
            [
              { key: "today", label: t("financial.periods.today") },
              { key: "thisWeek", label: t("financial.periods.thisWeek") },
              { key: "thisMonth", label: t("financial.periods.thisMonth") },
              { key: "last7Days", label: t("financial.periods.last7Days") },
              { key: "last30Days", label: t("financial.periods.last30Days") },
              { key: "custom", label: t("financial.periods.custom") },
            ] as const
          ).map((p) => {
            const isSelected = preset === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                style={{
                  padding: "0.45rem 0.85rem",
                  fontSize: "0.85rem",
                  fontWeight: isSelected ? 700 : 500,
                  borderRadius: "var(--radius-full)",
                  border: isSelected
                    ? "1.5px solid var(--color-primary)"
                    : "1px solid var(--color-border)",
                  background: isSelected
                    ? "var(--color-primary-subtle)"
                    : "transparent",
                  color: isSelected
                    ? "var(--color-primary)"
                    : "var(--color-text)",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {preset === "custom" && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              style={{
                padding: "0.4rem 0.6rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                fontSize: "0.85rem",
                background: "var(--color-surface)",
              }}
            />
            <span style={{ color: "var(--color-text-muted)" }}>—</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              style={{
                padding: "0.4rem 0.6rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                fontSize: "0.85rem",
                background: "var(--color-surface)",
              }}
            />
          </div>
        )}

        <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          {activeDates.start_date} → {activeDates.end_date}
        </div>
      </Card>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--color-border)",
          gap: "1.5rem",
        }}
      >
        {(
          [
            { id: "overview", label: t("financial.tabs.overview"), icon: <BarChart3 size={17} /> },
            { id: "expenses", label: t("financial.tabs.expenses"), icon: <Receipt size={17} /> },
            { id: "categories", label: t("financial.tabs.categories"), icon: <Layers size={17} /> },
            { id: "supplierPayments", label: t("financial.tabs.supplierPayments"), icon: <Wallet size={17} /> },
          ] as const
        ).map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 0.25rem",
                fontSize: "0.95rem",
                fontWeight: isSelected ? 700 : 500,
                color: isSelected ? "var(--color-primary)" : "var(--color-text-muted)",
                background: "transparent",
                border: "none",
                borderBottom: isSelected ? "2.5px solid var(--color-primary)" : "2.5px solid transparent",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: FINANCIAL OVERVIEW */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Growth Comparison Banner */}
          {comparison && (
            <Card
              style={{
                padding: "1rem 1.5rem",
                background: "linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
                border: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <TrendingUp size={24} color="var(--color-primary)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-text)" }}>
                    {t("financial.comparison.title")}
                  </div>
                  {comparison.previous_start_date && comparison.previous_end_date && (
                    <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      {comparison.previous_start_date} — {comparison.previous_end_date}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {t("financial.comparison.salesGrowth")}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "1rem",
                      color:
                        Number(comparison.sales_growth_pct || 0) >= 0 ? "var(--color-success)" : "var(--color-danger)",
                    }}
                  >
                    {Number(comparison.sales_growth_pct || 0) >= 0 ? "+" : ""}
                    {comparison.sales_growth_pct ?? 0}%
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {t("financial.comparison.grossProfitGrowth")}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "1rem",
                      color:
                        Number(comparison.gross_profit_growth_pct ?? comparison.profit_growth_pct ?? 0) >= 0
                          ? "var(--color-success)"
                          : "var(--color-danger)",
                    }}
                  >
                    {Number(comparison.gross_profit_growth_pct ?? comparison.profit_growth_pct ?? 0) >= 0 ? "+" : ""}
                    {comparison.gross_profit_growth_pct ?? comparison.profit_growth_pct ?? 0}%
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {t("financial.comparison.netProfitGrowth")}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "1rem",
                      color:
                        Number(comparison.net_profit_growth_pct || 0) >= 0 ? "var(--color-success)" : "var(--color-danger)",
                    }}
                  >
                    {Number(comparison.net_profit_growth_pct || 0) >= 0 ? "+" : ""}
                    {comparison.net_profit_growth_pct ?? 0}%
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {t("financial.comparison.expenseGrowth")}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "1rem",
                      color:
                        Number(comparison.expense_growth_pct || 0) <= 0 ? "var(--color-success)" : "var(--color-warning)",
                    }}
                  >
                    {Number(comparison.expense_growth_pct || 0) >= 0 ? "+" : ""}
                    {comparison.expense_growth_pct ?? 0}%
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 10 Comprehensive KPI Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
            {/* 1. Invoiced Sales */}
            <Card style={{ padding: "1.25rem", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.salesInvoiced")}</span>
                <DollarSign size={18} color="var(--color-primary)" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text)", marginTop: "0.5rem" }}>
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `${formatCurrency(summary?.sales_invoiced)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                {t("financial.kpi.salesInvoicedSub")}
              </div>
            </Card>

            {/* 2. Sales Returns */}
            <Card style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.salesReturns")}</span>
                <TrendingDown size={18} color="var(--color-danger)" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-danger)", marginTop: "0.5rem" }}>
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `-${formatCurrency(summary?.returns_amount)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                {t("financial.kpi.salesReturnsSub")}
              </div>
            </Card>

            {/* 3. Net Sales Revenue */}
            <Card style={{ padding: "1.25rem", borderLeft: "4px solid var(--color-primary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.netSales")}</span>
                <CheckCircle2 size={18} color="var(--color-primary)" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-primary)", marginTop: "0.5rem" }}>
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `${formatCurrency(summary?.net_sales)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                {t("financial.kpi.netSalesSub")}
              </div>
            </Card>

            {/* 4. Batch COGS */}
            <Card style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.cogs")}</span>
                <Layers size={18} color="var(--color-warning)" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text)", marginTop: "0.5rem" }}>
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `${formatCurrency(summary?.cogs)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                {t("financial.kpi.cogsSub")}
              </div>
            </Card>

            {/* 5. Gross Profit & Margin */}
            <Card style={{ padding: "1.25rem", borderLeft: "4px solid var(--color-secondary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.grossProfit")}</span>
                <Badge variant="info">{summary?.gross_margin_pct || 0}%</Badge>
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-secondary)", marginTop: "0.5rem" }}>
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `${formatCurrency(summary?.gross_profit)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                {t("financial.kpi.grossProfitSub")}
              </div>
            </Card>

            {/* 6. Operating Expenses */}
            <Card style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.operatingExpenses")}</span>
                <Receipt size={18} color="var(--color-danger)" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text)", marginTop: "0.5rem" }}>
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `${formatCurrency(summary?.operating_expenses)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                {t("financial.kpi.operatingExpensesSub")}
              </div>
            </Card>

            {/* 7. Net Profit & Net Margin */}
            <Card
              style={{
                padding: "1.25rem",
                borderLeft: `4px solid ${(summary?.net_profit || 0) >= 0 ? "var(--color-success)" : "var(--color-danger)"}`,
                background: (summary?.net_profit || 0) >= 0 ? "var(--color-surface)" : "rgba(239, 68, 68, 0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.netProfit")}</span>
                <Badge variant={(summary?.net_profit || 0) >= 0 ? "success" : "danger"}>
                  {summary?.net_margin_pct || 0}%
                </Badge>
              </div>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: (summary?.net_profit || 0) >= 0 ? "var(--color-success)" : "var(--color-danger)",
                  marginTop: "0.5rem",
                }}
              >
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `${formatCurrency(summary?.net_profit)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                {t("financial.kpi.netProfitSub")}
              </div>
            </Card>

            {/* 8. Net Cash Flow */}
            <Card
              style={{
                padding: "1.25rem",
                borderLeft: `4px solid ${(summary?.net_cash_flow || 0) >= 0 ? "var(--color-primary)" : "var(--color-warning)"}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.netCashFlow")}</span>
                <Wallet size={18} color="var(--color-primary)" />
              </div>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: (summary?.net_cash_flow || 0) >= 0 ? "var(--color-text)" : "var(--color-warning)",
                  marginTop: "0.5rem",
                }}
              >
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `${formatCurrency(summary?.net_cash_flow)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                In: {formatCurrency(summary?.cash_inflow)} | Out: {formatCurrency(summary?.cash_outflow)}
              </div>
            </Card>

            {/* 9. Credit Receivables */}
            <Card style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.creditReceivables")}</span>
                <CreditCard size={18} color="var(--color-warning)" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text)", marginTop: "0.5rem" }}>
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `${formatCurrency(summary?.credit_receivables)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                {t("financial.kpi.creditReceivablesSub")}
              </div>
            </Card>

            {/* 10. Inventory at Cost */}
            <Card style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("financial.kpi.inventoryValue")}</span>
                <Building2 size={18} color="var(--color-primary)" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text)", marginTop: "0.5rem" }}>
                {isLoadingSummary ? <Skeleton width="100px" height="28px" /> : `${formatCurrency(summary?.inventory_value)} ${t("common.egp")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                {t("financial.kpi.inventoryValueSub")}
              </div>
            </Card>
          </div>

          {/* SVG Charts Section */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {/* Chart 1: Sales vs. Operating Expenses */}
            <Card style={{ padding: "1.5rem" }}>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <BarChart3 size={18} color="var(--color-primary)" />
                {t("financial.charts.salesVsExpenses")}
              </h3>

              {dailyBreakdown && dailyBreakdown.length > 0 ? (
                <div style={{ width: "100%", height: "220px", display: "flex", alignItems: "flex-end", gap: "0.4rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--color-border)" }}>
                  {(() => {
                    const maxVal = Math.max(
                      ...dailyBreakdown.map((d) =>
                        Math.max(
                          Number(d.net_sales || 0),
                          Number(d.operating_expenses ?? d.expenses ?? 0)
                        )
                      ),
                      100
                    );
                    return dailyBreakdown.map((d) => {
                      const salesVal = Number(d.net_sales || 0);
                      const expVal = Number(d.operating_expenses ?? d.expenses ?? 0);
                      const salesHeight = (salesVal / maxVal) * 180;
                      const expHeight = (expVal / maxVal) * 180;
                      return (
                        <div
                          key={d.date}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            height: "100%",
                            justifyContent: "flex-end",
                            gap: "2px",
                          }}
                          title={`${d.date}: Sales ${salesVal} EGP, Exp ${expVal} EGP`}
                        >
                          <div style={{ display: "flex", gap: "2px", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
                            <div
                              style={{
                                width: "45%",
                                height: `${Math.max(salesHeight, 4)}px`,
                                background: "var(--color-primary)",
                                borderRadius: "3px 3px 0 0",
                              }}
                            />
                            <div
                              style={{
                                width: "45%",
                                height: `${Math.max(expHeight, 4)}px`,
                                background: "var(--color-danger)",
                                borderRadius: "3px 3px 0 0",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: "var(--color-text-muted)",
                              marginTop: "0.25rem",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "35px",
                            }}
                          >
                            {d.date.slice(5)}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                  {t("financial.charts.noData")}
                </div>
              )}

              <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.75rem", fontSize: "0.8rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div style={{ width: 10, height: 10, background: "var(--color-primary)", borderRadius: 2 }} />
                  {t("financial.table.netSales")}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div style={{ width: 10, height: 10, background: "var(--color-danger)", borderRadius: 2 }} />
                  {t("financial.table.expenses")}
                </span>
              </div>
            </Card>

            {/* Chart 2: Profitability Trend (Gross vs. Net Profit) */}
            <Card style={{ padding: "1.5rem" }}>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <TrendingUp size={18} color="var(--color-secondary)" />
                {t("financial.charts.profitTrend")}
              </h3>

              {dailyBreakdown && dailyBreakdown.length > 0 ? (
                <div style={{ width: "100%", height: "220px", display: "flex", alignItems: "flex-end", gap: "0.4rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--color-border)" }}>
                  {(() => {
                    const maxProfit = Math.max(
                      ...dailyBreakdown.map((d) =>
                        Math.max(
                          Math.abs(Number(d.gross_profit || 0)),
                          Math.abs(Number(d.net_profit || 0))
                        )
                      ),
                      100
                    );
                    return dailyBreakdown.map((d) => {
                      const gpVal = Number(d.gross_profit || 0);
                      const npVal = Number(d.net_profit || 0);
                      const gpHeight = (Math.max(gpVal, 0) / maxProfit) * 180;
                      const npHeight = (Math.max(npVal, 0) / maxProfit) * 180;
                      return (
                        <div
                          key={d.date}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            height: "100%",
                            justifyContent: "flex-end",
                            gap: "2px",
                          }}
                          title={`${d.date}: Gross Profit ${gpVal} EGP, Net Profit ${npVal} EGP`}
                        >
                          <div style={{ display: "flex", gap: "2px", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
                            <div
                              style={{
                                width: "45%",
                                height: `${Math.max(gpHeight, 4)}px`,
                                background: "var(--color-secondary)",
                                borderRadius: "3px 3px 0 0",
                              }}
                            />
                            <div
                              style={{
                                width: "45%",
                                height: `${Math.max(npHeight, 4)}px`,
                                background: "var(--color-success)",
                                borderRadius: "3px 3px 0 0",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: "var(--color-text-muted)",
                              marginTop: "0.25rem",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "35px",
                            }}
                          >
                            {d.date.slice(5)}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                  {t("financial.charts.noData")}
                </div>
              )}

              <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.75rem", fontSize: "0.8rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div style={{ width: 10, height: 10, background: "var(--color-secondary)", borderRadius: 2 }} />
                  {t("financial.table.grossProfit")}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div style={{ width: 10, height: 10, background: "var(--color-success)", borderRadius: 2 }} />
                  {t("financial.table.netProfit")}
                </span>
              </div>
            </Card>

            {/* Chart 3: Cash Flow Timeline */}
            <Card style={{ padding: "1.5rem" }}>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <Wallet size={18} color="var(--color-primary)" />
                {t("financial.charts.cashFlowTimeline")}
              </h3>

              {dailyBreakdown && dailyBreakdown.length > 0 ? (
                <div style={{ width: "100%", height: "220px", display: "flex", alignItems: "flex-end", gap: "0.4rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--color-border)" }}>
                  {(() => {
                    const maxCash = Math.max(
                      ...dailyBreakdown.map((d) =>
                        Math.max(
                          Number(d.cash_inflow ?? d.cash_in ?? 0),
                          Number(d.cash_outflow ?? d.cash_out ?? 0)
                        )
                      ),
                      100
                    );
                    return dailyBreakdown.map((d) => {
                      const inVal = Number(d.cash_inflow ?? d.cash_in ?? 0);
                      const outVal = Number(d.cash_outflow ?? d.cash_out ?? 0);
                      const netVal = Number(d.net_cash_flow || 0);
                      const inHeight = (inVal / maxCash) * 180;
                      const outHeight = (outVal / maxCash) * 180;
                      return (
                        <div
                          key={d.date}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            height: "100%",
                            justifyContent: "flex-end",
                            gap: "2px",
                          }}
                          title={`${d.date}: Inflow ${inVal} EGP, Outflow ${outVal} EGP, Net ${netVal} EGP`}
                        >
                          <div style={{ display: "flex", gap: "2px", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
                            <div
                              style={{
                                width: "45%",
                                height: `${Math.max(inHeight, 4)}px`,
                                background: "var(--color-primary)",
                                borderRadius: "3px 3px 0 0",
                              }}
                            />
                            <div
                              style={{
                                width: "45%",
                                height: `${Math.max(outHeight, 4)}px`,
                                background: "var(--color-warning)",
                                borderRadius: "3px 3px 0 0",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: "var(--color-text-muted)",
                              marginTop: "0.25rem",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "35px",
                            }}
                          >
                            {d.date.slice(5)}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                  {t("financial.charts.noData")}
                </div>
              )}

              <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.75rem", fontSize: "0.8rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div style={{ width: 10, height: 10, background: "var(--color-primary)", borderRadius: 2 }} />
                  {t("financial.table.cashIn")}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div style={{ width: 10, height: 10, background: "var(--color-warning)", borderRadius: 2 }} />
                  {t("financial.table.cashOut")}
                </span>
              </div>
            </Card>

            {/* Chart 4: Expense Breakdown by Category */}
            <Card style={{ padding: "1.5rem" }}>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <PieChartIcon size={18} color="var(--color-danger)" />
                {t("financial.charts.expenseBreakdown")}
              </h3>

              {expenseBreakdown && expenseBreakdown.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {expenseBreakdown.map((item) => (
                    <div key={item.category_id} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                        <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
                          {language === "ar" ? item.category_name_ar : item.category_name}
                        </span>
                        <span style={{ color: "var(--color-text-muted)" }}>
                          {formatCurrency(item.total_amount)} {t("common.egp")} ({item.percentage}%)
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          background: "var(--color-border-subtle)",
                          borderRadius: "var(--radius-full)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(item.percentage, 100)}%`,
                            height: "100%",
                            background: "var(--color-danger)",
                            borderRadius: "var(--radius-full)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                  {t("financial.charts.noData")}
                </div>
              )}
            </Card>
          </div>

          {/* Daily Reconciliation Table */}
          <Card style={{ padding: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-text)" }}>
                {t("financial.table.title")}
              </h3>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.85rem",
                  textAlign: direction === "rtl" ? "right" : "left",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid var(--color-border)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.table.date")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.sales")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.returns")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.netSales")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.cogs")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.grossProfit")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.expenses")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.netProfit")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.cashIn")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.cashOut")}</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.table.netCash")}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingDaily ? (
                    <tr>
                      <td colSpan={11} style={{ padding: "2rem", textAlign: "center" }}>
                        <Skeleton height="20px" width="100%" />
                      </td>
                    </tr>
                  ) : dailyBreakdown && dailyBreakdown.length > 0 ? (
                    dailyBreakdown.map((row) => (
                      <tr
                        key={row.date}
                        style={{
                          borderBottom: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <td style={{ padding: "0.6rem 0.8rem", fontWeight: 600 }}>{row.date}</td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{formatCurrency(row.sales_revenue ?? row.sales)}</td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "end", color: "var(--color-danger)" }}>
                          {Number(row.sales_returns ?? row.returns ?? 0) > 0 ? `-${formatCurrency(row.sales_returns ?? row.returns)}` : "0.00"}
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "end", fontWeight: 700 }}>
                          {formatCurrency(row.net_sales)}
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{formatCurrency(row.cogs)}</td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "end", fontWeight: 700, color: "var(--color-secondary)" }}>
                          {formatCurrency(row.gross_profit)}
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{formatCurrency(row.operating_expenses ?? row.expenses)}</td>
                        <td
                          style={{
                            padding: "0.6rem 0.8rem",
                            textAlign: "end",
                            fontWeight: 800,
                            color: Number(row.net_profit || 0) >= 0 ? "var(--color-success)" : "var(--color-danger)",
                          }}
                        >
                          {formatCurrency(row.net_profit)}
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{formatCurrency(row.cash_inflow ?? row.cash_in)}</td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{formatCurrency(row.cash_outflow ?? row.cash_out)}</td>
                        <td
                          style={{
                            padding: "0.6rem 0.8rem",
                            textAlign: "end",
                            fontWeight: 700,
                            color: Number(row.net_cash_flow || 0) >= 0 ? "var(--color-primary)" : "var(--color-warning)",
                          }}
                        >
                          {formatCurrency(row.net_cash_flow)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                        {t("financial.charts.noData")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: OPERATING EXPENSES */}
      {activeTab === "expenses" && (
        <Card style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text)" }}>
                {t("financial.expenses.title")}
              </h2>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                {t("financial.expenses.subtitle")}
              </p>
            </div>

            {isAdmin && (
              <Button
                variant="primary"
                onClick={() => {
                  setEditingExpenseId(null);
                  setExpenseForm({
                    category_id: categories.length > 0 ? categories[0].id : "",
                    amount: 0,
                    expense_date: todayStr,
                    payment_method: "cash",
                    description: "",
                    notes: "",
                  });
                  setIsExpenseModalOpen(true);
                }}
                leftIcon={<Plus size={16} />}
              >
                {t("financial.expenses.addExpense")}
              </Button>
            )}
          </div>

          {/* Filter Bar */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <Input
                placeholder={t("common.search")}
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                leftIcon={<Search size={16} />}
              />
            </div>

            <div style={{ minWidth: "180px" }}>
              <select
                value={selectedExpenseCat}
                onChange={(e) => setSelectedExpenseCat(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.625rem",
                  borderRadius: "var(--radius-md)",
                  border: "1.5px solid var(--color-border)",
                  background: "var(--color-surface)",
                  fontSize: "0.9rem",
                }}
              >
                <option value="all">{t("financial.expenses.allCategories")}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {language === "ar" ? cat.name_ar : cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Expenses Table */}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
                textAlign: direction === "rtl" ? "right" : "left",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.expenses.expenseDate")}</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.expenses.category")}</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.expenses.description")}</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.expenses.paymentMethod")}</th>
                  <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.expenses.amount")}</th>
                  {isAdmin && <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>{t("common.actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {isLoadingExpenses ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "2rem", textAlign: "center" }}>
                      <Skeleton height="20px" width="100%" />
                    </td>
                  </tr>
                ) : expensesList.length > 0 ? (
                  expensesList.map((exp) => (
                    <tr key={exp.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <td style={{ padding: "0.6rem 0.8rem" }}>{exp.expense_date}</td>
                      <td style={{ padding: "0.6rem 0.8rem" }}>
                        <Badge variant="neutral">
                          {language === "ar" ? exp.category_name_ar || exp.category_name : exp.category_name}
                        </Badge>
                      </td>
                      <td style={{ padding: "0.6rem 0.8rem" }}>
                        <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{exp.description}</div>
                        {exp.notes && (
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                            {exp.notes}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.6rem 0.8rem" }}>
                        <span style={{ textTransform: "capitalize" }}>
                          {t(`financial.paymentMethods.${exp.payment_method}`)}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "end", fontWeight: 700, color: "var(--color-danger)" }}>
                        {formatCurrency(exp.amount)} {t("common.egp")}
                      </td>
                      {isAdmin && (
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                          <div style={{ display: "flex", justifyContent: "center", gap: "0.4rem" }}>
                            <button
                              onClick={() => handleOpenEditExpense(exp)}
                              style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--color-primary)",
                                padding: "4px",
                              }}
                              title={t("common.edit")}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(t("financial.expenses.deleteConfirm"))) {
                                  deleteExpenseMutation.mutate(exp.id);
                                }
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--color-danger)",
                                padding: "4px",
                              }}
                              title={t("common.delete")}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                      {t("financial.expenses.noExpenses")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: EXPENSE CATEGORIES */}
      {activeTab === "categories" && (
        <Card style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text)" }}>
                {t("financial.categories.title")}
              </h2>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                {t("financial.categories.subtitle")}
              </p>
            </div>

            {isAdmin && (
              <Button
                variant="primary"
                onClick={() => {
                  setCatForm({ name: "", name_ar: "", description: "" });
                  setIsCatModalOpen(true);
                }}
                leftIcon={<Plus size={16} />}
              >
                {t("financial.categories.addCategory")}
              </Button>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
                textAlign: direction === "rtl" ? "right" : "left",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.categories.nameEn")}</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.categories.nameAr")}</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.categories.description")}</th>
                  <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>{t("financial.categories.status")}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                    <td style={{ padding: "0.6rem 0.8rem", fontWeight: 700 }}>{c.name}</td>
                    <td style={{ padding: "0.6rem 0.8rem", fontWeight: 700 }}>{c.name_ar}</td>
                    <td style={{ padding: "0.6rem 0.8rem", color: "var(--color-text-muted)" }}>
                      {c.description || "—"}
                    </td>
                    <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                      <Badge variant={c.is_active ? "success" : "neutral"}>
                        {c.is_active ? t("financial.categories.active") : t("financial.categories.inactive")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 4: SUPPLIER PAYMENTS */}
      {activeTab === "supplierPayments" && (
        <Card style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text)" }}>
                {t("financial.supplierPayments.title")}
              </h2>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                {t("financial.supplierPayments.subtitle")}
              </p>
            </div>

            {canRecordPayments && (
              <Button
                variant="primary"
                onClick={() => {
                  setPaymentForm({
                    supplier_id: suppliers.length > 0 ? suppliers[0].id : "",
                    purchase_id: undefined,
                    amount: 0,
                    payment_date: todayStr,
                    payment_method: "bank_transfer",
                    reference_number: "",
                    notes: "",
                  });
                  setIsPaymentModalOpen(true);
                }}
                leftIcon={<Plus size={16} />}
              >
                {t("financial.supplierPayments.addPayment")}
              </Button>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
                textAlign: direction === "rtl" ? "right" : "left",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.supplierPayments.paymentDate")}</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.supplierPayments.supplier")}</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.supplierPayments.paymentMethod")}</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.supplierPayments.refNumber")}</th>
                  <th style={{ padding: "0.6rem 0.8rem" }}>{t("financial.supplierPayments.notes")}</th>
                  <th style={{ padding: "0.6rem 0.8rem", textAlign: "end" }}>{t("financial.supplierPayments.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingPayments ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "2rem", textAlign: "center" }}>
                      <Skeleton height="20px" width="100%" />
                    </td>
                  </tr>
                ) : supplierPayments.length > 0 ? (
                  supplierPayments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <td style={{ padding: "0.6rem 0.8rem" }}>{p.payment_date}</td>
                      <td style={{ padding: "0.6rem 0.8rem", fontWeight: 700 }}>{p.supplier_name || "—"}</td>
                      <td style={{ padding: "0.6rem 0.8rem" }}>
                        <Badge variant="neutral">
                          {t(`financial.paymentMethods.${p.payment_method}`)}
                        </Badge>
                      </td>
                      <td style={{ padding: "0.6rem 0.8rem", fontFamily: "monospace" }}>
                        {p.reference_number || "—"}
                      </td>
                      <td style={{ padding: "0.6rem 0.8rem", color: "var(--color-text-muted)" }}>
                        {p.notes || "—"}
                      </td>
                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "end", fontWeight: 800, color: "var(--color-warning)" }}>
                        {formatCurrency(p.amount)} {t("common.egp")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
                      {t("financial.supplierPayments.noPayments")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 1: ADD / EDIT EXPENSE */}
      {/* ------------------------------------------------------------------- */}
      {isExpenseModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "2rem",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                {editingExpenseId
                  ? t("financial.expenses.editExpense")
                  : t("financial.expenses.addExpense")}
              </h2>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingExpenseId) {
                  updateExpenseMutation.mutate({
                    id: editingExpenseId,
                    payload: expenseForm,
                  });
                } else {
                  createExpenseMutation.mutate(expenseForm);
                }
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", display: "block", marginBottom: "0.35rem" }}>
                  {t("financial.expenses.category")}
                </label>
                <select
                  value={expenseForm.category_id}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}
                  required
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid var(--color-border)",
                    background: "var(--color-surface)",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="" disabled>Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {language === "ar" ? c.name_ar : c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Input
                  label={t("financial.expenses.amount")}
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={expenseForm.amount || ""}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: parseFloat(e.target.value) || 0 })}
                />

                <Input
                  label={t("financial.expenses.expenseDate")}
                  type="date"
                  required
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", display: "block", marginBottom: "0.35rem" }}>
                  {t("financial.expenses.paymentMethod")}
                </label>
                <select
                  value={expenseForm.payment_method}
                  onChange={(e) =>
                    setExpenseForm({
                      ...expenseForm,
                      payment_method: e.target.value as FinancialPaymentMethod,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid var(--color-border)",
                    background: "var(--color-surface)",
                    fontSize: "0.9rem",
                  }}
                >
                  {(["cash", "card", "bank_transfer", "check", "other"] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(`financial.paymentMethods.${m}`)}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label={t("financial.expenses.description")}
                placeholder={t("financial.expenses.descriptionPlaceholder")}
                required
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              />

              <Input
                label={t("financial.expenses.notes")}
                placeholder={t("financial.expenses.notesPlaceholder")}
                value={expenseForm.notes || ""}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsExpenseModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={createExpenseMutation.isPending || updateExpenseMutation.isPending}
                >
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 2: ADD EXPENSE CATEGORY */}
      {/* ------------------------------------------------------------------- */}
      {isCatModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "2rem",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                {t("financial.categories.addCategory")}
              </h2>
              <button
                onClick={() => setIsCatModalOpen(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createCategoryMutation.mutate(catForm);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Input
                label={t("financial.categories.nameEn")}
                required
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              />

              <Input
                label={t("financial.categories.nameAr")}
                required
                value={catForm.name_ar}
                onChange={(e) => setCatForm({ ...catForm, name_ar: e.target.value })}
              />

              <Input
                label={t("financial.categories.description")}
                value={catForm.description || ""}
                onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsCatModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={createCategoryMutation.isPending}
                >
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 3: RECORD SUPPLIER PAYMENT */}
      {/* ------------------------------------------------------------------- */}
      {isPaymentModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "2rem",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                {t("financial.supplierPayments.addPayment")}
              </h2>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createPaymentMutation.mutate(paymentForm);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", display: "block", marginBottom: "0.35rem" }}>
                  {t("financial.supplierPayments.supplier")}
                </label>
                <select
                  value={paymentForm.supplier_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, supplier_id: e.target.value })}
                  required
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid var(--color-border)",
                    background: "var(--color-surface)",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="" disabled>{t("financial.supplierPayments.selectSupplier")}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Input
                  label={t("financial.supplierPayments.amount")}
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={paymentForm.amount || ""}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                />

                <Input
                  label={t("financial.supplierPayments.paymentDate")}
                  type="date"
                  required
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", display: "block", marginBottom: "0.35rem" }}>
                  {t("financial.supplierPayments.paymentMethod")}
                </label>
                <select
                  value={paymentForm.payment_method}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_method: e.target.value as FinancialPaymentMethod,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid var(--color-border)",
                    background: "var(--color-surface)",
                    fontSize: "0.9rem",
                  }}
                >
                  {(["bank_transfer", "cash", "check", "card", "other"] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(`financial.paymentMethods.${m}`)}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label={t("financial.supplierPayments.refNumber")}
                placeholder="e.g. TRF-1029384"
                value={paymentForm.reference_number || ""}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
              />

              <Input
                label={t("financial.supplierPayments.notes")}
                placeholder="Optional payment notes"
                value={paymentForm.notes || ""}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsPaymentModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={createPaymentMutation.isPending}
                >
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
