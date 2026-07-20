"use client";

// The closet's three action sheets: add a pair (search picker + purchase
// details), log a run (quick-hour chips + note), and edit / retire / remove.
// All three use the in-house glass BottomSheet; destructive confirms route
// through confirmDialog, which is the native Liquid Glass alert inside the iOS
// app and window.confirm on the web.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Check, Search, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { useLocale } from "@/components/i18n/locale-provider";
import { confirmDialog } from "@/components/native/native-menu";
import { haptics } from "@/lib/native/haptics";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import type { ClosetItemRow } from "@/lib/closet/wear";
import type { ClosetShoe } from "@/components/closet/shelf-cell";
import type { ClosetEntry, PickerShoe } from "@/components/closet/closet-view";
import { addToCloset, logWear, patchCloset, removeFromCloset } from "@/components/closet/closet-api";

const QUICK_HOURS = [1, 1.5, 2, 3];

function fieldClass(disabled?: boolean) {
  return `w-full rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-3 py-2 text-sm outline-none transition focus:border-[rgb(var(--text)/0.5)] ${disabled ? "opacity-50" : ""}`;
}

const LABEL_CLASS = "text-xs font-medium uppercase tracking-[0.18em] soft-text";

// --- Add a pair --------------------------------------------------------------

export function AddShoeSheet({
  open,
  onClose,
  picker,
  ownedIds,
  atFreeLimit,
  onAdded
}: {
  open: boolean;
  onClose: () => void;
  picker: PickerShoe[];
  ownedIds: Set<string>;
  atFreeLimit: boolean;
  onAdded: (item: ClosetItemRow, shoe: ClosetShoe) => void;
}) {
  const { translate } = useLocale();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PickerShoe | null>(null);
  const [sizeLabel, setSizeLabel] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
      setSizeLabel("");
      setPriceStr("");
      setDateStr("");
      setError(null);
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = picker.filter((s) => !ownedIds.has(s.id));
    if (!q) return pool.slice(0, 24);
    return pool
      .filter((s) => `${s.brand} ${s.shoe_name}`.toLowerCase().includes(q))
      .slice(0, 24);
  }, [picker, ownedIds, query]);

  async function handleAdd() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    const price = priceStr.trim() === "" ? null : Number(priceStr);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setError(translate("Please enter a valid price."));
      setBusy(false);
      return;
    }
    const res = await addToCloset({
      shoeId: selected.id,
      sizeLabel: sizeLabel.trim() || undefined,
      purchasePrice: price,
      purchasedAt: dateStr || null
    });
    setBusy(false);
    if (!res.ok) {
      haptics.error();
      setError(res.message ?? translate("Something went wrong."));
      return;
    }
    haptics.success();
    onAdded(res.item, selected);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={translate("Add a pair")}>
      {atFreeLimit && SUBSCRIBE_LIVE ? (
        <div className="space-y-4 pb-2">
          <p className="text-sm soft-text">
            {translate("Free plan holds up to 3 pairs. Upgrade for an unlimited closet.")}
          </p>
          <Link href={"/subscribe" as Route} className="block" onClick={onClose}>
            <Button className="w-full rounded-xl">{translate("See membership")}</Button>
          </Link>
        </div>
      ) : !selected ? (
        <div className="flex max-h-[60svh] flex-col gap-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 soft-text" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={translate("Search the database")}
              autoFocus
              className={`${fieldClass()} pl-9`}
            />
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setSelected(s);
                  }}
                  className="tap-44 flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-[rgb(var(--text)/0.06)]"
                >
                  <span className="h-12 w-14 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--bg-elev)/0.6)]">
                    <ShoeImage src={s.image_url ?? undefined} alt="" fallbackLabel={s.shoe_name} stage={false} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.shoe_name}</span>
                    <span className="block text-xs soft-text">{s.brand}</span>
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm soft-text">{translate("No shoes match your search.")}</li>
            ) : null}
          </ul>
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <div className="flex items-center gap-3 rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-3">
            <span className="h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--bg-elev)/0.6)]">
              <ShoeImage src={selected.image_url ?? undefined} alt="" fallbackLabel={selected.shoe_name} stage={false} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selected.shoe_name}</p>
              <p className="text-xs soft-text">{selected.brand}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="text-xs soft-text underline-offset-2 hover:underline">
              {translate("Change")}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className={LABEL_CLASS}>{translate("Size (optional)")}</label>
              <input
                type="text"
                value={sizeLabel}
                onChange={(e) => setSizeLabel(e.target.value)}
                placeholder="US 9.5"
                maxLength={20}
                disabled={busy}
                className={fieldClass(busy)}
              />
            </div>
            <div className="space-y-1">
              <label className={LABEL_CLASS}>{translate("Price paid (optional)")}</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                placeholder="899"
                disabled={busy}
                className={fieldClass(busy)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={LABEL_CLASS}>{translate("Purchase date (optional)")}</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              disabled={busy}
              className={fieldClass(busy)}
            />
          </div>

          {error ? <FeedbackMessage message={error} isError /> : null}

          <Button className="w-full rounded-xl" onClick={handleAdd} disabled={busy}>
            <Check className="mr-1 h-4 w-4" aria-hidden />
            {busy ? translate("Saving...") : translate("Add to closet")}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}

