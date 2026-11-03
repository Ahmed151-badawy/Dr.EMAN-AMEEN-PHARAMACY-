import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Coins,
  Receipt,
  AlertTriangle,
  CalendarClock,
  ShoppingCart,
  Pill,
  PackagePlus,
  UserPlus,
  Sparkles,
  Activity,
  PackageCheck,
  Trash2,
  Sliders,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  AlertCircle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { salesApi } from "../services/api/sales";
import { inventoryApi } from "../services/api/inventory";
import { forecastsApi } from "../services/api/forecasts";
import { notificationsApi } from "../services/api/notifications";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { NavItemKey } from "../components/layout/Sidebar";

interface DashboardProps {
  onNavigate: (tab: NavItemKey) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { t, direction, language } = useI18n();
  const { user } = useAuth();
  const [intelTab, setIntelTab] = useState<"stockouts" | "reorders" | "alerts">("stockouts");

  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Query Today's Sales & Transactions
  const salesQuery = useQuery({
    queryKey: ["dashboard", "sales", todayStr],
    queryFn: () => salesApi.list({ from_date: todayStr, to_date: todayStr, limit: 500 }),
  });

  // 2. Query Low Stock Medicines
  const lowStockQuery = useQuery({
    queryKey: ["dashboard", "low-stock"],
    queryFn: () => inventoryApi.getLowStock(),
  });

  // 3. Query Expiring Batches
  const expiringQuery = useQuery({
    queryKey: ["dashboard", "expiring"],
    queryFn: () => inventoryApi.getExpiring(30),
  });

  // 4. Query Imminent Stockouts (within 7 days)
  const stockoutQuery = useQuery({
    queryKey: ["dashboard", "stockouts"],
    queryFn: () => forecastsApi.list({ stockout_within_days: 7, limit: 10 }),
  });

  // 5. Query Reorder Recommendations
  const reorderQuery = useQuery({
    queryKey: ["dashboard", "reorders"],
    queryFn: () => forecastsApi.list({ needs_reorder: true, limit: 10 }),
  });

