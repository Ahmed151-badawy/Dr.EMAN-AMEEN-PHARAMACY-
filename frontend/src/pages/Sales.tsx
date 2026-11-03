import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Receipt,
  RotateCcw,
  User,
  X,
  FileText,
  ShieldAlert,
  Printer,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { salesApi, SaleReturnPayload, SaleItemOut } from "../services/api/sales";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { printReceiptDocument } from "../utils/receiptPrinter";

interface SalesProps {
  initialSaleId?: string | null;
  onClearInitialSaleId?: () => void;
}

export const Sales: React.FC<SalesProps> = ({ initialSaleId, onClearInitialSaleId }) => {
  const { t, direction } = useI18n();
  const { user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const canSell = user?.role === "admin" || user?.role === "pharmacist" || user?.role === "cashier";

  // Filter & Pagination State
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pageOffset, setPageOffset] = useState(0);
  const pageSize = 25;

  // Selected Sale for Details Modal
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(initialSaleId || null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(!!initialSaleId);

  // Return Modal State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnItemTarget, setReturnItemTarget] = useState<SaleItemOut | null>(null);
  const [returnQty, setReturnQty] = useState(1);
  const [returnReason, setReturnReason] = useState("");
  const [isRestock, setIsRestock] = useState(true);
  const [isConfirmReturnOpen, setIsConfirmReturnOpen] = useState(false);

  // Query 1: Sales History List
  const { data: salesList, isLoading: isLoadingSales } = useQuery({
    queryKey: ["sales", "list", fromDate, toDate, pageOffset],
    queryFn: () =>
      salesApi.list({
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        limit: pageSize,
        offset: pageOffset,
      }),
  });

  // Query 2: Selected Sale Details
  const { data: saleDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["sales", "detail", selectedSaleId],
    queryFn: () => salesApi.get(selectedSaleId!),
    enabled: !!selectedSaleId && isDetailsModalOpen,
  });

  // Mutation: Process Return
  const returnMutation = useMutation({
    mutationFn: (payload: SaleReturnPayload) => salesApi.createReturn(payload),
    onSuccess: () => {
      success(t("sales.returnSuccess"));
      setIsConfirmReturnOpen(false);
      setIsReturnModalOpen(false);
      setReturnItemTarget(null);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      error(err?.message || t("sales.returnError"));
    },
  });

  // Handlers
  const handleOpenSaleDetails = (saleId: string) => {
    setSelectedSaleId(saleId);
    setIsDetailsModalOpen(true);
  };

  const handleCloseDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedSaleId(null);
    if (onClearInitialSaleId) {
      onClearInitialSaleId();
    }
  };

  const handleInitiateReturn = (item: SaleItemOut) => {
    setReturnItemTarget(item);
    setReturnQty(1);
    setReturnReason("");
    setIsRestock(true);
    setIsReturnModalOpen(true);
  };

  const handleConfirmReturnSubmit = () => {
    if (!returnItemTarget) return;
    returnMutation.mutate({
      sale_item_id: returnItemTarget.id,
      quantity: returnQty,
      reason: returnReason.trim() || null,
      restock: isRestock,
    });
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
            <Receipt size={28} color="var(--color-primary)" />
            {t("sales.title")}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
            {t("sales.subtitle")}
          </p>
        </div>
      </div>

      {/* Main Sales Table Card */}
      <Card style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Date Filter Controls */}
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("sales.filterFromDate")}:
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPageOffset(0);
              }}
              style={{
                padding: "0.45rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: "1.5px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: "0.85rem",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("sales.filterToDate")}:
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPageOffset(0);
              }}
              style={{
                padding: "0.45rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: "1.5px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: "0.85rem",
              }}
            />
          </div>

          {(fromDate || toDate) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setPageOffset(0);
              }}
            >
              {t("common.filter")} {t("common.cancel")}
            </Button>
          )}
        </div>

        {/* Table View */}
        {isLoadingSales ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
          </div>
        ) : salesList && salesList.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: direction === "rtl" ? "right" : "left" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("sales.saleId", { id: "" }).replace("#", "")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("sales.date")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("sales.customer")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("sales.payment")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("sales.total")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("sales.status")}</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "end" }}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {salesList.map((s) => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-subtle)",
                      fontSize: "0.9rem",
                    }}
                  >
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <span
                        onClick={() => handleOpenSaleDetails(s.id)}
                        style={{
                          fontWeight: 700,
                          color: "var(--color-primary)",
                          cursor: "pointer",
                          fontFamily: "monospace",
                          fontSize: "0.85rem",
                        }}
                      >
                        #{s.id.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "0.875rem 1rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", fontWeight: 600 }}>
                      {s.customer_name ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          <User size={14} color="var(--color-primary)" />
                          {s.customer_name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                          {t("sales.walkIn")}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", textTransform: "capitalize" }}>
                      {t(`sales.paymentMethods.${s.payment_method}`) || s.payment_method}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "var(--color-text)" }}>
                      {Number(s.total_amount).toFixed(2)} {t("common.egp")}
                    </td>
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <Badge
                        variant={
                          s.status === "completed"
                            ? "success"
                            : s.status === "partially_returned"
                            ? "warning"
                            : "danger"
                        }
                      >
                        {t(`sales.statuses.${s.status}`) || s.status}
                      </Badge>
                    </td>
                    <td style={{ padding: "0.875rem 1rem", textAlign: "end" }}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenSaleDetails(s.id)}
                        leftIcon={<FileText size={14} />}
                      >
                        {t("sales.viewReceipt")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "1.25rem",
                fontSize: "0.85rem",
                color: "var(--color-text-muted)",
              }}
            >
              <span>
                {t("sales.pagination", { from: pageOffset + 1, to: pageOffset + salesList.length })}
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageOffset === 0}
                  onClick={() => setPageOffset((p) => Math.max(0, p - pageSize))}
                >
                  {t("medicines.prev")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={salesList.length < pageSize}
                  onClick={() => setPageOffset((p) => p + pageSize)}
                >
                  {t("medicines.next")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            <Receipt size={40} color="var(--color-border)" style={{ marginBottom: "0.5rem" }} />
            <div>{t("sales.emptySales")}</div>
          </div>
        )}
      </Card>

      {/* Sale Details & Line Items Modal */}
      {isDetailsModalOpen && selectedSaleId && (
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
              gap: "1.5rem",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {t("sales.saleId", { id: selectedSaleId.slice(0, 8).toUpperCase() })}
                </h2>
                {saleDetails && (
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                    {new Date(saleDetails.created_at).toLocaleString()}
                  </div>
                )}
              </div>
              <button onClick={handleCloseDetailsModal} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            {isLoadingDetails || !saleDetails ? (
              <Skeleton height="200px" />
            ) : (
              <>
                {/* Meta Overview Cards */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "0.75rem",
                    background: "var(--color-surface-subtle)",
                    padding: "1rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border-subtle)",
                    fontSize: "0.85rem",
                  }}
                >
                  <div>
                    <div style={{ color: "var(--color-text-muted)" }}>{t("sales.customer")}</div>
                    <div style={{ fontWeight: 700, color: "var(--color-text)", marginTop: "0.2rem" }}>
                      {saleDetails.customer_name || t("sales.walkIn")}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "var(--color-text-muted)" }}>{t("sales.payment")}</div>
                    <div style={{ fontWeight: 700, color: "var(--color-text)", marginTop: "0.2rem", textTransform: "capitalize" }}>
                      {t(`sales.paymentMethods.${saleDetails.payment_method}`) || saleDetails.payment_method}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "var(--color-text-muted)" }}>{t("sales.status")}</div>
                    <div style={{ marginTop: "0.2rem" }}>
                      <Badge
                        variant={
                          saleDetails.status === "completed"
                            ? "success"
                            : saleDetails.status === "partially_returned"
                            ? "warning"
                            : "danger"
                        }
                      >
                        {t(`sales.statuses.${saleDetails.status}`) || saleDetails.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text)" }}>
                    {t("sales.items")}
                  </h3>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: direction === "rtl" ? "right" : "left" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                          <th style={{ padding: "0.6rem 0.5rem" }}>{t("sales.medicine")}</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>{t("sales.batch")}</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>{t("pos.qty")}</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>{t("sales.unitPrice")}</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>{t("sales.lineTotal")}</th>
                          {canSell && saleDetails.status !== "returned" && (
                            <th style={{ padding: "0.6rem 0.5rem", textAlign: "end" }}>{t("common.actions")}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {saleDetails.items.map((item) => (
                          <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>{item.medicine_name}</td>
                            <td style={{ padding: "0.75rem 0.5rem", color: "var(--color-text-muted)" }}>
                              {item.batch_number || "—"}
                            </td>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700 }}>{item.quantity}</td>
                            <td style={{ padding: "0.75rem 0.5rem" }}>
                              {Number(item.unit_price).toFixed(2)} {t("common.egp")}
                            </td>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700 }}>
                              {Number(item.total_price).toFixed(2)} {t("common.egp")}
                            </td>
                            {canSell && saleDetails.status !== "returned" && (
                              <td style={{ padding: "0.75rem 0.5rem", textAlign: "end" }}>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleInitiateReturn(item)}
                                  leftIcon={<RotateCcw size={13} />}
                                >
                                  {t("sales.returnItem")}
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals Breakdown */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                    borderTop: "1.5px solid var(--color-border)",
                    paddingTop: "1rem",
                    alignItems: "flex-end",
                    fontSize: "0.9rem",
                  }}
                >
                  <div style={{ display: "flex", gap: "2rem", color: "var(--color-text-muted)" }}>
                    <span>{t("pos.discount")}:</span>
                    <span style={{ fontWeight: 600 }}>{Number(saleDetails.discount).toFixed(2)} {t("common.egp")}</span>
                  </div>
                  <div style={{ display: "flex", gap: "2rem", fontSize: "1.2rem", fontWeight: 800, color: "var(--color-primary)" }}>
                    <span>{t("sales.total")}:</span>
                    <span>{Number(saleDetails.total_amount).toFixed(2)} {t("common.egp")}</span>
                  </div>
                </div>
              </>
            )}

            {/* Bottom Close & Print */}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
              <Button
                variant="outline"
                onClick={() => {
                  if (!saleDetails) return;
                  const items = (saleDetails.items || []).map((i) => ({
                    medicineName: i.medicine_name,
                    quantity: i.quantity,
                    unitPrice: Number(i.unit_price),
                    totalPrice: Number(i.total_price),
                  }));
                  const subtotal = items.reduce((acc, it) => acc + it.totalPrice, 0);

                  printReceiptDocument(
                    {
                      saleId: saleDetails.id,
                      createdAt: saleDetails.created_at,
                      customerName: saleDetails.customer_name,
                      cashierName: user?.full_name,
                      paymentMethod: saleDetails.payment_method,
                      items,
                      subtotal,
                      discount: Number(saleDetails.discount || 0),
                      totalAmount: Number(saleDetails.total_amount),
                    },
                    { isArabic: direction === "rtl" }
                  );
                }}
                leftIcon={<Printer size={18} />}
              >
                {t("pos.printReceipt")}
              </Button>
              <Button variant="primary" onClick={handleCloseDetailsModal}>
                {t("pos.close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Process Return Modal */}
      {isReturnModalOpen && returnItemTarget && (
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
              maxWidth: "460px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--color-danger)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <RotateCcw size={18} />
                {t("sales.returnTitle")}
              </h2>
              <button onClick={() => setIsReturnModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("sales.returnDesc")}
            </p>

            <div
              style={{
                background: "var(--color-surface-subtle)",
                padding: "0.875rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border-subtle)",
                fontSize: "0.85rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
              }}
            >
              <div style={{ fontWeight: 700, color: "var(--color-text)" }}>{returnItemTarget.medicine_name}</div>
              <div style={{ color: "var(--color-text-muted)" }}>
                {t("sales.qtySold")}: <strong>{returnItemTarget.quantity} {t("common.units")}</strong>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setIsConfirmReturnOpen(true);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Input
                label={t("sales.returnQuantity") + ` (1 - ${returnItemTarget.quantity}) *`}
                type="number"
                min="1"
                max={returnItemTarget.quantity}
                value={returnQty}
                onChange={(e) => setReturnQty(parseInt(e.target.value, 10) || 1)}
                required
              />

              <Input
                label={t("sales.returnReason")}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Customer brought wrong box"
              />

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="restock"
                  checked={isRestock}
                  onChange={(e) => setIsRestock(e.target.checked)}
                />
                <label htmlFor="restock" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)" }}>
                  {t("sales.restockOption")}
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsReturnModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" type="submit">
                  {t("sales.returnItem")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Confirmation Dialog */}
      {isConfirmReturnOpen && returnItemTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 120,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "1.75rem",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-danger-light)",
                  color: "var(--color-danger)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {t("sales.returnConfirmTitle")}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                  {t("sales.returnConfirmText", { qty: returnQty, medicine: returnItemTarget.medicine_name })}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <Button variant="outline" onClick={() => setIsConfirmReturnOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                isLoading={returnMutation.isPending}
                onClick={handleConfirmReturnSubmit}
              >
                {t("sales.returnItem")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
