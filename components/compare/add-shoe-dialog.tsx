"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Shoe } from "@/lib/types";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { normalizeSearchText, rankShoeMatch } from "@/lib/search/shoe-search";
import { useLocale } from "@/components/i18n/locale-provider";
import { DynamicTranslatedText } from "@/components/i18n/dynamic-translated-text";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";

const MAX_RESULTS = 20;

type Props = {
  open: boolean;
  onClose: () => void;
  shoes: Shoe[];
  selectedIds: Set<string>;
  remainingSlots: number;
  onConfirm: (ids: string[]) => void;
};

export function AddShoeDialog({ open, onClose, shoes, selectedIds, remainingSlots, onConfirm }: Props) {
  const { translate } = useLocale();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [mounted, setMounted] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  useBodyScrollLock(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setPendingIds(new Set());
      setQuery("");
      setBrand("");
      setCategory("");
    }
  }, [open]);

  const brands = useMemo(() => Array.from(new Set(shoes.map((s) => s.brand).filter(Boolean))).sort(), [shoes]);
  const categories = useMemo(
    () => Array.from(new Set(shoes.map((s) => s.category).filter(Boolean) as string[])).sort(),
    [shoes]
  );

  const normBrand = normalizeSearchText(brand);
  const normCategory = normalizeSearchText(category);

  const results = useMemo(() => {
    return shoes
      .filter((shoe) => !selectedIds.has(shoe.id))
      .map((shoe) => ({ shoe, score: rankShoeMatch(shoe, query) }))
      .filter(({ shoe, score }) => {
        if (query && score < 0) return false;
        if (normBrand && normalizeSearchText(shoe.brand) !== normBrand) return false;
        if (normCategory && normalizeSearchText(shoe.category) !== normCategory) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((entry) => entry.shoe);
  }, [shoes, selectedIds, query, normBrand, normCategory]);

  if (!mounted) return null;

  const pendingCount = pendingIds.size;
  const atCap = pendingCount >= remainingSlots;

  function togglePending(id: string) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < remainingSlots) {
        next.add(id);
      }
      return next;
    });
  }

  function handleConfirm() {
    if (pendingCount === 0) return;
    onConfirm(Array.from(pendingIds));
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgb(var(--glass-overlay)/0.45)] backdrop-blur-[16px] md:items-center"
          style={{ padding: "max(1rem, var(--top-nav-h)) 1rem max(1rem, var(--mobile-nav-h))" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal
            className="glass-strong glass-rim glass-clip liquid-interactive relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-3xl"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-6 pt-6">
              <div>
                <p className="t-eyebrow">{translate("Add to compare")}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">{translate("Pick shoes")}</h2>
                <p className="mt-1 text-xs soft-text">
                  {translate("Select up to")} {remainingSlots} {remainingSlots === 1 ? translate("more shoe") : translate("more shoes")}.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="relative tap-44 rounded-lg border border-[rgb(var(--muted)/0.5)] p-2 soft-text transition hover:border-[rgb(var(--text)/0.45)] hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)]"
                aria-label={translate("Close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 px-6 pt-4 md:grid-cols-[1fr_160px_160px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 soft-text" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={translate("Name, tags, tech…")}
                  className="pl-9"
                  autoFocus
                />
              </label>
              <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">{translate("All brands")}</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{translate("All categories")}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-4 max-h-[55vh] flex-1 overflow-y-auto px-6 pb-4">
              {results.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.35)] py-8 text-center">
                  <p className="text-sm font-medium">{translate("No shoes found")}</p>
                  <p className="mt-1 text-xs soft-text">
                    {translate("Try broader keywords or remove one filter.")}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[rgb(var(--muted)/0.18)]">
                  {results.map((shoe) => {
                    const checked = pendingIds.has(shoe.id);
                    const disabled = !checked && atCap;
                    return (
                      <li key={shoe.id}>
                        <button
                          type="button"
                          onClick={() => togglePending(shoe.id)}
                          aria-pressed={checked}
                          disabled={disabled}
                          className={`group flex w-full items-center gap-3 py-3 text-left transition focus-visible:outline-none focus-visible:bg-[rgb(var(--surface)/0.55)] ${
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
                              {shoe.brand}
                              {shoe.category ? (
                                <>
                                  {" · "}
                                  <DynamicTranslatedText as="span" text={shoe.category} contentType="descriptive" />
                                </>
                              ) : null}
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold tracking-[-0.01em]">{shoe.shoe_name}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {(shoe.spec.tags ?? []).slice(0, 3).map((tag) => (
                                <Badge key={tag}>
                                  <DynamicTranslatedText as="span" text={tag} contentType="descriptive" />
                                </Badge>
                              ))}
                            </div>
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
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[rgb(var(--muted)/0.25)] bg-[rgb(var(--bg-elev)/0.55)] px-6 py-4">
              <p className="text-xs soft-text">
                {pendingCount > 0
                  ? `${pendingCount} ${pendingCount === 1 ? translate("shoe selected") : translate("shoes selected")}`
                  : translate("No shoes selected yet")}
                {atCap ? <span className="ml-2 text-[rgb(var(--text)/0.7)]">· {translate("max reached")}</span> : null}
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={onClose} className="px-3 text-xs">
                  {translate("Cancel")}
                </Button>
                <Button type="button" onClick={handleConfirm} disabled={pendingCount === 0} className="px-3 text-xs">
                  {pendingCount > 0
                    ? `${translate("Add")} ${pendingCount} ${pendingCount === 1 ? translate("shoe") : translate("shoes")}`
                    : translate("Add shoes")}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
