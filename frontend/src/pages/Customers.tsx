import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Search,
  Plus,
  Edit2,
  Phone,
  Mail,
  MapPin,
  X,
  Receipt,
  DollarSign,
  Settings2,
  History,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  customersApi,
  CustomerCreatePayload,
  CustomerUpdatePayload,
} from "../services/api/customers";
import { creditApi } from "../services/api/credit";
import {
  Customer,
  CreditStatus,
  CustomerPaymentMethod,
  CustomerPaymentCreatePayload,
  CustomerCreditAccountUpdatePayload,
} from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";

interface CustomersProps {
  onViewSale?: (saleId: string) => void;
}

type MainTab = "all" | "receivables";
type CustomerDetailTab = "overview" | "credit" | "transactions" | "payments";

export const Customers: React.FC<CustomersProps> = ({ onViewSale }) => {
  const { t, direction } = useI18n();
  const { user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const canManage =
    user?.role === "admin" ||
    user?.role === "pharmacist" ||
    user?.role === "cashier";
  const isAdmin = user?.role === "admin";

  // Navigation tab state
  const [mainTab, setMainTab] = useState<MainTab>("all");
  const [detailTab, setDetailTab] = useState<CustomerDetailTab>("overview");

  // Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pageOffset, setPageOffset] = useState(0);
  const pageSize = 25;

  // Selected Customer & Modals State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Credit Modals State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isConfigCreditModalOpen, setIsConfigCreditModalOpen] = useState(false);

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] =
    useState<CustomerPaymentMethod>("cash");
  const [paymentNotes, setPaymentNotes] = useState<string>("");

  // Credit Config Form State
  const [creditStatusForm, setCreditStatusForm] =
    useState<CreditStatus>("active");
  const [creditLimitForm, setCreditLimitForm] = useState<string>("5000");
  const [paymentTermsForm, setPaymentTermsForm] = useState<string>("30");

  // Customer Form State
  const [formData, setFormData] = useState<CustomerCreatePayload>({
    name: "",
    phone: "",
    email: "",
    address: "",
    date_of_birth: "",
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPageOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Query 1: Customers List
  const { data: customersList, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["customers", "list", debouncedSearch, pageOffset],
    queryFn: () =>
      customersApi.list({
        q: debouncedSearch || undefined,
        limit: pageSize,
        offset: pageOffset,
      }),
  });

  // Query 2: Receivables List
  const { data: receivablesList, isLoading: isLoadingReceivables } = useQuery({
    queryKey: ["customers", "receivables"],
    queryFn: () => creditApi.listReceivables({ limit: 100 }),
    enabled: mainTab === "receivables",
  });

  // Query 3: Selected Customer Profile
  const { data: customerProfile } = useQuery({
    queryKey: ["customers", "profile", selectedCustomerId],
    queryFn: () => customersApi.get(selectedCustomerId!),
    enabled: !!selectedCustomerId,
  });

  // Query 4: Customer Credit Account Summary
  const { data: customerCredit, isLoading: isLoadingCredit } = useQuery({
    queryKey: ["customers", "credit", selectedCustomerId],
    queryFn: () => creditApi.getCustomerCredit(selectedCustomerId!),
    enabled: !!selectedCustomerId && isDetailsModalOpen,
  });

  // Query 5: Customer Credit Transactions
  const { data: creditTransactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["customers", "creditTransactions", selectedCustomerId],
    queryFn: () => creditApi.listCustomerTransactions(selectedCustomerId!),
    enabled: !!selectedCustomerId && isDetailsModalOpen && (detailTab === "transactions" || detailTab === "credit"),
  });

  // Query 6: Customer Payments
  const { data: customerPayments, isLoading: isLoadingPayments } = useQuery({
    queryKey: ["customers", "payments", selectedCustomerId],
    queryFn: () => creditApi.listCustomerPayments(selectedCustomerId!),
    enabled: !!selectedCustomerId && isDetailsModalOpen && (detailTab === "payments" || detailTab === "credit"),
  });

  // Query 7: Customer Stats
  const { data: customerStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["customers", "stats", selectedCustomerId],
    queryFn: () => customersApi.getStats(selectedCustomerId!),
    enabled: !!selectedCustomerId && isDetailsModalOpen && detailTab === "overview",
  });

  // Query 8: Customer Sales History
  const { data: customerSales, isLoading: isLoadingSales } = useQuery({
    queryKey: ["customers", "sales", selectedCustomerId],
    queryFn: () => customersApi.getSales(selectedCustomerId!),
    enabled: !!selectedCustomerId && isDetailsModalOpen && detailTab === "overview",
  });

  // Mutation: Create / Edit Customer
  const saveCustomerMutation = useMutation({
    mutationFn: (data: CustomerCreatePayload) => {
      const payload: CustomerCreatePayload = {
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
        date_of_birth: data.date_of_birth?.trim() || null,
      };

      if (editingCustomer) {
        return customersApi.update(
          editingCustomer.id,
          payload as CustomerUpdatePayload
        );
      }
      return customersApi.create(payload);
    },
    onSuccess: (savedCustomer) => {
      success(t("customers.saveSuccess"));
      setIsCustomerFormOpen(false);
      setEditingCustomer(null);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      if (savedCustomer?.id) {
        setSelectedCustomerId(savedCustomer.id);
        setDetailTab("overview");
        setIsDetailsModalOpen(true);
      }
    },
    onError: (err: any) => {
      if (err?.message?.includes("already exists") || err?.status === 400) {
        error(t("customers.duplicatePhoneError"));
      } else {
        error(err?.message || t("common.somethingWentWrong"));
      }
    },
  });

  // Mutation: Record Payment
  const recordPaymentMutation = useMutation({
    mutationFn: (payload: CustomerPaymentCreatePayload) =>
      creditApi.recordCustomerPayment(selectedCustomerId!, payload),
    onSuccess: (data) => {
      success(
        t("customers.paymentSuccess", {
          amount: Number(data.amount).toFixed(2),
        })
      );
      setIsPaymentModalOpen(false);
      setPaymentAmount("");
      setPaymentNotes("");
      queryClient.invalidateQueries({
        queryKey: ["customers", "credit", selectedCustomerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["customers", "creditTransactions", selectedCustomerId],
      });
      queryClient.invalidateQueries({
        queryKey: ["customers", "payments", selectedCustomerId],
      });
      queryClient.invalidateQueries({ queryKey: ["customers", "receivables"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Mutation: Configure Credit Account
  const updateCreditConfigMutation = useMutation({
    mutationFn: (payload: CustomerCreditAccountUpdatePayload) =>
      creditApi.updateCustomerCredit(selectedCustomerId!, payload),
    onSuccess: () => {
      success(t("customers.creditUpdateSuccess"));
      setIsConfigCreditModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({
        queryKey: ["customers", "credit", selectedCustomerId],
      });
      queryClient.invalidateQueries({ queryKey: ["customers", "receivables"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Handlers
  const handleOpenAddCustomer = () => {
    setEditingCustomer(null);
    setFormData({
      name: "",
      phone: "",
      email: "",
      address: "",
      date_of_birth: "",
    });
    setIsCustomerFormOpen(true);
  };

  const handleOpenEditCustomer = (cust: Customer) => {
    setEditingCustomer(cust);
    setFormData({
      name: cust.name,
      phone: cust.phone || "",
      email: cust.email || "",
      address: cust.address || "",
      date_of_birth: cust.date_of_birth || "",
    });
    setIsCustomerFormOpen(true);
  };

  const handleViewCustomerDetails = (customerId: string, tab: CustomerDetailTab = "overview") => {
    setSelectedCustomerId(customerId);
    setDetailTab(tab);
    setIsDetailsModalOpen(true);
  };

  const handleOpenRecordPayment = () => {
    setPaymentAmount(
      customerCredit ? String(customerCredit.outstanding_balance) : ""
    );
    setPaymentMethod("cash");
    setPaymentNotes("");
    setIsPaymentModalOpen(true);
  };

  const handleOpenConfigCredit = () => {
    if (customerCredit) {
      setCreditStatusForm(customerCredit.credit_status);
      setCreditLimitForm(String(customerCredit.credit_limit));
      setPaymentTermsForm(String(customerCredit.payment_terms_days ?? 30));
    }
    setIsConfigCreditModalOpen(true);
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(paymentAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      error(t("customers.paymentAmountPositive"));
      return;
    }
    if (
      customerCredit &&
      parsedAmount > Number(customerCredit.outstanding_balance)
    ) {
      error(
        t("customers.paymentAmountExceedsDebt", {
          max: Number(customerCredit.outstanding_balance).toFixed(2),
        })
      );
      return;
    }
    recordPaymentMutation.mutate({
      amount: parsedAmount,
      payment_method: paymentMethod,
      notes: paymentNotes.trim() || null,
    });
  };

  const handleSubmitCreditConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const limit = parseFloat(creditLimitForm);
    const terms = parseInt(paymentTermsForm, 10);
    if (isNaN(limit) || limit < 0) {
      error("Credit limit must be a non-negative amount");
      return;
    }
    updateCreditConfigMutation.mutate({
      credit_status: creditStatusForm,
      credit_limit: limit,
      payment_terms_days: isNaN(terms) ? null : terms,
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
            <Users size={28} color="var(--color-primary)" />
            {t("customers.title")}
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-muted)",
              marginTop: "0.15rem",
            }}
          >
            {t("customers.subtitle")}
          </p>
        </div>

        {canManage && (
          <Button
            variant="primary"
            onClick={handleOpenAddCustomer}
            leftIcon={<Plus size={18} />}
          >
            {t("customers.addCustomer")}
          </Button>
        )}
      </div>

      {/* Main Tab Switcher: All Customers vs Receivables */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "1px solid var(--color-border-subtle)",
          paddingBottom: "0.25rem",
        }}
      >
        <button
          onClick={() => setMainTab("all")}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "var(--radius-md) var(--radius-md) 0 0",
            border: "none",
            background:
              mainTab === "all"
                ? "var(--color-surface)"
                : "transparent",
            color:
              mainTab === "all"
                ? "var(--color-primary)"
                : "var(--color-text-muted)",
            fontWeight: mainTab === "all" ? 700 : 500,
            fontSize: "0.9rem",
            cursor: "pointer",
            borderBottom:
              mainTab === "all"
                ? "2px solid var(--color-primary)"
                : "2px solid transparent",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <Users size={16} />
          {t("customers.allCustomersTab")}
        </button>

        <button
          onClick={() => setMainTab("receivables")}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "var(--radius-md) var(--radius-md) 0 0",
            border: "none",
            background:
              mainTab === "receivables"
                ? "var(--color-surface)"
                : "transparent",
            color:
              mainTab === "receivables"
                ? "var(--color-primary)"
                : "var(--color-text-muted)",
            fontWeight: mainTab === "receivables" ? 700 : 500,
            fontSize: "0.9rem",
            cursor: "pointer",
            borderBottom:
              mainTab === "receivables"
                ? "2px solid var(--color-primary)"
                : "2px solid transparent",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <DollarSign size={16} />
          {t("customers.receivablesTab")}
        </button>
      </div>

      {mainTab === "all" ? (
        /* Tab 1: All Customers Table */
        <Card style={{ padding: "1.25rem" }}>
          {/* Search Filter */}
          <div style={{ marginBottom: "1.25rem", maxWidth: "420px" }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("customers.searchPlaceholder")}
              leftIcon={<Search size={18} color="var(--color-secondary)" />}
            />
          </div>

          {isLoadingCustomers ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <Skeleton height="50px" />
              <Skeleton height="50px" />
              <Skeleton height="50px" />
            </div>
          ) : customersList && customersList.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.875rem",
                  textAlign: direction === "rtl" ? "right" : "left",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.name")}</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.phone")}</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.creditStatus")}</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.address")}</th>
                    <th style={{ padding: "0.75rem 0.5rem", textAlign: "end" }}>
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customersList.map((cust) => (
                    <tr
                      key={cust.id}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                        transition: "background var(--transition-fast)",
                      }}
                    >
                      <td style={{ padding: "0.875rem 0.5rem", fontWeight: 600 }}>
                        <button
                          onClick={() => handleViewCustomerDetails(cust.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-primary)",
                            fontWeight: 700,
                            cursor: "pointer",
                            textAlign: "inherit",
                          }}
                        >
                          {cust.name}
                        </button>
                      </td>
                      <td style={{ padding: "0.875rem 0.5rem" }}>
                        {cust.phone || "—"}
                      </td>
                      <td style={{ padding: "0.875rem 0.5rem" }}>
                        <Badge
                          variant={
                            (cust as any).credit_status === "active"
                              ? "success"
                              : (cust as any).credit_status === "suspended"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {t(
                            `customers.status${
                              (cust as any).credit_status === "active"
                                ? "Active"
                                : (cust as any).credit_status === "suspended"
                                ? "Suspended"
                                : "Disabled"
                            }`
                          )}
                        </Badge>
                      </td>
                      <td style={{ padding: "0.875rem 0.5rem", color: "var(--color-text-muted)" }}>
                        {cust.address || "—"}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 0.5rem",
                          textAlign: "end",
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            gap: "0.5rem",
                          }}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewCustomerDetails(cust.id, "credit")}
                            leftIcon={<DollarSign size={14} />}
                          >
                            {t("customers.creditWorkspace")}
                          </Button>
                          {canManage && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEditCustomer(cust)}
                              leftIcon={<Edit2 size={14} />}
                            >
                              {t("common.edit")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                color: "var(--color-text-muted)",
              }}
            >
              <Users
                size={40}
                color="var(--color-border)"
                style={{ marginBottom: "0.5rem" }}
              />
              <div>{t("customers.emptyCustomers")}</div>
            </div>
          )}
        </Card>
      ) : (
        /* Tab 2: Receivables & Credit Accounts Directory */
        <Card style={{ padding: "1.25rem" }}>
          {isLoadingReceivables ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <Skeleton height="50px" />
              <Skeleton height="50px" />
              <Skeleton height="50px" />
            </div>
          ) : receivablesList && receivablesList.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.875rem",
                  textAlign: direction === "rtl" ? "right" : "left",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.name")}</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.phone")}</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.creditStatus")}</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.outstandingBalance")}</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.creditLimit")}</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>{t("customers.availableCredit")}</th>
                    <th style={{ padding: "0.75rem 0.5rem", textAlign: "end" }}>
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receivablesList.map((rec) => (
                    <tr
                      key={rec.customer_id}
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                      }}
                    >
                      <td style={{ padding: "0.875rem 0.5rem", fontWeight: 700 }}>
                        <button
                          onClick={() => handleViewCustomerDetails(rec.customer_id, "credit")}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-primary)",
                            fontWeight: 700,
                            cursor: "pointer",
                            textAlign: "inherit",
                          }}
                        >
                          {rec.customer_name}
                        </button>
                      </td>
                      <td style={{ padding: "0.875rem 0.5rem" }}>
                        {rec.customer_phone || "—"}
                      </td>
                      <td style={{ padding: "0.875rem 0.5rem" }}>
                        <Badge
                          variant={
                            rec.credit_status === "active"
                              ? "success"
                              : rec.credit_status === "suspended"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {t(
                            `customers.status${
                              rec.credit_status === "active"
                                ? "Active"
                                : rec.credit_status === "suspended"
                                ? "Suspended"
                                : "Disabled"
                            }`
                          )}
                        </Badge>
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 0.5rem",
                          fontWeight: 800,
                          color:
                            Number(rec.outstanding_balance) > 0
                              ? "var(--color-danger)"
                              : "var(--color-text)",
                        }}
                      >
                        {Number(rec.outstanding_balance).toFixed(2)} {t("common.egp")}
                      </td>
                      <td style={{ padding: "0.875rem 0.5rem", fontWeight: 600 }}>
                        {Number(rec.credit_limit).toFixed(2)} {t("common.egp")}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 0.5rem",
                          fontWeight: 700,
                          color: "var(--color-primary)",
                        }}
                      >
                        {Number(rec.available_credit).toFixed(2)} {t("common.egp")}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 0.5rem",
                          textAlign: "end",
                        }}
                      >
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setSelectedCustomerId(rec.customer_id);
                            setPaymentAmount(String(rec.outstanding_balance));
                            setPaymentMethod("cash");
                            setPaymentNotes("");
                            setIsPaymentModalOpen(true);
                          }}
                          leftIcon={<DollarSign size={14} />}
                        >
                          {t("customers.recordPayment")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                color: "var(--color-text-muted)",
              }}
            >
              <DollarSign
                size={40}
                color="var(--color-border)"
                style={{ marginBottom: "0.5rem" }}
              />
              <div>{t("customers.noReceivables")}</div>
            </div>
          )}
        </Card>
      )}

      {/* Customer Details & History Modal */}
      {isDetailsModalOpen && customerProfile && (
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
              maxWidth: "840px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--color-primary-light)",
                    color: "var(--color-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: "1.2rem",
                  }}
                >
                  {customerProfile.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: "1.35rem",
                      fontWeight: 800,
                      color: "var(--color-text)",
                    }}
                  >
                    {customerProfile.name}
                  </h2>
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      flexWrap: "wrap",
                      fontSize: "0.85rem",
                      color: "var(--color-text-muted)",
                      marginTop: "0.2rem",
                    }}
                  >
                    {customerProfile.phone && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <Phone size={13} />
                        {customerProfile.phone}
                      </span>
                    )}
                    {customerProfile.email && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <Mail size={13} />
                        {customerProfile.email}
                      </span>
                    )}
                    {customerProfile.address && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <MapPin size={13} />
                        {customerProfile.address}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                style={{ color: "var(--color-text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Sub-tabs Navigation inside Profile Modal */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                borderBottom: "1px solid var(--color-border-subtle)",
                paddingBottom: "0.25rem",
              }}
            >
              {[
                { key: "overview" as CustomerDetailTab, label: t("customers.overview"), icon: <Users size={15} /> },
                { key: "credit" as CustomerDetailTab, label: t("customers.creditWorkspace"), icon: <DollarSign size={15} /> },
                { key: "transactions" as CustomerDetailTab, label: t("customers.creditTransactions"), icon: <History size={15} /> },
                { key: "payments" as CustomerDetailTab, label: t("customers.paymentHistory"), icon: <Receipt size={15} /> },
              ].map((tab) => {
                const isActive = detailTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: isActive ? "var(--color-primary-light)" : "transparent",
                      color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT 1: Overview & Statistics */}
            {detailTab === "overview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {isLoadingStats ? (
                  <Skeleton height="80px" />
                ) : customerStats ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          background: "var(--color-surface-subtle)",
                          padding: "1rem",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          {t("customers.totalVisits")}
                        </div>
                        <div
                          style={{
                            fontSize: "1.25rem",
                            fontWeight: 800,
                            color: "var(--color-primary)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {customerStats.total_visits}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--color-surface-subtle)",
                          padding: "1rem",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          {t("customers.totalSpent")}
                        </div>
                        <div
                          style={{
                            fontSize: "1.25rem",
                            fontWeight: 800,
                            color: "var(--color-text)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {Number(customerStats.total_spent).toFixed(2)} {t("common.egp")}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--color-surface-subtle)",
                          padding: "1rem",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          {t("customers.averageBasket")}
                        </div>
                        <div
                          style={{
                            fontSize: "1.25rem",
                            fontWeight: 800,
                            color: "var(--color-text)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {Number(customerStats.average_basket_value).toFixed(2)} {t("common.egp")}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--color-surface-subtle)",
                          padding: "1rem",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          {t("customers.lastPurchase")}
                        </div>
                        <div
                          style={{
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            color: "var(--color-text)",
                            marginTop: "0.45rem",
                          }}
                        >
                          {customerStats.last_purchase_date
                            ? new Date(customerStats.last_purchase_date).toLocaleDateString()
                            : t("customers.never")}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--color-text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      {t("customers.statsLimitationNote")}
                    </div>
                  </div>
                ) : null}

                {/* Purchase History */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <h3
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "var(--color-text)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <Receipt size={16} color="var(--color-primary)" />
                    {t("customers.salesHistory")}
                  </h3>

                  {isLoadingSales ? (
                    <Skeleton height="100px" />
                  ) : customerSales && customerSales.length > 0 ? (
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
                              borderBottom: "1px solid var(--color-border)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            <th style={{ padding: "0.5rem" }}>{t("sales.date")}</th>
                            <th style={{ padding: "0.5rem" }}>{t("sales.payment")}</th>
                            <th style={{ padding: "0.5rem" }}>{t("sales.total")}</th>
                            <th style={{ padding: "0.5rem" }}>{t("sales.status")}</th>
                            <th style={{ padding: "0.5rem", textAlign: "end" }}>
                              {t("common.actions")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerSales.map((s) => (
                            <tr
                              key={s.id}
                              style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                            >
                              <td style={{ padding: "0.625rem 0.5rem" }}>
                                {new Date(s.created_at).toLocaleString()}
                              </td>
                              <td
                                style={{
                                  padding: "0.625rem 0.5rem",
                                  textTransform: "capitalize",
                                }}
                              >
                                {s.payment_method === "credit"
                                  ? t("pos.credit")
                                  : s.payment_method}
                              </td>
                              <td style={{ padding: "0.625rem 0.5rem", fontWeight: 700 }}>
                                {Number(s.total_amount).toFixed(2)} {t("common.egp")}
                              </td>
                              <td style={{ padding: "0.625rem 0.5rem" }}>
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
                              <td style={{ padding: "0.625rem 0.5rem", textAlign: "end" }}>
                                {onViewSale && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setIsDetailsModalOpen(false);
                                      onViewSale(s.id);
                                    }}
                                  >
                                    {t("sales.viewReceipt")}
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: "1.5rem",
                        textAlign: "center",
                        color: "var(--color-text-muted)",
                        fontSize: "0.85rem",
                      }}
                    >
                      {t("customers.noSalesHistory")}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: Credit Account Overview */}
            {detailTab === "credit" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {isLoadingCredit ? (
                  <Skeleton height="120px" />
                ) : customerCredit ? (
                  <div
                    style={{
                      background: "var(--color-surface-subtle)",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--color-border)",
                      padding: "1.5rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.25rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                        <DollarSign size={22} color="var(--color-primary)" />
                        <h3
                          style={{
                            fontSize: "1.1rem",
                            fontWeight: 800,
                            color: "var(--color-text)",
                          }}
                        >
                          {t("customers.creditAccount")}
                        </h3>
                        <Badge
                          variant={
                            customerCredit.credit_status === "active"
                              ? "success"
                              : customerCredit.credit_status === "suspended"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {t(
                            `customers.status${
                              customerCredit.credit_status === "active"
                                ? "Active"
                                : customerCredit.credit_status === "suspended"
                                ? "Suspended"
                                : "Disabled"
                            }`
                          )}
                        </Badge>
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        {canManage && Number(customerCredit.outstanding_balance) > 0 && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleOpenRecordPayment}
                            leftIcon={<DollarSign size={16} />}
                          >
                            {t("customers.recordPayment")}
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleOpenConfigCredit}
                            leftIcon={<Settings2 size={16} />}
                          >
                            {t("customers.configureCredit")}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Financial KPIs */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: "1rem",
                      }}
                    >
                      <div
                        style={{
                          background: "var(--color-surface)",
                          padding: "1rem",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                          {t("customers.outstandingBalance")}
                        </div>
                        <div
                          style={{
                            fontSize: "1.35rem",
                            fontWeight: 800,
                            color:
                              Number(customerCredit.outstanding_balance) > 0
                                ? "var(--color-danger)"
                                : "var(--color-text)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {Number(customerCredit.outstanding_balance).toFixed(2)} {t("common.egp")}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--color-surface)",
                          padding: "1rem",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                          {t("customers.creditLimit")}
                        </div>
                        <div
                          style={{
                            fontSize: "1.35rem",
                            fontWeight: 800,
                            color: "var(--color-text)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {Number(customerCredit.credit_limit).toFixed(2)} {t("common.egp")}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--color-surface)",
                          padding: "1rem",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                          {t("customers.availableCredit")}
                        </div>
                        <div
                          style={{
                            fontSize: "1.35rem",
                            fontWeight: 800,
                            color: "var(--color-primary)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {Number(customerCredit.available_credit).toFixed(2)} {t("common.egp")}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--color-surface)",
                          padding: "1rem",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                          {t("customers.paymentTerms")}
                        </div>
                        <div
                          style={{
                            fontSize: "1.1rem",
                            fontWeight: 700,
                            color: "var(--color-text)",
                            marginTop: "0.35rem",
                          }}
                        >
                          {customerCredit.payment_terms_days
                            ? t("customers.paymentTermsDays", {
                                days: customerCredit.payment_terms_days,
                              })
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* TAB CONTENT 3: Credit Ledger Transactions */}
            {detailTab === "transactions" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <h3
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    color: "var(--color-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <History size={16} color="var(--color-primary)" />
                  {t("customers.creditTransactions")}
                </h3>

                {isLoadingTransactions ? (
                  <Skeleton height="100px" />
                ) : creditTransactions && creditTransactions.length > 0 ? (
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
                            borderBottom: "1px solid var(--color-border)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          <th style={{ padding: "0.5rem" }}>{t("customers.date")}</th>
                          <th style={{ padding: "0.5rem" }}>{t("customers.transactionType")}</th>
                          <th style={{ padding: "0.5rem" }}>{t("customers.amount")}</th>
                          <th style={{ padding: "0.5rem" }}>{t("customers.balanceAfter")}</th>
                          <th style={{ padding: "0.5rem" }}>{t("customers.notes")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditTransactions.map((tx) => {
                          const isDebit =
                            tx.transaction_type === "credit_sale" ||
                            tx.transaction_type === "adjustment";
                          return (
                            <tr
                              key={tx.id}
                              style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                            >
                              <td style={{ padding: "0.625rem 0.5rem" }}>
                                {new Date(tx.created_at).toLocaleString()}
                              </td>
                              <td style={{ padding: "0.625rem 0.5rem" }}>
                                <Badge
                                  variant={
                                    tx.transaction_type === "payment"
                                      ? "success"
                                      : tx.transaction_type === "return"
                                      ? "info"
                                      : tx.transaction_type === "credit_sale"
                                      ? "warning"
                                      : "neutral"
                                  }
                                >
                                  {t(
                                    `customers.txType${
                                      tx.transaction_type === "credit_sale"
                                        ? "CreditSale"
                                        : tx.transaction_type === "payment"
                                        ? "Payment"
                                        : tx.transaction_type === "return"
                                        ? "Return"
                                        : "Adjustment"
                                    }`
                                  )}
                                </Badge>
                              </td>
                              <td
                                style={{
                                  padding: "0.625rem 0.5rem",
                                  fontWeight: 700,
                                  color: isDebit
                                    ? "var(--color-danger)"
                                    : "var(--color-success)",
                                }}
                              >
                                {isDebit ? "+" : "-"}
                                {Number(tx.amount).toFixed(2)} {t("common.egp")}
                              </td>
                              <td style={{ padding: "0.625rem 0.5rem", fontWeight: 700 }}>
                                {tx.balance_after !== null
                                  ? `${Number(tx.balance_after).toFixed(2)} ${t("common.egp")}`
                                  : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "0.625rem 0.5rem",
                                  color: "var(--color-text-muted)",
                                }}
                              >
                                {tx.notes || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "1.5rem",
                      textAlign: "center",
                      color: "var(--color-text-muted)",
                      fontSize: "0.85rem",
                    }}
                  >
                    {t("customers.noCreditTransactions")}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT 4: Payment History */}
            {detailTab === "payments" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "var(--color-text)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <Receipt size={16} color="var(--color-primary)" />
                    {t("customers.paymentHistory")}
                  </h3>

                  {canManage && customerCredit && Number(customerCredit.outstanding_balance) > 0 && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleOpenRecordPayment}
                      leftIcon={<DollarSign size={14} />}
                    >
                      {t("customers.recordPayment")}
                    </Button>
                  )}
                </div>

                {isLoadingPayments ? (
                  <Skeleton height="100px" />
                ) : customerPayments && customerPayments.length > 0 ? (
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
                            borderBottom: "1px solid var(--color-border)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          <th style={{ padding: "0.5rem" }}>{t("customers.date")}</th>
                          <th style={{ padding: "0.5rem" }}>{t("customers.amount")}</th>
                          <th style={{ padding: "0.5rem" }}>{t("customers.paymentMethod")}</th>
                          <th style={{ padding: "0.5rem" }}>{t("customers.notes")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerPayments.map((p) => (
                          <tr
                            key={p.id}
                            style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                          >
                            <td style={{ padding: "0.625rem 0.5rem" }}>
                              {new Date(p.created_at).toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "0.625rem 0.5rem",
                                fontWeight: 800,
                                color: "var(--color-success)",
                              }}
                            >
                              {Number(p.amount).toFixed(2)} {t("common.egp")}
                            </td>
                            <td style={{ padding: "0.625rem 0.5rem" }}>
                              <Badge variant="success">
                                {t(
                                  `customers.payMethod${
                                    p.payment_method === "cash"
                                      ? "Cash"
                                      : p.payment_method === "card"
                                      ? "Card"
                                      : p.payment_method === "wallet"
                                      ? "Wallet"
                                      : "BankTransfer"
                                  }`
                                )}
                              </Badge>
                            </td>
                            <td
                              style={{
                                padding: "0.625rem 0.5rem",
                                color: "var(--color-text-muted)",
                              }}
                            >
                              {p.notes || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "1.5rem",
                      textAlign: "center",
                      color: "var(--color-text-muted)",
                      fontSize: "0.85rem",
                    }}
                  >
                    {t("customers.noPayments")}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                borderTop: "1px solid var(--color-border)",
                paddingTop: "1rem",
              }}
            >
              {canManage && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleOpenEditCustomer(customerProfile);
                  }}
                  leftIcon={<Edit2 size={16} />}
                >
                  {t("customers.editCustomer")}
                </Button>
              )}
              <Button variant="primary" onClick={() => setIsDetailsModalOpen(false)}>
                {t("pos.close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {isPaymentModalOpen && selectedCustomerId && (
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <DollarSign size={22} color="var(--color-primary)" />
                <h3
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 800,
                    color: "var(--color-text)",
                  }}
                >
                  {t("customers.recordPaymentTitle")}
                </h3>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                style={{ color: "var(--color-text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("customers.recordPaymentDesc")}
            </p>

            {customerCredit && (
              <div
                style={{
                  background: "var(--color-surface-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.75rem 1rem",
                  border: "1px solid var(--color-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                  {t("customers.outstandingBalance")}:
                </span>
                <span
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    color: "var(--color-danger)",
                  }}
                >
                  {Number(customerCredit.outstanding_balance).toFixed(2)} {t("common.egp")}
                </span>
              </div>
            )}

            <form
              onSubmit={handleSubmitPayment}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--color-text)",
                  }}
                >
                  {t("customers.paymentAmountLabel")} *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={customerCredit ? customerCredit.outstanding_balance : undefined}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--color-text)",
                  }}
                >
                  {t("customers.paymentMethodLabel")}
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.5rem",
                  }}
                >
                  {[
                    { key: "cash" as CustomerPaymentMethod, label: t("customers.payMethodCash") },
                    { key: "card" as CustomerPaymentMethod, label: t("customers.payMethodCard") },
                    { key: "wallet" as CustomerPaymentMethod, label: t("customers.payMethodWallet") },
                    { key: "bank_transfer" as CustomerPaymentMethod, label: t("customers.payMethodBankTransfer") },
                  ].map((pm) => (
                    <button
                      key={pm.key}
                      type="button"
                      onClick={() => setPaymentMethod(pm.key)}
                      style={{
                        padding: "0.5rem",
                        borderRadius: "var(--radius-sm)",
                        border:
                          paymentMethod === pm.key
                            ? "2px solid var(--color-primary)"
                            : "1px solid var(--color-border)",
                        background:
                          paymentMethod === pm.key
                            ? "var(--color-primary-light)"
                            : "var(--color-surface)",
                        color:
                          paymentMethod === pm.key
                            ? "var(--color-primary)"
                            : "var(--color-text)",
                        fontWeight: paymentMethod === pm.key ? 700 : 500,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--color-text)",
                  }}
                >
                  {t("customers.paymentNotesLabel")}
                </label>
                <Input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Bank transfer ref #12345"
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  marginTop: "0.5rem",
                }}
              >
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={recordPaymentMutation.isPending}
                >
                  {recordPaymentMutation.isPending
                    ? t("customers.recordingPayment")
                    : t("customers.recordPayment")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Configure Customer Credit Modal (Admin Only) */}
      {isConfigCreditModalOpen && selectedCustomerId && isAdmin && (
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Settings2 size={22} color="var(--color-primary)" />
                <h3
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 800,
                    color: "var(--color-text)",
                  }}
                >
                  {t("customers.configureCreditTitle")}
                </h3>
              </div>
              <button
                onClick={() => setIsConfigCreditModalOpen(false)}
                style={{ color: "var(--color-text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {t("customers.configureCreditDesc")}
            </p>

            <form
              onSubmit={handleSubmitCreditConfig}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--color-text)",
                  }}
                >
                  {t("customers.creditStatusLabel")}
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "0.5rem",
                  }}
                >
                  {[
                    { key: "active" as CreditStatus, label: t("customers.statusActive") },
                    { key: "suspended" as CreditStatus, label: t("customers.statusSuspended") },
                    { key: "disabled" as CreditStatus, label: t("customers.statusDisabled") },
                  ].map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setCreditStatusForm(st.key)}
                      style={{
                        padding: "0.5rem",
                        borderRadius: "var(--radius-sm)",
                        border:
                          creditStatusForm === st.key
                            ? "2px solid var(--color-primary)"
                            : "1px solid var(--color-border)",
                        background:
                          creditStatusForm === st.key
                            ? "var(--color-primary-light)"
                            : "var(--color-surface)",
                        color:
                          creditStatusForm === st.key
                            ? "var(--color-primary)"
                            : "var(--color-text)",
                        fontWeight: creditStatusForm === st.key ? 700 : 500,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--color-text)",
                  }}
                >
                  {t("customers.creditLimitLabel")} *
                </label>
                <Input
                  type="number"
                  step="100"
                  min="0"
                  value={creditLimitForm}
                  onChange={(e) => setCreditLimitForm(e.target.value)}
                  placeholder="5000.00"
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--color-text)",
                  }}
                >
                  {t("customers.paymentTermsLabel")}
                </label>
                <Input
                  type="number"
                  min="0"
                  value={paymentTermsForm}
                  onChange={(e) => setPaymentTermsForm(e.target.value)}
                  placeholder="30"
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  marginTop: "0.5rem",
                }}
              >
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsConfigCreditModalOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={updateCreditConfigMutation.isPending}
                >
                  {updateCreditConfigMutation.isPending
                    ? t("customers.saving")
                    : t("customers.saveCreditConfig")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Customer Form Modal */}
      {isCustomerFormOpen && (
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: "var(--color-text)",
                }}
              >
                {editingCustomer
                  ? t("customers.editCustomer")
                  : t("customers.addCustomer")}
              </h2>
              <button
                onClick={() => setIsCustomerFormOpen(false)}
                style={{ color: "var(--color-text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveCustomerMutation.mutate(formData);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Input
                label={t("customers.name") + " *"}
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />

              <Input
                label={t("customers.phone")}
                value={formData.phone || ""}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="e.g. 01012345678"
              />

              <Input
                label={t("customers.email")}
                type="email"
                value={formData.email || ""}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="client@example.com"
              />

              <Input
                label={t("customers.address")}
                value={formData.address || ""}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
              />

              <Input
                label={t("customers.dob")}
                type="date"
                value={formData.date_of_birth || ""}
                onChange={(e) =>
                  setFormData({ ...formData, date_of_birth: e.target.value })
                }
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsCustomerFormOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={saveCustomerMutation.isPending}
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
