import React, { useState } from "react";
import { Lock, User, Eye, EyeOff, Globe } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n/i18nContext";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { PharmacyLogo } from "../components/ui/PharmacyLogo";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { t, language, toggleLanguage } = useI18n();
  const toast = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setIsLoading(true);
    setError(null);

    try {
      await login(username.trim(), password);
      toast.success(t("dashboard.greeting", { name: username }));
    } catch (err: any) {
      const msg =
        err.status === 401
          ? t("auth.invalidCredentials")
          : err.message || t("common.somethingWentWrong");
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at 50% 20%, #E8F6F6 0%, #D4ECEC 45%, #C2E2E2 100%)",
        padding: "1.5rem",
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "2.5rem 2rem",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-modal)",
          display: "flex",
          flexDirection: "column",
          gap: "1.75rem",
          position: "relative",
        }}
      >
        {/* Top Branding Section */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "0.75rem" }}>
          <PharmacyLogo size={56} showText={false} />
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-primary)", letterSpacing: "-0.02em" }}>
              {t("brand.name")}
            </h1>
            <p style={{ color: "var(--color-secondary)", fontSize: "0.85rem", fontWeight: 600, marginTop: "0.25rem" }}>
              {t("brand.tagline")}
            </p>
          </div>
        </div>

        {/* Form Title */}
        <div style={{ textAlign: "center", borderTop: "1px solid var(--color-border-subtle)", paddingTop: "1rem" }}>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--color-text)" }}>
            {t("auth.welcomeBack")}
          </h2>
          <p style={{ fontSize: "0.825rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
            {t("auth.signInToContinue")}
          </p>
        </div>

        {/* Error Alert if any */}
        {error && (
          <div
            style={{
              background: "var(--color-danger-light)",
              border: "1px solid var(--color-danger-border)",
              color: "var(--color-danger)",
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-md)",
              fontSize: "0.85rem",
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Input
            label={t("auth.username")}
            placeholder={t("auth.usernamePlaceholder")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            leftIcon={<User size={18} />}
            autoFocus
            required
          />

          <Input
            label={t("auth.password")}
            type={showPassword ? "text" : "password"}
            placeholder={t("auth.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock size={18} />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={{ color: "var(--color-text-muted)" }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            style={{ marginTop: "0.5rem" }}
          >
            {isLoading ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>

        {/* Language Switcher Footer */}
        <div style={{ display: "flex", justifyContent: "center", borderTop: "1px solid var(--color-border-subtle)", paddingTop: "1rem" }}>
          <button
            onClick={toggleLanguage}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "var(--color-secondary)",
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-full)",
              background: "var(--color-primary-light)",
            }}
          >
            <Globe size={16} />
            <span>{language === "en" ? "العربية (RTL)" : "English (LTR)"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
