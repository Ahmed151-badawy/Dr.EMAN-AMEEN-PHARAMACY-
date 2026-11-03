import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Pill,
  Users,
  ShoppingCart,
  LayoutDashboard,
  Truck,
  PackagePlus,
  ReceiptText,
  Landmark,
  Bell,
  TrendingUp,
  Settings,
  X,
  CornerDownLeft,
  ArrowUpDown,
  Package,
} from "lucide-react";
import { useI18n } from "../../i18n/i18nContext";
import { medicinesApi } from "../../services/api/medicines";
import { customersApi } from "../../services/api/customers";
import { Medicine, Customer } from "../../types";
import { NavItemKey } from "../layout/Sidebar";
import { Badge } from "../ui/Badge";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: NavItemKey, searchParam?: string) => void;
}

type ResultItem =
  | { type: "nav"; key: NavItemKey; title: string; subtitle: string; icon: React.ReactNode }
  | { type: "medicine"; data: Medicine }
  | { type: "customer"; data: Customer };

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const { direction } = useI18n();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus on open & reset state
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
      setMedicines([]);
      setCustomers([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fetch search results when debounced query changes
  useEffect(() => {
    if (!debouncedQuery) {
      setMedicines([]);
      setCustomers([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      medicinesApi.list({ q: debouncedQuery, limit: 6 }).catch(() => [] as Medicine[]),
      customersApi.list({ q: debouncedQuery, limit: 4 }).catch(() => [] as Customer[]),
    ])
      .then(([meds, custs]) => {
        if (!isMounted) return;
        setMedicines(meds);
        setCustomers(custs);
        setSelectedIndex(0);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery]);

  // Navigation targets
  const allNavItems = useMemo<
    Array<{ key: NavItemKey; titleEn: string; titleAr: string; descEn: string; descAr: string; icon: React.ReactNode }>
  >(
    () => [
      {
        key: "pos",
        titleEn: "Point of Sale (POS)",
        titleAr: "نقطة البيع (فاتورة جديدة)",
        descEn: "Process new retail sales and prescription dispensing",
        descAr: "إنشاء فواتير المبيعات وصرف الأدوية",
        icon: <ShoppingCart size={18} color="var(--color-primary)" />,
      },
      {
        key: "medicines",
        titleEn: "Medicines & Stock Catalog",
        titleAr: "دليل الأدوية والمخزون",
        descEn: "Browse, filter, and manage pharmaceutical catalog & products",
        descAr: "استعراض والبحث في الأدوية والمنتجات وإدارتها",
        icon: <Pill size={18} color="#0d9488" />,
      },
      {
        key: "dashboard",
        titleEn: "Dashboard",
        titleAr: "لوحة التحكم",
        descEn: "Overview of sales, active alerts, and pharmacy metrics",
        descAr: "نظرة عامة على المبيعات والتنبيهات ومؤشرات الصيدلية",
        icon: <LayoutDashboard size={18} color="#6366f1" />,
      },
      {
        key: "customers",
        titleEn: "Customers & Credit",
        titleAr: "العملاء والحسابات الآجلة",
        descEn: "Manage patient files, loyalty, and ledger receivables",
        descAr: "إدارة بيانات المرضى والحسابات والديون",
        icon: <Users size={18} color="#3b82f6" />,
      },
      {
        key: "purchases",
        titleEn: "Purchases & Inward Orders",
        titleAr: "المشتريات وفواتير الموردين",
        descEn: "Record incoming supplier batches and purchase invoices",
        descAr: "تسجيل فواتير الشراء واستلام الشحنات",
        icon: <PackagePlus size={18} color="#10b981" />,
      },
      {
        key: "suppliers",
        titleEn: "Suppliers",
        titleAr: "شركات التوزيع والموردين",
        descEn: "Manage pharmaceutical distributors and vendor directory",
        descAr: "إدارة بيانات شركات توزيع الأدوية والموردين",
        icon: <Truck size={18} color="#f59e0b" />,
      },
      {
        key: "sales",
        titleEn: "Sales History & Invoices",
        titleAr: "سجل المبيعات والفواتير",
        descEn: "Review completed sales, receipts, and customer returns",
        descAr: "استعراض فواتير البيع السابقة وعمليات الإرجاع",
        icon: <ReceiptText size={18} color="#8b5cf6" />,
      },
      {
        key: "financial",
        titleEn: "Financial & Profitability",
        titleAr: "المالية والأرباح والمصروفات",
        descEn: "Monitor cash flow, expenses, COGS, and daily profit",
        descAr: "متابعة التدفقات النقدية والمصروفات والأرباح اليومية",
        icon: <Landmark size={18} color="#14b8a6" />,
      },
      {
        key: "alerts",
        titleEn: "Alerts & Expiry Notifications",
        titleAr: "التنبيهات وصلاحية الأدوية",
        descEn: "Low stock warnings and expiring batch alerts",
        descAr: "تنبيهات نواقص الأدوية والتشغيلات قريبة الانتهاء",
        icon: <Bell size={18} color="#ef4444" />,
      },
      {
        key: "forecasts",
        titleEn: "Demand Forecasting",
        titleAr: "التنبؤ بالطلب والنواقص",
        descEn: "AI inventory reorder recommendations",
        descAr: "توصيات الذكاء الاصطناعي لإعادة طلب النواقص",
        icon: <TrendingUp size={18} color="#ec4899" />,
      },
      {
        key: "settings",
        titleEn: "System Settings",
        titleAr: "إعدادات النظام",
        descEn: "Configure store preferences, taxes, and backups",
        descAr: "ضبط إعدادات الصيدلية والنسخ الاحتياطي",
        icon: <Settings size={18} color="#64748b" />,
      },
    ],
    []
  );

  // Filter navigation items
  const matchedNavItems = useMemo(() => {
    if (!debouncedQuery) {
      return allNavItems.slice(0, 4); // Show top 4 quick links when empty
    }
    const qLower = debouncedQuery.toLowerCase();
    return allNavItems.filter(
      (item) =>
        item.titleEn.toLowerCase().includes(qLower) ||
        item.titleAr.includes(debouncedQuery) ||
        item.descEn.toLowerCase().includes(qLower) ||
        item.descAr.includes(debouncedQuery)
    );
  }, [debouncedQuery, allNavItems]);

  // Combined flat list for unified keyboard arrow navigation
  const flatResults = useMemo<ResultItem[]>(() => {
    const list: ResultItem[] = [];
    matchedNavItems.forEach((n) => list.push({
      type: "nav",
      key: n.key,
      title: direction === "rtl" ? n.titleAr : n.titleEn,
      subtitle: direction === "rtl" ? n.descAr : n.descEn,
      icon: n.icon,
    }));
    medicines.forEach((m) => list.push({ type: "medicine", data: m }));
    customers.forEach((c) => list.push({ type: "customer", data: c }));
    return list;
  }, [matchedNavItems, medicines, customers, direction]);

  // Execute selection
  const handleSelectResult = (item: ResultItem) => {
    if (item.type === "nav") {
      onNavigateTab(item.key);
      onClose();
    } else if (item.type === "medicine") {
      onNavigateTab("medicines", item.data.name);
      onClose();
    } else if (item.type === "customer") {
      onNavigateTab("customers", item.data.name);
      onClose();
    }
  };

  // Keyboard navigation inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (flatResults.length > 0 ? (prev + 1) % flatResults.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (flatResults.length > 0 ? (prev - 1 + flatResults.length) % flatResults.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatResults.length > 0 && selectedIndex >= 0 && selectedIndex < flatResults.length) {
        handleSelectResult(flatResults[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Auto-scroll selected element into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector<HTMLElement>("[data-active='true']");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "680px",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "scaleIn 0.15s ease-out",
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0.875rem 1.25rem",
            borderBottom: "1px solid var(--color-border)",
            gap: "0.75rem",
            background: "var(--color-surface)",
          }}
        >
          <Search size={22} color="var(--color-primary)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              direction === "rtl"
                ? "ابحث عن دواء، مستلزم، باركود، عميل، أو صفحة..."
                : "Search medicines, products, barcodes, customers, or pages..."
            }
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: "1.1rem",
              fontWeight: 500,
              color: "var(--color-text)",
              fontFamily: "inherit",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0.25rem",
                color: "var(--color-text-muted)",
              }}
            >
              <X size={18} />
            </button>
          )}
          <span
            style={{
              fontSize: "0.75rem",
              background: "var(--color-surface-subtle)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              padding: "0.2rem 0.5rem",
              color: "var(--color-text-muted)",
              fontWeight: 600,
            }}
          >
            ESC
          </span>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            maxHeight: "440px",
            overflowY: "auto",
            padding: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          {isLoading && (
            <div
              style={{
                padding: "1.5rem",
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: "0.9rem",
              }}
            >
              {direction === "rtl" ? "جارٍ البحث..." : "Searching..."}
            </div>
          )}

          {!isLoading && flatResults.length === 0 && debouncedQuery && (
            <div
              style={{
                padding: "2.5rem 1.5rem",
                textAlign: "center",
                color: "var(--color-text-muted)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Search size={36} color="var(--color-border)" />
              <div style={{ fontWeight: 600, fontSize: "1rem" }}>
                {direction === "rtl" ? `لم يتم العثور على نتائج لـ "${debouncedQuery}"` : `No results found for "${debouncedQuery}"`}
              </div>
              <div style={{ fontSize: "0.85rem" }}>
                {direction === "rtl"
                  ? "جرب كتابة الاسم التجاري، المادة الفعالة، الباركود، أو اسم العميل"
                  : "Try typing a trade name, active ingredient, barcode, SKU, or customer name"}
              </div>
            </div>
          )}

          {/* Render Categorized Items */}
          {matchedNavItems.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  padding: "0.35rem 0.5rem",
                }}
              >
                🧭 {direction === "rtl" ? "التنقل السريع" : "Quick Navigation"}
              </div>
              {matchedNavItems.map((nav) => {
                const globalIdx = flatResults.findIndex((r) => r.type === "nav" && r.key === nav.key);
                const isSelected = globalIdx === selectedIndex;
                return (
                  <div
                    key={`nav-${nav.key}`}
                    data-active={isSelected}
                    onClick={() => handleSelectResult({ type: "nav", key: nav.key, title: nav.titleEn, subtitle: nav.descEn, icon: nav.icon })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.8rem",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      background: isSelected ? "var(--color-primary-light)" : "transparent",
                      color: isSelected ? "var(--color-primary)" : "var(--color-text)",
                      transition: "background 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--color-surface-subtle)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {nav.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                          {direction === "rtl" ? nav.titleAr : nav.titleEn}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          {direction === "rtl" ? nav.descAr : nav.descEn}
                        </div>
                      </div>
                    </div>
                    {isSelected && <CornerDownLeft size={16} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Medicines & Products Section */}
          {medicines.length > 0 && (
            <div style={{ marginTop: "0.5rem" }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  padding: "0.35rem 0.5rem",
                }}
              >
                💊 {direction === "rtl" ? "الأدوية والمنتجات" : "Medicines & Products"} ({medicines.length})
              </div>
              {medicines.map((med) => {
                const globalIdx = flatResults.findIndex((r) => r.type === "medicine" && r.data.id === med.id);
                const isSelected = globalIdx === selectedIndex;
                const totalStock = (med as any).total_stock ?? 0;
                return (
                  <div
                    key={`med-${med.id}`}
                    data-active={isSelected}
                    onClick={() => handleSelectResult({ type: "medicine", data: med })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.8rem",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      background: isSelected ? "var(--color-primary-light)" : "transparent",
                      color: isSelected ? "var(--color-primary)" : "var(--color-text)",
                      transition: "background 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "var(--radius-md)",
                          background: med.product_type === "general" ? "#fef3c7" : "var(--color-primary-light)",
                          color: med.product_type === "general" ? "#d97706" : "var(--color-primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {med.product_type === "general" ? <Package size={18} /> : <Pill size={18} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                            {direction === "rtl" && med.name_ar ? med.name_ar : med.name}
                          </span>
                          {med.name_ar && (
                            <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                              ({direction === "rtl" ? med.name : med.name_ar})
                            </span>
                          )}
                          {med.product_type === "general" ? (
                            <Badge variant="warning">{direction === "rtl" ? "منتج تجاري" : "General"}</Badge>
                          ) : (
                            med.dosage_form && (
                              <Badge variant="neutral">
                                {direction === "rtl" ? med.dosage_form.name_ar : med.dosage_form.name_en}
                              </Badge>
                            )
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--color-text-muted)",
                            display: "flex",
                            gap: "0.75rem",
                            marginTop: "0.15rem",
                          }}
                        >
                          {med.barcode && <span>{med.barcode}</span>}
                          {med.sku && <span>SKU: {med.sku}</span>}
                          {med.strength && <span>{med.strength}</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "end", flexShrink: 0, marginInlineStart: "0.75rem" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--color-primary)" }}>
                        {Number(med.selling_price).toFixed(2)} {direction === "rtl" ? "ج.م" : "EGP"}
                      </div>
                      <div style={{ fontSize: "0.75rem" }}>
                        {totalStock > 0 ? (
                          <span style={{ color: "var(--color-success)" }}>
                            {direction === "rtl" ? `المخزون: ${totalStock}` : `Stock: ${totalStock}`}
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-danger)" }}>
                            {direction === "rtl" ? "نفد المخزون" : "Out of stock"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Customers Section */}
          {customers.length > 0 && (
            <div style={{ marginTop: "0.5rem" }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  padding: "0.35rem 0.5rem",
                }}
              >
                👥 {direction === "rtl" ? "العملاء" : "Customers"} ({customers.length})
              </div>
              {customers.map((cust) => {
                const globalIdx = flatResults.findIndex((r) => r.type === "customer" && r.data.id === cust.id);
                const isSelected = globalIdx === selectedIndex;
                return (
                  <div
                    key={`cust-${cust.id}`}
                    data-active={isSelected}
                    onClick={() => handleSelectResult({ type: "customer", data: cust })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.8rem",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      background: isSelected ? "var(--color-primary-light)" : "transparent",
                      color: isSelected ? "var(--color-primary)" : "var(--color-text)",
                      transition: "background 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--color-surface-subtle)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Users size={18} color="var(--color-primary)" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{cust.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          {cust.phone || (direction === "rtl" ? "لا يوجد هاتف" : "No phone")}
                        </div>
                      </div>
                    </div>
                    {isSelected && <CornerDownLeft size={16} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer with Keyboard Shortcuts Guide */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.6rem 1.25rem",
            background: "var(--color-surface-subtle)",
            borderTop: "1px solid var(--color-border)",
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <ArrowUpDown size={14} />
              {direction === "rtl" ? "للتنقل" : "Navigate"}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <CornerDownLeft size={14} />
              {direction === "rtl" ? "للاختيار" : "Select"}
            </span>
          </div>
          <div>
            {direction === "rtl" ? "ESC للإغلاق" : "ESC to close"}
          </div>
        </div>
      </div>
    </div>
  );
};