// --- Log a run ---------------------------------------------------------------

export function LogWearSheet({
  entry,
  onClose,
  onLogged
}: {
  entry: ClosetEntry | null;
  onClose: () => void;
  onLogged: (item: ClosetItemRow) => void;
}) {
  const { translate } = useLocale();
  const [hours, setHours] = useState<number>(2);
  const [customStr, setCustomStr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = entry !== null;

  useEffect(() => {
    if (open) {
      setHours(2);
      setCustomStr("");
      setNote("");
      setError(null);
    }
  }, [open]);

  const effective = customStr.trim() === "" ? hours : Number(customStr);

  async function handleLog() {
    if (!entry || busy) return;
    if (!Number.isFinite(effective) || effective <= 0 || effective > 24) {
      setError(translate("Please enter a valid duration."));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await logWear({
      shoeId: entry.item.shoe_id,
      hours: effective,
      note: note.trim() || undefined
    });
    setBusy(false);
    if (!res.ok) {
      haptics.error();
      setError(res.message ?? translate("Something went wrong."));
      return;
    }
    haptics.success();
    if (res.item) onLogged(res.item);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={translate("Log a run")}>
      {entry ? (
        <div className="space-y-4 pb-2">
          <p className="text-sm soft-text">
            {entry.shoe.shoe_name} · <span className="num-display">{Math.round(Number(entry.item.play_hours) * 10) / 10}h</span>{" "}
            {translate("logged so far")}
          </p>

          <div className="space-y-1.5">
            <label className={LABEL_CLASS}>{translate("How long was the session?")}</label>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_HOURS.map((h) => {
                const active = customStr.trim() === "" && hours === h;
                return (
                  <button
                    key={h}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      haptics.selection();
                      setHours(h);
                      setCustomStr("");
                    }}
                    className={`tap-44 rounded-2xl border px-2 py-2.5 text-center text-[0.85rem] font-medium transition disabled:opacity-50 ${
                      active
                        ? "border-[rgb(var(--brand)/0.6)] bg-[rgb(var(--brand)/0.12)] text-[rgb(var(--text))]"
                        : "border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.4)] soft-text hover:border-[rgb(var(--text)/0.4)]"
                    }`}
                  >
                    <span className="num-display">{h}</span>h
                  </button>
                );
              })}
            </div>
            <input
              type="number"
              inputMode="decimal"
              min={0.25}
              max={24}
              step={0.25}
              value={customStr}
              onChange={(e) => setCustomStr(e.target.value)}
              placeholder={translate("Custom hours")}
              disabled={busy}
              className={fieldClass(busy)}
            />
          </div>

          <div className="space-y-1">
            <label className={LABEL_CLASS}>{translate("Note (optional)")}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder={translate("Full court, outdoor …")}
              disabled={busy}
              className={fieldClass(busy)}
            />
          </div>

          {error ? <FeedbackMessage message={error} isError /> : null}

          <Button className="w-full rounded-xl" onClick={handleLog} disabled={busy}>
            <Check className="mr-1 h-4 w-4" aria-hidden />
            {busy ? translate("Saving...") : translate("Log it")}
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}

// --- Edit / retire / remove --------------------------------------------------

export function EditItemSheet({
  entry,
  onClose,
  onPatched,
  onRemoved
}: {
  entry: ClosetEntry | null;
  onClose: () => void;
  onPatched: (item: ClosetItemRow) => void;
  onRemoved: (shoeId: string) => void;
}) {
  const { translate } = useLocale();
  const [sizeLabel, setSizeLabel] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = entry !== null;

  useEffect(() => {
    if (entry) {
      setSizeLabel(entry.item.size_label ?? "");
      setPriceStr(entry.item.purchase_price != null ? String(entry.item.purchase_price) : "");
      setDateStr(entry.item.purchased_at ?? "");
      setError(null);
    }
  }, [entry]);

  async function handleSave() {
    if (!entry || busy) return;
    const price = priceStr.trim() === "" ? null : Number(priceStr);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setError(translate("Please enter a valid price."));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await patchCloset({
      shoeId: entry.item.shoe_id,
      sizeLabel: sizeLabel.trim() || null,
      purchasePrice: price,
      purchasedAt: dateStr || null
    });
    setBusy(false);
    if (!res.ok) {
      haptics.error();
      setError(res.message ?? translate("Something went wrong."));
      return;
    }
    haptics.success();
    if (res.item) onPatched(res.item);
    onClose();
  }

  async function handleRetireToggle() {
    if (!entry || busy) return;
    setBusy(true);
    const res = await patchCloset({ shoeId: entry.item.shoe_id, retired: !entry.item.retired });
    setBusy(false);
    if (!res.ok) {
      haptics.error();
      setError(res.message ?? translate("Something went wrong."));
      return;
    }
    haptics.gesture();
    if (res.item) onPatched(res.item);
    onClose();
  }

  async function handleRemove() {
    if (!entry || busy) return;
    const yes = await confirmDialog({
      title: translate("Remove from closet"),
      message: translate("This clears its wear history too. Remove this pair?"),
      okLabel: translate("Remove"),
      cancelLabel: translate("Cancel"),
      destructive: true
    });
    if (!yes) return;
    setBusy(true);
    const res = await removeFromCloset(entry.item.shoe_id);
    setBusy(false);
    if (!res.ok) {
      haptics.error();
      setError(res.message ?? translate("Something went wrong."));
      return;
    }
    haptics.success();
    onRemoved(entry.item.shoe_id);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={entry ? entry.shoe.shoe_name : undefined}>
      {entry ? (
        <div className="space-y-4 pb-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className={LABEL_CLASS}>{translate("Size")}</label>
              <input
                type="text"
                value={sizeLabel}
                onChange={(e) => setSizeLabel(e.target.value)}
                maxLength={20}
                placeholder="US 9.5"
                disabled={busy}
                className={fieldClass(busy)}
              />
            </div>
            <div className="space-y-1">
              <label className={LABEL_CLASS}>{translate("Price paid")}</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                placeholder="899"
                disabled={busy}
                className={fieldClass(busy)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={LABEL_CLASS}>{translate("Purchase date")}</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              disabled={busy}
              className={fieldClass(busy)}
            />
          </div>

          {error ? <FeedbackMessage message={error} isError /> : null}

          <div className="flex flex-col gap-2">
            <Button className="w-full rounded-xl" onClick={handleSave} disabled={busy}>
              <Check className="mr-1 h-4 w-4" aria-hidden />
              {busy ? translate("Saving...") : translate("Save changes")}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" className="w-full rounded-xl" onClick={handleRetireToggle} disabled={busy}>
                {translate(entry.item.retired ? "Back in rotation" : "Retire this pair")}
              </Button>
              <Button
                variant="ghost"
                className="w-full rounded-xl text-[rgb(var(--error))]"
                onClick={handleRemove}
                disabled={busy}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                {translate("Remove")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