  // 6. Query Active Notifications
  const alertsQuery = useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: () => notificationsApi.list({ resolved: false, limit: 10 }),
  });

  // 7. Query Recent Inventory Movements
  const movementsQuery = useQuery({
    queryKey: ["dashboard", "movements"],
    queryFn: () => inventoryApi.getMovements({ limit: 8 }),
  });

  // Calculate Today's Sales Total and Completed Transactions Count
  const todaySalesList = salesQuery.data || [];
  const completedSales = todaySalesList.filter(
    (s) => s.status === "completed" || s.status === "partially_returned"
  );
  const todayRevenue = completedSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const transactionsCount = completedSales.length;

  const lowStockCount = lowStockQuery.data?.length ?? 0;
  const expiringCount = expiringQuery.data?.length ?? 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      }).format(d);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* ------------------------------------------------------------- */}
      {/* 1. WELCOME HEADER */}
      {/* ------------------------------------------------------------- */}
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
          <h1 style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--color-primary)", letterSpacing: "-0.02em" }}>
            {t("dashboard.greeting", { name: user?.full_name || user?.username || "Pharmacist" })}
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.95rem", marginTop: "0.25rem" }}>
            {t("dashboard.subtitle")}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 1rem",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-full)",
            boxShadow: "var(--shadow-sm)",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "var(--color-primary)",
          }}
        >
          <Clock size={16} color="var(--color-secondary)" />
          <span>
            {new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
              weekday: "long",
              year: "numeric",
              month: "short",
              day: "numeric",
            }).format(new Date())}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. KPI CARDS (4 PRIMARY METRICS) */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {/* KPI 1: Today's Sales */}
        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            background: "var(--color-surface)",
            borderInlineStart: "4px solid var(--color-primary)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
              {t("dashboard.kpi.todaySales")}
            </span>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-primary-light)",
                color: "var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Coins size={20} />
            </div>
          </div>

          {salesQuery.isLoading ? (
            <Skeleton height="32px" width="70%" />
          ) : salesQuery.isError ? (
            <div style={{ color: "var(--color-danger)", fontSize: "0.85rem" }}>{t("common.error")}</div>
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
              <span style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--color-primary)" }}>
                {formatCurrency(todayRevenue)}
              </span>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-secondary)" }}>
                {t("common.egp")}
              </span>
            </div>
          )}

          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontWeight: 500 }}>
            {t("dashboard.kpi.todaySalesSub")}
          </div>
        </Card>

        {/* KPI 2: Transactions */}
        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            background: "var(--color-surface)",
            borderInlineStart: "4px solid var(--color-secondary)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
              {t("dashboard.kpi.transactions")}
            </span>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-info-light)",
                color: "var(--color-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Receipt size={20} />
            </div>
          </div>

          {salesQuery.isLoading ? (
            <Skeleton height="32px" width="50%" />
          ) : salesQuery.isError ? (
            <div style={{ color: "var(--color-danger)", fontSize: "0.85rem" }}>{t("common.error")}</div>
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
              <span style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--color-primary)" }}>
                {transactionsCount}
              </span>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
                {t("common.items")}
              </span>
            </div>
          )}

          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontWeight: 500 }}>
            {t("dashboard.kpi.transactionsSub")}
          </div>
        </Card>

        {/* KPI 3: Low Stock */}
        <Card
          variant="interactive"
          onClick={() => onNavigate("inventory")}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            background: "var(--color-surface)",
            borderInlineStart: `4px solid ${lowStockCount > 0 ? "var(--color-warning)" : "var(--color-success)"}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
              {t("dashboard.kpi.lowStock")}
            </span>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                background: lowStockCount > 0 ? "var(--color-warning-light)" : "var(--color-success-light)",
                color: lowStockCount > 0 ? "var(--color-warning)" : "var(--color-success)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={20} />
            </div>
          </div>

          {lowStockQuery.isLoading ? (
            <Skeleton height="32px" width="50%" />
          ) : lowStockQuery.isError ? (
            <div style={{ color: "var(--color-danger)", fontSize: "0.85rem" }}>{t("common.error")}</div>
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
              <span
                style={{
                  fontSize: "1.65rem",
                  fontWeight: 800,
                  color: lowStockCount > 0 ? "#B45309" : "var(--color-success)",
                }}
              >
                {lowStockCount}
              </span>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
                {t("common.units")}
              </span>
            </div>
          )}

          <div
            style={{
              fontSize: "0.75rem",
              color: lowStockCount > 0 ? "var(--color-warning)" : "var(--color-success)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            {lowStockCount > 0 ? t("dashboard.kpi.lowStockSub") : t("dashboard.intelligence.allHealthy")}
            {direction === "rtl" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </div>
        </Card>

        {/* KPI 4: Expiring Soon */}
        <Card
          variant="interactive"
          onClick={() => onNavigate("inventory")}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            background: "var(--color-surface)",
            borderInlineStart: `4px solid ${expiringCount > 0 ? "var(--color-danger)" : "var(--color-success)"}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
              {t("dashboard.kpi.expiringSoon")}
            </span>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                background: expiringCount > 0 ? "var(--color-danger-light)" : "var(--color-success-light)",
                color: expiringCount > 0 ? "var(--color-danger)" : "var(--color-success)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CalendarClock size={20} />
            </div>
          </div>

          {expiringQuery.isLoading ? (
            <Skeleton height="32px" width="50%" />
          ) : expiringQuery.isError ? (
            <div style={{ color: "var(--color-danger)", fontSize: "0.85rem" }}>{t("common.error")}</div>
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
              <span
                style={{
                  fontSize: "1.65rem",
                  fontWeight: 800,
                  color: expiringCount > 0 ? "var(--color-danger)" : "var(--color-success)",
                }}
              >
                {expiringCount}
              </span>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
                {t("common.units")}
              </span>
            </div>
          )}

          <div
            style={{
              fontSize: "0.75rem",
              color: expiringCount > 0 ? "var(--color-danger)" : "var(--color-success)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            {t("dashboard.kpi.expiringSoonSub")}
            {direction === "rtl" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. QUICK ACTIONS SHORTCUTS */}
      {/* ------------------------------------------------------------- */}
      <div>
        <div style={{ marginBottom: "0.875rem", fontWeight: 700, fontSize: "1.1rem", color: "var(--color-primary)" }}>
          {t("dashboard.actions.title")}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Action 1: New Sale (POS) */}
          <button
            onClick={() => onNavigate("pos")}
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              padding: "1rem 1.25rem",
              textAlign: "start",
              border: "1.5px solid rgba(20, 145, 155, 0.2)",
              background: "linear-gradient(135deg, #FFFFFF 0%, var(--color-primary-light) 100%)",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-primary)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 10px rgba(12, 74, 96, 0.25)",
              }}
            >
              <ShoppingCart size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-primary)" }}>
                {t("dashboard.actions.newSale")}
              </div>
              <div style={{ fontSize: "0.775rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                {t("dashboard.actions.newSaleDesc")}
              </div>
            </div>
          </button>

          {/* Action 2: Add Medicine */}
          <button
            onClick={() => onNavigate("medicines")}
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              padding: "1rem 1.25rem",
              textAlign: "start",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-secondary)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 10px rgba(20, 145, 155, 0.25)",
              }}
            >
              <Pill size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-primary)" }}>
                {t("dashboard.actions.addMedicine")}
              </div>
              <div style={{ fontSize: "0.775rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                {t("dashboard.actions.addMedicineDesc")}
              </div>
            </div>
          </button>

          {/* Action 3: Receive Purchase */}
          <button
            onClick={() => onNavigate("purchases")}
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              padding: "1rem 1.25rem",
              textAlign: "start",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-success)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 10px rgba(16, 185, 129, 0.25)",
              }}
            >
              <PackagePlus size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-primary)" }}>
                {t("dashboard.actions.receivePurchase")}
              </div>
              <div style={{ fontSize: "0.775rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                {t("dashboard.actions.receivePurchaseDesc")}
              </div>
            </div>
          </button>

          {/* Action 4: Add Customer */}
          <button
            onClick={() => onNavigate("customers")}
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              padding: "1rem 1.25rem",
              textAlign: "start",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-primary-light)",
                color: "var(--color-primary)",
                border: "1.5px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <UserPlus size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-primary)" }}>
                {t("dashboard.actions.addCustomer")}
              </div>
              <div style={{ fontSize: "0.775rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                {t("dashboard.actions.addCustomerDesc")}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. MAIN TWO-COLUMN SECTION: PHARMACY INTELLIGENCE & RECENT ACTIVITY */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* ========================================================= */}
        {/* COLUMN 1: PHARMACY INTELLIGENCE */}
        {/* ========================================================= */}
        <Card style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Sparkles size={20} color="var(--color-secondary)" />
                <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--color-primary)" }}>
                  {t("dashboard.intelligence.title")}
                </h2>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                {t("dashboard.intelligence.subtitle")}
              </p>
            </div>

            <button
              onClick={() => onNavigate("forecasts")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "var(--color-secondary)",
              }}
            >
              <span>{t("dashboard.intelligence.viewAllForecasts")}</span>
              <ArrowUpRight size={15} />
            </button>
          </div>

          {/* Sub-tab switcher */}
          <div
            style={{
              display: "flex",
              background: "var(--color-surface-subtle)",
              padding: "0.25rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-subtle)",
              gap: "0.25rem",
            }}
          >
            <button
              onClick={() => setIntelTab("stockouts")}
              style={{
                flex: 1,
                padding: "0.45rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8rem",
                fontWeight: intelTab === "stockouts" ? 700 : 500,
                background: intelTab === "stockouts" ? "var(--color-surface)" : "transparent",
                color: intelTab === "stockouts" ? "var(--color-primary)" : "var(--color-text-muted)",
                boxShadow: intelTab === "stockouts" ? "var(--shadow-xs)" : "none",
              }}
            >
              {t("dashboard.intelligence.stockouts")}
            </button>

            <button
              onClick={() => setIntelTab("reorders")}
              style={{
                flex: 1,
                padding: "0.45rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8rem",
                fontWeight: intelTab === "reorders" ? 700 : 500,
                background: intelTab === "reorders" ? "var(--color-surface)" : "transparent",
                color: intelTab === "reorders" ? "var(--color-primary)" : "var(--color-text-muted)",
                boxShadow: intelTab === "reorders" ? "var(--shadow-xs)" : "none",
              }}
            >
              {t("dashboard.intelligence.reorders")}
            </button>

            <button
              onClick={() => setIntelTab("alerts")}
              style={{
                flex: 1,
                padding: "0.45rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8rem",
                fontWeight: intelTab === "alerts" ? 700 : 500,
                background: intelTab === "alerts" ? "var(--color-surface)" : "transparent",
                color: intelTab === "alerts" ? "var(--color-primary)" : "var(--color-text-muted)",
                boxShadow: intelTab === "alerts" ? "var(--shadow-xs)" : "none",
              }}
            >
              {t("dashboard.intelligence.alerts")}
            </button>
          </div>

          {/* Tab 1: Imminent Stockouts */}
          {intelTab === "stockouts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {stockoutQuery.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height="60px" />)
              ) : stockoutQuery.isError ? (
                <div style={{ color: "var(--color-danger)", fontSize: "0.85rem", padding: "1rem", textAlign: "center" }}>
                  {t("common.somethingWentWrong")}
                </div>
              ) : (stockoutQuery.data?.length ?? 0) === 0 ? (
                <div
                  style={{
                    padding: "2rem 1rem",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.5rem",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <CheckCircle2 size={32} color="var(--color-success)" />
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {t("dashboard.intelligence.allHealthy")}
                  </span>
                </div>
              ) : (
                stockoutQuery.data?.map((fc) => {
                  const daysLeft = fc.days_until_stockout ?? 0;
                  const isCritical = daysLeft <= 2;
                  return (
                    <div
                      key={fc.id}
                      style={{
                        padding: "0.875rem 1rem",
                        borderRadius: "var(--radius-md)",
                        background: isCritical ? "var(--color-danger-light)" : "var(--color-warning-light)",
                        border: `1px solid ${isCritical ? "var(--color-danger-border)" : "var(--color-warning-border)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "1rem",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--color-text)" }}>
                          {fc.medicine_name || fc.medicine_id}
                        </div>
                        <div style={{ fontSize: "0.775rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                          {t("dashboard.intelligence.currentStock", { stock: fc.current_stock ?? 0 })} •{" "}
                          {t("dashboard.intelligence.dailyDemand", { demand: fc.predicted_daily_demand })}
                        </div>
                      </div>

                      <Badge variant={isCritical ? "danger" : "warning"}>
                        {daysLeft === 0
                          ? t("dashboard.intelligence.stockoutToday")
                          : t("dashboard.intelligence.stockoutInDays", { days: daysLeft })}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 2: Reorder Recommendations */}
          {intelTab === "reorders" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {reorderQuery.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height="60px" />)
              ) : reorderQuery.isError ? (
                <div style={{ color: "var(--color-danger)", fontSize: "0.85rem", padding: "1rem", textAlign: "center" }}>
                  {t("common.somethingWentWrong")}
                </div>
              ) : (reorderQuery.data?.length ?? 0) === 0 ? (
                <div
                  style={{
                    padding: "2rem 1rem",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.5rem",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <CheckCircle2 size={32} color="var(--color-success)" />
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {t("dashboard.intelligence.noReorders")}
                  </span>
                </div>
              ) : (
                reorderQuery.data?.map((fc) => (
                  <div
                    key={fc.id}
                    style={{
                      padding: "0.875rem 1rem",
                      borderRadius: "var(--radius-md)",
                      background: "var(--color-surface-subtle)",
                      border: "1px solid var(--color-border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--color-text)" }}>
                        {fc.medicine_name || fc.medicine_id}
                      </div>
                      <div style={{ fontSize: "0.775rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                        {t("dashboard.intelligence.currentStock", { stock: fc.current_stock ?? 0 })}
                      </div>
                    </div>

                    <Badge variant="info">
                      {t("dashboard.intelligence.recommendedReorder", { qty: fc.recommended_reorder_qty ?? 0 })}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Active Notifications */}
          {intelTab === "alerts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {alertsQuery.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height="60px" />)
              ) : alertsQuery.isError ? (
                <div style={{ color: "var(--color-danger)", fontSize: "0.85rem", padding: "1rem", textAlign: "center" }}>
                  {t("common.somethingWentWrong")}
                </div>
              ) : (alertsQuery.data?.length ?? 0) === 0 ? (
                <div
                  style={{
                    padding: "2rem 1rem",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.5rem",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <CheckCircle2 size={32} color="var(--color-success)" />
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {t("dashboard.intelligence.noAlerts")}
                  </span>
                </div>
              ) : (
                alertsQuery.data?.map((notif) => {
                  const variantMap: Record<string, "danger" | "warning" | "info"> = {
                    critical: "danger",
                    warning: "warning",
                    info: "info",
                  };
                  return (
                    <div
                      key={notif.id}
                      style={{
                        padding: "0.875rem 1rem",
                        borderRadius: "var(--radius-md)",
                        background: "var(--color-surface-subtle)",
                        border: "1px solid var(--color-border)",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "0.875rem",
                      }}
                    >
                      <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
                        <div style={{ marginTop: "2px" }}>
                          {notif.severity === "critical" ? (
                            <AlertCircle size={18} color="var(--color-danger)" />
                          ) : notif.severity === "warning" ? (
                            <AlertTriangle size={18} color="var(--color-warning)" />
                          ) : (
                            <Activity size={18} color="var(--color-info)" />
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-text)" }}>
                            {notif.title}
                          </div>
                          <div style={{ fontSize: "0.775rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                            {notif.message}
                          </div>
                        </div>
                      </div>

                      <Badge variant={variantMap[notif.severity] || "info"}>
                        {t(`notifications.${notif.severity}`)}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </Card>

        {/* ========================================================= */}
        {/* COLUMN 2: RECENT INVENTORY ACTIVITY */}
        {/* ========================================================= */}
        <Card style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Activity size={20} color="var(--color-primary)" />
                <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--color-primary)" }}>
                  {t("dashboard.recentActivity.title")}
                </h2>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                {t("dashboard.recentActivity.subtitle")}
              </p>
            </div>

            <button
              onClick={() => onNavigate("inventory")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "var(--color-primary)",
              }}
            >
              <span>{t("common.viewDetails")}</span>
              <ArrowUpRight size={15} />
            </button>
          </div>

          {movementsQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height="48px" />)
          ) : movementsQuery.isError ? (
            <div style={{ color: "var(--color-danger)", fontSize: "0.85rem", padding: "1rem", textAlign: "center" }}>
              {t("common.somethingWentWrong")}
            </div>
          ) : (movementsQuery.data?.length ?? 0) === 0 ? (
            <div
              style={{
                padding: "2rem 1rem",
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: "0.875rem",
              }}
            >
              {t("dashboard.recentActivity.noActivity")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              {movementsQuery.data?.map((mv) => {
                const isPositive = mv.quantity_change > 0;
                const isSale = mv.reason === "sale";
                const isReturn = mv.reason === "sale_return";
                const isPurchase = mv.reason === "purchase_received";
                const isWriteOff = mv.reason.includes("write_off");

                let icon = <Sliders size={16} />;
                let iconColor = "var(--color-text-muted)";
                let iconBg = "var(--color-surface-subtle)";

                if (isSale) {
                  icon = <TrendingDown size={16} />;
                  iconColor = "#9A3412";
                  iconBg = "#FFEDD5";
                } else if (isReturn) {
                  icon = <TrendingUp size={16} />;
                  iconColor = "var(--color-success)";
                  iconBg = "var(--color-success-light)";
                } else if (isPurchase) {
                  icon = <PackageCheck size={16} />;
                  iconColor = "var(--color-primary)";
                  iconBg = "var(--color-primary-light)";
                } else if (isWriteOff) {
                  icon = <Trash2 size={16} />;
                  iconColor = "var(--color-danger)";
                  iconBg = "var(--color-danger-light)";
                }

                return (
                  <div
                    key={mv.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.625rem 0.875rem",
                      borderRadius: "var(--radius-md)",
                      background: "var(--color-surface-subtle)",
                      border: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "var(--radius-sm)",
                          background: iconBg,
                          color: iconColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {icon}
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--color-text)" }}>
                          {mv.medicine_name || mv.medicine_id}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          {t(`dashboard.recentActivity.types.${mv.reason}`) || mv.reason} • {formatTime(mv.created_at)}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: "0.9rem",
                        color: isPositive ? "var(--color-success)" : "var(--color-danger)",
                        direction: "ltr",
                      }}
                    >
                      {isPositive ? `+${mv.quantity_change}` : mv.quantity_change}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
