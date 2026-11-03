import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { medicinesApi } from "../../services/api/medicines";
import { Medicine } from "../../types";

interface MedicineSearchSelectProps {
  /** Currently selected medicine id ("" = nothing selected). */
  value: string;
  onSelect: (medicine: Medicine) => void;
  placeholder?: string;
}

/**
 * Searchable medicine picker. Instead of loading a fixed list into a <select>,
 * it asks the server (GET /medicines?q=...) as the user types, so every
 * medicine in the catalog is reachable by English name, Arabic name,
 * generic name, barcode or SKU.
 */
export const MedicineSearchSelect: React.FC<MedicineSearchSelectProps> = ({
  value,
  onSelect,
  placeholder,
}) => {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  // Clear the box when the parent resets the row
  useEffect(() => {
    if (!value) setText("");
  }, [value]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(text.trim()), 250);
    return () => window.clearTimeout(id);
  }, [text]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["medicines", "searchPicker", debounced],
    queryFn: () =>
      medicinesApi.list({
        q: debounced || undefined,
        active_only: true,
        limit: 30,
      }),
    enabled: open,
    staleTime: 30_000,
  });

  const choose = (m: Medicine) => {
    onSelect(m);
    setText(m.name);
    setOpen(false);
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={text}
        placeholder={placeholder}
        onFocus={() => {
          window.clearTimeout(closeTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          closeTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault(); // never submit the purchase form from here
            if (results && results.length > 0) choose(results[0]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        autoComplete="off"
        style={{
          width: "100%",
          padding: "0.5rem",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text)",
          fontSize: "0.85rem",
        }}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            insetInlineStart: 0,
            insetInlineEnd: 0,
            zIndex: 50,
            maxHeight: "240px",
            overflowY: "auto",
            marginTop: "2px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-xl)",
          }}
        >
          {isFetching && !results && (
            <div style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>…</div>
          )}
          {results && results.length === 0 && (
            <div style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>—</div>
          )}
          {results?.map((m) => (
            <div
              key={m.id}
              // onMouseDown fires before the input's blur, so the click isn't lost
              onMouseDown={(e) => {
                e.preventDefault();
                choose(m);
              }}
              style={{
                padding: "0.45rem 0.6rem",
                fontSize: "0.85rem",
                cursor: "pointer",
                background: m.id === value ? "var(--color-surface-subtle)" : "transparent",
                borderBottom: "1px solid var(--color-border-subtle)",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{m.name}</div>
              {(m.name_ar || m.strength) && (
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  {[m.name_ar, m.strength].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
