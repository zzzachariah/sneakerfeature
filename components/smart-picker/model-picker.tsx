"use client";

// Model selector for the Smart Picker. EVERY tier sees the full model list;
// models the current plan can't run are grayed out with a lock + "Pro" tag and
// deep-link to the subscribe page, so the upgrade path is discoverable exactly
// where the limitation bites. Inside the iOS app the list presents as a 100%
// native Liquid Glass options sheet (UIGlassEffect) via the native-chrome
// plugin; web and Android get the in-house glass BottomSheet.

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Cpu, Lock, Rabbit, Sparkles, Zap } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { nativeMenuAvailable, presentNativeOptions } from "@/components/native/native-menu";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import {
  MODEL_IDS,
  PICKER_MODELS,
  isModelId,
  pickerModelInfo,
  tierSupportsModel,
  type ModelId,
  type Tier
} from "@/lib/subscription/tiers";

const MODEL_ICONS: Record<ModelId, typeof Sparkles> = {
  [MODEL_IDS.haiku]: Rabbit,
  [MODEL_IDS.deepseek]: Zap,
  [MODEL_IDS.fable]: Sparkles
};

type Props = {
  tier: Tier;
  /** Effective current selection; null until /api/ai/credits loads. */
  model: ModelId | null;
  onSelect: (id: ModelId) => void;
};

export function ModelPicker({ tier, model, onSelect }: Props) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const [sheetOpen, setSheetOpen] = useState(false);

  const current = model ? pickerModelInfo(model) : null;
  const CurrentIcon = model ? MODEL_ICONS[model] : Cpu;
  const title = zh ? "选择 AI 模型" : "Choose AI model";

  const choose = (id: ModelId) => {
    if (!tierSupportsModel(tier, id) || id === model) return;
    haptics.selection();
    onSelect(id);
  };

  const openPicker = async () => {
    haptics.selection();
    if (nativeMenuAvailable()) {
      // iOS app: real native Liquid Glass sheet with grayed-out locked rows.
      const key = await presentNativeOptions(
        PICKER_MODELS.map((m) => {
          const supported = tierSupportsModel(tier, m.id);
          return {
            key: m.id,
            label: m.name,
            subtitle: zh ? m.taglineZh : m.tagline,
            symbol: m.symbol,
            checked: m.id === model,
            disabled: !supported,
            tag: supported ? undefined : zh ? "Pro 会员" : "Pro"
          };
        }),
        { title }
      );
      if (key && isModelId(key)) choose(key);
      return;
    }
    setSheetOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void openPicker()}
        disabled={!model}
        aria-label={current ? `${title} — ${current.name}` : title}
        aria-haspopup="dialog"
        className="tap-44 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] px-2.5 text-[0.78rem] font-medium transition hover:bg-[rgb(var(--text)/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] disabled:cursor-default min-[480px]:px-3"
      >
        <CurrentIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "rgb(var(--brand))" }} aria-hidden />
        {/* On narrow phones the name yields its space to the textarea — the
            per-model brand-tinted icon still identifies the choice. */}
        {current ? (
          <span className="hidden max-w-[7rem] truncate min-[480px]:inline">{current.name}</span>
        ) : (
          <span aria-hidden className="skeleton hidden h-3.5 w-12 min-[480px]:inline-block" />
        )}
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      </button>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={title}>
        <div className="flex flex-col gap-2 pb-2">
          {PICKER_MODELS.map((m) => {
            const supported = tierSupportsModel(tier, m.id);
            const selected = m.id === model;
            const Icon = MODEL_ICONS[m.id];
            const row = (
              <>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={
                    m.premium
                      ? {
                          background: "linear-gradient(135deg, rgba(217,180,90,0.22), rgba(217,180,90,0.08))",
                          color: "rgb(var(--gold-ink))"
                        }
                      : { background: "rgb(var(--text)/0.06)", color: "rgb(var(--text))" }
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold">{m.name}</span>
                  <span className="block truncate text-xs soft-text">{zh ? m.taglineZh : m.tagline}</span>
                </span>
                {selected ? (
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--brand))] text-[rgb(var(--brand-contrast,255_255_255))]"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : !supported ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.66rem] font-bold uppercase tracking-wide"
                    style={{ color: "rgb(var(--gold-ink))", borderColor: "rgba(217,180,90,0.5)" }}
                  >
                    <Lock className="h-3 w-3" aria-hidden />
                    Pro
                  </span>
                ) : null}
              </>
            );
            const base = "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 transition";
            if (supported) {
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    choose(m.id);
                    setSheetOpen(false);
                  }}
                  aria-pressed={selected}
                  className={`${base} ${
                    selected
                      ? "border-[rgb(var(--brand))] bg-[rgb(var(--brand)/0.08)]"
                      : "border-[rgb(var(--glass-stroke-soft)/0.5)] hover:border-[rgb(var(--text)/0.3)] hover:bg-[rgb(var(--text)/0.04)]"
                  }`}
                >
                  {row}
                </button>
              );
            }
            // Locked: grayed out; tapping leads to the upgrade page (when live).
            const lockedClass = `${base} border-[rgb(var(--glass-stroke-soft)/0.4)] opacity-55`;
            return SUBSCRIBE_LIVE ? (
              <Link key={m.id} href="/subscribe" onClick={() => setSheetOpen(false)} className={`${lockedClass} hover:opacity-75`}>
                {row}
              </Link>
            ) : (
              <div key={m.id} aria-disabled className={lockedClass}>
                {row}
              </div>
            );
          })}

          {tier === "free" && SUBSCRIBE_LIVE && (
            <Link
              href="/subscribe"
              onClick={() => setSheetOpen(false)}
              className="mt-1 self-center text-xs font-medium soft-text transition hover:text-[rgb(var(--text))]"
            >
              {zh ? "升级 Pro 解锁全部模型 →" : "Upgrade to Pro to unlock every model →"}
            </Link>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
