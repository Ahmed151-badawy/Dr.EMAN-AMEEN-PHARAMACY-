import React, { useState } from "react";
import logoImg from "../../assets/logo.png";

interface PharmacyLogoProps {
  size?: number;
  showText?: boolean;
  collapsed?: boolean;
}

export const PharmacyLogo: React.FC<PharmacyLogoProps> = ({
  size = 40,
  showText = true,
  collapsed = false,
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: "transparent",
        }}
      >
        {!imgError ? (
          <img
            src={logoImg}
            alt="Dr. Eman Ameen Pharmacy"
            onError={() => setImgError(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "var(--radius-md)",
              background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              boxShadow: "0 4px 12px -2px rgba(20, 145, 155, 0.35)",
            }}
          >
            <svg
              width={size * 0.6}
              height={size * 0.6}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v20M2 12h20" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.4" />
            </svg>
          </div>
        )}
      </div>

      {showText && !collapsed && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: "1.05rem",
              color: "var(--color-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            Dr. Eman Ameen
          </span>
          <span
            style={{
              fontWeight: 600,
              fontSize: "0.75rem",
              color: "var(--color-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Pharmacy OS
          </span>
        </div>
      )}
    </div>
  );
};
