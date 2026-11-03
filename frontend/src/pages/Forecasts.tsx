import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  BrainCircuit,
  AlertTriangle,
  PackagePlus,
  RefreshCw,
  X,
  ExternalLink,
  Calendar,
  BarChart2,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { forecastsApi, ForecastFilters, GenerateForecastPayload } from "../services/api/forecasts";
import { ForecastMethod } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";

interface ForecastsProps {
  onNavigateToMedicine?: (medicineId: string) => void;
}

export const Forecasts: React.FC<ForecastsProps> = ({ onNavigateToMedicine }) => {
  const { t, direction } = useI18n();
  const { user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const canGenerate = user?.role === "admin" || user?.role === "inventory_manager";

  // Tab Filter State
  const [activeTab, setActiveTab] = useState<"all" | "stockouts" | "reorders">("all");

  // Selected Medicine Detail Modal
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Generate Forecasts Modal
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generatePayload, setGeneratePayload] = useState<GenerateForecastPayload>({
    method: "moving_average",
    lookback_days: 30,
    lead_time_days: 7,
    horizon_days: 14,
  });

  // Query Filters
  const filters: ForecastFilters = {
    stockout_within_days: activeTab === "stockouts" ? 7 : undefined,
    needs_reorder: activeTab === "reorders" ? true : undefined,
    limit: 200,
  };

  // Query 1: Forecasts List
  const { data: forecasts, isLoading: isLoadingForecasts } = useQuery({
    queryKey: ["forecasts", "list", activeTab],
    queryFn: () => forecastsApi.list(filters),
  });

  // Query 2: Selected Medicine Detail & Continuous Demand History
  const { data: medicineDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ["forecasts", "detail", selectedMedicineId],
    queryFn: () => forecastsApi.get(selectedMedicineId!, 30),
    enabled: !!selectedMedicineId && isDetailModalOpen,
  });

  // Mutation: Generate Forecasts
  const generateMutation = useMutation({
    mutationFn: (payload: GenerateForecastPayload) => forecastsApi.generate(payload),
    onSuccess: (res) => {
      success(
        t("forecasts.generateSuccess", {
          count: res.forecasts_generated,
          created: res.notifications_created,
          resolved: res.notifications_resolved,
        })
      );
      setIsGenerateModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["forecasts"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  const handleOpenDetail = (medicineId: string) => {
    setSelectedMedicineId(medicineId);
    setIsDetailModalOpen(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Bar */}
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
          <h1
            style={{
              fontSize: "1.6rem",
              fontWeight: 800,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
            }}
          >
            <BrainCircuit size={28} color="var(--color-primary)" />
            {t("forecasts.title")}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
            {t("forecasts.subtitle")}
          </p>
        </div>

        {canGenerate && (
          <Button
            variant="primary"
            onClick={() => setIsGenerateModalOpen(true)}
            leftIcon={<RefreshCw size={18} />}
          >
            {t("forecasts.generate")}
          </Button>
        )}
      </div>

      {/* Main Container Card */}
      <Card style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Navigation Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.75rem", flexWrap: "wrap" }}>
          {(
            [
              { key: "all", label: t("forecasts.tabs.all"), icon: <TrendingUp size={16} /> },
              { key: "stockouts", label: t("forecasts.tabs.stockouts"), icon: <AlertTriangle size={16} /> },
              { key: "reorders", label: t("forecasts.tabs.reorders"), icon: <PackagePlus size={16} /> },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: isActive ? "var(--color-primary-light)" : "transparent",
                  color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Forecasts Table */}
        {isLoadingForecasts ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
          </div>
        ) : forecasts && forecasts.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: direction === "rtl" ? "right" : "left" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("forecasts.medicine")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("forecasts.currentStock")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("forecasts.dailyDemand")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("forecasts.stockoutDate")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("forecasts.reorderQty")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("forecasts.method")}</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "end" }}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((fc) => {
                  const daysUntil = fc.days_until_stockout ?? null;
                  const hasStockoutRisk = daysUntil !== null && daysUntil <= 7;
                  const needsReorder = (fc.recommended_reorder_qty ?? 0) > 0;

                  return (
                    <tr
                      key={fc.id || fc.medicine_id}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                        fontSize: "0.9rem",
                      }}
                    >
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div
                          onClick={() => handleOpenDetail(fc.medicine_id)}
                          style={{ fontWeight: 700, color: "var(--color-primary)", cursor: "pointer" }}
                        >
                          {fc.medicine_name || fc.medicine_id.slice(0, 8)}
                        </div>
                        {fc.notes && (
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
                            {fc.notes}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "0.875rem 1rem", fontWeight: 600 }}>
                        {fc.current_stock ?? "—"} {t("common.units")}
                      </td>

                      <td style={{ padding: "0.875rem 1rem" }}>
                        <span style={{ fontWeight: 700, color: "var(--color-text)" }}>
                          {Number(fc.predicted_daily_demand).toFixed(1)}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginInlineStart: "0.25rem" }}>
                          {t("common.units")}/day
                        </span>
                      </td>

                      <td style={{ padding: "0.875rem 1rem" }}>
                        {fc.predicted_stockout_date && daysUntil !== null ? (
                          <Badge variant={daysUntil === 0 ? "danger" : hasStockoutRisk ? "warning" : "neutral"}>
                            {daysUntil === 0
                              ? t("forecasts.stockoutToday")
                              : t("forecasts.stockoutIn", { days: daysUntil })}
                          </Badge>
                        ) : (
                          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                            {t("forecasts.noStockout")}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "0.875rem 1rem" }}>
                        {needsReorder && fc.recommended_reorder_qty ? (
                          <Badge variant="success">
                            {t("forecasts.reorderBadge", { qty: fc.recommended_reorder_qty })}
                          </Badge>
                        ) : (
                          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                        {t(`forecasts.methods.${fc.method}`) || fc.method}
                      </td>

                      <td style={{ padding: "0.875rem 1rem", textAlign: "end" }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleOpenDetail(fc.medicine_id)}
                          leftIcon={<BarChart2 size={14} />}
                        >
                          {t("forecasts.viewDetail")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "3.5rem 1rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            <TrendingUp size={44} color="var(--color-border)" style={{ marginBottom: "0.75rem" }} />
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>
              {activeTab === "stockouts"
                ? t("forecasts.emptyStockouts")
                : activeTab === "reorders"
                ? t("forecasts.emptyReorders")
                : t("forecasts.emptyAll")}
            </div>
          </div>
        )}
      </Card>

      {/* Demand History & Detail Modal */}
      {isDetailModalOpen && selectedMedicineId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "2rem",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {medicineDetail?.forecast?.medicine_name || t("forecasts.detailTitle")}
                </h2>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
                  {t("forecasts.detailSubtitle", { name: medicineDetail?.forecast?.medicine_name || "" })}
                </p>
              </div>

              <button onClick={() => setIsDetailModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            {isLoadingDetail || !medicineDetail ? (
              <Skeleton height="200px" />
            ) : (
              <>
                {/* Summary Metrics Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr",
                    gap: "0.75rem",
                    background: "var(--color-surface-subtle)",
                    padding: "1rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border-subtle)",
                    fontSize: "0.85rem",
                  }}
                >
                  <div>
                    <div style={{ color: "var(--color-text-muted)" }}>{t("forecasts.currentStock")}</div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--color-text)", marginTop: "0.2rem" }}>
                      {medicineDetail.forecast.current_stock ?? "—"}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "var(--color-text-muted)" }}>{t("forecasts.dailyDemand")}</div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--color-primary)", marginTop: "0.2rem" }}>
                      {Number(medicineDetail.forecast.predicted_daily_demand).toFixed(1)} /day
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "var(--color-text-muted)" }}>{t("forecasts.stockoutDate")}</div>
                    <div style={{ fontWeight: 700, marginTop: "0.2rem" }}>
                      {medicineDetail.forecast.days_until_stockout !== null && medicineDetail.forecast.days_until_stockout !== undefined
                        ? t("forecasts.stockoutIn", { days: medicineDetail.forecast.days_until_stockout })
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "var(--color-text-muted)" }}>{t("forecasts.reorderQty")}</div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--color-primary)", marginTop: "0.2rem" }}>
                      {medicineDetail.forecast.recommended_reorder_qty
                        ? `+${medicineDetail.forecast.recommended_reorder_qty}`
                        : "—"}
                    </div>
                  </div>
                </div>

                {medicineDetail.forecast.notes && (
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
                    <strong>{t("forecasts.notes")}:</strong> {medicineDetail.forecast.notes}
                  </div>
                )}

                {/* Daily Demand History Table */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Calendar size={16} color="var(--color-primary)" />
                    {t("forecasts.historyTable")}
                  </h3>

                  {medicineDetail.history && medicineDetail.history.length > 0 ? (
                    <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: direction === "rtl" ? "right" : "left" }}>
                        <thead style={{ position: "sticky", top: 0, background: "var(--color-surface)" }}>
                          <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                            <th style={{ padding: "0.5rem 0.75rem" }}>{t("forecasts.date")}</th>
                            <th style={{ padding: "0.5rem 0.75rem", textAlign: "end" }}>{t("forecasts.quantitySold")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medicineDetail.history.map((pt) => (
                            <tr key={pt.date} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                              <td style={{ padding: "0.5rem 0.75rem" }}>{pt.date}</td>
                              <td style={{ padding: "0.5rem 0.75rem", textAlign: "end", fontWeight: 700 }}>
                                {pt.quantity_sold > 0 ? (
                                  <span style={{ color: "var(--color-primary)" }}>{pt.quantity_sold} {t("common.units")}</span>
                                ) : (
                                  <span style={{ color: "var(--color-text-muted)" }}>0</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                      {t("forecasts.zeroDemand")}
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
              {onNavigateToMedicine && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const medId = selectedMedicineId;
                    setIsDetailModalOpen(false);
                    onNavigateToMedicine(medId);
                  }}
                  leftIcon={<ExternalLink size={16} />}
                >
                  {t("notifications.viewMedicine")}
                </Button>
              )}

              <Button variant="primary" onClick={() => setIsDetailModalOpen(false)}>
                {t("pos.close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Forecasts Modal */}
      {isGenerateModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 110,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "2rem",
              width: "100%",
              maxWidth: "500px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                {t("forecasts.generateModalTitle")}
              </h2>
              <button onClick={() => setIsGenerateModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("forecasts.generateModalDesc")}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                generateMutation.mutate(generatePayload);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", display: "block", marginBottom: "0.35rem" }}>
                  {t("forecasts.method")}
                </label>
                <select
                  value={generatePayload.method}
                  onChange={(e) => setGeneratePayload({ ...generatePayload, method: e.target.value as ForecastMethod })}
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid var(--color-border)",
                    background: "var(--color-surface)",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="moving_average">{t("forecasts.methods.moving_average")}</option>
                  <option value="weighted_moving_average">{t("forecasts.methods.weighted_moving_average")}</option>
                  <option value="exponential_smoothing">{t("forecasts.methods.exponential_smoothing")}</option>
                </select>
              </div>

              <Input
                label={t("forecasts.lookbackDays")}
                type="number"
                min="1"
                max="365"
                value={generatePayload.lookback_days || 30}
                onChange={(e) => setGeneratePayload({ ...generatePayload, lookback_days: parseInt(e.target.value, 10) || 30 })}
              />

              <Input
                label={t("forecasts.leadTimeDays")}
                type="number"
                min="1"
                max="90"
                value={generatePayload.lead_time_days || 7}
                onChange={(e) => setGeneratePayload({ ...generatePayload, lead_time_days: parseInt(e.target.value, 10) || 7 })}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsGenerateModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" type="submit" isLoading={generateMutation.isPending}>
                  {t("forecasts.generate")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
