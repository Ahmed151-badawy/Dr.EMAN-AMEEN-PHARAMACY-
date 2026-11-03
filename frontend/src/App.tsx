import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "./i18n/i18nContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { AppShell } from "./components/layout/AppShell";
import { NavItemKey } from "./components/layout/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { POS } from "./pages/POS";
import { Medicines } from "./pages/Medicines";
import { Customers } from "./pages/Customers";
import { Suppliers } from "./pages/Suppliers";
import { Purchases } from "./pages/Purchases";
import { Sales } from "./pages/Sales";
import { Financial } from "./pages/Financial";
import { Notifications } from "./pages/Notifications";
import { Forecasts } from "./pages/Forecasts";
import { Settings } from "./pages/Settings";
import { Users } from "./pages/Users";
import { ControlledMedicinesReport } from "./pages/ControlledMedicinesReport";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderView } from "./pages/PlaceholderView";
import { PharmacyLogo } from "./components/ui/PharmacyLogo";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const MainLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavItemKey>("dashboard");
  const [activeSaleId, setActiveSaleId] = useState<string | null>(null);
  const [initialMedicineSearch, setInitialMedicineSearch] = useState<string | undefined>(undefined);

  const handleNavigateTab = (tab: NavItemKey, searchParam?: string) => {
    if (tab !== "sales") {
      setActiveSaleId(null);
    }
    if (tab === "medicines") {
      setInitialMedicineSearch(searchParam);
    } else {
      setInitialMedicineSearch(undefined);
    }
    setCurrentTab(tab);
  };

  const handleNavigateToSale = (saleId: string) => {
    setActiveSaleId(saleId);
    setCurrentTab("sales");
  };

  const handleNavigateToMedicine = (_medicineId: string) => {
    setInitialMedicineSearch(undefined);
    setCurrentTab("medicines");
  };

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-background)",
          gap: "1.5rem",
        }}
      >
        <PharmacyLogo size={64} showText={false} />
        <div
          style={{
            width: "120px",
            height: "4px",
            background: "var(--color-border)",
            borderRadius: "var(--radius-full)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              width: "40%",
              height: "100%",
              background: "var(--color-secondary)",
              borderRadius: "var(--radius-full)",
              animation: "indeterminate 1.2s infinite ease-in-out",
            }}
          />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <AppShell
      currentTab={currentTab}
      onSelectTab={(tab) => handleNavigateTab(tab)}
      onNavigateTab={handleNavigateTab}
    >
      {currentTab === "dashboard" ? (
        <Dashboard onNavigate={setCurrentTab} />
      ) : currentTab === "pos" ? (
        <POS />
      ) : currentTab === "medicines" || currentTab === "inventory" ? (
        <Medicines initialSearch={initialMedicineSearch} />
      ) : currentTab === "customers" ? (
        <Customers onViewSale={handleNavigateToSale} />
      ) : currentTab === "suppliers" ? (
        <Suppliers />
      ) : currentTab === "purchases" ? (
        <Purchases />
      ) : currentTab === "sales" ? (
        <Sales
          initialSaleId={activeSaleId}
          onClearInitialSaleId={() => setActiveSaleId(null)}
        />
      ) : currentTab === "financial" ? (
        <Financial />
      ) : currentTab === "controlled_reports" ? (
        <ControlledMedicinesReport />
      ) : currentTab === "alerts" ? (
        <Notifications onNavigateToMedicine={handleNavigateToMedicine} />
      ) : currentTab === "forecasts" ? (
        <Forecasts onNavigateToMedicine={handleNavigateToMedicine} />
      ) : currentTab === "users" ? (
        <Users />
      ) : currentTab === "settings" ? (
        <Settings />
      ) : (
        <PlaceholderView tabKey={currentTab} />
      )}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <MainLayout />
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
};
