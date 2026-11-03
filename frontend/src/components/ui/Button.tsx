import React, { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost" | "success";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  style,
  ...props
}) => {
  const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
    sm: { padding: "0.375rem 0.75rem", fontSize: "0.8rem", borderRadius: "var(--radius-sm)", height: "32px" },
    md: { padding: "0.625rem 1.125rem", fontSize: "0.875rem", borderRadius: "var(--radius-md)", height: "42px" },
    lg: { padding: "0.75rem 1.5rem", fontSize: "1rem", borderRadius: "var(--radius-md)", height: "48px" },
  };

  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background: "var(--color-primary)",
      color: "var(--color-text-inverse)",
      boxShadow: "0 2px 6px rgba(12, 74, 96, 0.2)",
    },
    secondary: {
      background: "var(--color-secondary)",
      color: "var(--color-text-inverse)",
      boxShadow: "0 2px 6px rgba(20, 145, 155, 0.2)",
    },
    outline: {
      background: "transparent",
      color: "var(--color-primary)",
      border: "1.5px solid var(--color-border)",
    },
    danger: {
      background: "var(--color-danger)",
      color: "var(--color-text-inverse)",
      boxShadow: "0 2px 6px rgba(239, 68, 68, 0.2)",
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text)",
    },
    success: {
      background: "var(--color-success)",
      color: "var(--color-text-inverse)",
      boxShadow: "0 2px 6px rgba(16, 185, 129, 0.2)",
    },
  };

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    fontWeight: 600,
    cursor: disabled || isLoading ? "not-allowed" : "pointer",
    opacity: disabled || isLoading ? 0.65 : 1,
    width: fullWidth ? "100%" : "auto",
    userSelect: "none",
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...style,
  };

  return (
    <button disabled={disabled || isLoading} style={baseStyle} {...props}>
      {isLoading && <Loader2 size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />}
      {!isLoading && leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
};
