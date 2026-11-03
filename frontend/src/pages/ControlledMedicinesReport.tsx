import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  ShieldAlert,
  RotateCcw,
  AlertTriangle,
  Pill,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { reportsApi } from "../services/api/reports";
import { medicinesApi } from "../services/api/medicines";
import { ControlledReportFilters, Medicine } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";

export const ControlledMedicinesReport: React.FC = () => {
  const { t, direction } = useI18n();
  const { success, error } = useToast();

  const [filters, setFilters] = useState<ControlledReportFilters>({
    start_date: "",
    end_date: "",
    medicine_id: "",
    controlled_schedule: "",
    transaction_type: "all",
    invoice_ref: "",
    page: 1,
    limit: 20,
  });

  const [isExporting, setIsExporting] = useState(false);

  // Fetch Controlled Medicines Catalog for dropdown filter
  const { data: controlledMedicines } = useQuery({
    queryKey: ["medicines", "controlledList"],
    queryFn: () => medicinesApi.list({ is_controlled: true, active_only: false, limit: 200 }),
  });

  // Query report data
  const { data: reportData, isLoading } = useQuery({
    queryKey: ["controlledReport", filters],
    queryFn: () => reportsApi.getControlledMedicinesReport(filters),
  });

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      await reportsApi.downloadControlledMedicinesExcel(filters);
      success(t("controlled_reports.exportSuccess"));
    } catch (err: any) {
      error(err.message || t("controlled_reports.exportError"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      start_date: "",
      end_date: "",
      medicine_id: "",
      controlled_schedule: "",
      transaction_type: "all",
      invoice_ref: "",
      page: 1,
      limit: 20,
    });
  };

  const summary = reportData?.summary;
  const records = reportData?.records || [];
  const totalCount = reportData?.total_count || 0;
  const totalPages = Math.ceil(totalCount / (filters.limit || 20)) || 1;
  const currentPage = filters.page || 1;

  const getScheduleBadge = (schedule?: string | null) => {
    switch (schedule) {
      case "schedule_1":
        return <Badge variant="danger">جدول 1 مخدرات (Schedule I)</Badge>;
      case "schedule_2":
        return <Badge variant="warning">جدول 2 مؤثرات (Schedule II)</Badge>;
      case "schedule_3":
        return <Badge variant="info">جدول 3 تذاكر خاصة (Schedule III)</Badge>;
      default:
        return <Badge variant="neutral">مراقبة خاصة (Special)</Badge>;
    }
  };

  const getTypeBadge = (type: string, displayAr: string, displayEn: string) => {
    const isAr = direction === "rtl";
    const text = isAr ? displayAr : displayEn;
    if (type === "sale") {
      return <Badge variant="success">{text}</Badge>;
    } else if (type === "return") {
      return <Badge variant="danger">{text}</Badge>;
    }
    return <Badge variant="neutral">{text}</Badge>;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        minHeight: "calc(100vh - var(--header-height) - 4rem)",
      }}
    >
      {/* Page Header */}
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
            <ShieldAlert size={28} color="#DC2626" />
            {t("controlled_reports.title")}
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-muted)",
              marginTop: "0.2rem",
            }}
          >
            {t("controlled_reports.subtitle")}
          </p>
        </div>

        <Button
          variant="primary"
          onClick={handleExportExcel}
          isLoading={isExporting}
          style={{
            background: "#166534",
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontWeight: 700,
          }}
        >
          <FileSpreadsheet size={18} />
          {isExporting ? t("controlled_reports.exporting") : t("controlled_reports.exportExcel")}
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        <Card style={{ padding: "1.25rem", borderInlineStart: "4px solid #2563EB" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", fontWeight: 600 }}>
                {t("controlled_reports.kpi.totalRecords")}
              </p>
              <h3 style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--color-text)" }}>
                {isLoading ? <Skeleton width="60px" height="28px" /> : summary?.total_records ?? 0}
              </h3>
            </div>
            <div style={{ background: "#EFF6FF", padding: "0.5rem", borderRadius: "8px", color: "#2563EB" }}>
              <ReceiptText size={22} />
            </div>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.4rem" }}>
            {t("controlled_reports.kpi.totalRecordsDesc")}
          </p>
        </Card>

        <Card style={{ padding: "1.25rem", borderInlineStart: "4px solid #16A34A" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", fontWeight: 600 }}>
                {t("controlled_reports.kpi.totalDispensed")}
              </p>
              <h3 style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.25rem", color: "#16A34A" }}>
                {isLoading ? <Skeleton width="60px" height="28px" /> : summary?.total_sales_base_quantity ?? 0}
              </h3>
            </div>
            <div style={{ background: "#F0FDF4", padding: "0.5rem", borderRadius: "8px", color: "#16A34A" }}>
              <Pill size={22} />
            </div>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.4rem" }}>
            {t("controlled_reports.kpi.totalDispensedDesc")}
          </p>
        </Card>

        <Card style={{ padding: "1.25rem", borderInlineStart: "4px solid #DC2626" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", fontWeight: 600 }}>
                {t("controlled_reports.kpi.totalReturned")}
              </p>
              <h3 style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.25rem", color: "#DC2626" }}>
                {isLoading ? <Skeleton width="60px" height="28px" /> : summary?.total_returns_base_quantity ?? 0}
              </h3>
            </div>
            <div style={{ background: "#FEF2F2", padding: "0.5rem", borderRadius: "8px", color: "#DC2626" }}>
              <RotateCcw size={22} />
            </div>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.4rem" }}>
            {t("controlled_reports.kpi.totalReturnedDesc")}
          </p>
        </Card>

        <Card style={{ padding: "1.25rem", borderInlineStart: "4px solid #9333EA" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", fontWeight: 600 }}>
                {t("controlled_reports.kpi.netMovement")}
              </p>
              <h3 style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.25rem", color: "#9333EA" }}>
                {isLoading ? <Skeleton width="60px" height="28px" /> : summary?.net_dispensed_base_quantity ?? 0}
              </h3>
            </div>
            <div style={{ background: "#FAF5FF", padding: "0.5rem", borderRadius: "8px", color: "#9333EA" }}>
              <Layers size={22} />
            </div>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.4rem" }}>
            {t("controlled_reports.kpi.netMovementDesc")}
          </p>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card style={{ padding: "1.25rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            alignItems: "flex-end",
          }}
        >
          {/* Start Date */}
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 600, display: "block", marginBottom: "0.375rem" }}>
              {t("controlled_reports.filters.startDate")}
            </label>
            <Input
              type="date"
              value={filters.start_date || ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, start_date: e.target.value, page: 1 }))}
            />
          </div>

          {/* End Date */}
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 600, display: "block", marginBottom: "0.375rem" }}>
              {t("controlled_reports.filters.endDate")}
            </label>
            <Input
              type="date"
              value={filters.end_date || ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, end_date: e.target.value, page: 1 }))}
            />
          </div>

          {/* Schedule Category */}
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 600, display: "block", marginBottom: "0.375rem" }}>
              {t("controlled_reports.filters.schedule")}
            </label>
            <select
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: "0.875rem",
              }}
              value={filters.controlled_schedule || ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, controlled_schedule: e.target.value, page: 1 }))}
            >
              <option value="">{t("controlled_reports.filters.allSchedules")}</option>
              <option value="schedule_1">{t("medicines.schedule_1")}</option>
              <option value="schedule_2">{t("medicines.schedule_2")}</option>
              <option value="schedule_3">{t("medicines.schedule_3")}</option>
              <option value="unscheduled_controlled">{t("medicines.unscheduled_controlled")}</option>
            </select>
          </div>

          {/* Transaction Type */}
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 600, display: "block", marginBottom: "0.375rem" }}>
              {t("controlled_reports.filters.type")}
            </label>
            <select
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: "0.875rem",
              }}
              value={filters.transaction_type || "all"}
              onChange={(e) => setFilters((prev) => ({ ...prev, transaction_type: e.target.value, page: 1 }))}
            >
              <option value="all">{t("controlled_reports.filters.allTypes")}</option>
              <option value="sale">{t("controlled_reports.filters.salesOnly")}</option>
              <option value="return">{t("controlled_reports.filters.returnsOnly")}</option>
              <option value="adjustment">{t("controlled_reports.filters.adjustmentsOnly")}</option>
            </select>
          </div>

          {/* Medicine Specific Selector */}
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 600, display: "block", marginBottom: "0.375rem" }}>
              {t("controlled_reports.filters.medicine")}
            </label>
            <select
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: "0.875rem",
              }}
              value={filters.medicine_id || ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, medicine_id: e.target.value, page: 1 }))}
            >
              <option value="">{t("controlled_reports.filters.allMedicines")}</option>
              {controlledMedicines?.map((med: Medicine) => (
                <option key={med.id} value={med.id}>
                  {med.name} {med.name_ar ? `(${med.name_ar})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Search Reference */}
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 600, display: "block", marginBottom: "0.375rem" }}>
              {t("controlled_reports.filters.searchRef")}
            </label>
            <Input
              placeholder={t("controlled_reports.filters.searchRef")}
              value={filters.invoice_ref || ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, invoice_ref: e.target.value, page: 1 }))}
            />
          </div>

          {/* Reset Filters Action */}
          <div>
            <Button
              variant="outline"
              onClick={handleResetFilters}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}
            >
              <RotateCcw size={16} />
              {t("controlled_reports.filters.reset")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Audit Data Table */}
      <Card style={{ overflow: "hidden", padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: direction === "rtl" ? "right" : "left",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--color-surface-hover)",
                  borderBottom: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.dateTime")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.type")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.reference")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.medicine")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.schedule")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.batch")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.qtyUnit")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.baseQty")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.purchaser")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.employee")}</th>
                <th style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>{t("controlled_reports.table.prescription")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {Array.from({ length: 11 }).map((_, cIdx) => (
                      <td key={cIdx} style={{ padding: "1rem" }}>
                        <Skeleton height="20px" width="80%" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: "3rem", textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                      <AlertTriangle size={36} color="var(--color-text-muted)" />
                      <p style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-text)" }}>
                        {t("controlled_reports.table.empty")}
                      </p>
                      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
                        {t("controlled_reports.table.emptyDesc")}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const dateStr = new Date(r.timestamp).toLocaleString(direction === "rtl" ? "ar-EG" : "en-US", {
                    dateStyle: "short",
                    timeStyle: "short",
                  });

                  return (
                    <tr
                      key={r.item_id}
                      style={{
                        borderBottom: "1px solid var(--color-border)",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Date & Time */}
                      <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <Clock size={14} color="var(--color-text-muted)" />
                          <span>{dateStr}</span>
                        </div>
                      </td>

                      {/* Type */}
                      <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                        {getTypeBadge(r.type, r.type_display_ar, r.type_display_en)}
                      </td>

                      {/* Reference # */}
                      <td style={{ padding: "0.875rem 1rem", fontFamily: "monospace", fontWeight: 700 }}>
                        {r.transaction_id.slice(0, 8)}
                      </td>

                      {/* Medicine */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div style={{ fontWeight: 700, color: "var(--color-text)" }}>{r.medicine_name}</div>
                        {r.medicine_name_ar && (
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                            {r.medicine_name_ar}
                          </div>
                        )}
                      </td>

                      {/* Schedule */}
                      <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                        {getScheduleBadge(r.schedule)}
                      </td>

                      {/* Batch */}
                      <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                        {r.batch_number || "-"}
                      </td>

                      {/* Qty & Unit */}
                      <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 700 }}>{r.quantity}</span> {r.package_unit}
                      </td>

                      {/* Base Units */}
                      <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            fontWeight: 800,
                            color: r.type === "return" ? "#DC2626" : "#16A34A",
                          }}
                        >
                          {r.type === "return" ? `-${r.base_quantity}` : `+${r.base_quantity}`}
                        </span>
                      </td>

                      {/* Purchaser Details */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        {r.purchaser_name ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{r.purchaser_name}</div>
                            {r.purchaser_id_number && (
                              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                                ID: {r.purchaser_id_number}
                              </div>
                            )}
                            {r.purchaser_phone && (
                              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                                📞 {r.purchaser_phone}
                              </div>
                            )}
                          </div>
                        ) : r.customer_name ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{r.customer_name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                              (حساب عميل / Client Acct)
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "var(--color-text-muted)" }}>Walk-in / غير مسجل</span>
                        )}
                      </td>

                      {/* Employee */}
                      <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600 }}>{r.user_full_name || "-"}</div>
                        {r.user_role && (
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                            {t(`roles.${r.user_role}`)}
                          </div>
                        )}
                      </td>

                      {/* Prescription & Doctor */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        {r.prescription_reference || r.doctor_name ? (
                          <div>
                            {r.prescription_reference && (
                              <div style={{ fontWeight: 600 }}>Rx: {r.prescription_reference}</div>
                            )}
                            {r.doctor_name && (
                              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                                د. {r.doctor_name}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--color-text-muted)" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <div style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
              Page {currentPage} of {totalPages} ({totalCount} total transactions)
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setFilters((prev) => ({ ...prev, page: currentPage - 1 }))}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setFilters((prev) => ({ ...prev, page: currentPage + 1 }))}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
