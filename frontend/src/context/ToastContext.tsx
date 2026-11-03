import React, { createContext, useContext, useState, ReactNode } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const showToast = (type: ToastType, message: string, title?: string, duration = 4500) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = { id, type, message, title, duration };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  };

  const success = (message: string, title?: string) => showToast("success", message, title);
  const error = (message: string, title?: string) => showToast("error", message, title);
  const warning = (message: string, title?: string) => showToast("warning", message, title);
  const info = (message: string, title?: string) => showToast("info", message, title);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

const ToastContainer: React.FC<{ toasts: ToastItem[]; onRemove: (id: string) => void }> = ({
  toasts,
  onRemove,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "1.5rem",
        insetInlineEnd: "1.5rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        maxWidth: "420px",
        width: "100%",
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle2 size={20} color="var(--color-success)" />,
          error: <AlertCircle size={20} color="var(--color-danger)" />,
          warning: <AlertTriangle size={20} color="var(--color-warning)" />,
          info: <Info size={20} color="var(--color-info)" />,
        };

        const bgColors = {
          success: "var(--color-success-light)",
          error: "var(--color-danger-light)",
          warning: "var(--color-warning-light)",
          info: "var(--color-info-light)",
        };

        const borderColors = {
          success: "var(--color-success-border)",
          error: "var(--color-danger-border)",
          warning: "var(--color-warning-border)",
          info: "var(--color-info-border)",
        };

        return (
          <div
            key={toast.id}
            className="animate-fade-in"
            style={{
              pointerEvents: "auto",
              background: "var(--color-surface)",
              border: `1px solid ${borderColors[toast.type]}`,
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-dropdown)",
              padding: "1rem 1.25rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.875rem",
            }}
          >
            <div
              style={{
                background: bgColors[toast.type],
                padding: "0.375rem",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {icons[toast.type]}
            </div>
            <div style={{ flex: 1 }}>
              {toast.title && (
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--color-text)", marginBottom: "0.125rem" }}>
                  {toast.title}
                </div>
              )}
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                {toast.message}
              </div>
            </div>
            <button
              onClick={() => onRemove(toast.id)}
              style={{
                color: "var(--color-text-light)",
                padding: "0.25rem",
                borderRadius: "var(--radius-xs)",
                display: "flex",
              }}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
