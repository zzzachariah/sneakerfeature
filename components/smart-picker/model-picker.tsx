"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Lock } from "lucide-react";
import { useModelCatalog } from "@/lib/ai/use-model-catalog";
import { catalogPickerModels } from "@/lib/ai/model-catalog";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { MODEL_IDS, tierSupportsModel, type ModelId, type Tier } from "@/lib/subscription/tiers";
import styles from "./unified-picker.module.css";

type Props = {
  tier: Tier;
  model: ModelId | null;
  onSelect: (id: ModelId) => void;
  disabled?: boolean;
  onOpen?: () => void;
  mode?: "chat" | "find";
};

export function ModelPicker({ tier, model, onSelect, disabled = false, onOpen, mode = "find" }: Props) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const models = catalogPickerModels(useModelCatalog());
  const current = models.find(item => item.id === model);
  const title = zh ? "选择 AI 模型" : "Choose AI model";

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  return <div ref={rootRef} className={styles.modelWrap}>
    <button ref={triggerRef} type="button" className={styles.modelTrigger} disabled={!model || disabled}
      aria-label={current ? `${title} — ${current.name}` : title} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { if (!open) { haptics.selection(); onOpen?.(); } setOpen(value => !value); }}>
      {current ? <span>{current.name}</span> : <span className={styles.inlineSkeleton}/>}
      <ChevronDown size={12}/>
    </button>
    {open && <div role="dialog" aria-label={title} className={styles.modelPopover} data-onboarding-blocking="true">
      <p className={styles.popoverTitle}>{title}</p>
      {models.map(item => {
        const supported = tierSupportsModel(tier, item.id);
        const selected = model === item.id;
        const description = mode === "chat"
          ? item.id === MODEL_IDS.haiku ? (zh ? "轻量快速，适合日常问题。" : "Light and fast for everyday questions.")
            : item.id === MODEL_IDS.deepseek ? (zh ? "均衡之选，适合日常咨询。" : "A balanced option for daily advice.")
              : (zh ? "深入思考，更细致地分析需求。" : "Deeper reasoning for a closer look.")
          : zh ? item.taglineZh : item.tagline;
        const content = <><span className={styles.modelCopy}><strong>{item.name}</strong><small>{description}</small></span>
          {selected ? <Check size={15} aria-label={zh ? "已选择" : "Selected"}/> : !supported ? <span className={styles.modelLock}><Lock size={12}/>{item.minTier === "max" ? "Max" : "Pro"}</span> : null}</>;
        if (supported) return <button key={item.id} type="button" className={styles.modelOption} aria-pressed={selected}
          onClick={() => { if (disabledRef.current) return; haptics.selection(); onSelect(item.id); setOpen(false); triggerRef.current?.focus(); }}>{content}</button>;
        return SUBSCRIBE_LIVE ? <Link key={item.id} className={`${styles.modelOption} ${styles.modelUnavailable}`} href="/subscribe" onClick={() => setOpen(false)}>{content}</Link>
          : <div key={item.id} className={`${styles.modelOption} ${styles.modelUnavailable}`} aria-disabled="true">{content}</div>;
      })}
      {mode === "chat" && <p className={styles.popoverTitle}>{zh ? "每次 Chat 回复使用 1 点月度额度。" : "Each Chat reply uses 1 monthly allowance."}</p>}
    </div>}
  </div>;
}
