import React, { useState, useRef, useEffect } from "react";
import { Search, Bell, Globe, RefreshCw, CheckCheck, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useI18n } from "../../i18n/i18nContext";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { notificationsApi } from "../../services/api/notifications";
import { Notification } from "../../types";

interface HeaderProps {
  onSearch?: (query: string) => void;
  onOpenAlerts?: () => void;
  onOpenGlobalSearch?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenAlerts, onOpenGlobalSearch }) => {
  const { t, language, toggleLanguage } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const data = await notificationsApi.list({ resolved: false, limit: 10 });
      setNotifications(data);
    } catch {
      // Background poll silently fails
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // 30s background sync
    return () => clearInterval(interval);
  }, []);

  // Global Ctrl+K shortcut to open global search dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenGlobalSearch?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenGlobalSearch]);

  // Close notifications dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleRunChecks = async () => {
    setIsScanning(true);
    try {
      const res = await notificationsApi.runChecks();
      toast.success(t("notifications.checksDone", { created: res.created, resolved: res.resolved }));
      await fetchNotifications();
    } catch (err: any) {
      toast.error(err.message || t("common.somethingWentWrong"));
    } finally {
      setIsScanning(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.info(t("header.markAllRead"));
    } catch (err: any) {
      toast.error(err.message || t("common.somethingWentWrong"));
    }
  };

  const handleMarkOneRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {}
  };

  return (
    <header
      style={{
        height: "var(--header-height)",
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "0 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 30,
        gap: "1.5rem",
      }}
    >
      {/* Global Search Bar Trigger */}
      <div style={{ flex: 1, maxWidth: "480px" }}>
        <button
          type="button"
          onClick={onOpenGlobalSearch}
          aria-label={t("header.globalSearch")}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            background: "var(--color-surface-subtle)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-full)",
            padding: "0.45rem 1rem",
            gap: "0.625rem",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            textAlign: "start",
            transition: "all var(--transition-fast)",
          }}
        >
          <Search size={18} color="var(--color-secondary)" />
          <span
            style={{
              flex: 1,
              fontSize: "0.875rem",
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {t("header.globalSearch")}
          </span>
          <kbd
            style={{
              fontSize: "0.7rem",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xs)",
              padding: "0.15rem 0.4rem",
              color: "var(--color-text-muted)",
              fontWeight: 600,
            }}
          >
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Header Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          title={t("header.language")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.45rem 0.875rem",
            borderRadius: "var(--radius-full)",
            background: "var(--color-surface-subtle)",
            border: "1px solid var(--color-border)",
            color: "var(--color-primary)",
            fontWeight: 700,
            fontSize: "0.85rem",
          }}
        >
          <Globe size={16} color="var(--color-secondary)" />
          <span>{language === "en" ? "العربية" : "English"}</span>
        </button>

        {/* Notifications Bell with Dropdown */}
        <div style={{ position: "relative" }} ref={notifDropdownRef}>
          <button
            onClick={() => setShowNotifications((prev) => !prev)}
            style={{
              position: "relative",
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-full)",
              background: "var(--color-surface-subtle)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary)",
            }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "3px",
                  insetInlineEnd: "3px",
                  background: "var(--color-danger)",
                  color: "#FFFFFF",
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  width: "18px",
                  height: "18px",
                  borderRadius: "var(--radius-full)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div
              className="animate-fade-in"
              style={{
                position: "absolute",
                top: "calc(100% + 0.5rem)",
                insetInlineEnd: 0,
                width: "360px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-dropdown)",
                padding: "1rem",
                zIndex: 100,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: "0.75rem",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  marginBottom: "0.75rem",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-primary)" }}>
                  {t("header.notifications")}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleRunChecks}
                    disabled={isScanning}
                    title={t("notifications.runChecks")}
                    style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.75rem",
                      color: "var(--color-secondary)",
                      background: "var(--color-primary-light)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <RefreshCw size={12} className={isScanning ? "animate-spin" : ""} />
                  </button>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      title={t("header.markAllRead")}
                      style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.75rem",
                        color: "var(--color-text-muted)",
                        background: "var(--color-surface-subtle)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <CheckCheck size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Notification List */}
              <div style={{ maxHeight: "280px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {notifications.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                    {t("header.noNotifications")}
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const iconMap = {
                      critical: <AlertCircle size={16} color="var(--color-danger)" />,
                      warning: <AlertTriangle size={16} color="var(--color-warning)" />,
                      info: <Info size={16} color="var(--color-info)" />,
                    };

                    return (
                      <div
                        key={notif.id}
                        onClick={() => handleMarkOneRead(notif.id)}
                        style={{
                          padding: "0.625rem 0.75rem",
                          borderRadius: "var(--radius-md)",
                          background: notif.is_read ? "transparent" : "var(--color-surface-subtle)",
                          borderInlineStart: `3px solid ${
                            notif.severity === "critical"
                              ? "var(--color-danger)"
                              : notif.severity === "warning"
                              ? "var(--color-warning)"
                              : "var(--color-info)"
                          }`,
                          cursor: "pointer",
                          display: "flex",
                          gap: "0.625rem",
                        }}
                      >
                        <div style={{ marginTop: "2px" }}>{iconMap[notif.severity]}</div>
                        <div style={{ flex: 1, lineHeight: 1.3 }}>
                          <div style={{ fontSize: "0.85rem", fontWeight: notif.is_read ? 500 : 700, color: "var(--color-text)" }}>
                            {notif.title}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                            {notif.message}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {onOpenAlerts && (
                <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--color-border-subtle)", textAlign: "center", marginTop: "0.5rem" }}>
                  <button
                    onClick={() => {
                      setShowNotifications(false);
                      onOpenAlerts();
                    }}
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "var(--color-secondary)",
                    }}
                  >
                    {t("header.viewAll")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Pill */}
        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              paddingInlineStart: "0.5rem",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-full)",
                background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "0.9rem",
              }}
            >
              {user.full_name?.charAt(0) || user.username?.charAt(0) || "U"}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
