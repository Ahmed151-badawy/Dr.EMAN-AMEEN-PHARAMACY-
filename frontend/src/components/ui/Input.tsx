import React, { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, fullWidth = true, style, ...props }, ref) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", width: fullWidth ? "100%" : "auto" }}>
        {label && (
          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)" }}>
            {label}
          </label>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            position: "relative",
            background: "var(--color-surface)",
            border: `1.5px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
            borderRadius: "var(--radius-md)",
            transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
            overflow: "hidden",
          }}
        >
          {leftIcon && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                paddingInlineStart: "0.875rem",
                color: "var(--color-text-muted)",
              }}
            >
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              padding: "0.625rem 0.875rem",
              fontSize: "0.9rem",
              color: "var(--color-text)",
              outline: "none",
              width: "100%",
              fontFamily: "inherit",
              ...style,
            }}
            {...props}
          />
          {rightIcon && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                paddingInlineEnd: "0.875rem",
                color: "var(--color-text-muted)",
              }}
            >
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <span style={{ fontSize: "0.75rem", color: "var(--color-danger)", fontWeight: 500 }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);
