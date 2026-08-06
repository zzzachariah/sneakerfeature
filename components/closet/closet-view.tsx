"use client";

// The shoe closet / rotation manager — a "display hall" of the pairs the
// member actually owns. Each premium skin renders the wall as a different
// physical space (see shelf-cell.tsx): a magazine sample rack (editorial), a
// row of floating glass pods (instrument), spotlit museum pedestals (gallery)
// or locker-room stalls (arena). The standard (no-skin) render stays in the
// site's plain card language.
//
// State lives here: the entry list (seeded from the server snapshot), the
// add / log-wear / edit sheets, and the Max analytics feed.

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Plus, ShoppingBag } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePremiumVariant } from "@/components/premium/variants";
import { PremiumMasthead } from "@/components/premium/page/premium-masthead";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { SignInValue } from "@/components/auth/sign-in-value";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { haptics } from "@/lib/native/haptics";
import { isPaidTier } from "@/lib/subscription/tiers";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { FREE_CLOSET_LIMIT, type ClosetItemRow } from "@/lib/closet/wear";
import { ShelfCell, type ClosetShoe } from "@/components/closet/shelf-cell";
import { AddShoeSheet, EditItemSheet, LogWearSheet } from "@/components/closet/closet-sheets";
import { ClosetAnalytics } from "@/components/closet/closet-analytics";
import { CourtSessionLauncher } from "@/components/closet/court-session-launcher";
import { SessionReceiptSheet } from "@/components/closet/session-receipt-sheet";

export type PickerShoe = {
  id: string;
  brand: string;
  shoe_name: string;
  image_url: string | null;
};

export type ClosetEntry = { item: ClosetItemRow; shoe: ClosetShoe };

const VARIANT_TITLE = {
  editorial: "The rotation",
  instrument: "Rotation console",
  gallery: "The collection",
  arena: "The locker room"
} as const;

