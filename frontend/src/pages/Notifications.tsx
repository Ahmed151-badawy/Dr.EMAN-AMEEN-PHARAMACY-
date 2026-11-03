import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  ExternalLink,
  Filter,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { notificationsApi, NotificationFilters } from "../services/api/notifications";
import { Notification, NotificationSeverity, NotificationType } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";

interface NotificationsProps {
  onNavigateToMedicine?: (medicineId: string) => void;
}

export const Notifications: React.FC<NotificationsProps> = ({ onNavigateToMedicine }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const canRunChecks = user?.role === "admin" || user?.role === "inventory_manager";

  // Filter State
  const [activeTab, setActiveTab] = useState<"active" | "all" | "unread" | "resolved">("active");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Selected Notification Modal
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  // Derive exact query params
  const queryFilters: NotificationFilters = {
    resolved: activeTab === "active" ? false : activeTab === "resolved" ? true : undefined,
    unread: activeTab === "unread" ? true : undefined,
    severity: severityFilter !== "all" ? (severityFilter as NotificationSeverity) : undefined,
    type: typeFilter !== "all" ? (typeFilter as NotificationType) : undefined,
    limit: 100,
  };

  // Query: Notifications List
  const { data: notifications, isLoading: isLoadingNotifications } = useQuery({
    queryKey: ["notifications", "center", activeTab, severityFilter, typeFilter],
    queryFn: () => notificationsApi.list(queryFilters),
  });

  // Query: Unread Count Badge
  const { data: unreadNotifications } = useQuery({
    queryKey: ["notifications", "unreadSummary"],
    queryFn: () => notificationsApi.list({ unread: true, limit: 200 }),
  });
  const unreadCount = unreadNotifications?.length || 0;

  // Mutation: Mark Single as Read
  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Mutation: Mark All Read
  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      success(t("notifications.readAllSuccess"));
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  // Mutation: Run Inventory Alert Checks
  const runChecksMutation = useMutation({
    mutationFn: () => notificationsApi.runChecks(),
    onSuccess: (res) => {
      success(
        t("notifications.checksDone", {
          created: res.created,
          resolved: res.resolved,
        })
      );
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      error(err?.message || t("common.somethingWentWrong"));
    },
  });

  const getSeverityIcon = (severity: NotificationSeverity) => {
    switch (severity) {
      case "critical":
        return <AlertCircle size={20} color="var(--color-danger)" />;
      case "warning":
        return <AlertTriangle size={20} color="var(--color-warning)" />;
      case "info":
      default:
        return <Info size={20} color="var(--color-secondary)" />;
    }
  };

  const getSeverityBadgeVariant = (severity: NotificationSeverity): "danger" | "warning" | "info" => {
    switch (severity) {
      case "critical":
        return "danger";
      case "warning":
        return "warning";
      case "info":
      default:
        return "info";
    }
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
            <Bell size={28} color="var(--color-primary)" />
            {t("notifications.title")}
            {unreadCount > 0 && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  background: "var(--color-danger)",
                  color: "#fff",
                  padding: "0.2rem 0.55rem",
                  borderRadius: "var(--radius-full)",
                }}
              >
                {unreadCount}
              </span>
            )}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
            {t("notifications.subtitle")}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={() => markAllReadMutation.mutate()}
              isLoading={markAllReadMutation.isPending}
              leftIcon={<CheckCheck size={16} />}
            >
              {t("notifications.markAllRead")}
            </Button>
          )}

          {canRunChecks && (
            <Button
              variant="primary"
              onClick={() => runChecksMutation.mutate()}
              isLoading={runChecksMutation.isPending}
              leftIcon={<RefreshCw size={16} />}
            >
              {t("notifications.runChecks")}
            </Button>
          )}
        </div>
      </div>

      {/* Main Container Card */}
      <Card style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Filters */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: "1rem",
          }}
        >
          {/* Main Status Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(
              [
                { key: "active", label: t("notifications.filters.active") },
                { key: "unread", label: t("notifications.filters.unread") },
                { key: "all", label: t("notifications.filters.all") },
                { key: "resolved", label: t("notifications.filters.resolved") },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
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
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Secondary Dropdown Filters */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              <Filter size={14} />
            </div>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{
                padding: "0.45rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: "0.85rem",
              }}
            >
              <option value="all">{t("notifications.severities.all")}</option>
              <option value="critical">{t("notifications.severities.critical")}</option>
              <option value="warning">{t("notifications.severities.warning")}</option>
              <option value="info">{t("notifications.severities.info")}</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                padding: "0.45rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: "0.85rem",
              }}
            >
              <option value="all">{t("notifications.types.all")}</option>
              <option value="low_stock">{t("notifications.types.low_stock")}</option>
              <option value="expiring_soon">{t("notifications.types.expiring_soon")}</option>
              <option value="expired">{t("notifications.types.expired")}</option>
              <option value="stockout_predicted">{t("notifications.types.stockout_predicted")}</option>
              <option value="reorder_suggested">{t("notifications.types.reorder_suggested")}</option>
            </select>
          </div>
        </div>

        {/* Notifications List */}
        {isLoadingNotifications ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Skeleton height="70px" />
            <Skeleton height="70px" />
            <Skeleton height="70px" />
          </div>
        ) : notifications && notifications.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {notifications.map((item) => {
              const isUnread = !item.is_read;
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    padding: "1rem",
                    borderRadius: "var(--radius-lg)",
                    border: isUnread
                      ? "1.5px solid var(--color-primary)"
                      : "1px solid var(--color-border-subtle)",
                    background: isUnread
                      ? "var(--color-primary-light)"
                      : "var(--color-surface)",
                    gap: "1rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", gap: "0.875rem", alignItems: "flex-start", flex: 1 }}>
                    <div style={{ marginTop: "0.15rem", flexShrink: 0 }}>
                      {getSeverityIcon(item.severity)}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--color-text)" }}>
                          {item.title}
                        </span>

                        <Badge variant={getSeverityBadgeVariant(item.severity)}>
                          {t(`notifications.severities.${item.severity}`) || item.severity}
                        </Badge>

                        <Badge variant="neutral">
                          {t(`notifications.types.${item.type}`) || item.type}
                        </Badge>

                        {item.is_resolved && (
                          <Badge variant="success">
                            {t("notifications.resolvedAlert")}
                          </Badge>
                        )}
                      </div>

                      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", lineHeight: 1.4, margin: 0 }}>
                        {item.message}
                      </p>

                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
                    {isUnread && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markReadMutation.mutate(item.id)}
                        isLoading={markReadMutation.isPending}
                        leftIcon={<CheckCircle2 size={14} />}
                      >
                        {t("notifications.markRead")}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedNotification(item)}
                    >
                      {t("common.viewDetails")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "3.5rem 1rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            <Bell size={44} color="var(--color-border)" style={{ marginBottom: "0.75rem" }} />
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>
              {activeTab === "active" ? t("notifications.emptyActive") : t("notifications.emptyAll")}
            </div>
          </div>
        )}
      </Card>

      {/* Notification Details Modal */}
      {selectedNotification && (
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
              maxWidth: "540px",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                {getSeverityIcon(selectedNotification.severity)}
                <div>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--color-text)" }}>
                    {selectedNotification.title}
                  </h2>
                  <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.35rem" }}>
                    <Badge variant={getSeverityBadgeVariant(selectedNotification.severity)}>
                      {t(`notifications.severities.${selectedNotification.severity}`) || selectedNotification.severity}
                    </Badge>
                    <Badge variant="neutral">
                      {t(`notifications.types.${selectedNotification.type}`) || selectedNotification.type}
                    </Badge>
                  </div>
                </div>
              </div>

              <button onClick={() => setSelectedNotification(null)} style={{ color: "var(--color-text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                background: "var(--color-surface-subtle)",
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border-subtle)",
                fontSize: "0.9rem",
                color: "var(--color-text)",
                lineHeight: 1.5,
              }}
            >
              {selectedNotification.message}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
                fontSize: "0.85rem",
              }}
            >
              <div>
                <span style={{ color: "var(--color-text-muted)" }}>{t("notifications.status")}: </span>
                <strong>
                  {selectedNotification.is_resolved
                    ? t("notifications.resolvedAlert")
                    : t("notifications.activeAlert")}
                </strong>
              </div>

              <div>
                <span style={{ color: "var(--color-text-muted)" }}>{t("notifications.timestamp")}: </span>
                <strong>{new Date(selectedNotification.created_at).toLocaleString()}</strong>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
              {selectedNotification.related_medicine_id && onNavigateToMedicine && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const medId = selectedNotification.related_medicine_id!;
                    setSelectedNotification(null);
                    onNavigateToMedicine(medId);
                  }}
                  leftIcon={<ExternalLink size={16} />}
                >
                  {t("notifications.viewMedicine")}
                </Button>
              )}

              <Button variant="primary" onClick={() => setSelectedNotification(null)}>
                {t("pos.close")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
