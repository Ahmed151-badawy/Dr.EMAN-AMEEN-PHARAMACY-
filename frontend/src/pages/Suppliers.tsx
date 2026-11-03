import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck,
  Search,
  Plus,
  Edit2,
  Phone,
  MapPin,
  User,
  X,
  FileText,
  Power,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { suppliersApi, SupplierCreatePayload, SupplierUpdatePayload } from "../services/api/suppliers";
import { Supplier } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";

export const Suppliers: React.FC = () => {
  const { t, direction } = useI18n();
  const { user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const canManage = user?.role === "admin" || user?.role === "pharmacist" || user?.role === "inventory_manager";

  // Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const pageSize = 25;

  // Selected Supplier & Modals
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isToggleActiveConfirmOpen, setIsToggleActiveConfirmOpen] = useState(false);
  const [supplierToToggle, setSupplierToToggle] = useState<Supplier | null>(null);

  // Form State
  const [formData, setFormData] = useState<SupplierCreatePayload>({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    is_active: true,
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPageOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Query: Suppliers List
  const { data: suppliersList, isLoading: isLoadingSuppliers } = useQuery({
    queryKey: ["suppliers", "list", debouncedSearch, activeOnly, pageOffset],
    queryFn: () =>
      suppliersApi.list({
        q: debouncedSearch || undefined,
        active_only: activeOnly ? true : undefined,
        limit: pageSize,
        offset: pageOffset,
      }),
  });

  // Mutation: Save / Edit Supplier
  const saveSupplierMutation = useMutation({
    mutationFn: (data: SupplierCreatePayload) => {
      const payload: SupplierCreatePayload = {
        name: data.name.trim(),
        contact_person: data.contact_person?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
        is_active: data.is_active ?? true,
      };

      if (editingSupplier) {
        return suppliersApi.update(editingSupplier.id, payload as SupplierUpdatePayload);
      }
      return suppliersApi.create(payload);
    },
    onSuccess: () => {
      success(t("suppliers.saveSuccess"));
      setIsFormModalOpen(false);
      setEditingSupplier(null);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (err: any) => {
      if (err?.message?.includes("already exists") || err?.status === 400) {
        error(t("suppliers.duplicatePhoneError"));
      } else {
        error(err?.message || t("common.somethingWentWrong"));
      }
    },
  });

  // Mutation: Toggle Active / Inactive
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      suppliersApi.update(id, { is_active }),
    onSuccess: () => {
      success(t("suppliers.statusUpdated"));
      setIsToggleActiveConfirmOpen(false);
      setSupplierToToggle(null);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Handlers
  const handleOpenAddSupplier = () => {
    setEditingSupplier(null);
    setFormData({
      name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      is_active: true,
    });
    setIsFormModalOpen(true);
  };

  const handleOpenEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      is_active: supplier.is_active,
    });
    setIsFormModalOpen(true);
  };

  const handleViewDetails = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setIsDetailsModalOpen(true);
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
            <Truck size={28} color="var(--color-primary)" />
            {t("suppliers.title")}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
            {t("suppliers.subtitle")}
          </p>
        </div>

        {canManage && (
          <Button
            variant="primary"
            onClick={handleOpenAddSupplier}
            leftIcon={<Plus size={18} />}
          >
            {t("suppliers.addSupplier")}
          </Button>
        )}
      </div>

      {/* Main Table Card */}
      <Card style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Search & Active Filter */}
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("suppliers.searchPlaceholder")}
              leftIcon={<Search size={18} />}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              id="activeOnly"
              checked={activeOnly}
              onChange={(e) => {
                setActiveOnly(e.target.checked);
                setPageOffset(0);
              }}
            />
            <label htmlFor="activeOnly" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)" }}>
              {t("suppliers.activeFilter")}
            </label>
          </div>
        </div>

        {/* Table View */}
        {isLoadingSuppliers ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
          </div>
        ) : suppliersList && suppliersList.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: direction === "rtl" ? "right" : "left" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("suppliers.name")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("suppliers.contactPerson")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("suppliers.phone")}</th>
                  <th style={{ padding: "0.75rem 1rem" }}>{t("common.status")}</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "end" }}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {suppliersList.map((sup) => (
                  <tr
                    key={sup.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-subtle)",
                      fontSize: "0.9rem",
                    }}
                  >
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <div
                        onClick={() => handleViewDetails(sup)}
                        style={{ fontWeight: 700, color: "var(--color-primary)", cursor: "pointer" }}
                      >
                        {sup.name}
                      </div>
                      {sup.address && (
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.15rem" }}>
                          <MapPin size={12} />
                          {sup.address}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", color: "var(--color-text)", fontWeight: 500 }}>
                      {sup.contact_person ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          <User size={14} color="var(--color-text-muted)" />
                          {sup.contact_person}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", color: "var(--color-text)" }}>
                      {sup.phone ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          <Phone size={14} color="var(--color-text-muted)" />
                          {sup.phone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <Badge variant={sup.is_active ? "success" : "danger"}>
                        {sup.is_active ? t("suppliers.active") : t("suppliers.inactive")}
                      </Badge>
                    </td>
                    <td style={{ padding: "0.875rem 1rem", textAlign: "end" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetails(sup)}
                          leftIcon={<FileText size={14} />}
                        >
                          {t("common.viewDetails")}
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenEditSupplier(sup)}
                              leftIcon={<Edit2 size={14} />}
                            >
                              {t("common.edit")}
                            </Button>
                            <Button
                              size="sm"
                              variant={sup.is_active ? "danger" : "outline"}
                              onClick={() => {
                                setSupplierToToggle(sup);
                                setIsToggleActiveConfirmOpen(true);
                              }}
                              leftIcon={<Power size={14} />}
                            >
                              {sup.is_active ? t("suppliers.deactivate") : t("suppliers.activate")}
                            </Button>
                          </>
                        )}
                      </div>
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
                {t("suppliers.pagination", { from: pageOffset + 1, to: pageOffset + suppliersList.length })}
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
                  disabled={suppliersList.length < pageSize}
                  onClick={() => setPageOffset((p) => p + pageSize)}
                >
                  {t("medicines.next")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            <Truck size={40} color="var(--color-border)" style={{ marginBottom: "0.5rem" }} />
            <div>{t("suppliers.emptySuppliers")}</div>
          </div>
        )}
      </Card>

      {/* Supplier Details Modal */}
      {isDetailsModalOpen && selectedSupplier && (
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
              maxWidth: "560px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {selectedSupplier.name}
                </h2>
                <div style={{ marginTop: "0.35rem" }}>
                  <Badge variant={selectedSupplier.is_active ? "success" : "danger"}>
                    {selectedSupplier.is_active ? t("suppliers.active") : t("suppliers.inactive")}
                  </Badge>
                </div>
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                background: "var(--color-surface-subtle)",
                padding: "1.25rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border-subtle)",
                fontSize: "0.85rem",
              }}
            >
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("suppliers.contactPerson")}</div>
                <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>{selectedSupplier.contact_person || "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("suppliers.phone")}</div>
                <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>{selectedSupplier.phone || "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("suppliers.email")}</div>
                <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>{selectedSupplier.email || "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("suppliers.address")}</div>
                <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>{selectedSupplier.address || "—"}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
              {canManage && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleOpenEditSupplier(selectedSupplier);
                  }}
                  leftIcon={<Edit2 size={16} />}
                >
                  {t("suppliers.editSupplier")}
                </Button>
              )}
              <Button variant="primary" onClick={() => setIsDetailsModalOpen(false)}>
                {t("pos.close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {isFormModalOpen && (
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
              maxWidth: "500px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                {editingSupplier ? t("suppliers.editSupplier") : t("suppliers.addSupplier")}
              </h2>
              <button onClick={() => setIsFormModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveSupplierMutation.mutate(formData);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Input
                label={t("suppliers.name") + " *"}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />

              <Input
                label={t("suppliers.contactPerson")}
                value={formData.contact_person || ""}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                placeholder="e.g. Sales Manager"
              />

              <Input
                label={t("suppliers.phone")}
                value={formData.phone || ""}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="e.g. 0223456789"
              />

              <Input
                label={t("suppliers.email")}
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="sales@vendor.com"
              />

              <Input
                label={t("suppliers.address")}
                value={formData.address || ""}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="supplierActive"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <label htmlFor="supplierActive" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)" }}>
                  {t("suppliers.active")}
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsFormModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" type="submit" isLoading={saveSupplierMutation.isPending}>
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active/Inactive Toggle Confirmation Modal */}
      {isToggleActiveConfirmOpen && supplierToToggle && (
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
                  background: supplierToToggle.is_active ? "var(--color-danger-light)" : "var(--color-success-light)",
                  color: supplierToToggle.is_active ? "var(--color-danger)" : "var(--color-success)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Power size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {supplierToToggle.is_active ? t("suppliers.deactivate") : t("suppliers.activate")}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                  {supplierToToggle.is_active
                    ? t("suppliers.deactivateConfirm", { name: supplierToToggle.name })
                    : `Activate ${supplierToToggle.name}?`}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <Button variant="outline" onClick={() => setIsToggleActiveConfirmOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant={supplierToToggle.is_active ? "danger" : "primary"}
                isLoading={toggleActiveMutation.isPending}
                onClick={() =>
                  toggleActiveMutation.mutate({
                    id: supplierToToggle.id,
                    is_active: !supplierToToggle.is_active,
                  })
                }
              >
                {supplierToToggle.is_active ? t("suppliers.deactivate") : t("suppliers.activate")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
