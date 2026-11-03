import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pill,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Calendar,
  Layers,
  History,
  Package,
  CheckCircle2,
  X,
  FileText,
  ArrowDownRight,
  ArrowUpRight,
  ShieldAlert,
  RotateCcw,
  Tag,
  Boxes,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  medicinesApi,
  MedicineCreatePayload,
  MedicineUpdatePayload,
  BatchCreatePayload,
} from "../services/api/medicines";
import { inventoryApi, WriteOffPayload, WriteOffReason } from "../services/api/inventory";
import {
  Medicine,
  MedicineBatch,
} from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import {
  formatPackagingBreakdown,
  defaultPackagingForm,
  packagingFromUnits,
  buildPackageUnits,
  validatePackaging,
  generateHierarchyUnits,
  getContextualUnitDisplay,
  round2,
  PREDEFINED_UNITS,
  type PackagingForm,
  type PredefinedUnitKey,
  type HierarchyTemplate,
} from "../utils/packaging";

type TabKey = "all" | "lowStock" | "expiring" | "movements";
type FormTabKey = "basic" | "classification" | "packaging";

interface MedicinesProps {
  initialSearch?: string;
}

export const Medicines: React.FC<MedicinesProps> = ({ initialSearch }) => {
  const { t, direction } = useI18n();
  const { user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const canManage = user?.role === "admin" || user?.role === "pharmacist" || user?.role === "inventory_manager";

  // Tab State
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // Advanced Filters State for "All Medicines"
  const [searchQuery, setSearchQuery] = useState(initialSearch || "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || "");

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
      setDebouncedSearch(initialSearch);
    }
  }, [initialSearch]);
  const [filterProductType, setFilterProductType] = useState("all");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterSubcategoryId, setFilterSubcategoryId] = useState("");
  const [filterFamilyId, setFilterFamilyId] = useState("");
  const [filterDosageFormId, setFilterDosageFormId] = useState("");
  const [filterActiveIngredientId, setFilterActiveIngredientId] = useState("");
  const [filterStockStatus, setFilterStockStatus] = useState("all");
  const [filterPrescription, setFilterPrescription] = useState("all");
  const [filterControlled, setFilterControlled] = useState("all");
  const [filterSchedule, setFilterSchedule] = useState("");

  const [pageOffset, setPageOffset] = useState(0);
  const pageSize = 25;

  // Selected Medicine & Modals State
  const [selectedMedicineId, setSelectedMedicineId] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isMedicineFormOpen, setIsMedicineFormOpen] = useState(false);
  const [formActiveTab, setFormActiveTab] = useState<FormTabKey>("basic");
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [isAddBatchOpen, setIsAddBatchOpen] = useState(false);
  const [isWriteOffOpen, setIsWriteOffOpen] = useState(false);
  const [writeOffBatch, setWriteOffBatch] = useState<MedicineBatch | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deletingMedicine, setDeletingMedicine] = useState<Medicine | null>(null);

  // Dosage Form Category & Packaging Preset states
  const [selectedDosageCategory, setSelectedDosageCategory] = useState<string>("");
  const [pkg, setPkg] = useState<PackagingForm>(defaultPackagingForm());

  // Form states
  const [medFormData, setMedFormData] = useState<MedicineCreatePayload>({
    name: "",
    name_ar: "",
    generic_name: "",
    barcode: "",
    sku: "",
    product_type: "medicine",
    category_id: "",
    subcategory_id: "",
    manufacturer: "",
    category: "",
    dosage: "",
    form: "",
    drug_family_id: "",
    dosage_form_id: "",
    strength: "",
    base_unit_name: "Unit",
    selling_price: 0,
    purchase_price: 0,
    minimum_stock: 10,
    requires_prescription: false,
    is_controlled: false,
    controlled_schedule: "",
    active_ingredients: [],
    package_units: [
      {
        unit_name_en: "Unit",
        unit_name_ar: "وحدة",
        conversion_factor: 1,
        selling_price: 0,
        purchase_price: 0,
        barcode: "",
        is_base_unit: true,
        is_default_dispense: true,
        allow_selling: true,
      },
    ],
  });

  const [batchFormData, setBatchFormData] = useState<BatchCreatePayload>({
    batch_number: "",
    expiry_date: "",
    quantity: 10,
    purchase_price: 0,
  });

  const [writeOffFormData, setWriteOffFormData] = useState<WriteOffPayload>({
    batch_id: "",
    quantity: 1,
    reason: "expiry_write_off",
    notes: "",
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPageOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Master Data Queries
  const { data: drugFamiliesList } = useQuery({
    queryKey: ["medicines", "drugFamilies"],
    queryFn: () => medicinesApi.getDrugFamilies(true),
  });

  const { data: dosageFormsList } = useQuery({
    queryKey: ["medicines", "dosageForms"],
    queryFn: () => medicinesApi.getDosageForms(true),
  });

  const { data: activeIngredientsList } = useQuery({
    queryKey: ["medicines", "activeIngredients"],
    queryFn: () => medicinesApi.getActiveIngredients(undefined, true),
  });

  const { data: productCategoriesList } = useQuery({
    queryKey: ["medicines", "categories"],
    queryFn: () => medicinesApi.getCategories(true),
  });

  // Master Data Helpers for Dosage Form Category & Subtype
  const uniqueDosageCategories = useMemo(() => {
    if (!dosageFormsList) return [];
    const cats = new Set<string>();
    dosageFormsList.forEach((df) => {
      if (df.category) cats.add(df.category);
    });
    return Array.from(cats).sort();
  }, [dosageFormsList]);

  const filteredDosageForms = useMemo(() => {
    if (!dosageFormsList) return [];
    if (!selectedDosageCategory) return dosageFormsList;
    return dosageFormsList.filter((df) => df.category === selectedDosageCategory);
  }, [dosageFormsList, selectedDosageCategory]);

  // Query 1: Medicines List with advanced filters
  const { data: medicinesList, isLoading: isLoadingMedicines } = useQuery({
    queryKey: [
      "medicines",
      "list",
      debouncedSearch,
      filterProductType,
      filterCategoryId,
      filterSubcategoryId,
      filterFamilyId,
      filterDosageFormId,
      filterActiveIngredientId,
      filterStockStatus,
      filterPrescription,
      filterControlled,
      filterSchedule,
      pageOffset,
    ],
    queryFn: () =>
      medicinesApi.list({
        q: debouncedSearch || undefined,
        product_type: filterProductType !== "all" ? filterProductType : undefined,
        category_id: filterCategoryId || undefined,
        subcategory_id: filterSubcategoryId || undefined,
        family_id: filterFamilyId || undefined,
        dosage_form_id: filterDosageFormId || undefined,
        active_ingredient_id: filterActiveIngredientId || undefined,
        stock_status: filterStockStatus !== "all" ? filterStockStatus : undefined,
        requires_prescription:
          filterPrescription === "rx"
            ? true
            : filterPrescription === "otc"
            ? false
            : undefined,
        is_controlled:
          filterControlled === "controlled"
            ? true
            : filterControlled === "ordinary"
            ? false
            : undefined,
        controlled_schedule: filterSchedule || undefined,
        limit: pageSize,
        offset: pageOffset,
      }),
    enabled: activeTab === "all",
  });

  // Query 2: Low Stock Items
  const { data: lowStockList, isLoading: isLoadingLowStock } = useQuery({
    queryKey: ["inventory", "lowStock"],
    queryFn: () => inventoryApi.getLowStock(),
    enabled: activeTab === "lowStock",
  });

  // Query 3: Expiring / Expired Batches
  const { data: expiringList, isLoading: isLoadingExpiring } = useQuery({
    queryKey: ["inventory", "expiring"],
    queryFn: () => inventoryApi.getExpiring(60),
    enabled: activeTab === "expiring",
  });

  // Query 4: Inventory Movements
  const { data: movementsList, isLoading: isLoadingMovements } = useQuery({
    queryKey: ["inventory", "movements"],
    queryFn: () => inventoryApi.getMovements({ limit: 100 }),
    enabled: activeTab === "movements",
  });

  // Query 5: Selected Medicine Details & Batches
  const { data: selectedMedicine } = useQuery({
    queryKey: ["medicines", "detail", selectedMedicineId],
    queryFn: () => medicinesApi.get(selectedMedicineId!),
    enabled: !!selectedMedicineId,
  });

  const { data: medicineBatches, isLoading: isLoadingBatches } = useQuery({
    queryKey: ["medicines", "batches", selectedMedicineId],
    queryFn: () => medicinesApi.listBatches(selectedMedicineId!),
    enabled: !!selectedMedicineId,
  });

  // Mutation: Create / Edit Medicine
  const saveMedicineMutation = useMutation({
    mutationFn: (data: MedicineCreatePayload) => {
      if (editingMedicine) {
        return medicinesApi.update(editingMedicine.id, data as MedicineUpdatePayload);
      }
      return medicinesApi.create(data);
    },
    onSuccess: () => {
      success(t("medicines.saveSuccess"));
      setIsMedicineFormOpen(false);
      setEditingMedicine(null);
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Mutation: Deactivate Medicine
  const deleteMedicineMutation = useMutation({
    mutationFn: (id: string) => medicinesApi.delete(id),
    onSuccess: () => {
      success(t("medicines.deleteSuccess"));
      setIsDeleteConfirmOpen(false);
      setDeletingMedicine(null);
      setIsDetailsModalOpen(false);
      setSelectedMedicineId(null);
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Mutation: Add Batch
  const addBatchMutation = useMutation({
    mutationFn: (data: BatchCreatePayload) => medicinesApi.addBatch(selectedMedicineId!, data),
    onSuccess: () => {
      success(t("medicines.addBatchSuccess"));
      setIsAddBatchOpen(false);
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Mutation: Write-Off
  const writeOffMutation = useMutation({
    mutationFn: (payload: WriteOffPayload) => inventoryApi.writeOff(payload),
    onSuccess: () => {
      success(t("medicines.writeOffSuccess"));
      setIsWriteOffOpen(false);
      setWriteOffBatch(null);
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Handlers
  const handleOpenAddMedicine = () => {
    setEditingMedicine(null);
    setFormActiveTab("basic");
    const initPkg = defaultPackagingForm();
    setPkg(initPkg);
    setSelectedDosageCategory("");
    setMedFormData({
      name: "",
      name_ar: "",
      generic_name: "",
      barcode: "",
      sku: "",
      product_type: "medicine",
      category_id: "",
      subcategory_id: "",
      manufacturer: "",
      category: "",
      dosage: "",
      form: "",
      drug_family_id: "",
      dosage_form_id: "",
      strength: "",
      base_unit_name: "Unit",
      selling_price: initPkg.stripSellingPrice || initPkg.boxSellingPrice || 0,
      purchase_price: initPkg.stripCostPrice || initPkg.boxCostPrice || 0,
      minimum_stock: 10,
      requires_prescription: false,
      is_controlled: false,
      controlled_schedule: "",
      active_ingredients: [],
      package_units: buildPackageUnits(initPkg),
    });
    setIsMedicineFormOpen(true);
  };

  const handleOpenEditMedicine = (med: Medicine) => {
    setEditingMedicine(med);
    setFormActiveTab("basic");
    const existingDf = dosageFormsList?.find((df) => df.id === med.dosage_form_id);
    setSelectedDosageCategory(existingDf?.category || med.dosage_form?.category || "");

    const loadedPkg = packagingFromUnits(
      med.package_units,
      med.dosage_form?.subtype || med.dosage_form?.name_en || med.form
    );
    setPkg(loadedPkg.form);

    const activeUnits = (med.package_units || []).map((pu) => ({
      id: pu.id,
      unit_name_en: pu.unit_name_en,
      unit_name_ar: pu.unit_name_ar,
      conversion_factor: Number(pu.conversion_factor),
      selling_price: Number(pu.selling_price),
      purchase_price: Number(pu.purchase_price || 0),
      barcode: pu.barcode || "",
      is_base_unit: pu.is_base_unit,
      is_default_dispense: pu.is_default_dispense,
      allow_selling: pu.allow_selling,
    }));

    setMedFormData({
      name: med.name,
      name_ar: med.name_ar || "",
      generic_name: med.generic_name || "",
      barcode: med.barcode || "",
      sku: med.sku || "",
      product_type: med.product_type || "medicine",
      category_id: med.category_id || "",
      subcategory_id: med.subcategory_id || "",
      manufacturer: med.manufacturer || "",
      category: med.category || "",
      dosage: med.dosage || "",
      form: med.form || "",
      drug_family_id: med.drug_family_id || "",
      dosage_form_id: med.dosage_form_id || "",
      strength: med.strength || "",
      base_unit_name: med.base_unit_name || "Unit",
      selling_price: (med.product_type === "general" ? loadedPkg.form.boxSellingPrice : (loadedPkg.form.stripSellingPrice || Number(med.selling_price))),
      purchase_price: (med.product_type === "general" ? loadedPkg.form.boxCostPrice : (loadedPkg.form.stripCostPrice || Number(med.purchase_price || 0))),
      minimum_stock: med.minimum_stock,
      requires_prescription: med.requires_prescription,
      is_controlled: !!med.is_controlled,
      controlled_schedule: med.controlled_schedule || "",
      active_ingredients: (med.active_ingredients || []).map((ai) => ({
        active_ingredient_id: ai.active_ingredient_id,
        strength_value: ai.strength_value ? Number(ai.strength_value) : null,
        strength_unit: ai.strength_unit || "mg",
        display_strength: ai.display_strength || "",
      })),
      package_units:
        activeUnits.length > 0
          ? activeUnits
          : buildPackageUnits(loadedPkg.form),
    });
    setIsMedicineFormOpen(true);
  };



  const handleAddActiveIngredientRow = () => {
    setMedFormData((prev) => ({
      ...prev,
      active_ingredients: [
        ...(prev.active_ingredients || []),
        {
          active_ingredient_id: activeIngredientsList?.[0]?.id || "",
          strength_value: null,
          strength_unit: "mg",
          display_strength: "",
        },
      ],
    }));
  };

  const handleUpdateActiveIngredientRow = (index: number, field: string, value: any) => {
    setMedFormData((prev) => {
      const items = [...(prev.active_ingredients || [])];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, active_ingredients: items };
    });
  };

  const handleRemoveActiveIngredientRow = (index: number) => {
    setMedFormData((prev) => {
      const items = [...(prev.active_ingredients || [])];
      items.splice(index, 1);
      return { ...prev, active_ingredients: items };
    });
  };

  const resetFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setFilterProductType("all");
    setFilterCategoryId("");
    setFilterSubcategoryId("");
    setFilterFamilyId("");
    setFilterDosageFormId("");
    setFilterActiveIngredientId("");
    setFilterStockStatus("all");
    setFilterPrescription("all");
    setFilterControlled("all");
    setFilterSchedule("");
    setPageOffset(0);
  };

  const handleOpenAddBatch = (medId: string) => {
    setSelectedMedicineId(medId);
    setBatchFormData({
      batch_number: "",
      expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      quantity: 20,
      purchase_price: 0,
    });
    setIsAddBatchOpen(true);
  };

  const handleOpenWriteOff = (batch: MedicineBatch) => {
    setWriteOffBatch(batch);
    setWriteOffFormData({
      batch_id: batch.id,
      quantity: 1,
      reason: "expiry_write_off",
      notes: "",
    });
    setIsWriteOffOpen(true);
  };

  const handleViewDetails = (medId: string) => {
    setSelectedMedicineId(medId);
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
            <Pill size={28} color="var(--color-primary)" />
            {t("medicines.title")}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
            {t("medicines.subtitle")}
          </p>
        </div>

        {canManage && (
          <Button
            variant="primary"
            onClick={handleOpenAddMedicine}
            leftIcon={<Plus size={18} />}
          >
            {t("medicines.addMedicine")}
          </Button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "0.5rem",
          overflowX: "auto",
        }}
      >
        {[
          { key: "all" as TabKey, label: t("medicines.tabs.all"), icon: <Layers size={16} /> },
          { key: "lowStock" as TabKey, label: t("medicines.tabs.lowStock"), icon: <AlertTriangle size={16} />, badge: lowStockList?.length },
          { key: "expiring" as TabKey, label: t("medicines.tabs.expiring"), icon: <Calendar size={16} />, badge: expiringList?.length },
          { key: "movements" as TabKey, label: t("medicines.tabs.movements"), icon: <History size={16} /> },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1rem",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: isActive ? "var(--color-primary-light)" : "transparent",
                color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.9rem",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
                whiteSpace: "nowrap",
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  style={{
                    background: tab.key === "expiring" ? "var(--color-danger)" : "var(--color-warning)",
                    color: "#FFFFFF",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "0.1rem 0.4rem",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: All Medicines View */}
      {activeTab === "all" && (
        <Card style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Permanent Visible Filter & Search Toolbar */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              padding: "1rem",
              background: "var(--color-surface-subtle)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
            }}
          >
            {/* Top Row: Search Input & Action Buttons */}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "260px" }}>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={direction === "rtl" ? "البحث بالاسم، الاسم العربي، الباركود، الكود (SKU)، أو المادة الفعالة..." : "Search by medicine name, Arabic name, barcode, SKU, or generic..."}
                  leftIcon={<Search size={18} />}
                />
              </div>

              {(filterProductType !== "all" || filterCategoryId || filterSubcategoryId || filterFamilyId || filterDosageFormId || filterActiveIngredientId || filterStockStatus !== "all" || filterPrescription !== "all" || filterControlled !== "all" || filterSchedule || searchQuery) && (
                <Button variant="ghost" onClick={resetFilters} leftIcon={<RotateCcw size={15} />}>
                  {t("medicines.resetFilters")}
                </Button>
              )}
            </div>

            {/* Structured Classification Filters Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "0.75rem",
                fontSize: "0.85rem",
              }}
            >
              {/* 1. Product Type */}
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                  {t("medicines.productType")}
                </label>
                <select
                  value={filterProductType}
                  onChange={(e) => {
                    setFilterProductType(e.target.value);
                    setPageOffset(0);
                  }}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  <option value="all">{t("medicines.allProductTypes")}</option>
                  <option value="medicine">{t("medicines.typeMedicine")}</option>
                  <option value="general">{t("medicines.typeGeneral")}</option>
                </select>
              </div>

              {/* 2. Product Category */}
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                  {t("medicines.productCategory")}
                </label>
                <select
                  value={filterCategoryId}
                  onChange={(e) => {
                    setFilterCategoryId(e.target.value);
                    setFilterSubcategoryId("");
                    setPageOffset(0);
                  }}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="">{t("medicines.allCategories")}</option>
                  {productCategoriesList?.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {direction === "rtl" ? cat.name_ar : cat.name_en}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Subcategory (if category chosen) */}
              {filterCategoryId && (
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                    {t("medicines.productSubcategory")}
                  </label>
                  <select
                    value={filterSubcategoryId}
                    onChange={(e) => {
                      setFilterSubcategoryId(e.target.value);
                      setPageOffset(0);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="">{t("medicines.allSubcategories")}</option>
                    {productCategoriesList
                      ?.find((c) => c.id === filterCategoryId)
                      ?.subcategories?.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {direction === "rtl" ? sub.name_ar : sub.name_en}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* 4. Drug Family */}
              {filterProductType !== "general" && (
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                    {t("medicines.drugFamily")}
                  </label>
                  <select
                    value={filterFamilyId}
                    onChange={(e) => {
                      setFilterFamilyId(e.target.value);
                      setPageOffset(0);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="">{t("medicines.allDrugFamilies")}</option>
                    {drugFamiliesList?.map((df) => (
                      <option key={df.id} value={df.id}>
                        {direction === "rtl" ? df.name_ar : df.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 5. Dosage Form (with Category & Subtype) */}
              {filterProductType !== "general" && (
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                    {t("medicines.dosageForm")}
                  </label>
                  <select
                    value={filterDosageFormId}
                    onChange={(e) => {
                      setFilterDosageFormId(e.target.value);
                      setPageOffset(0);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="">{t("medicines.allDosageForms")}</option>
                    {dosageFormsList?.map((df) => (
                      <option key={df.id} value={df.id}>
                        {direction === "rtl" ? df.name_ar : df.name_en} {df.subtype ? `(${df.subtype})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 6. Active Ingredient */}
              {filterProductType !== "general" && (
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                    {t("medicines.activeIngredients")}
                  </label>
                  <select
                    value={filterActiveIngredientId}
                    onChange={(e) => {
                      setFilterActiveIngredientId(e.target.value);
                      setPageOffset(0);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="">{t("medicines.allIngredients")}</option>
                    {activeIngredientsList?.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name_en} {ing.name_ar ? `(${ing.name_ar})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 7. Stock Status */}
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                  {t("medicines.stockStatus")}
                </label>
                <select
                  value={filterStockStatus}
                  onChange={(e) => {
                    setFilterStockStatus(e.target.value);
                    setPageOffset(0);
                  }}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="all">{t("medicines.allStock")}</option>
                  <option value="in_stock">{t("medicines.inStockOnly")}</option>
                  <option value="low_stock">{t("medicines.lowStockOnly")}</option>
                  <option value="out_of_stock">{t("medicines.outOfStockOnly")}</option>
                </select>
              </div>

              {/* 8. Prescription (Rx vs OTC) */}
              {filterProductType !== "general" && (
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                    {t("medicines.filterPrescription")}
                  </label>
                  <select
                    value={filterPrescription}
                    onChange={(e) => {
                      setFilterPrescription(e.target.value);
                      setPageOffset(0);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="all">{t("medicines.allPrescriptions")}</option>
                    <option value="rx">{t("medicines.rxRequired")}</option>
                    <option value="otc">{t("medicines.otc")}</option>
                  </select>
                </div>
              )}

              {/* 9. Controlled Classification */}
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                  {t("medicines.classificationFilter")}
                </label>
                <select
                  value={filterControlled}
                  onChange={(e) => {
                    setFilterControlled(e.target.value);
                    if (e.target.value !== "controlled") {
                      setFilterSchedule("");
                    }
                    setPageOffset(0);
                  }}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="all">{t("medicines.allClassifications")}</option>
                  <option value="ordinary">{t("medicines.ordinaryOnly")}</option>
                  <option value="controlled">{t("medicines.controlledOnly")}</option>
                </select>
              </div>

              {/* 10. Schedule Category Filter */}
              {filterControlled === "controlled" && (
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 700, color: "var(--color-text-muted)" }}>
                    {t("medicines.scheduleFilter")}
                  </label>
                  <select
                    value={filterSchedule}
                    onChange={(e) => {
                      setFilterSchedule(e.target.value);
                      setPageOffset(0);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="">{t("medicines.allSchedules")}</option>
                    <option value="schedule_1">{t("medicines.schedules.schedule_1")}</option>
                    <option value="schedule_2">{t("medicines.schedules.schedule_2")}</option>
                    <option value="schedule_3">{t("medicines.schedules.schedule_3")}</option>
                    <option value="unscheduled_controlled">{t("medicines.schedules.unscheduled_controlled")}</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Medicines Table */}
          {isLoadingMedicines ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <Skeleton height="50px" />
              <Skeleton height="50px" />
              <Skeleton height="50px" />
              <Skeleton height="50px" />
            </div>
          ) : medicinesList && medicinesList.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: direction === "rtl" ? "right" : "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.movementMedicine")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.barcode")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.sellingPrice")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.currentStock")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.prescription")}</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "end" }}>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {medicinesList.map((med) => {
                    const stock = (med as any).total_stock ?? 0;
                    const isLow = stock > 0 && stock <= med.minimum_stock;
                    const isOut = stock <= 0;

                    return (
                      <tr
                        key={med.id}
                        style={{
                          borderBottom: "1px solid var(--color-border-subtle)",
                          fontSize: "0.9rem",
                          transition: "background var(--transition-fast)",
                        }}
                      >
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <div
                            onClick={() => handleViewDetails(med.id)}
                            style={{ fontWeight: 700, color: "var(--color-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}
                          >
                            <span>{direction === "rtl" && med.name_ar ? med.name_ar : med.name}</span>
                            {direction === "rtl" && med.name_ar && med.name && (
                              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                                ({med.name})
                              </span>
                            )}
                            {direction !== "rtl" && med.name_ar && (
                              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                                ({med.name_ar})
                              </span>
                            )}
                            {med.is_controlled && (
                              <span
                                title={med.controlled_schedule || "Controlled"}
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: "var(--radius-sm)",
                                  background: "rgba(239, 68, 68, 0.15)",
                                  color: "#dc2626",
                                  fontWeight: 700,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "2px",
                                }}
                              >
                                <ShieldAlert size={11} />
                                {direction === "rtl" ? "أدوية جدول" : "Controlled"}
                              </span>
                            )}
                            {med.product_type === "general" && (
                              <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", borderRadius: "var(--radius-sm)", background: "rgba(16, 185, 129, 0.12)", color: "#059669", fontWeight: 700 }}>
                                {med.category_rel ? (direction === "rtl" ? med.category_rel.name_ar : med.category_rel.name_en) : (direction === "rtl" ? "منتج عام" : "General")}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.2rem", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                            {med.sku && (
                              <span style={{ fontWeight: 600, color: "var(--color-secondary)" }}>SKU: {med.sku}</span>
                            )}
                            {med.strength && (
                              <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{med.strength}</span>
                            )}
                            {med.dosage_form && (
                              <span>{direction === "rtl" ? med.dosage_form.name_ar : med.dosage_form.name_en} {med.dosage_form.subtype ? `(${med.dosage_form.subtype})` : ""}</span>
                            )}
                            {med.generic_name && (
                              <span>• {med.generic_name}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                          {med.barcode || "—"}
                        </td>
                        <td style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>
                          {Number(med.selling_price).toFixed(2)} {t("common.egp")}
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          {isOut ? (
                            <Badge variant="danger">{t("pos.outOfStock")}</Badge>
                          ) : isLow ? (
                            <Badge variant="warning">
                              {formatPackagingBreakdown(stock, med.package_units, direction === "rtl", med.base_unit_name)}
                            </Badge>
                          ) : (
                            <Badge variant="success">
                              {formatPackagingBreakdown(stock, med.package_units, direction === "rtl", med.base_unit_name)}
                            </Badge>
                          )}
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          {med.is_controlled ? (
                            <Badge variant="danger">
                              <ShieldAlert size={12} style={{ marginInlineEnd: 4, verticalAlign: "middle" }} />
                              {direction === "rtl" ? "جدول" : "Controlled"}
                              {med.controlled_schedule ? ` (${med.controlled_schedule.replace("schedule_", "S").replace("unscheduled_controlled", "Unsch")})` : ""}
                            </Badge>
                          ) : med.product_type === "general" ? (
                            <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                              {direction === "rtl" ? "عام" : "General"}
                            </span>
                          ) : med.requires_prescription ? (
                            <Badge variant="warning">{t("medicines.rxRequired")}</Badge>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                              {t("medicines.otc")}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "0.875rem 1rem", textAlign: "end" }}>
                          <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDetails(med.id)}
                              leftIcon={<FileText size={14} />}
                            >
                              {t("common.viewDetails")}
                            </Button>
                            {canManage && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleOpenAddBatch(med.id)}
                                leftIcon={<Plus size={14} />}
                              >
                                {t("medicines.addBatch")}
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
                  {t("medicines.pagination", { from: pageOffset + 1, to: pageOffset + medicinesList.length })}
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
                    disabled={medicinesList.length < pageSize}
                    onClick={() => setPageOffset((p) => p + pageSize)}
                  >
                    {t("medicines.next")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
              <Package size={40} color="var(--color-border)" style={{ marginBottom: "0.5rem" }} />
              <div>{t("medicines.emptyAll")}</div>
            </div>
          )}
        </Card>
      )}

      {/* Tab 2: Low Stock View */}
      {activeTab === "lowStock" && (
        <Card style={{ padding: "1.25rem" }}>
          {isLoadingLowStock ? (
            <Skeleton height="120px" />
          ) : lowStockList && lowStockList.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: direction === "rtl" ? "right" : "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.movementMedicine")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.barcode")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.currentStock")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.minimumStock")}</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "end" }}>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockList.map((item) => (
                    <tr key={item.medicine_id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "var(--color-text)" }}>
                        {item.medicine_name}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", color: "var(--color-text-muted)" }}>
                        {item.barcode || "—"}
                      </td>
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <Badge variant={item.current_stock === 0 ? "danger" : "warning"}>
                          {item.current_stock} {t("common.units")}
                        </Badge>
                      </td>
                      <td style={{ padding: "0.875rem 1rem", color: "var(--color-text-muted)" }}>
                        {item.minimum_stock} {t("common.units")}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", textAlign: "end" }}>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOpenAddBatch(item.medicine_id)}
                            leftIcon={<Plus size={14} />}
                          >
                            {t("medicines.addBatch")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
              <CheckCircle2 size={40} color="var(--color-success)" style={{ marginBottom: "0.5rem" }} />
              <div>{t("medicines.emptyLowStock")}</div>
            </div>
          )}
        </Card>
      )}

      {/* Tab 3: Expiring & Expired Batches */}
      {activeTab === "expiring" && (
        <Card style={{ padding: "1.25rem" }}>
          {isLoadingExpiring ? (
            <Skeleton height="120px" />
          ) : expiringList && expiringList.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: direction === "rtl" ? "right" : "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.movementMedicine")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.batchNumber")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.expiryDate")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("pos.qty")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("common.status")}</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "end" }}>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringList.map((item) => (
                    <tr key={item.batch_id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "var(--color-text)" }}>
                        {item.medicine_name}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", color: "var(--color-text-muted)" }}>
                        {item.batch_number || "—"}
                      </td>
                      <td style={{ padding: "0.875rem 1rem" }}>
                        {item.expiry_date}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>
                        {item.quantity}
                      </td>
                      <td style={{ padding: "0.875rem 1rem" }}>
                        {item.is_expired ? (
                          <Badge variant="danger">
                            {t("medicines.expired")} ({t("medicines.expiredAgo", { days: Math.abs(item.days_until_expiry) })})
                          </Badge>
                        ) : (
                          <Badge variant="warning">
                            {t("medicines.daysRemaining", { days: item.days_until_expiry })}
                          </Badge>
                        )}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", textAlign: "end" }}>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              handleOpenWriteOff({
                                id: item.batch_id,
                                medicine_id: item.medicine_id,
                                batch_number: item.batch_number,
                                expiry_date: item.expiry_date,
                                quantity: item.quantity,
                                purchase_price: 0,
                              })
                            }
                            leftIcon={<ShieldAlert size={14} />}
                          >
                            {t("medicines.writeOff")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
              <CheckCircle2 size={40} color="var(--color-success)" style={{ marginBottom: "0.5rem" }} />
              <div>{t("medicines.emptyExpiring")}</div>
            </div>
          )}
        </Card>
      )}

      {/* Tab 4: Inventory Movements Ledger */}
      {activeTab === "movements" && (
        <Card style={{ padding: "1.25rem" }}>
          {isLoadingMovements ? (
            <Skeleton height="150px" />
          ) : movementsList && movementsList.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: direction === "rtl" ? "right" : "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.movementDate")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.movementMedicine")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.movementReason")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.movementChange")}</th>
                    <th style={{ padding: "0.75rem 1rem" }}>{t("medicines.movementRef")}</th>
                  </tr>
                </thead>
                <tbody>
                  {movementsList.map((m) => {
                    const isPositive = m.quantity_change > 0;
                    return (
                      <tr key={m.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                          {new Date(m.created_at).toLocaleString()}
                        </td>
                        <td style={{ padding: "0.875rem 1rem", fontWeight: 600 }}>
                          {m.medicine_name || "—"}
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span style={{ fontSize: "0.85rem", textTransform: "capitalize" }}>
                            {t(`dashboard.recentActivity.types.${m.reason}`) || m.reason}
                          </span>
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontWeight: 700,
                              color: isPositive ? "var(--color-success)" : "var(--color-danger)",
                            }}
                          >
                            {isPositive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                            {isPositive ? `+${m.quantity_change}` : m.quantity_change}
                          </span>
                        </td>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                          {m.reference_type || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-muted)" }}>
              <History size={40} color="var(--color-border)" style={{ marginBottom: "0.5rem" }} />
              <div>{t("medicines.emptyMovements")}</div>
            </div>
          )}
        </Card>
      )}

      {/* Details Modal */}
      {isDetailsModalOpen && selectedMedicine && (
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
                  {direction === "rtl" && selectedMedicine.name_ar ? selectedMedicine.name_ar : selectedMedicine.name}
                  {selectedMedicine.name_ar && selectedMedicine.name && (
                    <span style={{ fontSize: "0.9rem", color: "var(--color-text-muted)", marginInlineStart: "0.5rem" }}>
                      ({direction === "rtl" ? selectedMedicine.name : selectedMedicine.name_ar})
                    </span>
                  )}
                </h2>
                <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.2rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  {selectedMedicine.generic_name && <span>{selectedMedicine.generic_name}</span>}
                  {selectedMedicine.manufacturer && <span>• {selectedMedicine.manufacturer}</span>}
                </div>

                {/* Badges Bar */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  {selectedMedicine.product_type === "general" ? (
                    <Badge variant="success">
                      🛍️ {selectedMedicine.category_rel ? (direction === "rtl" ? selectedMedicine.category_rel.name_ar : selectedMedicine.category_rel.name_en) : (direction === "rtl" ? "منتج عام" : "General Merchandise")}
                    </Badge>
                  ) : (
                    <Badge variant="info">
                      💊 {direction === "rtl" ? "دواء بشري" : "Pharmaceutical Medicine"}
                    </Badge>
                  )}
                  {selectedMedicine.sku && (
                    <Badge variant="neutral">SKU: {selectedMedicine.sku}</Badge>
                  )}
                  {selectedMedicine.drug_family && (
                    <Badge variant="info">
                      {direction === "rtl" ? selectedMedicine.drug_family.name_ar : selectedMedicine.drug_family.name_en}
                    </Badge>
                  )}
                  {selectedMedicine.dosage_form && (
                    <Badge variant="neutral">
                      {direction === "rtl" ? selectedMedicine.dosage_form.name_ar : selectedMedicine.dosage_form.name_en}
                      {selectedMedicine.dosage_form.subtype ? ` (${selectedMedicine.dosage_form.subtype})` : ""}
                    </Badge>
                  )}
                  {selectedMedicine.strength && (
                    <Badge variant="info">{selectedMedicine.strength}</Badge>
                  )}
                  {selectedMedicine.product_type !== "general" && (
                    selectedMedicine.is_controlled ? (
                      <Badge variant="danger">
                        <ShieldAlert size={12} style={{ marginInlineEnd: 4, verticalAlign: "middle" }} />
                        {direction === "rtl" ? "دواء مراقب / جدول" : "Controlled"} ({selectedMedicine.controlled_schedule || "Controlled"})
                      </Badge>
                    ) : selectedMedicine.requires_prescription ? (
                      <Badge variant="warning">{t("medicines.rxRequired")}</Badge>
                    ) : (
                      <Badge variant="success">{t("medicines.otc")}</Badge>
                    )
                  )}
                </div>
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            {/* Spec Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "1rem",
                background: "var(--color-surface-subtle)",
                padding: "1.25rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border-subtle)",
                fontSize: "0.85rem",
              }}
            >
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("medicines.sellingPrice")}</div>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-primary)", marginTop: "0.2rem" }}>
                  {Number(selectedMedicine.selling_price).toFixed(2)} {t("common.egp")}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("medicines.currentStock")}</div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-text)", marginTop: "0.2rem" }}>
                  {formatPackagingBreakdown(
                    (selectedMedicine as any).total_stock ?? 0,
                    selectedMedicine.package_units,
                    direction === "rtl",
                    selectedMedicine.base_unit_name
                  )}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("medicines.minimumStock")}</div>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-text)", marginTop: "0.2rem" }}>
                  {selectedMedicine.minimum_stock} {selectedMedicine.base_unit_name || t("common.units")}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("medicines.barcode")}</div>
                <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>{selectedMedicine.barcode || "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("medicines.baseUnitName")}</div>
                <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>{selectedMedicine.base_unit_name || "Unit"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)" }}>{t("medicines.prescription")}</div>
                <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>
                  {selectedMedicine.requires_prescription ? t("medicines.rxRequired") : t("medicines.otc")}
                </div>
              </div>
            </div>

            {/* Active Ingredients Section */}
            {selectedMedicine.active_ingredients && selectedMedicine.active_ingredients.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Tag size={16} color="var(--color-primary)" />
                  {t("medicines.activeIngredients")}
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {selectedMedicine.active_ingredients.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "0.5rem 0.75rem",
                        background: "var(--color-surface-subtle)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border)",
                        fontSize: "0.85rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "var(--color-text)" }}>
                        {item.active_ingredient?.name_en || "Ingredient"}
                        {item.active_ingredient?.name_ar ? ` (${item.active_ingredient.name_ar})` : ""}
                      </span>
                      {(item.display_strength || item.strength_value) && (
                        <Badge variant="info">
                          {item.display_strength || `${item.strength_value} ${item.strength_unit || "mg"}`}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Packaging Hierarchy Section */}
            {selectedMedicine.package_units && selectedMedicine.package_units.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Boxes size={16} color="var(--color-primary)" />
                  {t("medicines.packageUnits")}
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: direction === "rtl" ? "right" : "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                        <th style={{ padding: "0.4rem" }}>{t("medicines.unitNameAr")}</th>
                        <th style={{ padding: "0.4rem" }}>{t("medicines.unitNameEn")}</th>
                        <th style={{ padding: "0.4rem" }}>{t("medicines.conversionFactor")}</th>
                        <th style={{ padding: "0.4rem" }}>{t("medicines.unitSellingPrice")}</th>
                        <th style={{ padding: "0.4rem" }}>{t("medicines.unitBarcode")}</th>
                        <th style={{ padding: "0.4rem", textAlign: "center" }}>{t("medicines.isBaseUnit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMedicine.package_units.map((u, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                          <td style={{ padding: "0.4rem", fontWeight: 700 }}>{u.unit_name_ar}</td>
                          <td style={{ padding: "0.4rem" }}>{u.unit_name_en}</td>
                          <td style={{ padding: "0.4rem", fontWeight: 600 }}>x{Number(u.conversion_factor)}</td>
                          <td style={{ padding: "0.4rem", fontWeight: 700, color: "var(--color-primary)" }}>
                            {Number(u.selling_price).toFixed(2)} {t("common.egp")}
                          </td>
                          <td style={{ padding: "0.4rem", color: "var(--color-text-muted)" }}>{u.barcode || "—"}</td>
                          <td style={{ padding: "0.4rem", textAlign: "center" }}>
                            {u.is_base_unit && <Badge variant="success">{t("medicines.isBaseUnit")}</Badge>}
                            {u.is_default_dispense && !u.is_base_unit && <Badge variant="info">{t("medicines.isDefaultDispense")}</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Batches Section */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text)" }}>
                  {t("medicines.batches")}
                </h3>
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenAddBatch(selectedMedicine.id)}
                    leftIcon={<Plus size={14} />}
                  >
                    {t("medicines.addBatch")}
                  </Button>
                )}
              </div>

              {isLoadingBatches ? (
                <Skeleton height="60px" />
              ) : medicineBatches && medicineBatches.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: direction === "rtl" ? "right" : "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                        <th style={{ padding: "0.5rem" }}>{t("medicines.batchNumber")}</th>
                        <th style={{ padding: "0.5rem" }}>{t("medicines.expiryDate")}</th>
                        <th style={{ padding: "0.5rem" }}>{t("pos.qty")}</th>
                        <th style={{ padding: "0.5rem" }}>{t("medicines.costPrice")}</th>
                        <th style={{ padding: "0.5rem", textAlign: "end" }}>{t("common.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medicineBatches.map((b) => (
                        <tr key={b.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                          <td style={{ padding: "0.625rem 0.5rem", fontWeight: 600 }}>{b.batch_number || "—"}</td>
                          <td style={{ padding: "0.625rem 0.5rem" }}>{b.expiry_date}</td>
                          <td style={{ padding: "0.625rem 0.5rem", fontWeight: 700 }}>{b.quantity}</td>
                          <td style={{ padding: "0.625rem 0.5rem" }}>{Number(b.purchase_price).toFixed(2)}</td>
                          <td style={{ padding: "0.625rem 0.5rem", textAlign: "end" }}>
                            {canManage && b.quantity > 0 && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleOpenWriteOff(b)}
                                leftIcon={<ShieldAlert size={14} />}
                              >
                                {t("medicines.writeOff")}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  {t("medicines.noBatches")}
                </div>
              )}
            </div>

            {/* Actions Bottom */}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
              {canManage && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setDeletingMedicine(selectedMedicine);
                    setIsDeleteConfirmOpen(true);
                  }}
                  leftIcon={<Trash2 size={16} />}
                >
                  {t("medicines.deleteMedicine")}
                </Button>
              )}

              <div style={{ display: "flex", gap: "0.75rem" }}>
                {canManage && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsDetailsModalOpen(false);
                      handleOpenEditMedicine(selectedMedicine);
                    }}
                    leftIcon={<Edit2 size={16} />}
                  >
                    {t("medicines.editMedicine")}
                  </Button>
                )}
                <Button variant="primary" onClick={() => setIsDetailsModalOpen(false)}>
                  {t("pos.close")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Medicine Form Modal */}
      {isMedicineFormOpen && (
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
              maxWidth: "760px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text)" }}>
                {editingMedicine ? t("medicines.editMedicine") : t("medicines.addMedicine")}
              </h2>
              <button
                type="button"
                onClick={() => setIsMedicineFormOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs Bar */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                borderBottom: "1px solid var(--color-border)",
                paddingBottom: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={() => setFormActiveTab("basic")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "var(--radius-md)",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  border: "none",
                  cursor: "pointer",
                  background: formActiveTab === "basic" ? "var(--color-primary-subtle, rgba(37,99,235,0.12))" : "transparent",
                  color: formActiveTab === "basic" ? "var(--color-primary)" : "var(--color-text-muted)",
                }}
              >
                <FileText size={16} />
                {t("medicines.tabBasic")}
              </button>
              <button
                type="button"
                onClick={() => setFormActiveTab("classification")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "var(--radius-md)",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  border: "none",
                  cursor: "pointer",
                  background: formActiveTab === "classification" ? "var(--color-primary-subtle, rgba(37,99,235,0.12))" : "transparent",
                  color: formActiveTab === "classification" ? "var(--color-primary)" : "var(--color-text-muted)",
                }}
              >
                <Layers size={16} />
                {t("medicines.tabClassification")}
              </button>
              <button
                type="button"
                onClick={() => setFormActiveTab("packaging")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "var(--radius-md)",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  border: "none",
                  cursor: "pointer",
                  background: formActiveTab === "packaging" ? "var(--color-primary-subtle, rgba(37,99,235,0.12))" : "transparent",
                  color: formActiveTab === "packaging" ? "var(--color-primary)" : "var(--color-text-muted)",
                }}
              >
                <Boxes size={16} />
                {t("medicines.tabPackaging")}
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const pkgError = validatePackaging(pkg, direction === "rtl");
                if (pkgError) {
                  error(pkgError);
                  setFormActiveTab("packaging");
                  return;
                }

                const units = buildPackageUnits(pkg);
                const baseUnit = units.find((u) => u.is_base_unit) || units[units.length - 1];

                if (medFormData.is_controlled && !medFormData.controlled_schedule) {
                  error(direction === "rtl" ? "يرجى تحديد جدول الصنف للأدوية المراقبة" : "Please select schedule category for controlled medicine");
                  setFormActiveTab("classification");
                  return;
                }

                const isMed = medFormData.product_type !== "general";
                const stripUnit = units.find((u) => u.unit_name_en.toLowerCase() === "strip");
                const boxUnit = units.find((u) => u.unit_name_en.toLowerCase() === "box");
                const primarySellingPrice = isMed && pkg.template === "box_strip_unit" && stripUnit
                  ? Number(stripUnit.selling_price)
                  : Number(boxUnit?.selling_price || baseUnit.selling_price);
                const primaryCostPrice = isMed && pkg.template === "box_strip_unit" && stripUnit
                  ? Number(stripUnit.purchase_price || 0)
                  : Number(boxUnit?.purchase_price || baseUnit.purchase_price || 0);

                const cleanPayload = {
                  ...medFormData,
                  drug_family_id: medFormData.drug_family_id || undefined,
                  dosage_form_id: medFormData.dosage_form_id || undefined,
                  category_id: medFormData.category_id || undefined,
                  subcategory_id: medFormData.subcategory_id || undefined,
                  sku: medFormData.sku || undefined,
                  barcode: medFormData.barcode || undefined,
                  manufacturer: medFormData.manufacturer || undefined,
                  category: medFormData.category || undefined,
                  dosage: medFormData.dosage || undefined,
                  form: medFormData.form || undefined,
                  strength: medFormData.strength || undefined,
                  controlled_schedule: medFormData.is_controlled ? (medFormData.controlled_schedule || undefined) : undefined,
                  // Primary catalog price: Strip for 3-level medicines, Box for general merchandise
                  base_unit_name: baseUnit.unit_name_en,
                  selling_price: primarySellingPrice,
                  purchase_price: primaryCostPrice,
                  package_units: units,
                };

                saveMedicineMutation.mutate(cleanPayload as any);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {/* Tab 1: Basic Information */}
              {formActiveTab === "basic" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {/* Product Type Toggle */}
                  <div
                    style={{
                      background: "var(--color-surface-subtle)",
                      padding: "0.75rem 1rem",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.35rem",
                    }}
                  >
                    <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-text)" }}>
                      {t("medicines.productType")} *
                    </label>
                    <div style={{ display: "flex", gap: "1.5rem" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
                        <input
                          type="radio"
                          name="product_type"
                          value="medicine"
                          checked={medFormData.product_type !== "general"}
                          onChange={() => setMedFormData({ ...medFormData, product_type: "medicine" })}
                        />
                        💊 {t("medicines.typeMedicine")}
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
                        <input
                          type="radio"
                          name="product_type"
                          value="general"
                          checked={medFormData.product_type === "general"}
                          onChange={() =>
                            setMedFormData({
                              ...medFormData,
                              product_type: "general",
                              requires_prescription: false,
                              drug_family_id: undefined,
                              dosage_form_id: undefined,
                              strength: "",
                              active_ingredients: [],
                            })
                          }
                        />
                        🛍️ {t("medicines.typeGeneral")}
                      </label>
                    </div>
                  </div>

                  {/* General Merchandise Classification (Category, Subcategory, SKU) */}
                  {medFormData.product_type === "general" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-text)" }}>
                          {t("medicines.productCategory")}
                        </label>
                        <select
                          value={medFormData.category_id || ""}
                          onChange={(e) => setMedFormData({ ...medFormData, category_id: e.target.value || undefined, subcategory_id: undefined })}
                          style={{
                            width: "100%",
                            padding: "0.5rem 0.75rem",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text)",
                            fontSize: "0.9rem",
                          }}
                        >
                          <option value="">{t("medicines.allCategories")}</option>
                          {productCategoriesList?.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {direction === "rtl" ? cat.name_ar : cat.name_en}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-text)" }}>
                          {t("medicines.productSubcategory")}
                        </label>
                        <select
                          value={medFormData.subcategory_id || ""}
                          onChange={(e) => setMedFormData({ ...medFormData, subcategory_id: e.target.value || undefined })}
                          disabled={!medFormData.category_id}
                          style={{
                            width: "100%",
                            padding: "0.5rem 0.75rem",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text)",
                            fontSize: "0.9rem",
                          }}
                        >
                          <option value="">{t("medicines.allSubcategories")}</option>
                          {productCategoriesList
                            ?.find((c) => c.id === medFormData.category_id)
                            ?.subcategories?.map((sub) => (
                              <option key={sub.id} value={sub.id}>
                                {direction === "rtl" ? sub.name_ar : sub.name_en}
                              </option>
                            ))}
                        </select>
                      </div>

                      <Input
                        label={t("medicines.sku")}
                        value={medFormData.sku || ""}
                        onChange={(e) => setMedFormData({ ...medFormData, sku: e.target.value })}
                        placeholder="e.g. SK-1002"
                      />
                    </div>
                  )}

                  {/* Pharmaceutical Medicines Classification (Drug Family, Dosage Category/Subtype, Strength, Rx/OTC) */}
                  {medFormData.product_type !== "general" && (
                    <div
                      style={{
                        background: "var(--color-surface-subtle)",
                        padding: "0.875rem 1rem",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, fontSize: "0.875rem", color: "var(--color-primary)" }}>
                          <Layers size={16} />
                          <span>{direction === "rtl" ? "التصنيف الصيدلاني والدليل العلاجي" : "Pharmaceutical Classification"}</span>
                        </div>

                        {/* Rx / OTC selector */}
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                            <input
                              type="radio"
                              name="basic_rx_selector"
                              checked={!medFormData.requires_prescription}
                              onChange={() => setMedFormData({ ...medFormData, requires_prescription: false })}
                            />
                            🟢 {t("medicines.otc")}
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                            <input
                              type="radio"
                              name="basic_rx_selector"
                              checked={!!medFormData.requires_prescription}
                              onChange={() => setMedFormData({ ...medFormData, requires_prescription: true })}
                            />
                            🔴 {t("medicines.rxRequired")}
                          </label>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                        {/* Drug Family */}
                        <div>
                          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-text)" }}>
                            {t("medicines.drugFamily")}
                          </label>
                          <select
                            value={medFormData.drug_family_id || ""}
                            onChange={(e) => setMedFormData({ ...medFormData, drug_family_id: e.target.value || undefined })}
                            style={{
                              width: "100%",
                              padding: "0.5rem 0.75rem",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--color-border)",
                              background: "var(--color-surface)",
                              color: "var(--color-text)",
                              fontSize: "0.9rem",
                            }}
                          >
                            <option value="">{t("medicines.allDrugFamilies")}</option>
                            {(drugFamiliesList || []).map((df) => (
                              <option key={df.id} value={df.id}>
                                {direction === "rtl" ? `${df.name_ar} (${df.name_en})` : `${df.name_en} (${df.name_ar})`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Strength / Concentration */}
                        <Input
                          label={t("medicines.strength") + " (e.g. 500mg, 1g/vial)"}
                          placeholder="e.g. 500 mg, 875/125 mg"
                          value={medFormData.strength || ""}
                          onChange={(e) => setMedFormData({ ...medFormData, strength: e.target.value })}
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                        {/* Dosage Form Category */}
                        <div>
                          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-text)" }}>
                            {t("medicines.dosageCategory")}
                          </label>
                          <select
                            value={selectedDosageCategory}
                            onChange={(e) => {
                              setSelectedDosageCategory(e.target.value);
                              if (e.target.value) {
                                const curDf = dosageFormsList?.find((df) => df.id === medFormData.dosage_form_id);
                                if (curDf && curDf.category !== e.target.value) {
                                  setMedFormData((prev) => ({ ...prev, dosage_form_id: undefined }));
                                }
                              }
                            }}
                            style={{
                              width: "100%",
                              padding: "0.5rem 0.75rem",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--color-border)",
                              background: "var(--color-surface)",
                              color: "var(--color-text)",
                              fontSize: "0.9rem",
                            }}
                          >
                            <option value="">{direction === "rtl" ? "جميع فئات الأشكال الصيدلانية" : "All Dosage Categories"}</option>
                            {uniqueDosageCategories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Dosage Form Subtype */}
                        <div>
                          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-text)" }}>
                            {t("medicines.dosageSubtype")} / {t("medicines.dosageForm")}
                          </label>
                          <select
                            value={medFormData.dosage_form_id || ""}
                            onChange={(e) => {
                              const val = e.target.value || undefined;
                              const chosen = dosageFormsList?.find((df) => df.id === val);
                              setMedFormData((prev) => ({
                                ...prev,
                                dosage_form_id: val,
                                form: chosen?.subtype || chosen?.name_en || prev.form,
                              }));
                              if (chosen?.category && !selectedDosageCategory) {
                                setSelectedDosageCategory(chosen.category);
                              }
                            }}
                            style={{
                              width: "100%",
                              padding: "0.5rem 0.75rem",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--color-border)",
                              background: "var(--color-surface)",
                              color: "var(--color-text)",
                              fontSize: "0.9rem",
                            }}
                          >
                            <option value="">{t("medicines.allDosageForms")}</option>
                            {(filteredDosageForms || []).map((df) => (
                              <option key={df.id} value={df.id}>
                                {direction === "rtl" ? `${df.name_ar} (${df.name_en})` : `${df.name_en} (${df.name_ar})`}
                                {df.subtype ? ` [${df.subtype}]` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Active Ingredients Summary indicator */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.25rem", borderTop: "1px dashed var(--color-border)" }}>
                        <div style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>
                          {medFormData.active_ingredients && medFormData.active_ingredients.length > 0
                            ? `🧪 ${medFormData.active_ingredients.length} ${t("medicines.activeIngredients")}`
                            : `🧪 ${t("medicines.noIngredients")}`}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setFormActiveTab("classification")}
                          leftIcon={<Tag size={14} />}
                        >
                          {direction === "rtl" ? "إدارة وتفصيل المواد الفعالة →" : "Manage Active Ingredients →"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <Input
                      label={t("medicines.nameEn") + " *"}
                      value={medFormData.name}
                      onChange={(e) => setMedFormData({ ...medFormData, name: e.target.value })}
                      required
                    />
                    <Input
                      label={t("medicines.nameAr")}
                      value={medFormData.name_ar || ""}
                      onChange={(e) => setMedFormData({ ...medFormData, name_ar: e.target.value })}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <Input
                      label="Generic Name"
                      value={medFormData.generic_name || ""}
                      onChange={(e) => setMedFormData({ ...medFormData, generic_name: e.target.value })}
                    />
                    <Input
                      label={t("medicines.manufacturer")}
                      value={medFormData.manufacturer || ""}
                      onChange={(e) => setMedFormData({ ...medFormData, manufacturer: e.target.value })}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <Input
                      label={t("medicines.barcode")}
                      value={medFormData.barcode || ""}
                      onChange={(e) => setMedFormData({ ...medFormData, barcode: e.target.value })}
                    />
                    <Input
                      label={t("medicines.category")}
                      value={medFormData.category || ""}
                      onChange={(e) => setMedFormData({ ...medFormData, category: e.target.value })}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    {(() => {
                      const isMed = medFormData.product_type !== "general";
                      const isStripPrimary = isMed && pkg.template === "box_strip_unit";
                      const primaryLabel = direction === "rtl"
                        ? (isStripPrimary ? "الشريط / الوحدة الرئيسية" : "العلبة / العبوة الرئيسية")
                        : (isStripPrimary ? "Strip / Primary Unit" : "Box / Primary Unit");

                      return (
                        <>
                          <Input
                            label={`${t("medicines.sellingPrice")} – ${primaryLabel} (EGP) *`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={medFormData.selling_price || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setMedFormData((prev) => ({ ...prev, selling_price: val }));
                              setPkg((prev) => {
                                const S = Math.max(1, prev.stripsPerBox);
                                const newStripPrice = isStripPrimary ? val : (val > 0 && S > 0 ? Math.round((val / S) * 100) / 100 : 0);
                                const newBoxPrice = isStripPrimary ? Math.round(val * S * 100) / 100 : val;
                                const newUnits = generateHierarchyUnits(
                                  prev.template,
                                  prev.stripsPerBox,
                                  prev.unitsPerStrip,
                                  prev.unitsPerBox,
                                  newBoxPrice,
                                  prev.boxCostPrice,
                                  prev.units,
                                  medFormData.form,
                                  isStripPrimary ? newStripPrice : undefined,
                                  isStripPrimary ? prev.stripCostPrice : undefined
                                );
                                return {
                                  ...prev,
                                  stripSellingPrice: newStripPrice,
                                  boxSellingPrice: newBoxPrice,
                                  units: newUnits,
                                };
                              });
                            }}
                            required
                          />
                          <Input
                            label={`${t("medicines.costPrice")} – ${primaryLabel} (EGP) *`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={medFormData.purchase_price || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setMedFormData((prev) => ({ ...prev, purchase_price: val }));
                              setPkg((prev) => {
                                const S = Math.max(1, prev.stripsPerBox);
                                const newStripCost = isStripPrimary ? val : (val > 0 && S > 0 ? Math.round((val / S) * 100) / 100 : 0);
                                const newBoxCost = isStripPrimary ? Math.round(val * S * 100) / 100 : val;
                                const newUnits = generateHierarchyUnits(
                                  prev.template,
                                  prev.stripsPerBox,
                                  prev.unitsPerStrip,
                                  prev.unitsPerBox,
                                  prev.boxSellingPrice,
                                  newBoxCost,
                                  prev.units,
                                  medFormData.form,
                                  isStripPrimary ? prev.stripSellingPrice : undefined,
                                  isStripPrimary ? newStripCost : undefined
                                );
                                return {
                                  ...prev,
                                  stripCostPrice: newStripCost,
                                  boxCostPrice: newBoxCost,
                                  units: newUnits,
                                };
                              });
                            }}
                            required
                          />
                        </>
                      );
                    })()}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", alignItems: "center" }}>
                    <Input
                      label={t("medicines.minimumStock")}
                      type="number"
                      min="0"
                      value={medFormData.minimum_stock ?? 10}
                      onChange={(e) => setMedFormData({ ...medFormData, minimum_stock: parseInt(e.target.value, 10) || 0 })}
                    />
                    {medFormData.product_type !== "general" && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.2rem" }}>
                        <input
                          type="checkbox"
                          id="rx"
                          checked={medFormData.requires_prescription}
                          onChange={(e) => setMedFormData({ ...medFormData, requires_prescription: e.target.checked })}
                        />
                        <label htmlFor="rx" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", cursor: "pointer" }}>
                          {t("medicines.rxRequired")}
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Classification & Active Ingredients */}
              {formActiveTab === "classification" && (
                medFormData.product_type === "general" ? (
                  <div
                    style={{
                      padding: "2.5rem 1.5rem",
                      textAlign: "center",
                      background: "var(--color-surface-subtle)",
                      borderRadius: "var(--radius-lg)",
                      border: "1px dashed var(--color-border)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <Boxes size={36} color="var(--color-text-muted)" />
                    <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-text)" }}>
                      {direction === "rtl" ? "منتج عناية أو مستلزمات عامة" : "General Merchandise / Personal Care"}
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", maxWidth: "440px" }}>
                      {direction === "rtl"
                        ? "هذا الصنف مصنف كمنتج عام، وبالتالي لا يخضع لشروط المواد الفعالة أو العائلات الدوائية أو قيود الوصفات الطبية."
                        : "This item is classified as general merchandise. Pharmaceutical active ingredients, drug families, and prescription regulations do not apply."}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-text)" }}>
                          {t("medicines.drugFamily")}
                        </label>
                        <select
                          value={medFormData.drug_family_id || ""}
                          onChange={(e) => setMedFormData({ ...medFormData, drug_family_id: e.target.value || undefined })}
                          style={{
                            width: "100%",
                            padding: "0.5rem 0.75rem",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text)",
                            fontSize: "0.9rem",
                          }}
                        >
                          <option value="">{t("medicines.allDrugFamilies")}</option>
                          {(drugFamiliesList || []).map((df) => (
                            <option key={df.id} value={df.id}>
                              {direction === "rtl" ? `${df.name_ar} (${df.name_en})` : `${df.name_en} (${df.name_ar})`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Input
                        label={t("medicines.strength")}
                        placeholder="e.g. 500 mg, 875/125 mg"
                        value={medFormData.strength || ""}
                        onChange={(e) => setMedFormData({ ...medFormData, strength: e.target.value })}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-text)" }}>
                          {t("medicines.dosageCategory")}
                        </label>
                        <select
                          value={selectedDosageCategory}
                          onChange={(e) => {
                            setSelectedDosageCategory(e.target.value);
                            if (e.target.value) {
                              const curDf = dosageFormsList?.find((df) => df.id === medFormData.dosage_form_id);
                              if (curDf && curDf.category !== e.target.value) {
                                setMedFormData((prev) => ({ ...prev, dosage_form_id: undefined }));
                              }
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "0.5rem 0.75rem",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text)",
                            fontSize: "0.9rem",
                          }}
                        >
                          <option value="">{direction === "rtl" ? "جميع فئات الأشكال الصيدلانية" : "All Dosage Categories"}</option>
                          {uniqueDosageCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-text)" }}>
                          {t("medicines.dosageSubtype")} / {t("medicines.dosageForm")}
                        </label>
                        <select
                          value={medFormData.dosage_form_id || ""}
                          onChange={(e) => {
                            const val = e.target.value || undefined;
                            const chosen = dosageFormsList?.find((df) => df.id === val);
                            setMedFormData((prev) => ({
                              ...prev,
                              dosage_form_id: val,
                              form: chosen?.subtype || chosen?.name_en || prev.form,
                            }));
                            if (chosen?.category && !selectedDosageCategory) {
                              setSelectedDosageCategory(chosen.category);
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "0.5rem 0.75rem",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text)",
                            fontSize: "0.9rem",
                          }}
                        >
                          <option value="">{t("medicines.allDosageForms")}</option>
                          {(filteredDosageForms || []).map((df) => (
                            <option key={df.id} value={df.id}>
                              {direction === "rtl" ? `${df.name_ar} (${df.name_en})` : `${df.name_en} (${df.name_ar})`}
                              {df.subtype ? ` [${df.subtype}]` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                  {/* Multi-Active Ingredients Builder */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--color-text)" }}>
                        {t("medicines.activeIngredients")}
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddActiveIngredientRow}
                        leftIcon={<Plus size={14} />}
                      >
                        {t("medicines.addIngredient")}
                      </Button>
                    </div>

                    {(!medFormData.active_ingredients || medFormData.active_ingredients.length === 0) ? (
                      <div
                        style={{
                          padding: "1rem",
                          border: "1px dashed var(--color-border)",
                          borderRadius: "var(--radius-md)",
                          textAlign: "center",
                          color: "var(--color-text-muted)",
                          fontSize: "0.85rem",
                        }}
                      >
                        {t("medicines.noIngredients")}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {medFormData.active_ingredients.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "2fr 1fr 1fr 1.5fr auto",
                              gap: "0.5rem",
                              alignItems: "center",
                              background: "var(--color-surface-subtle, rgba(0,0,0,0.02))",
                              padding: "0.5rem",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--color-border-subtle)",
                            }}
                          >
                            <select
                              value={item.active_ingredient_id}
                              onChange={(e) => handleUpdateActiveIngredientRow(idx, "active_ingredient_id", e.target.value)}
                              style={{
                                width: "100%",
                                padding: "0.4rem 0.5rem",
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--color-border)",
                                background: "var(--color-surface)",
                                color: "var(--color-text)",
                                fontSize: "0.85rem",
                              }}
                            >
                              {(activeIngredientsList || []).map((ai) => (
                                <option key={ai.id} value={ai.id}>
                                  {ai.name_en} {ai.name_ar ? `(${ai.name_ar})` : ""}
                                </option>
                              ))}
                            </select>

                            <Input
                              type="number"
                              step="any"
                              placeholder="500"
                              value={item.strength_value ?? ""}
                              onChange={(e) =>
                                handleUpdateActiveIngredientRow(
                                  idx,
                                  "strength_value",
                                  e.target.value === "" ? null : parseFloat(e.target.value)
                                )
                              }
                            />

                            <Input
                              placeholder="mg"
                              value={item.strength_unit || "mg"}
                              onChange={(e) => handleUpdateActiveIngredientRow(idx, "strength_unit", e.target.value)}
                            />

                            <Input
                              placeholder="Display (e.g. 500 mg)"
                              value={item.display_strength || ""}
                              onChange={(e) => handleUpdateActiveIngredientRow(idx, "display_strength", e.target.value)}
                            />

                            <button
                              type="button"
                              onClick={() => handleRemoveActiveIngredientRow(idx)}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "var(--color-danger, #ef4444)",
                                cursor: "pointer",
                                padding: "0.25rem",
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Controlled / Schedule Medicine Classification */}
                    <div
                      style={{
                        padding: "1rem",
                        borderRadius: "var(--radius-md)",
                        background: medFormData.is_controlled ? "rgba(239, 68, 68, 0.05)" : "var(--color-surface-subtle)",
                        border: medFormData.is_controlled ? "1.5px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--color-border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                        marginTop: "0.5rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <ShieldAlert size={18} color={medFormData.is_controlled ? "var(--color-danger, #ef4444)" : "var(--color-text-muted)"} />
                          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: medFormData.is_controlled ? "var(--color-danger, #ef4444)" : "var(--color-text)" }}>
                            {t("medicines.controlledClassification")}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                            <input
                              type="radio"
                              name="is_controlled_radio"
                              checked={!medFormData.is_controlled}
                              onChange={() => {
                                setMedFormData((prev) => ({
                                  ...prev,
                                  is_controlled: false,
                                  controlled_schedule: "",
                                }));
                              }}
                            />
                            {t("medicines.ordinaryMedicine")}
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, color: "var(--color-danger, #dc2626)" }}>
                            <input
                              type="radio"
                              name="is_controlled_radio"
                              checked={!!medFormData.is_controlled}
                              onChange={() => {
                                setMedFormData((prev) => ({
                                  ...prev,
                                  is_controlled: true,
                                  controlled_schedule: prev.controlled_schedule || "schedule_2",
                                  requires_prescription: true,
                                }));
                              }}
                            />
                            {t("medicines.controlledMedicine")}
                          </label>
                        </div>
                      </div>

                      {medFormData.is_controlled && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", paddingTop: "0.5rem", borderTop: "1px dashed rgba(239,68,68,0.2)" }}>
                          <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.25rem", color: "var(--color-danger, #dc2626)" }}>
                              {t("medicines.controlledSchedule")} *
                            </label>
                            <select
                              value={medFormData.controlled_schedule || "schedule_2"}
                              onChange={(e) => setMedFormData((prev) => ({ ...prev, controlled_schedule: e.target.value }))}
                              style={{
                                width: "100%",
                                padding: "0.5rem 0.75rem",
                                borderRadius: "var(--radius-md)",
                                border: "1.5px solid rgba(239, 68, 68, 0.4)",
                                background: "var(--color-surface)",
                                color: "var(--color-text)",
                                fontSize: "0.9rem",
                                fontWeight: 600,
                              }}
                            >
                              <option value="schedule_1">{t("medicines.schedules.schedule_1")}</option>
                              <option value="schedule_2">{t("medicines.schedules.schedule_2")}</option>
                              <option value="schedule_3">{t("medicines.schedules.schedule_3")}</option>
                              <option value="unscheduled_controlled">{t("medicines.schedules.unscheduled_controlled")}</option>
                            </select>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}>
                            {direction === "rtl"
                              ? "الأدوية المراقبة تتطلب تسجيل بيانات المشتري (الاسم، الرقم القومي، الهاتف) وتفاصيل الروشتة (اسم الطبيب والترخيص) عند الصرف."
                              : "Controlled medicines require capturing purchaser identification (Name, ID, Phone) and prescription reference upon POS dispensing."}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Tab 3: Packaging & Multi-Unit Pricing */}
              {formActiveTab === "packaging" && (() => {
                const isAr = direction === "rtl";
                const S = Math.max(1, Math.floor(Number(pkg.stripsPerBox) || 1));
                const U_strip = Math.max(1, Math.floor(Number(pkg.unitsPerStrip) || 1));
                const U_box = Math.max(1, Math.floor(Number(pkg.unitsPerBox) || 1));
                const boxSelling = Number(medFormData.selling_price) || Number(pkg.boxSellingPrice) || 0;
                const boxCost = Number(medFormData.purchase_price) || Number(pkg.boxCostPrice) || 0;
                const contextBaseLabel = getContextualUnitDisplay("unit", medFormData.form, isAr);

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    {/* Information Banner */}
                    <div
                      style={{
                        padding: "0.85rem 1.15rem",
                        borderRadius: "var(--radius-lg)",
                        background: "linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(37,99,235,0.03) 100%)",
                        border: "1px solid rgba(37,99,235,0.2)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      <Boxes size={22} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                      <div style={{ fontSize: "0.835rem", color: "var(--color-text)", lineHeight: 1.5 }}>
                        {isAr ? (
                          <>
                            <strong>نظام التعبئة والتسعير المتعدد:</strong> يتم احتساب أسعار الوحدات (الأشرطة والأقراص) تلقائياً من سعر العلبة الرئيسي وفق معاملات التحويل. يمكنك تعديل أي سعر يدوياً مع حفظ السعر المخصص.
                          </>
                        ) : (
                          <>
                            <strong>Multi-Unit Packaging & Pricing:</strong> Selling and cost prices for lower units (Strips & Tablets) are calculated automatically from the Box price based on conversion factors. You can customize any price manually.
                          </>
                        )}
                      </div>
                    </div>

                    {/* SECTION A: Packaging Configuration */}
                    <div
                      style={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-lg)",
                        padding: "1.25rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "0.95rem" }}>
                          <Layers size={18} color="var(--color-primary)" />
                          <span>{isAr ? "أ. تكوين مستويات التعبئة" : "A. Packaging Configuration"}</span>
                        </div>

                        {/* Template Selector */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
                            {isAr ? "نمط التعبئة:" : "Hierarchy Preset:"}
                          </label>
                          <select
                            value={pkg.template}
                            onChange={(e) => {
                              const newTmpl = e.target.value as HierarchyTemplate;
                              const newUnits = generateHierarchyUnits(
                                newTmpl,
                                pkg.stripsPerBox,
                                pkg.unitsPerStrip,
                                pkg.unitsPerBox,
                                boxSelling,
                                boxCost,
                                pkg.units,
                                medFormData.form
                              );
                              setPkg((prev) => ({
                                ...prev,
                                template: newTmpl,
                                units: newUnits,
                              }));
                            }}
                            style={{
                              padding: "0.4rem 0.65rem",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--color-border)",
                              background: "var(--color-surface)",
                              color: "var(--color-text)",
                              fontSize: "0.85rem",
                              fontWeight: 600,
                            }}
                          >
                            <option value="box_strip_unit">
                              {isAr ? "شريط ⟵ علبة ⟵ قرص (3 مستويات للأقراص والكبسولات)" : "Strip → Box → Unit (3-Level Solid Oral)"}
                            </option>
                            <option value="box_unit">
                              {isAr ? "علبة ⟵ وحدة (مستويان للأمبولات والحقن والأكياس)" : "Box → Unit (2-Level Ampoules/Sachets)"}
                            </option>
                            <option value="single_unit">
                              {isAr ? "عبوة مفردة / وحدة واحدة (للشراب والمراهم والقطرات)" : "Single Unit (1-Level Syrups/Creams)"}
                            </option>
                          </select>
                        </div>
                      </div>

                      {/* Quantity Inputs Grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: pkg.template === "box_strip_unit" ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr",
                          gap: "0.75rem",
                          alignItems: "end",
                        }}
                      >
                        {pkg.template === "box_strip_unit" && (
                          <>
                            <Input
                              label={isAr ? "عدد الأشرطة في العلبة *" : "Strips per Box *"}
                              type="number"
                              min="1"
                              step="1"
                              value={pkg.stripsPerBox}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 1;
                                const isMed = medFormData.product_type !== "general";
                                const isStrip = isMed && pkg.template === "box_strip_unit";
                                const currentStripSell = isStrip ? Number(medFormData.selling_price) : (pkg.stripSellingPrice || round2(boxSelling / val));
                                const currentStripCost = isStrip ? Number(medFormData.purchase_price) : (pkg.stripCostPrice || round2(boxCost / val));
                                const currentBoxSell = isStrip ? round2(currentStripSell * val) : boxSelling;
                                const currentBoxCost = isStrip ? round2(currentStripCost * val) : boxCost;

                                const newUnits = generateHierarchyUnits(
                                  pkg.template,
                                  val,
                                  pkg.unitsPerStrip,
                                  pkg.unitsPerBox,
                                  currentBoxSell,
                                  currentBoxCost,
                                  pkg.units,
                                  medFormData.form,
                                  isStrip ? currentStripSell : undefined,
                                  isStrip ? currentStripCost : undefined
                                );
                                setPkg((prev) => ({
                                  ...prev,
                                  stripsPerBox: val,
                                  boxSellingPrice: currentBoxSell,
                                  boxCostPrice: currentBoxCost,
                                  stripSellingPrice: currentStripSell,
                                  stripCostPrice: currentStripCost,
                                  units: newUnits,
                                }));
                              }}
                            />
                            <Input
                              label={isAr ? "عدد الأقراص في الشريط *" : "Units inside one Strip *"}
                              type="number"
                              min="1"
                              step="1"
                              value={pkg.unitsPerStrip}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 1;
                                const isMed = medFormData.product_type !== "general";
                                const isStrip = isMed && pkg.template === "box_strip_unit";
                                const currentStripSell = isStrip ? Number(medFormData.selling_price) : (pkg.stripSellingPrice || round2(boxSelling / Math.max(1, pkg.stripsPerBox)));
                                const currentStripCost = isStrip ? Number(medFormData.purchase_price) : (pkg.stripCostPrice || round2(boxCost / Math.max(1, pkg.stripsPerBox)));
                                const currentBoxSell = isStrip ? round2(currentStripSell * Math.max(1, pkg.stripsPerBox)) : boxSelling;
                                const currentBoxCost = isStrip ? round2(currentStripCost * Math.max(1, pkg.stripsPerBox)) : boxCost;

                                const newUnits = generateHierarchyUnits(
                                  pkg.template,
                                  pkg.stripsPerBox,
                                  val,
                                  pkg.unitsPerBox,
                                  currentBoxSell,
                                  currentBoxCost,
                                  pkg.units,
                                  medFormData.form,
                                  isStrip ? currentStripSell : undefined,
                                  isStrip ? currentStripCost : undefined
                                );
                                setPkg((prev) => ({ ...prev, unitsPerStrip: val, units: newUnits }));
                              }}
                            />
                          </>
                        )}

                        {pkg.template === "box_unit" && (
                          <Input
                            label={isAr ? "عدد الوحدات داخل العلبة *" : "Units inside one Box *"}
                            type="number"
                            min="1"
                            step="1"
                            value={pkg.unitsPerBox}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 1;
                              const newUnits = generateHierarchyUnits(
                                pkg.template,
                                pkg.stripsPerBox,
                                pkg.unitsPerStrip,
                                val,
                                boxSelling,
                                boxCost,
                                pkg.units,
                                medFormData.form
                              );
                              setPkg((prev) => ({ ...prev, unitsPerBox: val, units: newUnits }));
                            }}
                          />
                        )}

                        {(() => {
                          const isMed = medFormData.product_type !== "general";
                          const isStripPrimary = isMed && pkg.template === "box_strip_unit";
                          const priceLabel = isAr
                            ? (isStripPrimary ? "الشريط" : "العلبة")
                            : (isStripPrimary ? "Strip" : "Box");

                          return (
                            <>
                              <Input
                                label={isAr ? `سعر بيع ${priceLabel} (EGP) *` : `${priceLabel} Selling Price (EGP) *`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={medFormData.selling_price || ""}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setMedFormData((prev) => ({ ...prev, selling_price: val }));
                                  const S = Math.max(1, pkg.stripsPerBox);
                                  const newStripPrice = isStripPrimary ? val : (val > 0 && S > 0 ? Math.round((val / S) * 100) / 100 : 0);
                                  const newBoxPrice = isStripPrimary ? Math.round(val * S * 100) / 100 : val;
                                  const newUnits = generateHierarchyUnits(
                                    pkg.template,
                                    pkg.stripsPerBox,
                                    pkg.unitsPerStrip,
                                    pkg.unitsPerBox,
                                    newBoxPrice,
                                    boxCost,
                                    pkg.units,
                                    medFormData.form,
                                    isStripPrimary ? newStripPrice : undefined,
                                    isStripPrimary ? pkg.stripCostPrice : undefined
                                  );
                                  setPkg((prev) => ({
                                    ...prev,
                                    stripSellingPrice: newStripPrice,
                                    boxSellingPrice: newBoxPrice,
                                    units: newUnits,
                                  }));
                                }}
                              />

                              <Input
                                label={isAr ? `سعر شراء ${priceLabel} (EGP)` : `${priceLabel} Cost Price (EGP)`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={medFormData.purchase_price || ""}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setMedFormData((prev) => ({ ...prev, purchase_price: val }));
                                  const S = Math.max(1, pkg.stripsPerBox);
                                  const newStripCost = isStripPrimary ? val : (val > 0 && S > 0 ? Math.round((val / S) * 100) / 100 : 0);
                                  const newBoxCost = isStripPrimary ? Math.round(val * S * 100) / 100 : val;
                                  const newUnits = generateHierarchyUnits(
                                    pkg.template,
                                    pkg.stripsPerBox,
                                    pkg.unitsPerStrip,
                                    pkg.unitsPerBox,
                                    pkg.boxSellingPrice,
                                    newBoxCost,
                                    pkg.units,
                                    medFormData.form,
                                    isStripPrimary ? pkg.stripSellingPrice : undefined,
                                    isStripPrimary ? newStripCost : undefined
                                  );
                                  setPkg((prev) => ({
                                    ...prev,
                                    stripCostPrice: newStripCost,
                                    boxCostPrice: newBoxCost,
                                    units: newUnits,
                                  }));
                                }}
                              />
                            </>
                          );
                        })()}
                      </div>

                      {/* Generate / Synchronize Hierarchy Button */}
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const isMed = medFormData.product_type !== "general";
                            const isStripPrimary = isMed && pkg.template === "box_strip_unit";
                            const S = Math.max(1, pkg.stripsPerBox);
                            const currentBoxSell = isStripPrimary ? Math.round(Number(medFormData.selling_price) * S * 100) / 100 : boxSelling;
                            const currentBoxCost = isStripPrimary ? Math.round(Number(medFormData.purchase_price) * S * 100) / 100 : boxCost;

                            const freshUnits = generateHierarchyUnits(
                              pkg.template,
                              pkg.stripsPerBox,
                              pkg.unitsPerStrip,
                              pkg.unitsPerBox,
                              currentBoxSell,
                              currentBoxCost,
                              undefined,
                              medFormData.form,
                              isStripPrimary ? Number(medFormData.selling_price) : undefined,
                              isStripPrimary ? Number(medFormData.purchase_price) : undefined
                            );
                            setPkg((prev) => ({ ...prev, units: freshUnits }));
                          }}
                          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                        >
                          <RotateCcw size={15} />
                          <span>{isAr ? "إعادة توليد وتحديث الأسعار المقترحة" : "Generate & Recalculate Suggested Prices"}</span>
                        </Button>
                      </div>
                    </div>

                    {/* SECTION B: Visual Hierarchy Preview */}
                    <div
                      style={{
                        background: "var(--color-surface-subtle)",
                        border: "1px dashed var(--color-primary)",
                        borderRadius: "var(--radius-lg)",
                        padding: "1rem 1.25rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--color-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {isAr ? "ب. معاينة تسلسل التعبئة والتسعير" : "B. Visual Hierarchy & Price Breakdown Preview"}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.95rem" }}>
                        {pkg.template === "box_strip_unit" && (
                          <>
                            <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-md)", border: "1.5px solid var(--color-primary)" }}>
                              <span style={{ fontWeight: 800, color: "var(--color-primary)" }}>💊 1 {isAr ? "شريط (Strip) [الوحدة الرئيسية]" : "Strip (شريط) [Primary Dispensing]"}</span>
                              <span style={{ fontSize: "0.85rem", color: "var(--color-primary)", fontWeight: 800 }}>
                                {pkg.units.find((u) => u.unitType === "strip")?.sellingPrice || pkg.stripSellingPrice || ((medFormData.product_type !== "general" && pkg.template === "box_strip_unit") ? Number(medFormData.selling_price) : (S > 0 ? Math.round((boxSelling / S) * 100) / 100 : 0))} EGP / {isAr ? "شريط" : "strip"}
                              </span>
                            </div>
                            <span style={{ fontWeight: 900, color: "var(--color-text-muted)" }}>{isAr ? "⟵" : "⟶"}</span>
                            <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                              <span style={{ fontWeight: 800, color: "var(--color-text)" }}>📦 1 {isAr ? "علبة (Box) [عبوة مجمعة]" : "Box (علبة) [Full Pack]"}</span>
                              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", fontWeight: 700 }}>
                                {pkg.units.find((u) => u.unitType === "box")?.sellingPrice || pkg.boxSellingPrice || boxSelling} EGP ({S} {isAr ? "أشرطة" : "strips"})
                              </span>
                            </div>
                            <span style={{ fontWeight: 900, color: "var(--color-text-muted)" }}>{isAr ? "⟵" : "⟶"}</span>
                            <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                              <span style={{ fontWeight: 800, color: "var(--color-text)" }}>⚪ 1 {contextBaseLabel} [{isAr ? "وحدة المخزون" : "Base Unit"}]</span>
                              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", fontWeight: 700 }}>
                                {pkg.units.find((u) => u.unitType === "unit")?.sellingPrice || (U_strip > 0 ? Math.round(((pkg.stripSellingPrice || (boxSelling / S)) / U_strip) * 100) / 100 : 0)} EGP / {isAr ? "قرص" : "tab"}
                              </span>
                            </div>
                          </>
                        )}

                        {pkg.template === "box_unit" && (
                          <>
                            <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                              <span style={{ fontWeight: 800, color: "var(--color-text)" }}>📦 1 {isAr ? "علبة (Box)" : "Box (علبة)"}</span>
                              <span style={{ fontSize: "0.8rem", color: "var(--color-primary)", fontWeight: 700 }}>
                                {pkg.units.find((u) => u.unitType === "box")?.sellingPrice || boxSelling} EGP
                              </span>
                            </div>
                            <span style={{ fontWeight: 900, color: "var(--color-text-muted)" }}>{isAr ? "⟵" : "⟶"}</span>
                            <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                              <span style={{ fontWeight: 800, color: "var(--color-text)" }}>⚪ {U_box} {contextBaseLabel}</span>
                              <span style={{ fontSize: "0.8rem", color: "var(--color-primary)", fontWeight: 700 }}>
                                {pkg.units.find((u) => u.unitType === "unit")?.sellingPrice ?? (U_box > 0 ? Math.round((boxSelling / U_box) * 100) / 100 : 0)} EGP / {isAr ? "وحدة" : "unit"}
                              </span>
                            </div>
                          </>
                        )}

                        {pkg.template === "single_unit" && (
                          <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                            <span style={{ fontWeight: 800, color: "var(--color-text)" }}>📦 1 {contextBaseLabel}</span>
                            <span style={{ fontSize: "0.8rem", color: "var(--color-primary)", fontWeight: 700 }}>
                              {boxSelling} EGP ({isAr ? "الوحدة الأساسية للمخزون والبيع" : "Base inventory & sale unit"})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SECTION C: Packaging Units & Pricing Cards */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Package size={18} color="var(--color-primary)" />
                        <span>{isAr ? "ج. وحدات البيع والأسعار المسجلة" : "C. Packaging Units & Pricing"}</span>
                      </div>

                      {pkg.units.map((u, idx) => {
                        const autoSell =
                          u.unitType === "box"
                            ? boxSelling
                            : u.unitType === "strip"
                            ? Math.round((boxSelling / S) * 100) / 100
                            : pkg.template === "box_strip_unit"
                            ? Math.round((boxSelling / (S * U_strip)) * 100) / 100
                            : pkg.template === "box_unit"
                            ? Math.round((boxSelling / U_box) * 100) / 100
                            : boxSelling;

                        const autoCost =
                          u.unitType === "box"
                            ? boxCost
                            : u.unitType === "strip"
                            ? Math.round((boxCost / S) * 100) / 100
                            : pkg.template === "box_strip_unit"
                            ? Math.round((boxCost / (S * U_strip)) * 100) / 100
                            : pkg.template === "box_unit"
                            ? Math.round((boxCost / U_box) * 100) / 100
                            : boxCost;

                        return (
                          <div
                            key={u.unitType + "_" + idx}
                            style={{
                              background: "var(--color-surface)",
                              border: u.isBaseUnit ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                              borderRadius: "var(--radius-lg)",
                              padding: "1rem",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.75rem",
                            }}
                          >
                            {/* Header row */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                {/* Predefined dropdown selector */}
                                <select
                                  value={u.unitType}
                                  onChange={(e) => {
                                    const newType = e.target.value as PredefinedUnitKey;
                                    const def = PREDEFINED_UNITS[newType];
                                    const newUnits = pkg.units.map((unitItem, i) =>
                                      i === idx
                                        ? { ...unitItem, unitType: newType, unitNameEn: def.nameEn, unitNameAr: def.nameAr }
                                        : unitItem
                                    );
                                    setPkg((prev) => ({ ...prev, units: newUnits }));
                                  }}
                                  style={{
                                    fontWeight: 800,
                                    fontSize: "0.95rem",
                                    padding: "0.35rem 0.6rem",
                                    borderRadius: "var(--radius-md)",
                                    border: "1px solid var(--color-border)",
                                    background: "var(--color-surface)",
                                    color: "var(--color-text)",
                                  }}
                                >
                                  <option value="box">{isAr ? "علبة (Box)" : "Box (علبة)"}</option>
                                  <option value="strip">{isAr ? "شريط (Strip)" : "Strip (شريط)"}</option>
                                  <option value="unit">{getContextualUnitDisplay("unit", medFormData.form, isAr)}</option>
                                </select>

                                <Badge variant={u.isBaseUnit ? "success" : "neutral"}>
                                  {u.isBaseUnit
                                    ? isAr ? "الوحدة الأساسية للمخزون (1 وحدة)" : "Base Unit (x1)"
                                    : `${isAr ? "معامل التحويل:" : "Factor:"} x${u.conversionFactor}`}
                                </Badge>

                                {u.isDefaultDispense && (
                                  <Badge variant="info">
                                    {isAr ? "وحدة الصرف الافتراضية" : "Default Dispense"}
                                  </Badge>
                                )}
                              </div>

                              {/* Toggles: Allow Selling & Default Dispense */}
                              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}>
                                  <input
                                    type="checkbox"
                                    checked={u.allowSelling}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      const newUnits = pkg.units.map((unitItem, i) =>
                                        i === idx
                                          ? {
                                              ...unitItem,
                                              allowSelling: checked,
                                              isDefaultDispense: checked ? unitItem.isDefaultDispense : false,
                                            }
                                          : unitItem
                                      );
                                      setPkg((prev) => ({ ...prev, units: newUnits }));
                                    }}
                                  />
                                  <span>{isAr ? "مسموح بالبيع" : "Allow Selling"}</span>
                                </label>

                                {u.allowSelling && (
                                  <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}>
                                    <input
                                      type="radio"
                                      name="default_dispense_unit_radio"
                                      checked={u.isDefaultDispense}
                                      onChange={() => {
                                        const newUnits = pkg.units.map((unitItem, i) => ({
                                          ...unitItem,
                                          isDefaultDispense: i === idx,
                                        }));
                                        setPkg((prev) => ({ ...prev, units: newUnits }));
                                      }}
                                    />
                                    <span>{isAr ? "افتراضي في الكاشير" : "Default at POS"}</span>
                                  </label>
                                )}
                              </div>
                            </div>

                            {/* Inputs row: Selling Price, Cost Price, Barcode */}
                            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.6fr", gap: "0.75rem", alignItems: "end" }}>
                              {/* Selling Price input */}
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                                    {isAr ? "سعر البيع (EGP) *" : "Selling Price (EGP) *"}
                                  </label>
                                  {u.isCustomSellingPrice ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                      <span style={{ fontSize: "0.7rem", color: "var(--color-warning, #d97706)", fontWeight: 700 }}>
                                        {isAr ? "معدل يدوياً" : "Custom"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newUnits = pkg.units.map((unitItem, i) =>
                                            i === idx ? { ...unitItem, sellingPrice: autoSell, isCustomSellingPrice: false } : unitItem
                                          );
                                          setPkg((prev) => ({ ...prev, units: newUnits }));
                                        }}
                                        style={{ fontSize: "0.7rem", border: "none", background: "transparent", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
                                        title={isAr ? "استعادة السعر المحسوب تلقائياً" : "Reset to formula suggested price"}
                                      >
                                        {isAr ? "استعادة" : "Reset"}
                                      </button>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: "0.7rem", color: "var(--color-success, #059669)", fontWeight: 700 }}>
                                      {isAr ? "مقترح تلقائي" : "Suggested"}
                                    </span>
                                  )}
                                </div>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={u.sellingPrice}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const isCustom = Math.abs(val - autoSell) > 0.01;
                                    const newUnits = pkg.units.map((unitItem, i) =>
                                      i === idx ? { ...unitItem, sellingPrice: val, isCustomSellingPrice: isCustom } : unitItem
                                    );
                                    setPkg((prev) => ({ ...prev, units: newUnits }));
                                  }}
                                />
                              </div>

                              {/* Cost Price input */}
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                                  <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                                    {isAr ? "سعر التكلفة (EGP)" : "Cost Price (EGP)"}
                                  </label>
                                  {u.isCustomCostPrice ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                      <span style={{ fontSize: "0.7rem", color: "var(--color-warning, #d97706)", fontWeight: 700 }}>
                                        {isAr ? "معدل يدوياً" : "Custom"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newUnits = pkg.units.map((unitItem, i) =>
                                            i === idx ? { ...unitItem, costPrice: autoCost, isCustomCostPrice: false } : unitItem
                                          );
                                          setPkg((prev) => ({ ...prev, units: newUnits }));
                                        }}
                                        style={{ fontSize: "0.7rem", border: "none", background: "transparent", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
                                      >
                                        {isAr ? "استعادة" : "Reset"}
                                      </button>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: "0.7rem", color: "var(--color-success, #059669)", fontWeight: 700 }}>
                                      {isAr ? "مقترح تلقائي" : "Suggested"}
                                    </span>
                                  )}
                                </div>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={u.costPrice}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const isCustom = Math.abs(val - autoCost) > 0.01;
                                    const newUnits = pkg.units.map((unitItem, i) =>
                                      i === idx ? { ...unitItem, costPrice: val, isCustomCostPrice: isCustom } : unitItem
                                    );
                                    setPkg((prev) => ({ ...prev, units: newUnits }));
                                  }}
                                />
                              </div>

                              {/* Dedicated Barcode input */}
                              <div>
                                <Input
                                  label={isAr ? "الباركود الخاص بهذه الوحدة" : "Dedicated Unit Barcode"}
                                  placeholder={isAr ? "باركود مخصص للوحدة (اختياري)" : "e.g. 622300123456"}
                                  value={u.barcode}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const newUnits = pkg.units.map((unitItem, i) =>
                                      i === idx ? { ...unitItem, barcode: val } : unitItem
                                    );
                                    setPkg((prev) => ({ ...prev, units: newUnits }));
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Extra units for legacy medicines if any */}
                    {pkg.extraUnits && pkg.extraUnits.length > 0 && (
                      <div
                        style={{
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-lg)",
                          padding: "1rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{isAr ? "وحدات إضافية قديمة" : "Additional legacy units"}</div>
                        {pkg.extraUnits.map((u, i) => (
                          <div key={u.id || i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.85rem" }}>
                            <span style={{ fontWeight: 600 }}>{isAr ? u.unit_name_ar : u.unit_name_en}</span>
                            <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>x{Number(u.conversion_factor)} · {Number(u.selling_price)} EGP</span>
                            <button
                              type="button"
                              onClick={() => setPkg((prev) => ({ ...prev, extraUnits: prev.extraUnits.filter((_, idx) => idx !== i) }))}
                              style={{ marginInlineStart: "auto", border: "none", background: "transparent", color: "var(--color-danger, #ef4444)", cursor: "pointer" }}
                              title={t("common.delete")}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Form Navigation & Actions Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-border)", paddingTop: "1rem", marginTop: "0.5rem" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {formActiveTab === "classification" && (
                    <Button variant="outline" type="button" size="sm" onClick={() => setFormActiveTab("basic")}>
                      {t("medicines.tabBasic")}
                    </Button>
                  )}
                  {formActiveTab === "packaging" && (
                    <Button variant="outline" type="button" size="sm" onClick={() => setFormActiveTab("classification")}>
                      {t("medicines.tabClassification")}
                    </Button>
                  )}
                  {formActiveTab === "basic" && (
                    <Button variant="outline" type="button" size="sm" onClick={() => setFormActiveTab("classification")}>
                      {t("medicines.tabClassification")} →
                    </Button>
                  )}
                  {formActiveTab === "classification" && (
                    <Button variant="outline" type="button" size="sm" onClick={() => setFormActiveTab("packaging")}>
                      {t("medicines.tabPackaging")} →
                    </Button>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button variant="outline" type="button" onClick={() => setIsMedicineFormOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button variant="primary" type="submit" isLoading={saveMedicineMutation.isPending}>
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Batch Modal */}
      {isAddBatchOpen && (
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
              maxWidth: "460px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--color-text)" }}>
                {t("medicines.addBatch")}
              </h2>
              <button onClick={() => setIsAddBatchOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addBatchMutation.mutate(batchFormData);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Input
                label={t("medicines.batchNumber")}
                value={batchFormData.batch_number || ""}
                onChange={(e) => setBatchFormData({ ...batchFormData, batch_number: e.target.value })}
                placeholder="e.g. BAT-2027-01"
              />

              <Input
                label={t("medicines.expiryDate") + " *"}
                type="date"
                value={batchFormData.expiry_date}
                onChange={(e) => setBatchFormData({ ...batchFormData, expiry_date: e.target.value })}
                required
              />

              <Input
                label={t("pos.qty") + " *"}
                type="number"
                min="1"
                value={batchFormData.quantity}
                onChange={(e) => setBatchFormData({ ...batchFormData, quantity: parseInt(e.target.value, 10) || 1 })}
                required
              />

              <Input
                label={t("medicines.costPrice") + " (EGP)"}
                type="number"
                step="0.01"
                min="0"
                value={batchFormData.purchase_price}
                onChange={(e) => setBatchFormData({ ...batchFormData, purchase_price: parseFloat(e.target.value) || 0 })}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsAddBatchOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" type="submit" isLoading={addBatchMutation.isPending}>
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Write-Off Modal */}
      {isWriteOffOpen && writeOffBatch && (
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
              maxWidth: "460px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--color-danger)" }}>
                {t("medicines.writeOffTitle")}
              </h2>
              <button onClick={() => setIsWriteOffOpen(false)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("medicines.writeOffDesc")}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                writeOffMutation.mutate(writeOffFormData);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", display: "block", marginBottom: "0.35rem" }}>
                  {t("medicines.writeOffReason")}
                </label>
                <select
                  value={writeOffFormData.reason}
                  onChange={(e) => setWriteOffFormData({ ...writeOffFormData, reason: e.target.value as WriteOffReason })}
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
                  <option value="expiry_write_off">{t("medicines.reasons.expiry_write_off")}</option>
                  <option value="damage_write_off">{t("medicines.reasons.damage_write_off")}</option>
                  <option value="manual_adjustment">{t("medicines.reasons.manual_adjustment")}</option>
                  <option value="stock_take_correction">{t("medicines.reasons.stock_take_correction")}</option>
                </select>
              </div>

              <Input
                label={t("medicines.writeOffQuantity") + ` (Max: ${writeOffBatch.quantity})`}
                type="number"
                min="1"
                max={writeOffBatch.quantity}
                value={writeOffFormData.quantity}
                onChange={(e) => setWriteOffFormData({ ...writeOffFormData, quantity: parseInt(e.target.value, 10) || 1 })}
                required
              />

              <Input
                label={t("medicines.writeOffNotes")}
                value={writeOffFormData.notes || ""}
                onChange={(e) => setWriteOffFormData({ ...writeOffFormData, notes: e.target.value })}
                placeholder="e.g. Water damage during transport"
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <Button variant="outline" type="button" onClick={() => setIsWriteOffOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" type="submit" isLoading={writeOffMutation.isPending}>
                  {t("medicines.writeOff")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && deletingMedicine && (
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
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {t("medicines.deleteMedicine")}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                  {t("medicines.deleteConfirm", { name: deletingMedicine.name })}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                isLoading={deleteMedicineMutation.isPending}
                onClick={() => deleteMedicineMutation.mutate(deletingMedicine.id)}
              >
                {t("medicines.deleteMedicine")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
