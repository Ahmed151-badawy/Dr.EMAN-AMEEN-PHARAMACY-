import React, { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "default" | "subtle" | "interactive";
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = "default",
  style,
  className = "",
  ...props
}) => {
  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      boxShadow: "var(--shadow-card)",
    },
    subtle: {
      background: "var(--color-surface-subtle)",
      border: "1px solid var(--color-border-subtle)",
    },
    interactive: {
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      boxShadow: "var(--shadow-card)",
      cursor: "pointer",
    },
  };

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        padding: "1.25rem",
        transition: "transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast)",
        ...variantStyles[variant],
        ...style,
      }}
      className={`card ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
