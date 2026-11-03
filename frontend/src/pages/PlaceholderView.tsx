import React from "react";
import { useI18n } from "../i18n/i18nContext";
import { Card } from "../components/ui/Card";
import { NavItemKey } from "../components/layout/Sidebar";

export const PlaceholderView: React.FC<{ tabKey: NavItemKey }> = ({ tabKey }) => {
  const { t } = useI18n();

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-primary)" }}>
          {t(`nav.${tabKey}`)}
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          {t("brand.subtitle")} — {t(`nav.${tabKey}`)}
        </p>
      </div>

      <Card style={{ padding: "3rem 2rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-primary-light)",
            color: "var(--color-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.75rem",
          }}
        >
          ✨
        </div>
        <div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--color-primary)" }}>
            {t(`nav.${tabKey}`)}
          </h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", maxWidth: "400px", marginTop: "0.5rem" }}>
            Foundation 9A ready. Full screen workflow scheduled for Phase 9 implementation.
          </p>
        </div>
      </Card>
    </div>
  );
};
