"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Loader2, Pencil, RotateCcw } from "lucide-react";
import { hasClarificationBudget, validateClarificationAnswers, type AiClarification, type ClarificationAnswers } from "@/lib/ai/clarification";
import { useModelCatalog } from "@/lib/ai/use-model-catalog";
import { catalogModel } from "@/lib/ai/model-catalog";
import { pickerModelInfo } from "@/lib/subscription/tiers";
import { DUR, EASE } from "@/lib/motion/constants";
import styles from "./clarification-panel.module.css";

const NOTE_LIMIT = 500;
function validChoice(id: string, answers: ClarificationAnswers) {
  if (id === "budget" && answers.choices.budget === "limit" && !hasClarificationBudget(answers.note)) return false;
  return Boolean(answers.choices[id]) && (!((id === "profile" && answers.choices[id] === "adjust") || (id === "budget" && answers.choices[id] === "limit")) || Boolean(answers.note.trim()));
}
function initialAnswers(state: AiClarification): ClarificationAnswers {
  let saved: Partial<ClarificationAnswers> = state.answers ?? {};
  try { saved = JSON.parse(sessionStorage.getItem(`sf-chat-clarification:${state.id}`) ?? "null") ?? saved; } catch { /* Optional local draft. */ }
  return {
    choices: Object.fromEntries(state.questions.flatMap(question => question.options.some(option => option.value === saved.choices?.[question.id]) ? [[question.id, saved.choices![question.id]]] : [])),
    note: typeof saved.note === "string" ? saved.note.slice(0, NOTE_LIMIT) : "",
  };
}

