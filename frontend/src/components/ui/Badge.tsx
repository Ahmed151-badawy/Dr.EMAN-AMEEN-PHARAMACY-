import React, { ReactNode } from "react";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  icon?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = "neutral", icon, className = "", style }) => {
  return (
    <span className={`badge badge-${variant} ${className}`} style={style}>
      {icon}
      {children}
    </span>
  );
};
