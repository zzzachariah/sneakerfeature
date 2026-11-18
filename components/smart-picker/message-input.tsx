"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUp, ChevronDown, CircleGauge, Loader2, SlidersHorizontal } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { ModelPicker } from "@/components/smart-picker/model-picker";
import { MAX_RECOMMENDATIONS } from "@/lib/ai/types";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { hasUnmeteredBase, isAllowanceMetered, tierConfig, type ModelId, type Tier } from "@/lib/subscription/tiers";
import styles from "./unified-picker.module.css";

type Props = {
  balance: number;
  unlimited: boolean;
  sending: boolean;
  atTurnLimit: boolean;
  tier: Tier;
  model: ModelId | null;
  onSelectModel: (id: ModelId) => void;
  onSend: (message: string, count: number) => boolean | void;
  freePreparation?: boolean;
  pendingClarification?: boolean;
  onCountChange?: (count: number) => void;
  prefillText?: string;
  prefillNonce?: number;
  mode?: "chat" | "find";
  canChat?: boolean;
  chatUnlimited?: boolean;
  creditsLoaded?: boolean;
  allowance?: { balance: number; grant: number } | null;
  onOpenUsage?: () => void;
  onMenuOpen?: () => void;
};

export function MessageInput({
  balance, unlimited, sending, atTurnLimit, tier, model, onSelectModel, onSend,
  freePreparation = false, pendingClarification = false, onCountChange,
  prefillText, prefillNonce = 0, mode = "find", canChat = true, chatUnlimited = false,
  creditsLoaded = true, allowance, onOpenUsage, onMenuOpen
}: Props) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";
  const [text, setText] = useState("");
  const [count, setCount] = useState(3);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const modelLocked = sending || pendingClarification || !creditsLoaded;
  const maxCount = Math.min(MAX_RECOMMENDATIONS, tierConfig(tier).prompt.count);
  const effectiveCount = mode === "chat" ? 1 : Math.min(maxCount, count);
  const metered = !unlimited && !hasUnmeteredBase(tier);
  const insufficient = mode === "find" && !freePreparation && metered && balance < effectiveCount;
  const chatLocked = mode === "chat" && !canChat;
  const chatInsufficient = mode === "chat" && canChat && creditsLoaded && !chatUnlimited && (allowance?.balance ?? 0) < 1;
  const isReady = Boolean(text.trim()) && !sending && !atTurnLimit && !insufficient && !chatLocked && !chatInsufficient && creditsLoaded;

  useEffect(() => { onCountChange?.(effectiveCount); }, [effectiveCount, onCountChange]);
  useEffect(() => {
    if (!optionsOpen) return;
    const close = (event: PointerEvent) => { if (!optionsRef.current?.contains(event.target as Node)) setOptionsOpen(false); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setOptionsOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [optionsOpen]);
  useEffect(() => { if (sending) setOptionsOpen(false); }, [sending]);
  useEffect(() => {
    if (!prefillNonce || prefillText === undefined) return;
    setText(prefillText);
    const frame = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(160, Math.max(44, el.scrollHeight))}px`;
      if (prefillText) el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [prefillNonce, prefillText]);

  const grow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(160, Math.max(44, el.scrollHeight))}px`;
  };
  const submit = () => {
    if (!isReady) return;
    if (onSend(text.trim(), effectiveCount) === false) return;
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
  };

  return (
    <div data-onboarding="ai-composer" className={styles.inputRoot}>
      {atTurnLimit && <p className={styles.composerNotice} role="status">{translate("Other conversations are still generating — you can send here once one of them finishes.")}</p>}
      {creditsLoaded && chatLocked && <p className={styles.composerNotice}>
        {zh ? "Chat 为 Max 会员提供。你仍可使用 Find 选鞋。" : "Chat is available with Max. You can still find your next pair with Find."}
        {SUBSCRIBE_LIVE && <> <Link href="/subscribe">{zh ? "查看 Max" : "Explore Max"}</Link></>}
      </p>}
      {chatInsufficient && <p className={styles.composerNotice} role="status">
        {zh ? "Chat 每次回复需要 1 额度，当前额度不足。你的输入已保留。" : "Each Chat reply uses 1 allowance. You’re out of allowance; your draft is saved."}
        {onOpenUsage && <button type="button" className={styles.textButton} onClick={onOpenUsage}>{zh ? "查看用量" : "View usage"}</button>}
      </p>}
      {insufficient && <p className={styles.composerNotice} role="status">
        {zh ? "积分不足，查看用量或领取每日积分后继续。" : "You need more credits. View your usage or claim daily credits to continue."}
        {onOpenUsage && <button type="button" className={styles.textButton} onClick={onOpenUsage}>{zh ? "查看用量" : "View usage"}</button>}
      </p>}
      <div className={styles.inputBox} data-picker-composer-box>
        <textarea
          ref={textareaRef} data-onboarding="ai-input" value={text} rows={1} maxLength={2000}
          aria-label={zh ? "发送给 Smart Picker" : "Message Smart Picker"}
          onChange={event => { setText(event.target.value); grow(); }} onKeyDown={onKeyDown}
          placeholder={pendingClarification
            ? (zh ? "在这里补充需求，加入本次选鞋…" : "Add any extra context to your picks here…")
            : mode === "chat" ? (zh ? "聊聊你的下一双球鞋…" : "Ask anything about your next pair…")
              : (zh ? "说说你想找什么样的球鞋…" : "Tell me what you’re looking for…")}
          className={styles.textarea}
        />
        <button type="button" data-onboarding="ai-send" onClick={submit} disabled={!isReady}
          aria-label={sending ? translate("AI is thinking…") : translate("Send")} className={styles.sendButton}>
          {sending ? <Loader2 size={17} className={styles.spinner}/> : <ArrowUp size={18} strokeWidth={2.2}/>}
        </button>
      </div>
      <div className={styles.inputFooter}>
        <div className={styles.inputTools}>
          <ModelPicker mode={mode} tier={tier} model={model} onSelect={onSelectModel} disabled={modelLocked}
            onOpen={() => { setOptionsOpen(false); onMenuOpen?.(); }}/>
          {mode === "find" && <div className={styles.optionsWrap} ref={optionsRef}>
            <button type="button" className={styles.footerButton} disabled={modelLocked} aria-expanded={optionsOpen}
              aria-label={zh ? `推荐 ${effectiveCount} 双，调整数量` : `${effectiveCount} picks, adjust count`}
              onClick={() => { setOptionsOpen(value => !value); onMenuOpen?.(); }}>
              <SlidersHorizontal size={12}/><span>{effectiveCount}</span><ChevronDown size={11}/>
            </button>
            {optionsOpen && <div className={styles.countPopover} data-onboarding-blocking="true">
              <label htmlFor="picker-recommendation-count">{zh ? "推荐数量" : "Number of picks"}</label>
              <select id="picker-recommendation-count" value={effectiveCount} onChange={event => setCount(Number(event.target.value))}>
                {Array.from({ length: maxCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
              <p>{zh ? "最终数量取决于符合条件的鞋款。" : "The final count depends on suitable matches."}</p>
            </div>}
          </div>}
        </div>
        <button type="button" className={styles.footerButton} disabled={!creditsLoaded} onClick={() => { setOptionsOpen(false); onOpenUsage?.(); }}
          aria-haspopup="dialog" aria-label={translate("View credit usage")}>
          {!creditsLoaded ? <span className={styles.inlineSkeleton}/> : <>
            <span>{chatUnlimited ? (zh ? "不限次数" : "Unlimited") : allowance && (mode === "chat" || (model && isAllowanceMetered(tier, model))) ? `${allowance.balance} ${zh ? "额度" : "allowance"}` : unlimited ? (zh ? "基础模型不限次" : "Base unlimited") : `${balance} ${zh ? "积分" : "credits"}`}</span>
            <CircleGauge size={13}/>
          </>}
        </button>
      </div>
    </div>
  );
}
