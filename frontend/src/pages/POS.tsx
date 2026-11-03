import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Scan,
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  User,
  CreditCard,
  Banknote,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  Printer,
  RotateCcw,
  AlertCircle,
  Pill,
  X,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { medicinesApi } from "../services/api/medicines";
import { salesApi, SaleCreate, SaleOut } from "../services/api/sales";
import { customersApi } from "../services/api/customers";
import { creditApi } from "../services/api/credit";
import { Medicine, Customer, PaymentMethod, MedicinePackageUnit } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";
import { printReceiptDocument } from "../utils/receiptPrinter";
import { formatPackagingBreakdown, getDefaultDispenseUnit } from "../utils/packaging";

interface CartItem {
  cart_item_id: string;
  medicine: Medicine;
  quantity: number;
  unit_price: number;
  selected_unit: MedicinePackageUnit | null;
}

export const POS: React.FC = () => {
  const { t, direction } = useI18n();
  const { user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  // Search & Scanner state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  // Controlled medicines purchaser & prescription state
  const [purchaserName, setPurchaserName] = useState("");
  const [purchaserIdNumber, setPurchaserIdNumber] = useState("");
  const [purchaserPhone, setPurchaserPhone] = useState("");
  const [prescriptionReference, setPrescriptionReference] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorLicense, setDoctorLicense] = useState("");

  // Dialog & Confirmation state
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isCreditConfirmOpen, setIsCreditConfirmOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleOut | null>(null);

  // Customer Credit summary query
  const { data: customerCredit, isLoading: isLoadingCredit } = useQuery({
    queryKey: ["pos", "customerCredit", selectedCustomer?.id],
    queryFn: () => creditApi.getCustomerCredit(selectedCustomer!.id),
    enabled: !!selectedCustomer,
  });

  // Focus scanner input on mount & F2 shortcut
  useEffect(() => {
    searchInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "Escape") {
        if (isCustomerModalOpen) setIsCustomerModalOpen(false);
        if (isClearConfirmOpen) setIsClearConfirmOpen(false);
        if (isCreditConfirmOpen) setIsCreditConfirmOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCustomerModalOpen, isClearConfirmOpen, isCreditConfirmOpen]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Medicine search query
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["pos", "medicines", debouncedQuery],
    queryFn: () => medicinesApi.list({ query: debouncedQuery, limit: 15 }),
    enabled: debouncedQuery.length > 0,
  });

  // Reset highlighted item when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchResults]);

  // Quick Access / Catalog shelf query when no search term is entered
  const { data: quickAccessProducts, isLoading: isLoadingQuickAccess } = useQuery({
    queryKey: ["pos", "quickAccessMedicines"],
    queryFn: () => medicinesApi.list({ limit: 10 }),
    enabled: !debouncedQuery,
  });

  // Customer search query
  const { data: customerList, isLoading: isSearchingCustomers } = useQuery({
    queryKey: ["pos", "customers", customerSearch],
    queryFn: () => customersApi.list({ q: customerSearch, limit: 20 }),
    enabled: isCustomerModalOpen,
  });

  // Add medicine to cart (with unit selection)
  const addToCart = (med: Medicine, qtyToAdd = 1, unitOverride?: MedicinePackageUnit | null) => {
    const defaultUnit =
      unitOverride !== undefined
        ? unitOverride
        : getDefaultDispenseUnit(med.package_units);

    const price = defaultUnit
      ? Number(defaultUnit.selling_price)
      : Number(med.selling_price);

    const cartItemId = `${med.id}_${defaultUnit?.id || "base"}`;

    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.cart_item_id === cartItemId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx].quantity += qtyToAdd;
        return updated;
      }
      return [
        ...prev,
        {
          cart_item_id: cartItemId,
          medicine: med,
          quantity: qtyToAdd,
          unit_price: price,
          selected_unit: defaultUnit || null,
        },
      ];
    });
    setSearchQuery("");
    setDebouncedQuery("");
    searchInputRef.current?.focus();
  };

  // Switch selling unit for a cart line item
  const changeCartItemUnit = (cartItemId: string, newUnitId: string) => {
    setCart((prev) => {
      const currentItem = prev.find((it) => it.cart_item_id === cartItemId);
      if (!currentItem) return prev;

      const newUnit = currentItem.medicine.package_units?.find((u) => u.id === newUnitId) || null;
      const newPrice = newUnit ? Number(newUnit.selling_price) : Number(currentItem.medicine.selling_price);
      const targetCartId = `${currentItem.medicine.id}_${newUnit?.id || "base"}`;

      // If target cart item exists already, merge quantities
      const existingOther = prev.find(
        (it) => it.cart_item_id === targetCartId && it.cart_item_id !== cartItemId
      );

      if (existingOther) {
        return prev
          .filter((it) => it.cart_item_id !== cartItemId)
          .map((it) =>
            it.cart_item_id === targetCartId
              ? { ...it, quantity: it.quantity + currentItem.quantity }
              : it
          );
      }

      return prev.map((it) =>
        it.cart_item_id === cartItemId
          ? {
              ...it,
              cart_item_id: targetCartId,
              selected_unit: newUnit,
              unit_price: newPrice,
            }
          : it
      );
    });
  };

  // Update item quantity in cart
  const updateQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cart_item_id === cartItemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // Direct quantity input change
  const setExactQuantity = (cartItemId: string, qty: number) => {
    if (isNaN(qty) || qty <= 0) return;
    setCart((prev) =>
      prev.map((item) =>
        item.cart_item_id === cartItemId ? { ...item, quantity: qty } : item
      )
    );
  };

  // Remove single line item
  const removeFromCart = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cart_item_id !== cartItemId));
  };

  // Keyboard navigation for search input
  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (searchResults && searchResults.length > 0) {
        setHighlightedIndex((prev) => Math.min(searchResults.length - 1, prev + 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (searchResults && searchResults.length > 0) {
        setHighlightedIndex((prev) => Math.max(0, prev - 1));
      }
    }
  };

  // Barcode / Text Search Form Submit
  const handleBarcodeOrSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    try {
      const scanRes = await medicinesApi.scanBarcode(query);
      if (scanRes && scanRes.medicine) {
        addToCart(scanRes.medicine, 1, scanRes.matched_unit);
        success(t("pos.itemAdded", { medicine: scanRes.medicine.name }));
        return;
      }
    } catch {
      // Not a direct barcode match, proceed with normal search results list
    }

    if (searchResults && searchResults.length > 0) {
      const targetMed = searchResults[highlightedIndex] || searchResults[0];
      addToCart(targetMed);
      success(t("pos.itemAdded", { medicine: targetMed.name }));
      return;
    }

    // Instant fallback for rapid scanner input or pressing Enter before debounce fires
    try {
      const instantResults = await medicinesApi.list({ query, limit: 15 });
      if (instantResults && instantResults.length > 0) {
        addToCart(instantResults[0]);
        success(t("pos.itemAdded", { medicine: instantResults[0].name }));
      } else {
        error(t("pos.noMedicineFound", { query }));
      }
    } catch {
      error(t("pos.noMedicineFound", { query }));
    }
  };

  // Clear entire cart
  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setSelectedCustomer(null);
    setPurchaserName("");
    setPurchaserIdNumber("");
    setPurchaserPhone("");
    setPrescriptionReference("");
    setDoctorName("");
    setDoctorLicense("");
    setIsClearConfirmOpen(false);
  };

  // Calculations
  const subtotal = cart.reduce(
    (acc, item) => acc + item.quantity * item.unit_price,
    0
  );
  const safeDiscount = Math.max(0, Math.min(discount, subtotal));
  const totalDue = Math.max(0, subtotal - safeDiscount);
  const isDiscountValid = discount >= 0 && discount <= subtotal;
  const controlledItems = cart.filter((item) => item.medicine.is_controlled);
  const hasControlledItems = controlledItems.length > 0;
  const hasSchedule1 = controlledItems.some((item) => item.medicine.controlled_schedule === "schedule_1");
  const hasSchedule2 = controlledItems.some((item) => item.medicine.controlled_schedule === "schedule_2");
  const hasSchedule3 = controlledItems.some((item) => item.medicine.controlled_schedule === "schedule_3");
  const activeScheduleLabel = hasSchedule1
    ? (direction === "rtl" ? "جدول أول (مخدرات شديدة الرقابة - قرار 44/2026)" : "Schedule 1 (Strict Narcotics - Decree 44/2026)")
    : hasSchedule2
    ? (direction === "rtl" ? "جدول ثانٍ (مؤثرات عقلية ونفسية)" : "Schedule 2 (Psychotropic Substances)")
    : hasSchedule3
    ? (direction === "rtl" ? "جدول ثالث (أدوية مراقبة بروشتة)" : "Schedule 3 (Restricted Rx Medicines)")
    : (direction === "rtl" ? "أدوية مراقبة غير مجدولة" : "Unscheduled Controlled");

  // Schedule compliance check: returns true if compliant, blocks checkout with toast if not
  const validateControlledCompliance = (): boolean => {
    if (!hasControlledItems) return true;

    const hasPurchaserName = !!purchaserName.trim() || !!selectedCustomer?.name;
    const hasPurchaserId = !!purchaserIdNumber.trim();
    const hasRx = !!prescriptionReference.trim();
    const hasDoc = !!doctorName.trim();

    if (hasSchedule1) {
      if (!hasPurchaserName) {
        error(
          direction === "rtl"
            ? "أدوية جدول أول: اسم المشتري إلزامي قانوناً (القرار الوزاري 44 لسنة 2026)"
            : "Schedule 1: Purchaser Name is legally mandatory (Decree 44/2026)"
        );
        return false;
      }
      if (!hasPurchaserId) {
        error(
          direction === "rtl"
            ? "أدوية جدول أول: الرقم القومي للمشتري إلزامي قانوناً لصرف المواد المخدرة"
            : "Schedule 1: Purchaser National ID is legally mandatory"
        );
        return false;
      }
      if (!hasRx) {
        error(
          direction === "rtl"
            ? "أدوية جدول أول: رقم الروشتة/الإذن الطبي إلزامي قانوناً"
            : "Schedule 1: Prescription reference number is mandatory"
        );
        return false;
      }
      if (!hasDoc) {
        error(
          direction === "rtl"
            ? "أدوية جدول أول: اسم الطبيب المعالج والترخيص إلزامي قانوناً"
            : "Schedule 1: Prescribing doctor name is mandatory"
        );
        return false;
      }
      return true;
    }

    if (hasSchedule2) {
      if (!hasPurchaserName) {
        error(
          direction === "rtl"
            ? "أدوية جدول ثانٍ: اسم المشتري إلزامي للتسجيل بسجل الأدوية المراقبة"
            : "Schedule 2: Purchaser Name is mandatory for controlled register"
        );
        return false;
      }
      if (!hasPurchaserId) {
        error(
          direction === "rtl"
            ? "أدوية جدول ثانٍ: الرقم القومي للمشتري إلزامي قانوناً"
            : "Schedule 2: Purchaser National ID is mandatory"
        );
        return false;
      }
      if (!hasRx) {
        error(
          direction === "rtl"
            ? "أدوية جدول ثانٍ: رقم الروشتة إلزامي للصرف"
            : "Schedule 2: Prescription reference number is mandatory"
        );
        return false;
      }
      return true;
    }

    if (hasSchedule3) {
      if (!hasPurchaserName) {
        error(
          direction === "rtl"
            ? "أدوية جدول ثالث: اسم المشتري أو اختيار عميل مسجل إلزامي"
            : "Schedule 3: Purchaser Name or registered customer is required"
        );
        return false;
      }
      if (!hasRx) {
        error(
          direction === "rtl"
            ? "أدوية جدول ثالث: رقم الروشتة إلزامي للصرف"
            : "Schedule 3: Prescription reference number is mandatory"
        );
        return false;
      }
      return true;
    }

    // Unscheduled controlled tier
    if (hasControlledItems && !hasPurchaserName) {
      error(
        direction === "rtl"
          ? "أدوية مراقبة: يلزم تسجيل اسم المشتري الفعلي أو اختيار عميل مسجل"
          : "Controlled Items: Purchaser Name or registered customer is required"
      );
      return false;
    }

    return true;
  };

  // Complete Sale Mutation
  const saleMutation = useMutation({
    mutationFn: (payload: SaleCreate) => salesApi.create(payload),
    onSuccess: (data) => {
      setCompletedSale(data);
      setCart([]);
      setDiscount(0);
      setPurchaserName("");
      setPurchaserIdNumber("");
      setPurchaserPhone("");
      setPrescriptionReference("");
      setDoctorName("");
      setDoctorLicense("");
      const customerId = selectedCustomer?.id;
      setSelectedCustomer(null);
      success(t("pos.saleSuccess"));
      // Invalidate relevant caches
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ["pos", "customerCredit", customerId] });
      }
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: any) => {
      const errMsg = err?.message || t("common.somethingWentWrong");
      error(errMsg);
    },
  });

  const executeSale = () => {
    const payload: SaleCreate = {
      customer_id: selectedCustomer ? selectedCustomer.id : null,
      payment_method: paymentMethod,
      discount: safeDiscount,
      items: cart.map((item) => ({
        medicine_id: item.medicine.id,
        quantity: item.quantity,
        package_unit_id: item.selected_unit?.id || null,
      })),
      purchaser_name: purchaserName.trim() || undefined,
      purchaser_id_number: purchaserIdNumber.trim() || undefined,
      purchaser_phone: purchaserPhone.trim() || undefined,
      prescription_reference: prescriptionReference.trim() || undefined,
      doctor_name: doctorName.trim() || undefined,
      doctor_license: doctorLicense.trim() || undefined,
    };
    saleMutation.mutate(payload);
  };

  const handleCompleteSale = () => {
    if (cart.length === 0 || !isDiscountValid || saleMutation.isPending) return;

    if (!validateControlledCompliance()) {
      return;
    }

    if (paymentMethod === "credit") {
      if (!selectedCustomer) {
        error(t("pos.customerRequiredForCredit"));
        return;
      }
      setIsCreditConfirmOpen(true);
      return;
    }

    executeSale();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        minHeight: "calc(100vh - var(--header-height) - 4rem)",
      }}
    >
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
            <ShoppingCart size={28} color="var(--color-primary)" />
            {t("pos.title")}
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-muted)",
              marginTop: "0.15rem",
            }}
          >
            {t("pos.subtitle")}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Clear Cart Button */}
          {cart.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClearConfirmOpen(true)}
              leftIcon={<RotateCcw size={15} />}
            >
              {t("pos.clearCart")}
            </Button>
          )}

          {/* Shortcut tags */}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              fontSize: "0.75rem",
              color: "var(--color-text-muted)",
            }}
          >
            <span
              style={{
                padding: "0.25rem 0.5rem",
                background: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border-subtle)",
                fontWeight: 600,
              }}
            >
              {t("pos.shortcuts.focus")}
            </span>
          </div>
        </div>
      </div>

      {/* Main Workstation Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 420px",
          gap: "1.25rem",
          alignItems: "start",
        }}
        className="pos-grid"
      >
        {/* Left Column: Scanner & Search */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Card style={{ padding: "1.25rem" }}>
            <form onSubmit={handleBarcodeOrSearchSubmit}>
              <div style={{ position: "relative" }}>
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchInputKeyDown}
                  placeholder={t("pos.scannerPlaceholder")}
                  leftIcon={<Scan size={20} color="var(--color-secondary)" />}
                  style={{
                    fontSize: "1.05rem",
                    height: "48px",
                    fontWeight: 500,
                  }}
                  autoComplete="off"
                />
              </div>
            </form>

            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--color-text-muted)",
                marginTop: "0.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <Search size={13} />
              {t("pos.scanOrSearchHint")}
            </div>
          </Card>

          {/* Search Results List */}
          {debouncedQuery ? (
            <Card style={{ padding: "1.25rem" }}>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  marginBottom: "0.75rem",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>
                  {t("pos.searchResults", { count: searchResults?.length || 0 })}
                </span>
                {isSearching && (
                  <span style={{ fontSize: "0.8rem", color: "var(--color-secondary)" }}>
                    {t("common.loading")}
                  </span>
                )}
              </div>

              {isSearching ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <Skeleton height="60px" />
                  <Skeleton height="60px" />
                  <Skeleton height="60px" />
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.625rem",
                    maxHeight: "440px",
                    overflowY: "auto",
                  }}
                >
                  {searchResults.map((med, idx) => {
                    const stock = (med as any).total_stock ?? 0;
                    const isOutOfStock = stock <= 0;
                    const isLowStock = stock > 0 && stock <= med.minimum_stock;
                    const isHighlighted = idx === highlightedIndex;

                    return (
                      <div
                        key={med.id}
                        onClick={() => addToCart(med)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        style={{
                          padding: "0.875rem 1rem",
                          background: isHighlighted ? "var(--color-primary-light)" : "var(--color-surface-subtle)",
                          borderRadius: "var(--radius-md)",
                          border: isHighlighted
                            ? "2px solid var(--color-primary)"
                            : "1px solid var(--color-border-subtle)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          cursor: "pointer",
                          transition: "all var(--transition-fast)",
                          boxShadow: isHighlighted ? "0 2px 8px rgba(37, 99, 235, 0.12)" : "none",
                        }}
                      >
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "var(--radius-md)",
                              background: isHighlighted ? "var(--color-primary)" : "var(--color-primary-light)",
                              color: isHighlighted ? "#ffffff" : "var(--color-primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Pill size={20} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-text)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span>{direction === "rtl" && med.name_ar ? med.name_ar : med.name}</span>
                              {direction === "rtl" && med.name_ar && med.name && (
                                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                                  ({med.name})
                                </span>
                              )}
                              {direction !== "rtl" && med.name_ar && (
                                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                                  ({med.name_ar})
                                </span>
                              )}
                              {isHighlighted && (
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    padding: "0.1rem 0.35rem",
                                    borderRadius: "4px",
                                    background: "var(--color-primary)",
                                    color: "#ffffff",
                                    fontWeight: 700,
                                  }}
                                >
                                  Enter ↵
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--color-text-muted)",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.5rem",
                                marginTop: "0.2rem",
                              }}
                            >
                              {med.strength && (
                                <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{med.strength}</span>
                              )}
                              {med.dosage_form && (
                                <span>{direction === "rtl" ? med.dosage_form.name_ar : med.dosage_form.name_en}</span>
                              )}
                              {med.generic_name && (
                                <span>{t("pos.genericName", { name: med.generic_name })}</span>
                              )}
                              {med.barcode && (
                                <span>{t("pos.barcodeLabel", { code: med.barcode })}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                          <div style={{ textAlign: "end" }}>
                            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-primary)" }}>
                              {t("pos.unitPrice", { price: Number(med.selling_price).toFixed(2) })}
                            </div>
                            <div style={{ marginTop: "0.2rem" }}>
                              {isOutOfStock ? (
                                <Badge variant="danger">{t("pos.outOfStock")}</Badge>
                              ) : isLowStock ? (
                                <Badge variant="warning">
                                  {formatPackagingBreakdown(stock, med.package_units, direction === "rtl", med.base_unit_name)}
                                </Badge>
                              ) : (
                                <Badge variant="success">
                                  {formatPackagingBreakdown(stock, med.package_units, direction === "rtl", med.base_unit_name)}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <Button size="sm" variant={isHighlighted ? "primary" : "secondary"} leftIcon={<Plus size={16} />}>
                            {t("common.save")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                    fontSize: "0.9rem",
                  }}
                >
                  {t("pos.noMedicineFound", { query: debouncedQuery })}
                </div>
              )}
            </Card>
          ) : (
            /* Quick Access / Shelf View when search query is empty */
            <Card style={{ padding: "1.25rem" }}>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  marginBottom: "0.75rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  ⚡ {direction === "rtl" ? "الوصول السريع للمنتجات المتوفرة" : "Quick Access Available Products"}
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  {quickAccessProducts?.length || 0} {direction === "rtl" ? "منتج" : "items"}
                </span>
              </div>

              {isLoadingQuickAccess ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <Skeleton height="56px" />
                  <Skeleton height="56px" />
                  <Skeleton height="56px" />
                </div>
              ) : quickAccessProducts && quickAccessProducts.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "0.75rem",
                    maxHeight: "440px",
                    overflowY: "auto",
                  }}
                >
                  {quickAccessProducts.map((med) => {
                    const stock = (med as any).total_stock ?? 0;
                    return (
                      <div
                        key={med.id}
                        onClick={() => addToCart(med)}
                        style={{
                          padding: "0.75rem",
                          background: "var(--color-surface-subtle)",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border-subtle)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          cursor: "pointer",
                          transition: "all var(--transition-fast)",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, marginInlineEnd: "0.5rem" }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: "0.875rem",
                              color: "var(--color-text)",
                              wordBreak: "break-word",
                            }}
                          >
                            {direction === "rtl" && med.name_ar ? med.name_ar : med.name}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
                            {formatPackagingBreakdown(stock, med.package_units, direction === "rtl", med.base_unit_name)}
                          </div>
                        </div>

                        <div style={{ textAlign: "end", flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-primary)" }}>
                            {Number(med.selling_price).toFixed(2)} {direction === "rtl" ? "ج.م" : "EGP"}
                          </div>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--color-primary)",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem",
                            }}
                          >
                            <Plus size={12} /> {direction === "rtl" ? "إضافة" : "Add"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Card>
          )}
        </div>

        {/* Right Column: Cart & Checkout Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Card
            style={{
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            {/* Cart Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--color-border-subtle)",
                paddingBottom: "0.75rem",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--color-text)" }}>
                {t("pos.cart")}
              </div>
              <Badge variant="info">
                {t("pos.cartItemsCount", { count: cart.length })}
              </Badge>
            </div>

            {/* Cart Items List */}
            <div
              style={{
                maxHeight: "380px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {cart.length === 0 ? (
                <div
                  style={{
                    padding: "2.5rem 1rem",
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <ShoppingCart size={36} color="var(--color-border)" />
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                    {t("pos.emptyCart")}
                  </div>
                  <div style={{ fontSize: "0.8rem", maxWidth: "260px" }}>
                    {t("pos.emptyCartDesc")}
                  </div>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.cart_item_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem",
                      background: "var(--color-surface-subtle)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border-subtle)",
                      gap: "0.5rem",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "0.875rem",
                          color: "var(--color-text)",
                          wordBreak: "break-word",
                          lineHeight: 1.35,
                        }}
                      >
                        {direction === "rtl" && item.medicine.name_ar ? item.medicine.name_ar : item.medicine.name}
                        {direction === "rtl" && item.medicine.name_ar && item.medicine.name && (
                          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginInlineStart: "0.35rem" }}>
                            ({item.medicine.name})
                          </span>
                        )}
                        {direction !== "rtl" && item.medicine.name_ar && (
                          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginInlineStart: "0.35rem" }}>
                            ({item.medicine.name_ar})
                          </span>
                        )}
                        {item.medicine.is_controlled && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "0.1rem 0.35rem",
                              borderRadius: "var(--radius-sm)",
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "#dc2626",
                              fontWeight: 700,
                              marginInlineStart: "0.4rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "2px",
                            }}
                          >
                            <ShieldAlert size={10} />
                            {direction === "rtl" ? "جدول" : "Controlled"}
                          </span>
                        )}
                      </div>

                      {/* Selling Unit Selector Dropdown & Pricing */}
                      {item.medicine.package_units &&
                      item.medicine.package_units.filter((u) => u.allow_selling !== false && u.is_active !== false).length > 1 ? (
                        <div style={{ marginTop: "0.35rem", display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: "0.725rem",
                              fontWeight: 700,
                              color: "var(--color-primary)",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.2rem",
                            }}
                          >
                            📦 {t("medicines.unitSelectorLabel")}:
                          </span>
                          <select
                            value={item.selected_unit?.id || ""}
                            onChange={(e) => changeCartItemUnit(item.cart_item_id, e.target.value)}
                            aria-label={t("medicines.unitSelectorLabel")}
                            style={{
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              padding: "0.25rem 0.5rem",
                              borderRadius: "var(--radius-sm)",
                              border: "1.5px solid var(--color-primary)",
                              background: "var(--color-primary-light)",
                              color: "var(--color-primary)",
                              cursor: "pointer",
                              outline: "none",
                            }}
                          >
                            {item.medicine.package_units
                              .filter((u) => u.allow_selling !== false && u.is_active !== false)
                              .map((u) => (
                                <option key={u.id || u.unit_name_en} value={u.id || ""}>
                                  {direction === "rtl" ? u.unit_name_ar : u.unit_name_en} (x{Number(u.conversion_factor)}) — {Number(u.selling_price).toFixed(2)} {direction === "rtl" ? "ج.م" : "EGP"}
                                </option>
                              ))}
                          </select>
                        </div>
                      ) : (
                        <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              padding: "0.15rem 0.45rem",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--color-surface)",
                              border: "1px solid var(--color-border)",
                              color: "var(--color-text)",
                            }}
                          >
                            {item.selected_unit
                              ? (direction === "rtl" ? item.selected_unit.unit_name_ar : item.selected_unit.unit_name_en)
                              : (item.medicine.base_unit_name || "Unit")}
                            {" • "}
                            {Number(item.unit_price).toFixed(2)} {direction === "rtl" ? "ج.م" : "EGP"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Quantity Controls */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        background: "var(--color-surface)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border)",
                        padding: "0.15rem",
                      }}
                    >
                      <button
                        onClick={() => updateQuantity(item.cart_item_id, -1)}
                        style={{
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--color-text)",
                        }}
                      >
                        <Minus size={14} />
                      </button>

                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          setExactQuantity(item.cart_item_id, parseInt(e.target.value, 10))
                        }
                        style={{
                          width: "36px",
                          textAlign: "center",
                          border: "none",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          background: "transparent",
                          color: "var(--color-text)",
                          outline: "none",
                        }}
                      />

                      <button
                        onClick={() => updateQuantity(item.cart_item_id, 1)}
                        style={{
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--color-text)",
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {/* Line Total & Remove */}
                    <div style={{ textAlign: "end", minWidth: "65px" }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          color: "var(--color-primary)",
                        }}
                      >
                        {(item.quantity * item.unit_price).toFixed(2)}
                      </div>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.cart_item_id)}
                      title={t("common.delete")}
                      style={{
                        color: "var(--color-danger)",
                        padding: "0.25rem",
                        display: "flex",
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Customer Selector */}
            <div
              style={{
                borderTop: "1px solid var(--color-border-subtle)",
                paddingTop: "0.875rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <User size={15} color="var(--color-secondary)" />
                  {t("pos.customer")}
                </span>

                {selectedCustomer ? (
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-danger)",
                      fontWeight: 600,
                    }}
                  >
                    {t("pos.walkIn")}
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCustomerModalOpen(true)}
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    {t("pos.selectCustomer")}
                  </button>
                )}
              </div>

              <div
                style={{
                  padding: "0.5rem 0.75rem",
                  background: "var(--color-surface-subtle)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.85rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                {selectedCustomer ? (
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
                      {selectedCustomer.name}
                    </span>
                    {selectedCustomer.phone && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-text-muted)",
                          marginInlineStart: "0.5rem",
                        }}
                      >
                        ({selectedCustomer.phone})
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {t("pos.walkIn")}
                  </span>
                )}
              </div>
            </div>

            {/* Controlled Drug Purchaser Attribution Section */}
            {hasControlledItems && (
              <div
                style={{
                  borderTop: "1px solid var(--color-border-subtle)",
                  paddingTop: "0.875rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(239, 68, 68, 0.07)",
                    border: "1.5px solid rgba(239, 68, 68, 0.35)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--color-danger, #dc2626)" }}>
                      <ShieldAlert size={18} />
                      <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                        {t("pos.controlledWarningTitle")}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "0.15rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        background: hasSchedule1 ? "#fee2e2" : hasSchedule2 ? "#fef3c7" : "#e0e7ff",
                        color: hasSchedule1 ? "#991b1b" : hasSchedule2 ? "#92400e" : "#3730a3",
                        border: "1px solid currentColor",
                      }}
                    >
                      {activeScheduleLabel}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.35 }}>
                    {t("pos.controlledWarningDesc")}
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.25rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, marginBottom: "0.15rem", color: "var(--color-text)" }}>
                        {t("pos.purchaserName")} <span style={{ color: "var(--color-danger)" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={purchaserName}
                        onChange={(e) => setPurchaserName(e.target.value)}
                        placeholder={selectedCustomer?.name || (direction === "rtl" ? "اسم المستلم" : "Full Name")}
                        style={{
                          width: "100%",
                          padding: "0.35rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-surface)",
                          color: "var(--color-text)",
                          fontSize: "0.8rem",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, marginBottom: "0.15rem", color: "var(--color-text)" }}>
                        {t("pos.purchaserId")} {(hasSchedule1 || hasSchedule2) && <span style={{ color: "var(--color-danger)" }}>*</span>}
                      </label>
                      <input
                        type="text"
                        value={purchaserIdNumber}
                        onChange={(e) => setPurchaserIdNumber(e.target.value)}
                        placeholder={direction === "rtl" ? "الرقم القومي (14 رقم)" : "National ID"}
                        style={{
                          width: "100%",
                          padding: "0.35rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-surface)",
                          color: "var(--color-text)",
                          fontSize: "0.8rem",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, marginBottom: "0.15rem", color: "var(--color-text)" }}>
                        {t("pos.purchaserPhone")}
                      </label>
                      <input
                        type="text"
                        value={purchaserPhone}
                        onChange={(e) => setPurchaserPhone(e.target.value)}
                        placeholder={selectedCustomer?.phone || "01xxxxxxxxx"}
                        style={{
                          width: "100%",
                          padding: "0.35rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-surface)",
                          color: "var(--color-text)",
                          fontSize: "0.8rem",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, marginBottom: "0.15rem", color: "var(--color-text)" }}>
                        {t("pos.prescriptionRef")} {(hasSchedule1 || hasSchedule2 || hasSchedule3) && <span style={{ color: "var(--color-danger)" }}>*</span>}
                      </label>
                      <input
                        type="text"
                        value={prescriptionReference}
                        onChange={(e) => setPrescriptionReference(e.target.value)}
                        placeholder={direction === "rtl" ? "رقم الروشتة/الإذن" : "Rx #"}
                        style={{
                          width: "100%",
                          padding: "0.35rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-surface)",
                          color: "var(--color-text)",
                          fontSize: "0.8rem",
                        }}
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, marginBottom: "0.15rem", color: "var(--color-text)" }}>
                        {t("pos.doctorName")} {hasSchedule1 && <span style={{ color: "var(--color-danger)" }}>*</span>}
                      </label>
                      <input
                        type="text"
                        value={doctorName}
                        onChange={(e) => setDoctorName(e.target.value)}
                        placeholder={direction === "rtl" ? "اسم الطبيب المعالج والترخيص" : "Doctor Name & License"}
                        style={{
                          width: "100%",
                          padding: "0.35rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-surface)",
                          color: "var(--color-text)",
                          fontSize: "0.8rem",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Method Selector */}
            <div
              style={{
                borderTop: "1px solid var(--color-border-subtle)",
                paddingTop: "0.875rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)" }}>
                {t("pos.paymentMethod")}
              </span>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                {[
                  { key: "cash" as PaymentMethod, label: t("pos.cash"), icon: <Banknote size={16} /> },
                  { key: "card" as PaymentMethod, label: t("pos.card"), icon: <CreditCard size={16} /> },
                  { key: "wallet" as PaymentMethod, label: t("pos.wallet"), icon: <Wallet size={16} /> },
                  { key: "insurance" as PaymentMethod, label: t("pos.insurance"), icon: <ShieldCheck size={16} /> },
                  { key: "credit" as PaymentMethod, label: t("pos.credit"), icon: <FileText size={16} /> },
                ].map((item) => {
                  const isSelected = paymentMethod === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setPaymentMethod(item.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "var(--radius-sm)",
                        border: isSelected
                          ? "2px solid var(--color-primary)"
                          : "1px solid var(--color-border)",
                        background: isSelected
                          ? "var(--color-primary-light)"
                          : "var(--color-surface)",
                        color: isSelected
                          ? "var(--color-primary)"
                          : "var(--color-text)",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        gridColumn: item.key === "credit" ? "span 2" : "auto",
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {/* Customer Credit Information (Shown when Credit is chosen) */}
              {paymentMethod === "credit" && (
                <div>
                  {!selectedCustomer ? (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        padding: "0.75rem",
                        background: "var(--color-warning-light)",
                        color: "var(--color-warning-dark)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.8rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        border: "1px solid var(--color-warning)",
                      }}
                    >
                      <AlertCircle size={16} />
                      <span>{t("pos.customerRequiredForCredit")}</span>
                    </div>
                  ) : isLoadingCredit ? (
                    <div style={{ marginTop: "0.5rem" }}>
                      <Skeleton height="80px" />
                    </div>
                  ) : customerCredit ? (
                    (() => {
                      const currentDebt = Number(customerCredit.outstanding_balance || 0);
                      const projectedDebt = currentDebt + totalDue;
                      const creditLimit = Number(customerCredit.credit_limit || 0);
                      const remainingCredit = Math.max(0, creditLimit - projectedDebt);
                      const isExceeded = projectedDebt > creditLimit;
                      const isInactive = customerCredit.credit_status !== "active";

                      return (
                        <div
                          style={{
                            marginTop: "0.5rem",
                            padding: "0.75rem",
                            background: "var(--color-surface-subtle)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.45rem",
                            fontSize: "0.8rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, color: "var(--color-text)" }}>
                              {t("pos.creditSummary")}
                            </span>
                            <Badge
                              variant={
                                customerCredit.credit_status === "active"
                                  ? "success"
                                  : customerCredit.credit_status === "suspended"
                                  ? "warning"
                                  : "danger"
                              }
                            >
                              {customerCredit.credit_status.toUpperCase()}
                            </Badge>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--color-text-muted)" }}>{t("pos.outstandingDebt")}:</span>
                            <span style={{ fontWeight: 600 }}>{currentDebt.toFixed(2)} {t("common.egp")}</span>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--color-text-muted)" }}>{t("pos.creditLimit")}:</span>
                            <span style={{ fontWeight: 600 }}>{creditLimit.toFixed(2)} {t("common.egp")}</span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              borderTop: "1px dashed var(--color-border-subtle)",
                              paddingTop: "0.35rem",
                            }}
                          >
                            <span style={{ color: "var(--color-text)" }}>{t("pos.projectedDebt")}:</span>
                            <span style={{ fontWeight: 700, color: isExceeded ? "var(--color-danger)" : "var(--color-text)" }}>
                              {projectedDebt.toFixed(2)} {t("common.egp")}
                            </span>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--color-text-muted)" }}>{t("pos.remainingCredit")}:</span>
                            <span style={{ fontWeight: 700, color: "var(--color-secondary)" }}>
                              {remainingCredit.toFixed(2)} {t("common.egp")}
                            </span>
                          </div>

                          {isInactive && (
                            <div style={{ color: "var(--color-danger)", fontWeight: 600, fontSize: "0.75rem" }}>
                              {customerCredit.credit_status === "disabled"
                                ? t("pos.creditDisabled")
                                : t("pos.creditSuspended")}
                            </div>
                          )}

                          {isExceeded && !isInactive && (
                            <div style={{ color: "var(--color-danger)", fontWeight: 600, fontSize: "0.75rem" }}>
                              {t("pos.creditLimitExceeded")}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : null}
                </div>
              )}
            </div>

            {/* Financial Totals */}
            <div
              style={{
                borderTop: "1px solid var(--color-border-subtle)",
                paddingTop: "0.875rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.875rem",
                  color: "var(--color-text-muted)",
                }}
              >
                <span>{t("pos.subtotal")}</span>
                <span>{subtotal.toFixed(2)} {t("common.egp")}</span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.875rem",
                  color: "var(--color-text-muted)",
                }}
              >
                <span>{t("pos.discount")}</span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  value={discount || ""}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0.00"
                  style={{
                    width: "85px",
                    textAlign: "end",
                    padding: "0.25rem 0.5rem",
                    borderRadius: "var(--radius-sm)",
                    border: !isDiscountValid
                      ? "1px solid var(--color-danger)"
                      : "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                />
              </div>

              {!isDiscountValid && (
                <div style={{ fontSize: "0.75rem", color: "var(--color-danger)" }}>
                  {t("pos.discountInvalid")}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: "var(--color-primary)",
                  borderTop: "1px dashed var(--color-border)",
                  paddingTop: "0.625rem",
                  marginTop: "0.25rem",
                }}
              >
                <span>{t("pos.total")}</span>
                <span>{totalDue.toFixed(2)} {t("common.egp")}</span>
              </div>
            </div>

            {/* Complete Sale Action */}
            <Button
              variant="primary"
              size="lg"
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || !isDiscountValid || saleMutation.isPending}
              isLoading={saleMutation.isPending}
              leftIcon={<CheckCircle2 size={20} />}
              style={{ width: "100%", height: "50px", fontSize: "1.05rem" }}
            >
              {saleMutation.isPending ? t("pos.completingSale") : t("pos.completeSale")}
            </Button>
          </Card>
        </div>
      </div>

      {/* Customer Selection Modal */}
      {isCustomerModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
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
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-text)" }}>
                {t("pos.selectCustomer")}
              </h3>
              <button
                onClick={() => setIsCustomerModalOpen(false)}
                style={{ color: "var(--color-text-muted)" }}
              >
                <X size={20} />
              </button>
            </div>

            <Input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder={t("pos.searchCustomerPlaceholder")}
              leftIcon={<Search size={18} />}
              autoFocus
            />

            <div
              style={{
                maxHeight: "260px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {isSearchingCustomers ? (
                <Skeleton height="50px" />
              ) : customerList && customerList.length > 0 ? (
                customerList.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                      setIsCustomerModalOpen(false);
                      setCustomerSearch("");
                    }}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--radius-md)",
                      background: "var(--color-surface-subtle)",
                      border: "1px solid var(--color-border-subtle)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--color-text)" }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                        {c.phone || "No phone"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      {t("common.save")}
                    </Button>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--color-text-muted)" }}>
                  {t("common.noResults")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clear Cart Confirmation Modal */}
      {isClearConfirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
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
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-danger-light)",
                  color: "var(--color-danger)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--color-text)" }}>
                  {t("pos.clearCart")}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                  {t("pos.clearCartConfirm")}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <Button variant="outline" onClick={() => setIsClearConfirmOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={clearCart}>
                {t("pos.clearCart")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Sale Confirmation Modal */}
      {isCreditConfirmOpen && selectedCustomer && customerCredit && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
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
              maxWidth: "460px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-secondary-light)",
                  color: "var(--color-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <FileText size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {t("pos.confirmCreditTitle")}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
                  {t("pos.confirmCreditDesc")}
                </p>
              </div>
            </div>

            <div
              style={{
                background: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{t("pos.customer")}:</span>
                <span style={{ fontWeight: 700 }}>{selectedCustomer.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{t("pos.outstandingDebt")}:</span>
                <span style={{ fontWeight: 600 }}>{Number(customerCredit.outstanding_balance || 0).toFixed(2)} {t("common.egp")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{t("pos.total")}:</span>
                <span style={{ fontWeight: 700, color: "var(--color-primary)" }}>{totalDue.toFixed(2)} {t("common.egp")}</span>
              </div>
              <div style={{ borderTop: "1px dashed var(--color-border)", paddingTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text)" }}>{t("pos.projectedDebt")}:</span>
                <span style={{ fontWeight: 800, color: "var(--color-text)" }}>
                  {(Number(customerCredit.outstanding_balance || 0) + totalDue).toFixed(2)} {t("common.egp")}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{t("pos.creditLimit")}:</span>
                <span style={{ fontWeight: 600 }}>{Number(customerCredit.credit_limit || 0).toFixed(2)} {t("common.egp")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{t("pos.remainingCredit")}:</span>
                <span style={{ fontWeight: 700, color: "var(--color-secondary)" }}>
                  {Math.max(0, Number(customerCredit.credit_limit || 0) - (Number(customerCredit.outstanding_balance || 0) + totalDue)).toFixed(2)} {t("common.egp")}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <Button variant="outline" onClick={() => setIsCreditConfirmOpen(false)}>
                {t("pos.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setIsCreditConfirmOpen(false);
                  executeSale();
                }}
                isLoading={saleMutation.isPending}
              >
                {t("pos.confirmCreditAction")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Completed Sale & Receipt Modal */}
      {completedSale && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
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
              maxWidth: "480px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            {/* Header Success */}
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-success-light)",
                  color: "var(--color-success)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--color-text)" }}>
                {t("pos.saleSuccess")}
              </h2>
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                {t("pos.saleId", { id: completedSale.id.substring(0, 8).toUpperCase() })}
              </div>
            </div>

            {/* Printable Receipt Summary Box */}
            <div
              id="printable-receipt"
              style={{
                background: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px dashed var(--color-border)",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{t("pos.receiptDate")}:</span>
                <span style={{ fontWeight: 600 }}>{new Date(completedSale.created_at).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{t("pos.customer")}:</span>
                <span style={{ fontWeight: 600 }}>{completedSale.customer_name || t("pos.walkIn")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{t("pos.paymentMethod")}:</span>
                <span style={{ fontWeight: 600 }}>
                  {completedSale.payment_method === "credit" ? t("pos.credit") : completedSale.payment_method.toUpperCase()}
                </span>
              </div>

              {/* Items Summary */}
              <div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: "0.5rem", marginTop: "0.25rem" }}>
                {completedSale.items?.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                    <span>
                      {item.medicine_name} {item.unit_name ? `(${item.unit_name})` : ""} × {item.quantity}
                    </span>
                    <span style={{ fontWeight: 600 }}>{Number(item.total_price).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Financial Breakdown */}
              <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {Number(completedSale.discount) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-danger)" }}>
                    <span>{t("pos.discount")}:</span>
                    <span>-{Number(completedSale.discount).toFixed(2)} {t("common.egp")}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "1.1rem", color: "var(--color-primary)" }}>
                  <span>{t("pos.total")}:</span>
                  <span>{Number(completedSale.total_amount).toFixed(2)} {t("common.egp")}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <Button
                variant="outline"
                onClick={() => {
                  if (!completedSale) return;
                  const items = (completedSale.items || []).map((i) => ({
                    medicineName: i.medicine_name,
                    quantity: i.quantity,
                    unitPrice: Number(i.unit_price),
                    totalPrice: Number(i.total_price),
                    unitName: i.unit_name || null,
                  }));
                  const subtotal = items.reduce((acc, it) => acc + it.totalPrice, 0);

                  let creditBalanceAfter: number | undefined = undefined;
                  if (completedSale.payment_method === "credit" && customerCredit) {
                    creditBalanceAfter = Number(customerCredit.outstanding_balance) + Number(completedSale.total_amount);
                  }

                  printReceiptDocument(
                    {
                      saleId: completedSale.id,
                      createdAt: completedSale.created_at,
                      customerName: completedSale.customer_name,
                      cashierName: user?.full_name,
                      paymentMethod: completedSale.payment_method,
                      items,
                      subtotal,
                      discount: Number(completedSale.discount || 0),
                      totalAmount: Number(completedSale.total_amount),
                      creditBalanceAfter,
                    },
                    { isArabic: direction === "rtl" }
                  );
                }}
                leftIcon={<Printer size={18} />}
              >
                {t("pos.printReceipt")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setCompletedSale(null);
                  searchInputRef.current?.focus();
                }}
                leftIcon={<Plus size={18} />}
              >
                {t("pos.newSale")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