export function ClosetView({
  initialEntries,
  picker,
  signedIn
}: {
  initialEntries: ClosetEntry[];
  picker: PickerShoe[];
  signedIn: boolean;
}) {
  const { translate } = useLocale();
  const variant = usePremiumVariant();
  const { tier } = useAuthState();

  const [entries, setEntries] = useState<ClosetEntry[]>(initialEntries);
  const [addOpen, setAddOpen] = useState(false);
  const [logTarget, setLogTarget] = useState<ClosetEntry | null>(null);
  const [editTarget, setEditTarget] = useState<ClosetEntry | null>(null);

  // The receipt for a finished run. Opened by ?session=<shoeId> — the one link
  // the Dynamic Island's farewell card and the in-app "已记录" confirmation both
  // point at, so there's a single way in from outside the page and from within.
  const router = useRouter();
  const searchParams = useSearchParams();
  const receiptShoeId = searchParams.get("session");
  const [receiptTarget, setReceiptTarget] = useState<ClosetEntry | null>(null);

  useEffect(() => {
    if (!receiptShoeId) return;
    const match = entries.find((e) => e.item.shoe_id === receiptShoeId) ?? null;
    setReceiptTarget(match);
  }, [receiptShoeId, entries]);

  const closeReceipt = useCallback(() => {
    setReceiptTarget(null);
    // Drop the param so a back-navigation (or a second visit) doesn't reopen a
    // receipt for a run the user already read.
    if (receiptShoeId) router.replace("/closet");
  }, [receiptShoeId, router]);

  const active = useMemo(() => entries.filter((e) => !e.item.retired), [entries]);
  const retired = useMemo(() => entries.filter((e) => e.item.retired), [entries]);

  const totals = useMemo(() => {
    const hours = active.reduce((s, e) => s + Number(e.item.play_hours), 0);
    const sessions = active.reduce((s, e) => s + e.item.sessions, 0);
    const invested = entries.reduce((s, e) => s + (Number(e.item.purchase_price) || 0), 0);
    return { hours, sessions, invested };
  }, [active, entries]);

  const atFreeLimit = !isPaidTier(tier) && entries.length >= FREE_CLOSET_LIMIT;
  const ownedIds = useMemo(() => new Set(entries.map((e) => e.item.shoe_id)), [entries]);

  const upsertEntry = useCallback((item: ClosetItemRow, shoe: ClosetShoe) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.item.shoe_id !== item.shoe_id);
      return [{ item, shoe }, ...next];
    });
  }, []);

  const patchEntry = useCallback((item: ClosetItemRow) => {
    setEntries((prev) => prev.map((e) => (e.item.shoe_id === item.shoe_id ? { ...e, item } : e)));
  }, []);

  const removeEntry = useCallback((shoeId: string) => {
    setEntries((prev) => prev.filter((e) => e.item.shoe_id !== shoeId));
  }, []);

  const openAdd = () => {
    haptics.selection();
    setAddOpen(true);
  };

  const title = variant === "standard" ? translate("My closet") : translate(VARIANT_TITLE[variant]);
  const subtitle =
    signedIn && active.length > 0
      ? `${active.length} ${translate(active.length === 1 ? "pair in rotation" : "pairs in rotation")}`
      : undefined;

  const addButton =
    signedIn && entries.length > 0 ? (
      <button
        type="button"
        onClick={openAdd}
        className={`tap-44 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.82rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.35)] ${
          variant === "standard"
            ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))] hover:opacity-90"
            : "pui-closet-add"
        }`}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {translate("Add a pair")}
      </button>
    ) : null;

  return (
    <main className={`container-shell has-mobile-nav-pad py-8 md:py-12 pui-closet pui-closet--${variant}`}>
      {variant === "standard" ? (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="t-eyebrow mb-2">{translate("Closet")}</p>
            <h1 className="t-display-sm" style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1.5 text-sm soft-text">{subtitle}</p>
            ) : null}
          </div>
          {addButton}
        </div>
      ) : (
        <>
          <PremiumMasthead
            variant={variant}
            kicker={translate("Closet")}
            title={title}
            subtitle={subtitle}
            meta={signedIn && totals.hours > 0 ? `${Math.round(totals.hours)}h` : undefined}
          />
          {addButton ? <div className="mb-6 -mt-2 flex justify-end">{addButton}</div> : null}
        </>
      )}

      {!signedIn ? (
        <EmptyState
          align="start"
          icon={ShoppingBag}
          title={translate("Keep your real rotation in one place")}
          description={translate(
            "Register the pairs you own, log your court time, and know exactly when a midsole is cooked — plus what every session really costs."
          )}
        >
          <div className="text-left">
            <SignInValue />
            <Link href={"/login?next=/closet" as Route} className="mt-5 block">
              <Button className="w-full rounded-xl">{translate("Log in")}</Button>
            </Link>
          </div>
        </EmptyState>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={translate("Your closet is empty")}
          description={translate("Add the pairs you actually hoop in to track wear, retirement and cost per run.")}
        >
          <Button className="w-full rounded-xl" onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            {translate("Add your first pair")}
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* The court timer sits above the summary, not inside a menu: it's
              the one action that lights up the Dynamic Island, so it gets the
              first slab on the page. */}
          <CourtSessionLauncher entries={entries} />

          {/* Wall summary strip */}
          <div className={`pui-closet-stats mb-6 ${variant === "standard" ? "glass-lite rounded-2xl" : ""}`}>
            <StatCell label={translate("In rotation")} value={String(active.length)} />
            <StatCell label={translate("Court hours")} value={`${Math.round(totals.hours * 10) / 10}h`} />
            <StatCell label={translate("Sessions")} value={String(totals.sessions)} />
            <StatCell
              label={translate("Invested")}
              value={totals.invested > 0 ? `¥${Math.round(totals.invested)}` : "—"}
            />
          </div>

          {atFreeLimit && SUBSCRIBE_LIVE ? (
            <Link
              href={"/subscribe" as Route}
              className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--brand)/0.4)] bg-[rgb(var(--brand)/0.08)] p-3.5 text-sm transition hover:bg-[rgb(var(--brand)/0.12)]"
            >
              <span>
                {translate("Free plan holds up to 3 pairs. Upgrade for an unlimited closet.")}
              </span>
              <span className="shrink-0 rounded-full bg-[rgb(var(--brand))] px-3 py-1 text-[0.72rem] font-bold text-[rgb(var(--brand-contrast))]">
                {translate("Upgrade")}
              </span>
            </Link>
          ) : null}

          <ul className="pui-closet-wall">
            {active.map((entry, i) => (
              <Reveal as="li" key={entry.item.shoe_id} index={i} rootMargin="120px 0px">
                <ShelfCell
                  entry={entry}
                  index={i}
                  variant={variant}
                  onLogWear={() => {
                    haptics.selection();
                    setLogTarget(entry);
                  }}
                  onEdit={() => {
                    haptics.selection();
                    setEditTarget(entry);
                  }}
                />
              </Reveal>
            ))}
          </ul>

          {retired.length > 0 ? (
            <section className="mt-10">
              <div className="mb-4 flex items-center gap-2">
                <Archive className="h-4 w-4 soft-text" aria-hidden />
                <h2 className="text-xs font-medium uppercase tracking-[0.18em] soft-text">
                  {translate("Retired")} · <span className="num-display">{retired.length}</span>
                </h2>
              </div>
              <ul className="pui-closet-wall is-retired">
                {retired.map((entry, i) => (
                  <Reveal as="li" key={entry.item.shoe_id} index={i} rootMargin="120px 0px">
                    <ShelfCell
                      entry={entry}
                      index={i}
                      variant={variant}
                      onLogWear={() => {
                        haptics.selection();
                        setLogTarget(entry);
                      }}
                      onEdit={() => {
                        haptics.selection();
                        setEditTarget(entry);
                      }}
                    />
                  </Reveal>
                ))}
              </ul>
            </section>
          ) : null}

          <ClosetAnalytics entries={entries} tier={tier} variant={variant} />
        </>
      )}

      <AddShoeSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        picker={picker}
        ownedIds={ownedIds}
        atFreeLimit={atFreeLimit}
        onAdded={upsertEntry}
      />
      <LogWearSheet
        entry={logTarget}
        onClose={() => setLogTarget(null)}
        onLogged={patchEntry}
      />
      <SessionReceiptSheet entry={receiptTarget} onClose={closeReceipt} />

      <EditItemSheet
        entry={editTarget}
        onClose={() => setEditTarget(null)}
        onPatched={patchEntry}
        onRemoved={removeEntry}
      />
    </main>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="pui-closet-stat">
      <span className="pui-closet-stat-v num-display">{value}</span>
      <span className="pui-closet-stat-k">{label}</span>
    </div>
  );
}
