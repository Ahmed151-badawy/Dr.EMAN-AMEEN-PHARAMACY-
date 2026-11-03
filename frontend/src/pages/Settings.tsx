import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Globe,
  User as UserIcon,
  Server,
  LogOut,
  CheckCircle2,
} from "lucide-react";
import { useI18n } from "../i18n/i18nContext";
import { useAuth } from "../context/AuthContext";
import { healthApi } from "../services/api/health";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";

export const Settings: React.FC = () => {
  const { t, language, toggleLanguage } = useI18n();
  const { user, logout } = useAuth();

  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);

  // Query: System / Backend Health
  const { data: health, isLoading: isLoadingHealth, isError: isHealthError } = useQuery({
    queryKey: ["system", "health"],
    queryFn: () => healthApi.get(),
    refetchInterval: 60000,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "900px" }}>
      {/* Header Bar */}
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
          <SettingsIcon size={28} color="var(--color-primary)" />
          {t("settings.title")}
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
          {t("settings.subtitle")}
        </p>
      </div>

      {/* Section 1: Language & Direction */}
      <Card style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "var(--radius-full)",
              background: "var(--color-primary-light)",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Globe size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-text)" }}>
              {t("settings.languageTitle")}
            </h2>
            <p style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>
              {t("settings.languageDesc")}
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div
            onClick={() => {
              if (language !== "en") toggleLanguage();
            }}
            style={{
              padding: "1rem",
              borderRadius: "var(--radius-lg)",
              border: language === "en" ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
              background: language === "en" ? "var(--color-primary-light)" : "var(--color-surface)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "all 0.15s ease",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: "var(--color-text)" }}>English</div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
                LTR (Left-to-Right layout)
              </div>
            </div>
            {language === "en" && <CheckCircle2 size={20} color="var(--color-primary)" />}
          </div>

          <div
            onClick={() => {
              if (language !== "ar") toggleLanguage();
            }}
            style={{
              padding: "1rem",
              borderRadius: "var(--radius-lg)",
              border: language === "ar" ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
              background: language === "ar" ? "var(--color-primary-light)" : "var(--color-surface)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "all 0.15s ease",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: "var(--color-text)" }}>العربية</div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
                RTL (من اليمين إلى اليسار)
              </div>
            </div>
            {language === "ar" && <CheckCircle2 size={20} color="var(--color-primary)" />}
          </div>
        </div>
      </Card>

      {/* Section 2: Active User Account Profile */}
      <Card style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "var(--radius-full)",
              background: "var(--color-surface-subtle)",
              color: "var(--color-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserIcon size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-text)" }}>
              {t("settings.accountTitle")}
            </h2>
            <p style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>
              {t("settings.accountDesc")}
            </p>
          </div>
        </div>

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
            <div style={{ color: "var(--color-text-muted)" }}>{t("settings.username")}</div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--color-text)", marginTop: "0.2rem" }}>
              {user?.username || "—"}
            </div>
          </div>

          <div>
            <div style={{ color: "var(--color-text-muted)" }}>{t("settings.fullName")}</div>
            <div style={{ fontWeight: 700, marginTop: "0.2rem" }}>{user?.full_name || "—"}</div>
          </div>

          <div>
            <div style={{ color: "var(--color-text-muted)" }}>{t("settings.role")}</div>
            <div style={{ marginTop: "0.2rem" }}>
              <Badge variant="info">
                {user?.role ? t(`roles.${user.role}`) || user.role : "—"}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Section 3: Server & System Health */}
      <Card style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "var(--radius-full)",
              background: "var(--color-success-light)",
              color: "var(--color-success)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Server size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-text)" }}>
              {t("settings.systemTitle")}
            </h2>
            <p style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>
              {t("settings.systemDesc")}
            </p>
          </div>
        </div>

        {isLoadingHealth ? (
          <Skeleton height="80px" />
        ) : (
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
              <div style={{ color: "var(--color-text-muted)" }}>{t("settings.serverStatus")}</div>
              <div style={{ marginTop: "0.3rem" }}>
                <Badge variant={!isHealthError && health?.status === "ok" ? "success" : "danger"}>
                  {!isHealthError && health?.status === "ok"
                    ? t("settings.online")
                    : t("settings.offline")}
                </Badge>
              </div>
            </div>

            <div>
              <div style={{ color: "var(--color-text-muted)" }}>{t("settings.appName")}</div>
              <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>
                {health?.app || t("brand.name")}
              </div>
            </div>

            <div>
              <div style={{ color: "var(--color-text-muted)" }}>{t("settings.environment")}</div>
              <div style={{ fontWeight: 600, marginTop: "0.2rem", textTransform: "capitalize" }}>
                {health?.env || "Production"}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Section 4: Sign Out Card */}
      <Card style={{ padding: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 800, color: "var(--color-text)" }}>
            {t("settings.signOutTitle")}
          </h2>
          <p style={{ fontSize: "0.825rem", color: "var(--color-text-muted)", marginTop: "0.15rem" }}>
            {t("settings.signOutDesc")}
          </p>
        </div>

        <Button
          variant="danger"
          onClick={() => setIsSignOutConfirmOpen(true)}
          leftIcon={<LogOut size={16} />}
        >
          {t("nav.logout")}
        </Button>
      </Card>

      {/* Sign Out Confirmation Modal */}
      {isSignOutConfirmOpen && (
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
                <LogOut size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-text)" }}>
                  {t("settings.signOutTitle")}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                  {t("settings.signOutConfirm")}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <Button variant="outline" onClick={() => setIsSignOutConfirmOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setIsSignOutConfirmOpen(false);
                  logout();
                }}
              >
                {t("nav.logout")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
