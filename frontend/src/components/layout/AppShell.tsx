import React, { useState, ReactNode } from "react";
import { Sidebar, NavItemKey } from "./Sidebar";
import { Header } from "./Header";
import { GlobalSearchModal } from "../common/GlobalSearchModal";

interface AppShellProps {
  currentTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  children: ReactNode;
  onSearch?: (query: string) => void;
  onNavigateTab?: (tab: NavItemKey, searchParam?: string) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onSelectTab,
  children,
  onSearch,
  onNavigateTab,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  const handleGlobalNavigate = (tab: NavItemKey, searchParam?: string) => {
    if (onNavigateTab) {
      onNavigateTab(tab, searchParam);
    } else {
      onSelectTab(tab);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--color-background)",
        width: "100%",
      }}
    >
      {/* Role-Aware Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={onSelectTab}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflowX: "hidden",
        }}
      >
        <Header
          onSearch={onSearch}
          onOpenAlerts={() => onSelectTab("alerts")}
          onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
        />

        <main
          style={{
            flex: 1,
            padding: "1.75rem",
            maxWidth: "1600px",
            width: "100%",
            margin: "0 auto",
          }}
        >
          {children}
        </main>
      </div>

      {/* Global Search & Command Palette (Ctrl+K) */}
      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        onNavigateTab={handleGlobalNavigate}
      />
    </div>
  );
};

