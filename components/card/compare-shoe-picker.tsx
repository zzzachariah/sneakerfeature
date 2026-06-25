"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Shoe } from "@/lib/types";

type Props = {
  open: boolean;
  shoes: Shoe[];
  max: number;
  onCancel: () => void;
  onConfirm: (shoes: Shoe[]) => void;
};

export function CompareShoePicker({ open, shoes, max, onCancel, onConfirm }: Props) {
  const { translate } = useLocale();
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(new Set(shoes.slice(0, max).map((s) => s.id)));
    }
  }, [open, shoes, max]);

  if (!mounted || !open) return null;

  const atCap = selected.size >= max;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < max) {
        next.add(id);
      }
      return next;
    });
  }

  function handleConfirm() {
    if (selected.size === 0) return;
    const ordered = shoes.filter((s) => selected.has(s.id));
    onConfirm(ordered);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-[rgb(0_0_0/0.55)] md:items-center"
      style={{ padding: "max(1rem, var(--safe-top)) 1rem max(1rem, var(--safe-bottom))" }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal
        className="surface-card premium-border ios-glass-compare-picker flex w-full max-w-xl flex-col overflow-hidden rounded-3xl shadow-[0_30px_72px_rgb(var(--glass-shadow)/0.42)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <p className="t-eyebrow">{translate("Share card")}</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
              {translate("Pick up to")} {max} {translate("shoes")}
            </h2>
            <p className="mt-1 text-xs soft-text">
              {translate("Comparison cards fit at most")} {max} {translate("shoes.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[rgb(var(--muted)/0.5)] p-2 soft-text transition hover:border-[rgb(var(--text)/0.45)] hover:text-[rgb(var(--text))]"
            aria-label={translate("Close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 max-h-[60vh] overflow-y-auto px-6 pb-2">
          <ul className="divide-y divide-[rgb(var(--muted)/0.18)]">
            {shoes.map((shoe) => {
              const checked = selected.has(shoe.id);
              const disabled = !checked && atCap;
              return (
                <li key={shoe.id}>
                  <button
                    type="button"
                    onClick={() => toggle(shoe.id)}
                    aria-pressed={checked}
                    disabled={disabled}
                    className={`group flex w-full items-center gap-3 py-3 text-left transition ${
                      disabled ? "cursor-not-allowed opacity-40" : "hover:bg-[rgb(var(--surface)/0.4)]"
                    }`}
                  >
                    <ShoeImage
                      src={shoe.image_url}
                      alt={shoe.shoe_name}
                      fallbackLabel={translate("No image")}
                      variant="suggestion"
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="t-eyebrow">
                        {[shoe.brand, shoe.release_year].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold tracking-[-0.01em]">
                        {shoe.shoe_name}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                        checked
                          ? "border-[rgb(var(--text))] bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
                          : "border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--surface)/0.6)] soft-text group-hover:border-[rgb(var(--text)/0.45)]"
                      }`}
                    >
                      {checked ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[rgb(var(--muted)/0.25)] bg-[rgb(var(--bg-elev)/0.55)] px-6 py-4">
          <p className="text-xs soft-text">
            {selected.size} / {max} {translate("selected")}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 py-1.5 text-xs soft-text transition hover:border-[rgb(var(--text)/0.45)] hover:text-[rgb(var(--text))]"
            >
              {translate("Cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selected.size < 2}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--text))] bg-[rgb(var(--text))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--bg))] transition hover:shadow-[0_8px_24px_rgb(var(--shadow)/0.3)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {translate("Continue")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
