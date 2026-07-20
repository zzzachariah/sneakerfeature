"use client";

// The Pro deep questionnaire's injury-history block inside the player-profile
// modal. Members on a paid tier pick the areas they want the matcher to protect
// (each maps to a protective scoring dimension in lib/match/score.ts); free
// members see a locked teaser that deep-links to /subscribe.
//
// Per-skin design languages (matching the premium variant system):
//   • Editorial — "the trainer's notes": a paper slip with serif ink entries
//     and a gold rule, checked items pressed in navy ink.
//   • Instrument — "body diagnostics": a console panel with corner brackets;
//     each area is a toggle row with a status lamp and an [ARMED] readout.
//   • Gallery — "the condition index": hairline rules, numbered entries,
//     tracked micro-captions; selected rows carry a platinum point.
//   • Arena — "injury report": a broadcast strip of badge-chips; protected
//     areas flip to gold with a PROTECT tag.
// The standard (no-skin) render matches the rest of the modal untouched.

import Link from "next/link";
import { Lock, ShieldPlus } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePremiumVariant, type PremiumVariant } from "@/components/premium/variants";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { INJURY_HINT, INJURY_KEYS, INJURY_LABEL, type InjuryKey } from "@/lib/persona/types";

const VARIANT_TITLE: Record<Exclude<PremiumVariant, "standard">, string> = {
  editorial: "The trainer's notes",
  instrument: "Body diagnostics",
  gallery: "The condition index",
  arena: "Injury report"
};

export function InjurySection({
  picks,
  onToggle,
  disabled,
  gated
}: {
  picks: InjuryKey[];
  onToggle: (key: InjuryKey) => void;
  disabled: boolean;
  /** True when the member's tier may edit the questionnaire (Pro/Max). */
  gated: boolean;
}) {
  const { translate } = useLocale();
  const variant = usePremiumVariant();

  if (!gated) {
    if (!SUBSCRIBE_LIVE) return null;
    return (
      <div className="space-y-2 border-t border-[rgb(var(--muted)/0.25)] pt-3">
        <SectionHeader variant="standard" locked />
        <Link
          href="/subscribe"
          className="group flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[rgb(var(--muted)/0.6)] bg-[rgb(var(--bg-elev)/0.4)] p-3 transition hover:border-[rgb(var(--brand)/0.5)] hover:bg-[rgb(var(--brand)/0.06)]"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--brand)/0.12)] text-[rgb(var(--brand))]">
              <ShieldPlus className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium">{translate("Tell us your injury history")}</span>
              <span className="text-[0.7rem] soft-text">
                {translate("Pro members get protective weighting — shoes that guard your ankles, knees and more.")}
              </span>
            </span>
          </span>
          <Lock className="h-4 w-4 soft-text" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className={`space-y-2 border-t border-[rgb(var(--muted)/0.25)] pt-3 pui-inj pui-inj--${variant}`}>
      <SectionHeader variant={variant} locked={false} />

      {variant === "gallery" ? (
        <div className="pui-inj-list">
          {INJURY_KEYS.map((key, i) => {
            const active = picks.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggle(key)}
                disabled={disabled}
                aria-pressed={active}
                className={`pui-inj-row${active ? " is-on" : ""}`}
              >
                <span className="pui-inj-idx">{String(i + 1).padStart(2, "0")}</span>
                <span className="pui-inj-name">{translate(INJURY_LABEL[key])}</span>
                <span className="pui-inj-dot" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : variant === "instrument" ? (
        <div className="pui-inj-panel">
          {INJURY_KEYS.map((key) => {
            const active = picks.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggle(key)}
                disabled={disabled}
                aria-pressed={active}
                className={`pui-inj-row${active ? " is-on" : ""}`}
              >
                <span className="pui-inj-lamp" aria-hidden />
                <span className="pui-inj-name">{translate(INJURY_LABEL[key])}</span>
                <span className="pui-inj-read">{active ? "[ARMED]" : "[ -- ]"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={variant === "standard" ? "grid grid-cols-2 gap-2" : "pui-inj-grid"}>
          {INJURY_KEYS.map((key) => {
            const active = picks.includes(key);
            if (variant === "standard") {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onToggle(key)}
                  disabled={disabled}
                  aria-pressed={active}
                  className={`rounded-2xl border px-2 py-2.5 text-center text-[0.8rem] font-medium transition disabled:opacity-50 ${
                    active
                      ? "border-[rgb(var(--brand)/0.6)] bg-[rgb(var(--brand)/0.12)] text-[rgb(var(--text))]"
                      : "border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.4)] soft-text hover:border-[rgb(var(--text)/0.4)]"
                  }`}
                >
                  {translate(INJURY_LABEL[key])}
                </button>
              );
            }
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggle(key)}
                disabled={disabled}
                aria-pressed={active}
                className={`pui-inj-chip${active ? " is-on" : ""}`}
              >
                {variant === "editorial" && <span className="pui-inj-mark" aria-hidden>{active ? "✓" : "○"}</span>}
                <span className="pui-inj-name">{translate(INJURY_LABEL[key])}</span>
                {variant === "arena" && active && <span className="pui-inj-tag">{translate("Protect")}</span>}
              </button>
            );
          })}
        </div>
      )}

      {picks.length > 0 && (
        <p className="text-[0.7rem] soft-text">
          {picks.map((k) => translate(INJURY_HINT[k])).join(" · ")}
        </p>
      )}
    </div>
  );
}

function SectionHeader({ variant, locked }: { variant: PremiumVariant; locked: boolean }) {
  const { translate } = useLocale();
  const title =
    variant === "standard" ? translate("Injury history") : translate(VARIANT_TITLE[variant]);
  return (
    <div className="flex items-center justify-between">
      <label className={`text-xs font-medium uppercase tracking-[0.18em] soft-text${variant !== "standard" ? " pui-inj-title" : ""}`}>
        {title}
        <span className="pui-inj-pro ml-2 inline-flex items-center rounded-full border border-[rgb(var(--brand)/0.45)] bg-[rgb(var(--brand)/0.12)] px-1.5 py-0.5 text-[0.58rem] font-bold tracking-widest text-[rgb(var(--brand))]">
          PRO
        </span>
      </label>
      {!locked && <span className="text-[0.7rem] soft-text">{translate("Optional — pick what applies")}</span>}
    </div>
  );
}
