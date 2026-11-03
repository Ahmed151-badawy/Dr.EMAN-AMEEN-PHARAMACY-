import React from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Pill,
  Boxes,
  Users,
  Truck,
  PackagePlus,
  ReceiptText,
  Bell,
  TrendingUp,
  UserCog,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Landmark,
  ShieldAlert,
} from "lucide-react";
import { useI18n } from "../../i18n/i18nContext";
import { useAuth } from "../../context/AuthContext";
import { PharmacyLogo } from "../ui/PharmacyLogo";

export type NavItemKey =
  | "dashboard"
  | "pos"
  | "medicines"
  | "inventory"
  | "customers"
  | "suppliers"
  | "purchases"
  | "sales"
  | "financial"
  | "controlled_reports"
  | "alerts"
  | "forecasts"
  | "users"
  | "settings";

interface SidebarProps {
  currentTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  unreadAlertCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  unreadAlertCount = 0,
}) => {
  const { t, direction } = useI18n();
  const { user, logout } = useAuth();

  const navItems: Array<{
    key: NavItemKey;
    icon: React.ReactNode;
    roles?: string[];
    badge?: number;
  }> = [
    { key: "dashboard", icon: <LayoutDashboard size={20} /> },
    { key: "pos", icon: <ShoppingCart size={20} />, roles: ["admin", "pharmacist", "cashier"] },
    { key: "medicines", icon: <Pill size={20} /> },
    { key: "inventory", icon: <Boxes size={20} /> },
    { key: "customers", icon: <Users size={20} /> },
    { key: "suppliers", icon: <Truck size={20} />, roles: ["admin", "pharmacist", "inventory_manager"] },
    { key: "purchases", icon: <PackagePlus size={20} />, roles: ["admin", "pharmacist", "inventory_manager"] },
    { key: "sales", icon: <ReceiptText size={20} /> },
    { key: "financial", icon: <Landmark size={20} />, roles: ["admin", "pharmacist"] },
    { key: "controlled_reports", icon: <ShieldAlert size={20} />, roles: ["admin", "pharmacist"] },
    { key: "alerts", icon: <Bell size={20} />, badge: unreadAlertCount },
    { key: "forecasts", icon: <TrendingUp size={20} />, roles: ["admin", "pharmacist", "inventory_manager"] },
    { key: "users", icon: <UserCog size={20} />, roles: ["admin"] },
    { key: "settings", icon: <Settings size={20} /> },
  ];

  // Filter items by user role
  const visibleItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return user?.role ? item.roles.includes(user.role) : false;
  });

  return (
    <aside
      style={{
        width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width-expanded)",
        height: "100vh",
        background: "var(--color-surface)",
        borderInlineEnd: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        transition: "width var(--transition-smooth)",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 40,
        userSelect: "none",
      }}
    >
      {/* Sidebar Header / Logo & Collapse Toggle */}
      <div
        style={{
          height: "var(--header-height)",
          padding: collapsed ? "0.5rem" : "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          borderBottom: "1px solid var(--color-border-subtle)",
          position: "relative",
        }}
      >
        {collapsed ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
            <button
              onClick={onToggleCollapse}
              title={t("nav.expandSidebar")}
              aria-label={t("nav.expandSidebar")}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px",
                borderRadius: "var(--radius-md)",
              }}
            >
              <PharmacyLogo collapsed={true} showText={false} size={32} />
            </button>
            <button
              onClick={onToggleCollapse}
              title={t("nav.expandSidebar")}
              aria-label={t("nav.expandSidebar")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "20px",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-primary)",
                background: "var(--color-primary-light)",
                border: "1px solid var(--color-border)",
                cursor: "pointer",
              }}
            >
              {direction === "rtl" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        ) : (
          <>
            <PharmacyLogo collapsed={false} showText={true} size={38} />

            <button
              onClick={onToggleCollapse}
              title={t("nav.collapseSidebar")}
              aria-label={t("nav.collapseSidebar")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "30px",
                height: "30px",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-muted)",
                background: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border-subtle)",
                cursor: "pointer",
              }}
            >
              {direction === "rtl" ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </>
        )}
      </div>

      {/* Navigation Links */}
      <nav
        style={{
          flex: 1,
          padding: "1rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
          overflowY: "auto",
        }}
      >
        {visibleItems.map((item) => {
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelectTab(item.key)}
              title={collapsed ? t(`nav.${item.key}`) : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: collapsed ? "0.625rem" : "0.625rem 0.875rem",
                borderRadius: "var(--radius-md)",
                justifyContent: collapsed ? "center" : "flex-start",
                color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                background: isActive ? "var(--color-primary-light)" : "transparent",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.9rem",
                position: "relative",
                transition: "all var(--transition-fast)",
              }}
            >
              {/* Active Indicator Strip */}
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    insetInlineStart: 0,
                    top: "15%",
                    bottom: "15%",
                    width: "3.5px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--color-secondary)",
                  }}
                />
              )}

              <div
                style={{
                  color: isActive ? "var(--color-secondary)" : "currentColor",
                  display: "flex",
                }}
              >
                {item.icon}
              </div>

              {!collapsed && (
                <span style={{ flex: 1, textAlign: "start" }}>{t(`nav.${item.key}`)}</span>
              )}

              {/* Alert Badge */}
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  style={{
                    background: "var(--color-danger)",
                    color: "#FFFFFF",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.45rem",
                    borderRadius: "var(--radius-full)",
                    minWidth: "18px",
                    textAlign: "center",
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Info & Logout at Bottom */}
      <div
        style={{
          padding: "1rem 0.75rem",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {!collapsed && user && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              background: "var(--color-surface-subtle)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "var(--radius-full)",
                background: "var(--color-primary)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "0.85rem",
                flexShrink: 0,
              }}
            >
              {user.full_name?.charAt(0) || user.username?.charAt(0) || "U"}
            </div>
            <div style={{ overflow: "hidden", lineHeight: 1.2 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  color: "var(--color-text)",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                }}
              >
                {user.full_name || user.username}
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-muted)",
                  textTransform: "capitalize",
                }}
              >
                {t(`roles.${user.role}`)}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          title={t("nav.logout")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: collapsed ? "0.625rem" : "0.625rem 0.875rem",
            borderRadius: "var(--radius-md)",
            justifyContent: collapsed ? "center" : "flex-start",
            color: "var(--color-danger)",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          <LogOut size={18} />
          {!collapsed && <span>{t("nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
};