export function ClarificationPanel({ value, zh, busy, canAfford, onConfirm, onRetry, onOpenUsage, extraNote, onNoteChange }: {
  value: AiClarification; zh: boolean; busy: boolean; canAfford: boolean;
  onConfirm: (answers: ClarificationAnswers) => void; onRetry: () => void; onOpenUsage: () => void;
  extraNote?: { text: string; nonce: number }; onNoteChange?: (note: string) => void;
}) {
  const lang = zh ? "zh" : "en";
  const reduced = useReducedMotion();
  const [answers, setAnswers] = useState<ClarificationAnswers>(() => initialAnswers(value));
  const [step, setStep] = useState(() => { const draft = initialAnswers(value); const next = value.questions.findIndex(question => !validChoice(question.id, draft)); return next < 0 ? value.questions.length : next; });
  const [editing, setEditing] = useState(false);
  const [addedNote, setAddedNote] = useState(false);
  const titleId = useId(), noteId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstFocus = useRef(true);
  const awaiting = value.status === "awaiting_answers";
  const settled = value.status === "complete";
  const question = value.questions[step];
  const review = !question;
  const noteRequired = answers.choices.profile === "adjust" || answers.choices.budget === "limit";
  const showNote = review || (question?.id === "profile" && answers.choices.profile === "adjust") || (question?.id === "budget" && answers.choices.budget === "limit");
  const complete = (() => { try { validateClarificationAnswers(value.questions, answers); return value.questions.length === 4; } catch { return false; } })();
  const canContinue = question ? validChoice(question.id, answers) : complete;
  const modelCatalog = useModelCatalog();
  const modelName = catalogModel(modelCatalog, value.model)?.name ?? Object.values(modelCatalog.models).find(item => item.model === value.model)?.name ?? pickerModelInfo(value.model)?.name ?? value.model;
  useEffect(() => {
    if (!awaiting) return;
    try { sessionStorage.setItem(`sf-chat-clarification:${value.id}`, JSON.stringify(answers)); } catch { /* Keep the in-memory answers. */ }
    onNoteChange?.(answers.note);
  }, [answers, awaiting, value.id, onNoteChange]);
  useEffect(() => {
    if (!extraNote) return;
    setAnswers(current => ({ ...current, note: extraNote.text.slice(0, NOTE_LIMIT) }));
    setAddedNote(true);
  }, [extraNote]);
  useEffect(() => {
    if (!awaiting) return;
    // Do not steal focus from a member typing in the main composer when the
    // questions arrive. Explicit Next/Back moves focus to the new question.
    if (firstFocus.current) { firstFocus.current = false; return; }
    const timer = window.setTimeout(() => titleRef.current?.focus({ preventScroll: false }), reduced ? 0 : 240);
    return () => window.clearTimeout(timer);
  }, [step, awaiting, reduced]);
  const forward = () => {
    if (!canContinue || busy) return;
    if (review) { if (canAfford) onConfirm({ choices: { ...answers.choices }, note: answers.note.trim() }); return; }
    setStep(editing ? value.questions.length : step + 1); setEditing(false);
  };
  const summary = (saved: ClarificationAnswers) => <dl className={styles.summary}>{value.questions.map(item => <div key={item.id}><dt>{item.prompt[lang]}</dt><dd>{item.options.find(option => option.value === saved.choices[item.id])?.label[lang] ?? (zh ? "未选择" : "Not selected")}</dd></div>)}{saved.note && <div><dt>{zh ? "补充信息" : "Additional context"}</dt><dd className={styles.savedNote}>{saved.note}</dd></div>}</dl>;
  if (settled) return <details className={`${styles.panel} ${styles.settled} sp-followup`} data-chat-clarification="complete"><summary><Check size={14}/>{zh ? "选鞋需求已确认" : "Your preferences, confirmed"}<ChevronDown size={14}/></summary>{summary(value.answers ?? answers)}</details>;
  if (!awaiting) return <section className={`${styles.panel} sp-followup`} data-chat-clarification={value.status}>
    <div className={styles.status} role="status">{value.status === "failed" ? <RotateCcw size={16}/> : <Loader2 size={16} className={styles.spinner}/>}<div><strong>{value.status === "failed" ? (zh ? "问题暂时未能准备好" : "The questions couldn’t be prepared") : value.status === "answering" ? (zh ? "已确认，正在为你选鞋" : "Confirmed. Finding your shoes…") : (zh ? "先确认几个影响选鞋的细节" : "Checking a few details before your picks…")}</strong><p>{value.status === "failed" ? (zh ? "你的原始要求已保留，可以重试。" : "Your original request is saved. You can retry.") : (zh ? "本轮确认后，将从目录筛选候选，再核对这些型号缺少的资料。" : "After this round, I’ll shortlist catalog models and check the details still missing for those shoes.")}</p></div></div>
    {value.status === "failed" && <button type="button" className={styles.next} disabled={busy} onClick={onRetry}><RotateCcw size={14}/>{zh ? "重新准备问题" : "Retry questions"}</button>}
  </section>;
  return <section className={`${styles.panel} sp-followup`} data-chat-clarification="awaiting_answers" data-clarification-id={value.id} data-clarification-step={review ? "review" : question.id}>
    <div className={styles.header}><span>{zh ? "先让推荐更贴合你" : "Let’s get the fit right"}</span><small>{review ? (zh ? "确认" : "Review") : `${String(step + 1).padStart(2, "0")} / ${String(value.questions.length).padStart(2, "0")}`}</small></div>
    <div className={styles.rail} aria-hidden="true">{value.questions.map((item,index) => <span key={item.id} data-reached={index <= step}/>)}</div>
    <AnimatePresence initial={false} mode="wait"><motion.div key={review ? "review" : question.id} initial={reduced ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0 : DUR.base, ease: EASE }}>
      <h3 ref={titleRef} tabIndex={-1} id={titleId} className={styles.title}>{review ? (zh ? "这些是本次选鞋的依据。" : "Here’s what I’ll use for your picks.") : question.prompt[lang]}</h3>
      <p className={styles.reason}>{review ? (zh ? `确认后，从完整目录筛选候选鞋，再查证具体型号的贴合、价格等缺失资料，最后推荐 ${value.count} 双。` : `I’ll shortlist from the full catalog, check missing fit, price and other details for those exact models, then recommend ${value.count} ${value.count === 1 ? "shoe" : "shoes"}.`) : question.reason[lang]}</p>
      {review ? <dl className={styles.review}>{value.questions.map((item,index) => <div key={item.id}><dt>{item.prompt[lang]}</dt><dd>{item.options.find(option => option.value === answers.choices[item.id])?.label[lang]}</dd><button type="button" className={styles.edit} disabled={busy} aria-label={`${zh ? "修改：" : "Edit: "}${item.prompt[lang]}`} onClick={() => { setEditing(true); setStep(index); }}><Pencil size={13}/></button></div>)}</dl> : <fieldset className={styles.options} aria-labelledby={titleId} disabled={busy}>{question.options.map(option => <label key={option.value} className={styles.option} data-selected={answers.choices[question.id] === option.value}><input type="radio" name={`clarification-${value.id}-${question.id}`} value={option.value} checked={answers.choices[question.id] === option.value} onChange={() => setAnswers(current => ({ ...current, choices: { ...current.choices, [question.id]: option.value } }))}/><span className={styles.radio} aria-hidden="true"/><span>{option.label[lang]}</span></label>)}</fieldset>}
      {showNote && <div className={styles.note}><label htmlFor={noteId}>{review ? (zh ? "有没有其他想补充的？" : "Anything else we should know?") : question.id === "profile" ? (zh ? "想调整什么？" : "What would you change?") : (zh ? "预算上限和币种" : "Your budget and currency")}{review && !noteRequired ? (zh ? "（选填）" : " (optional)") : ""}</label><textarea id={noteId} maxLength={NOTE_LIMIT} required={noteRequired} disabled={busy} value={answers.note} onChange={event => setAnswers(current => ({ ...current, note: event.target.value }))} placeholder={zh ? "例如：以前穿哪双鞋不舒服、脚宽且脚背高、预算 800 元人民币。" : "For example: a shoe that felt uncomfortable, wide feet with a high instep, or a budget of 120 USD."}/><small>{noteRequired ? (zh ? "请补充更正或预算后继续。" : "Add your correction or budget to continue.") : (zh ? "也可以把补充写在下方聊天输入框。" : "You can also add context in the chat box below.")}<span>{answers.note.length}/{NOTE_LIMIT}</span></small></div>}
    </motion.div></AnimatePresence>
    {addedNote && !showNote && <p className={styles.notice} role="status">{zh ? "已加入补充信息，最后一步可以检查或修改。" : "Added to your notes. You can review or edit them in the last step."}</p>}
    <div className={styles.meta}><span>{modelName}</span><span>× {value.count} {zh ? "双" : value.count === 1 ? "shoe" : "shoes"}</span></div>
    {review && !canAfford && <p className={styles.notice}>{zh ? "当前积分不足以生成这次推荐，答案已保留。" : "You need more credits for these recommendations. Your answers are saved."} <button type="button" onClick={onOpenUsage}>{zh ? "查看积分" : "View credits"}</button></p>}
    <div className={styles.actions}><button type="button" className={styles.back} disabled={busy || step === 0} onClick={() => { setStep(editing ? value.questions.length : step - 1); setEditing(false); }}><ArrowLeft size={14}/>{zh ? "上一步" : "Back"}</button><button type="button" className={styles.next} disabled={busy || !canContinue || (review && !canAfford)} onClick={forward}>{busy && <Loader2 size={14} className={styles.spinner}/>} {review ? (zh ? "确认并开始选鞋" : "Confirm & find my shoes") : editing ? (zh ? "保存选择" : "Save choice") : (zh ? "继续" : "Continue")}{!busy && (review ? <Check size={14}/> : <ArrowRight size={14}/>)}</button></div>
  </section>;
}
