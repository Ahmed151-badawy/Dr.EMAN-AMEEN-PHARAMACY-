import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag,
  Plus,
  X,
  FileText,
  PackageCheck,
  Trash2,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { purchasesApi, PurchaseCreatePayload, PurchaseItemRequestPayload, ReceivePurchasePayload } from "../services/api/purchases";
import { suppliersApi } from "../services/api/suppliers";
import { MedicineSearchSelect } from "../components/common/MedicineSearchSelect";
import { Medicine, PurchaseStatus } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";

export const Purchases: React.FC = () => {
  const { t, direction } = useI18n();
  const { user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const canManage = user?.role === "admin" || user?.role === "pharmacist" || user?.role === "inventory_manager";

  // Filter & Pagination State
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pageOffset, setPageOffset] = useState(0);
  const pageSize = 25;

  // Modals & Selected Purchase
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isConfirmReceiveOpen, setIsConfirmReceiveOpen] = useState(false);

  // New Purchase Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [purchaseNotes, setPurchaseNotes] = useState<string>("");
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemRequestPayload[]>([
    { medicine_id: "", quantity: 10, unit_price: 0 },
  ]);

  // Receiving Form State (maps purchase_item_id -> { expiry_date, batch_number })
  const [receiveItemDetails, setReceiveItemDetails] = useState<
    Record<string, { expiry_date: string; batch_number: string }>
  >({});

  // Query 1: Purchases List
  const { data: purchasesList, isLoading: isLoadingPurchases } = useQuery({
    queryKey: ["purchases", "list", statusFilter, pageOffset],
    queryFn: () =>
      purchasesApi.list({
        status: statusFilter !== "all" ? (statusFilter as PurchaseStatus) : undefined,
        limit: pageSize,
        offset: pageOffset,
      }),
  });

  // Query 2: Selected Purchase Details
  const { data: purchaseDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["purchases", "detail", selectedPurchaseId],
    queryFn: () => purchasesApi.get(selectedPurchaseId!),
    enabled: !!selectedPurchaseId && (isDetailsModalOpen || isReceiveModalOpen),
  });

  // Query 3: Active Suppliers (for creation dropdown)
  const { data: activeSuppliers } = useQuery({
    queryKey: ["suppliers", "activeDropdown"],
    queryFn: () => suppliersApi.list({ active_only: true, limit: 200 }),
    enabled: isCreateModalOpen,
  });

  // Mutation: Create Purchase Order
  const createPurchaseMutation = useMutation({
    mutationFn: (payload: PurchaseCreatePayload) => purchasesApi.create(payload),
    onSuccess: (newPurchase) => {
      success(t("purchases.orderPlacedSuccess"));
      setIsCreateModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      if (newPurchase?.id) {
        setSelectedPurchaseId(newPurchase.id);
        setIsDetailsModalOpen(true);
      }
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Mutation: Receive Purchase Order
  const receivePurchaseMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReceivePurchasePayload }) =>
      purchasesApi.receive(id, payload),
    onSuccess: () => {
      success(t("purchases.receiveSuccess"));
      setIsConfirmReceiveOpen(false);
      setIsReceiveModalOpen(false);

      // Invalidate related server state
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Handlers for Items in Create Form
  const handleAddItemRow = () => {
    setPurchaseItems([...purchaseItems, { medicine_id: "", quantity: 10, unit_price: 0 }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (purchaseItems.length === 1) return;
    setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
  };

  const handleUpdateItemMedicine = (index: number, med: Medicine) => {
    const updated = [...purchaseItems];
    updated[index] = {
      ...updated[index],
      medicine_id: med.id,
      unit_price: Number(med.purchase_price) || updated[index].unit_price,
    };
    setPurchaseItems(updated);
  };

  const handleUpdateItemQty = (index: number, qty: number) => {
    const updated = [...purchaseItems];
    updated[index] = { ...updated[index], quantity: Math.max(1, qty) };
    setPurchaseItems(updated);
  };

  const handleUpdateItemPrice = (index: number, price: number) => {
    const updated = [...purchaseItems];
    updated[index] = { ...updated[index], unit_price: Math.max(0, price) };
    setPurchaseItems(updated);
  };

  const calculatePreSubmitTotal = () => {
    return purchaseItems.reduce((sum, item) => sum + (item.quantity * item.unit_price || 0), 0);
  };

  const handleOpenCreatePurchase = () => {
    setSelectedSupplierId(activeSuppliers?.[0]?.id || "");
    setPurchaseNotes("");
    setPurchaseItems([{ medicine_id: "", quantity: 10, unit_price: 0 }]);
    setIsCreateModalOpen(true);
  };

  const handleOpenReceiveModal = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    setIsReceiveModalOpen(true);
  };

  const handleInitiateReceiveSubmit = () => {
    if (!purchaseDetails || !purchaseDetails.items) return;

    // Build ReceivePurchasePayload
    const defaultExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const items = purchaseDetails.items.map((item) => {
      const detail = receiveItemDetails[item.id] || {
        expiry_date: defaultExpiry,
        batch_number: "",
      };
      return {
        purchase_item_id: item.id,
        expiry_date: detail.expiry_date || defaultExpiry,
        batch_number: detail.batch_number?.trim() || null,
      };
    });

    receivePurchaseMutation.mutate({
      id: purchaseDetails.id,
      payload: { items },
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
            <ShoppingBag size={28} color="var(--color-primary)" />
            {t("purchases.title")}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
            {t("purchases.subtitle")}
          </p>
        </div>

        {canManage && (
          <Button
            variant="primary"
            onClick={handleOpenCreatePurchase}
            leftIcon={<Plus size={18} />}
          >
            {t("purchases.newPurchase")}
          </Button>
        )}
      </div>

      {/* Main Purchases Table Card */}
      <Card style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Status Filters */}
        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.5rem" }}>
          {[
            { key: "all", label: t("purchases.allStatuses") },
            { key: "ordered", label: t("purchases.statuses.ordered") },
            { key: "received", label: t("purchases.statuses.received") },
            { key: "cancelled", label: t("purchases.statuses.cancelled") },
          ].map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPageOffset(0);
                }}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: isActive ? "var(--color-primary-light)" : "transparent",
                  color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Purchases List */}
        {isLoadingPurchases ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
          </div>
        ) : purchasesList && purchasesList.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: direction === "rtl" ? "right" : "left" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("purchases.purchaseId", { id: "" }).replace("#", "")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("purchases.date")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("purchases.supplier")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("purchases.total")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("purchases.status")}</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "end" }}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {purchasesList.map((p) => {
                  const isOrdered = p.status === "ordered";
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                        fontSize: "0.9rem",
                      }}
                    >
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <span
                          onClick={() => {
                            setSelectedPurchaseId(p.id);
                            setIsDetailsModalOpen(true);
                          }}
                          style={{
                            fontWeight: 700,
                            color: "var(--color-primary)",
                            cursor: "pointer",
                            fontFamily: "monospace",
                          }}
                        >
                          #{p.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "0.875rem 1rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                        {new Date(p.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", fontWeight: 600 }}>
                        {p.supplier_name || "—"}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "var(--color-text)" }}>
                        {Number(p.total_amount).toFixed(2)} {t("common.egp")}
                      </td>
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <Badge
                          variant={
                            p.status === "received"
                              ? "success"
                              : p.status === "ordered"
                              ? "warning"
                              : "danger"
                          }
                        >
                          {t(`purchases.statuses.${p.status}`) || p.status}
                        </Badge>
                      </td>
                      <td style={{ padding: "0.875rem 1rem", textAlign: "end" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedPurchaseId(p.id);
                              setIsDetailsModalOpen(true);
                            }}
                            leftIcon={<FileText size={14} />}
                          >
                            {t("purchases.viewOrder")}
                          </Button>
                          {canManage && isOrdered && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleOpenReceiveModal(p.id)}
                              leftIcon={<PackageCheck size={14} />}
                            >
                              {t("purchases.receivePurchase")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                {t("purchases.pagination", { from: pageOffset + 1, to: pageOffset + purchasesList.length })}
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
                  disabled={purchasesList.length < pageSize}
                  onClick={() => setPageOffset((p) => p + pageSize)}
                >
                  {t("medicines.next")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            <ShoppingBag size={40} color="var(--color-border)" style={{ marginBottom: "0.5rem" }} />
            <div>{t("purchases.emptyPurchases")}</div>
          </div>
        )}
      </Card>

      {/* Create Purchase Order Modal */}
      {isCreateModalOpen && (
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
              maxWidth: "720px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                {t("purchases.newPurchase")}
              </h2>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const invalid = purchaseItems.some((i) => !i.medicine_id);
                if (invalid) {
                  error(t("purchases.selectValidMed"));
                  return;
                }
                createPurchaseMutation.mutate({
                  supplier_id: selectedSupplierId || null,
                  notes: purchaseNotes.trim() || null,
                  items: purchaseItems,
                });
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {/* Supplier Picker */}
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", display: "block", marginBottom: "0.35rem" }}>
                  {t("purchases.supplier")}
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="">{t("purchases.selectSupplier")}</option>
                  {activeSuppliers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Items List Builder */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--color-text)" }}>
                    {t("purchases.items")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={handleAddItemRow}
                    leftIcon={<Plus size={14} />}
                  >
                    {t("purchases.addItem")}
                  </Button>
                </div>

                {purchaseItems.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1.2fr auto",
                      gap: "0.5rem",
                      alignItems: "center",
                      background: "var(--color-surface-subtle)",
                      padding: "0.75rem",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    <div>
                      <MedicineSearchSelect
                        value={item.medicine_id}
                        onSelect={(med) => handleUpdateItemMedicine(index, med)}
                        placeholder={t("purchases.selectMedicine")}
                      />
                    </div>

                    <Input
                      type="number"
                      min="1"
                      placeholder={t("purchases.qty")}
                      value={item.quantity}
                      onChange={(e) => handleUpdateItemQty(index, parseInt(e.target.value, 10) || 1)}
                      required
                    />

                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={t("purchases.unitPrice")}
                      value={item.unit_price}
                      onChange={(e) => handleUpdateItemPrice(index, parseFloat(e.target.value) || 0)}
                      required
                    />

                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(index)}
                      disabled={purchaseItems.length === 1}
                      style={{
                        padding: "0.5rem",
                        color: purchaseItems.length === 1 ? "var(--color-border)" : "var(--color-danger)",
                        background: "transparent",
                        border: "none",
                        cursor: purchaseItems.length === 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Notes Input */}
              <Input
                label={t("purchases.notes")}
                value={purchaseNotes}
                onChange={(e) => setPurchaseNotes(e.target.value)}
                placeholder="e.g. PO-2026-AUG-14"
              />

              {/* Total Summary */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1.5px solid var(--color-border)", paddingTop: "1rem" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-primary)" }}>
                  {t("purchases.total")}: {calculatePreSubmitTotal().toFixed(2)} {t("common.egp")}
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button variant="outline" type="button" onClick={() => setIsCreateModalOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button variant="primary" type="submit" isLoading={createPurchaseMutation.isPending}>
                    {t("purchases.saveOrder")}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Details Modal */}
      {isDetailsModalOpen && selectedPurchaseId && (
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {t("purchases.purchaseId", { id: selectedPurchaseId.slice(0, 8).toUpperCase() })}
                </h2>
                {purchaseDetails && (
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                    {new Date(purchaseDetails.created_at).toLocaleString()}
                  </div>
                )}
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            {isLoadingDetails || !purchaseDetails ? (
              <Skeleton height="200px" />
            ) : (
              <>
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
                    <div style={{ color: "var(--color-text-muted)" }}>{t("purchases.supplier")}</div>
                    <div style={{ fontWeight: 700, color: "var(--color-text)", marginTop: "0.2rem" }}>
                      {purchaseDetails.supplier_name || "—"}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "var(--color-text-muted)" }}>{t("purchases.status")}</div>
                    <div style={{ marginTop: "0.2rem" }}>
                      <Badge
                        variant={
                          purchaseDetails.status === "received"
                            ? "success"
                            : purchaseDetails.status === "ordered"
                            ? "warning"
                            : "danger"
                        }
                      >
                        {t(`purchases.statuses.${purchaseDetails.status}`) || purchaseDetails.status}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "var(--color-text-muted)" }}>{t("purchases.total")}</div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--color-primary)", marginTop: "0.2rem" }}>
                      {Number(purchaseDetails.total_amount).toFixed(2)} {t("common.egp")}
                    </div>
                  </div>
                </div>

                {purchaseDetails.notes && (
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
                    <strong>{t("purchases.notes")}:</strong> {purchaseDetails.notes}
                  </div>
                )}

                {/* Items Table */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text)" }}>
                    {t("purchases.items")}
                  </h3>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: direction === "rtl" ? "right" : "left" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                          <th style={{ padding: "0.6rem 0.5rem" }}>{t("purchases.medicine")}</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>{t("purchases.qty")}</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>{t("purchases.unitPrice")}</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>{t("purchases.lineTotal")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseDetails.items?.map((item) => (
                          <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>{item.medicine_name}</td>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700 }}>{item.quantity}</td>
                            <td style={{ padding: "0.75rem 0.5rem" }}>{Number(item.unit_price).toFixed(2)} {t("common.egp")}</td>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700 }}>{Number(item.total_price).toFixed(2)} {t("common.egp")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Bottom Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
              {canManage && purchaseDetails?.status === "ordered" && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleOpenReceiveModal(purchaseDetails.id);
                  }}
                  leftIcon={<PackageCheck size={16} />}
                >
                  {t("purchases.receivePurchase")}
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsDetailsModalOpen(false)}>
                {t("pos.close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Receive Purchase Form Modal */}
      {isReceiveModalOpen && purchaseDetails && (
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
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <PackageCheck size={22} />
                {t("purchases.receiveTitle")}
              </h2>
              <button onClick={() => setIsReceiveModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("purchases.receiveDesc")}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setIsConfirmReceiveOpen(true);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {purchaseDetails.items?.map((item) => {
                const current = receiveItemDetails[item.id] || {
                  expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                  batch_number: "",
                };
                return (
                  <div
                    key={item.id}
                    style={{
                      background: "var(--color-surface-subtle)",
                      padding: "1rem",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border-subtle)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.625rem",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "var(--color-text)", fontSize: "0.9rem" }}>
                      {item.medicine_name} — <strong>{item.quantity} {t("common.units")}</strong>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <Input
                        label={t("purchases.expiryDate") + " *"}
                        type="date"
                        value={current.expiry_date}
                        onChange={(e) =>
                          setReceiveItemDetails({
                            ...receiveItemDetails,
                            [item.id]: { ...current, expiry_date: e.target.value },
                          })
                        }
                        required
                      />

                      <Input
                        label={t("purchases.batchNumber")}
                        placeholder="e.g. LOT-2027-X"
                        value={current.batch_number}
                        onChange={(e) =>
                          setReceiveItemDetails({
                            ...receiveItemDetails,
                            [item.id]: { ...current, batch_number: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsReceiveModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" type="submit">
                  {t("purchases.receivePurchase")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {isConfirmReceiveOpen && purchaseDetails && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 130,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "1.75rem",
              width: "100%",
              maxWidth: "440px",
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
                  background: "var(--color-primary-light)",
                  color: "var(--color-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <PackageCheck size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {t("purchases.receiveConfirmTitle")}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                  {t("purchases.receiveConfirmText", {
                    id: purchaseDetails.id.slice(0, 8).toUpperCase(),
                    count: purchaseDetails.items?.length || 0,
                  })}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <Button variant="outline" onClick={() => setIsConfirmReceiveOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                isLoading={receivePurchaseMutation.isPending}
                onClick={handleInitiateReceiveSubmit}
              >
                {t("purchases.receivePurchase")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
