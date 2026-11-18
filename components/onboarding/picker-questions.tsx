"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { DUR, EASE } from "@/lib/motion/constants";
import type { DemoSnapshot } from "@/lib/onboarding/picker-demo-contract";
import { pickerQuestionOptions, type PickerAnswers, type PickerQuestionSet } from "@/lib/onboarding/picker-questions";
import { useNarrativeScroll } from "./use-narrative-scroll";
import styles from "./picker-questions.module.css";

const emptyAnswers = (): PickerAnswers => ({ choices: {}, note: "" });
function restoreAnswers(key: string, set: PickerQuestionSet): PickerAnswers {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!stored || typeof stored !== "object") return emptyAnswers();
    const choices = Object.fromEntries(set.questions.flatMap(question => {
      const value = stored.choices?.[question.id];
      return pickerQuestionOptions(question.id).some(option => option.value === value) ? [[question.id, value]] : [];
    }));
    return { choices, note: typeof stored.note === "string" ? stored.note.slice(0, 500) : "" };
  } catch { return emptyAnswers(); }
}
function readyToContinue(id: string, answers: PickerAnswers) {
  return Boolean(answers.choices[id]) && (!((id === "profile" && answers.choices.profile === "adjust") || (id === "budget" && answers.choices.budget === "limit")) || Boolean(answers.note.trim()));
}

export function PickerQuestions({ snapshot, zh, reduced, busy, submissionError, onSubmit, onRetry, onBack }: {
  snapshot: DemoSnapshot; zh: boolean; reduced: boolean; busy: boolean; submissionError?: boolean;
  onSubmit: (answers: PickerAnswers) => void; onRetry: () => void; onBack: () => void;
}) {
  const set = snapshot.questions;
  const lang = zh ? "zh" : "en";
  const [answers, setAnswers] = useState<PickerAnswers>(emptyAnswers);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [restoredKey, setRestoredKey] = useState("");
  const titleId = useId(), noteId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scroll = useNarrativeScroll(reduced);
  const runKey = snapshot.runId ? `sf-picker-answers:${snapshot.runId}` : "";
  const questionIds = set?.questions.map(question => question.id).join("|") ?? "";
  const setRef = useRef(set); setRef.current = set;
  useEffect(() => {
    const questions = setRef.current;
    if (!runKey || !questions) return;
    const saved = restoreAnswers(runKey, questions);
    setAnswers(saved);
    const missing = questions.questions.findIndex(question => !readyToContinue(question.id, saved));
    setStep(missing < 0 ? questions.questions.length : missing);
    setRestoredKey(runKey);
  }, [runKey, questionIds]);
  useEffect(() => {
    if (!runKey || restoredKey !== runKey) return;
    try { sessionStorage.setItem(runKey, JSON.stringify(answers)); } catch { /* Answers remain available in this view. */ }
  }, [answers, runKey, restoredKey]);
  const awaiting = snapshot.status === "awaiting_answers" && Boolean(set);
  const failed = snapshot.status === "failed";
  useEffect(() => {
    if (!awaiting) return;
    const timer = window.setTimeout(() => {
      titleRef.current?.focus({ preventScroll: true });
      void scroll(titleRef.current, false, 0, 450);
    }, reduced ? 0 : 240);
    return () => window.clearTimeout(timer);
  }, [step, awaiting, reduced, scroll]);
  const review = Boolean(set && step >= set.questions.length);
  const question = set?.questions[step];
  const options = question ? pickerQuestionOptions(question.id) : [];
  const complete = Boolean(set?.questions.every(item => readyToContinue(item.id, answers)));
  const valid = question ? readyToContinue(question.id, answers) : complete;
  const needsCorrection = answers.choices.profile === "adjust";
  const needsBudget = answers.choices.budget === "limit";
  const noteRequired = needsCorrection || needsBudget;
  const showNote = review || (question?.id === "profile" && needsCorrection) || (question?.id === "budget" && needsBudget);
  const updateNote = (value: string) => setAnswers(current => ({ ...current, note: value.slice(0, 500) }));
  const back = () => { if (editing) { setEditing(false); setStep(set!.questions.length); } else if (step > 0) setStep(step - 1); else onBack(); };
  const next = () => {
    if (!valid || busy) return;
    if (review) { onSubmit({ choices: { ...answers.choices }, note: answers.note.trim() }); return; }
    setStep(editing ? set!.questions.length : step + 1); setEditing(false);
  };
  return <motion.section className={styles.panel} data-picker-questions data-question-step={review ? "review" : question?.id ?? "loading"} aria-busy={!awaiting && !failed}
    aria-label={zh ? "完善选鞋偏好" : "Refine your shoe preferences"}
    initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : DUR.slow, ease: EASE }}>
    <div className={styles.header}><span className={styles.eyebrow}><Sparkles size={13}/>{zh ? "再了解你一点" : "A closer look at your game"}</span>{awaiting && <span className={styles.counter}>{review ? (zh ? "确认选择" : "Review") : `${String(step + 1).padStart(2, "0")} / ${String(set!.questions.length).padStart(2, "0")}`}</span>}</div>
    {!awaiting ? <>
      <div className={styles.loading} role={failed ? "alert" : "status"}>{failed ? <RotateCcw size={18}/> : <LoaderCircle size={18} className={styles.spinner}/>}<div><h4 className={styles.title}>{failed ? (zh ? "暂时未能准备好问题" : "The questions aren’t ready yet") : (zh ? "AI 正在细化你的选鞋需求" : "AI is preparing your follow-up questions")}</h4><p className={styles.reason}>{failed ? snapshot.retryable ? (zh ? "你的选择仍在。重试后，先确认偏好，再开始选鞋。" : "Your choices are still here. Retry to refine your preferences before finding shoes.") : (zh ? "这次演示已用完重试次数。你仍可继续注册，在 Smart Picker 中选鞋。" : "This demo has no retries remaining. You can continue signing up and use Smart Picker.") : (zh ? "结合你的位置、偏好和感兴趣的鞋款，先确认影响推荐的几个细节。" : "Using your positions, priorities and shoe interests to check the details that matter for your picks.")}</p></div></div>
      {failed && <div className={styles.actions}><button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={14}/>{zh ? "返回" : "Back"}</button>{snapshot.retryable&&<button type="button" className={styles.next} disabled={busy} onClick={onRetry}>{zh ? "重新准备问题" : "Retry questions"}<RotateCcw size={14}/></button>}</div>}
    </> : <>
      <div className={styles.rail} aria-hidden="true">{set!.questions.map((item, index) => <span key={item.id} data-reached={index <= step}/>)}</div>
      <AnimatePresence initial={false} mode="wait"><motion.div key={review ? "review" : question!.id} className={styles.body}
        initial={reduced ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -10 }} transition={{ duration: reduced ? 0 : DUR.base, ease: EASE }}>
        <h4 id={titleId} ref={titleRef} tabIndex={-1} className={styles.title}>{review ? (zh ? "这样开始选鞋。" : "Ready to find your two.") : question!.prompt[lang]}</h4>
        <p className={styles.reason}>{review ? (zh ? "确认后，先从目录筛出候选鞋，再查证这些型号缺少的贴合、价格等资料，最后给出两双推荐。" : "First, shortlist shoes from the catalog. Then check missing fit, price and other details for those exact models before making two recommendations.") : question!.reason[lang]}</p>
        {review ? <dl className={styles.review}>{set!.questions.map((item, index) => <div key={item.id}><dt>{item.prompt[lang]}</dt><dd>{pickerQuestionOptions(item.id).find(option => option.value === answers.choices[item.id])?.label[lang] ?? (zh ? "尚未选择" : "Not selected")}</dd><button type="button" className={styles.edit} disabled={busy} aria-label={`${zh ? "修改：" : "Edit: "}${item.prompt[lang]}`} onClick={() => { setEditing(true); setStep(index); }}><Pencil size={13}/></button></div>)}</dl>
          : <fieldset className={styles.options} aria-labelledby={titleId} disabled={busy}>{options.map(option => <label className={styles.option} data-selected={answers.choices[question!.id] === option.value} key={option.value}>
            <input type="radio" name={`picker-question-${question!.id}`} value={option.value} checked={answers.choices[question!.id] === option.value} onChange={() => setAnswers(current => ({ ...current, choices: { ...current.choices, [question!.id]: option.value } }))}/><span className={styles.radio} aria-hidden="true"/><span className={styles.optionText}>{option.label[lang]}</span>
          </label>)}</fieldset>}
        {showNote && <div className={styles.note}><label htmlFor={noteId}>{review ? (zh ? "有没有其他想补充的？" : "Anything else we should know?") : needsCorrection ? (zh ? "告诉我们需要调整的地方" : "Tell us what to adjust") : (zh ? "你的预算上限和币种是？" : "What is your budget and currency?")}{review && !noteRequired ? (zh ? "（选填）" : " (optional)") : ""}</label><textarea id={noteId} value={answers.note} required={noteRequired} maxLength={500} disabled={busy} onChange={event => updateNote(event.target.value)} placeholder={zh ? "例如：之前哪双鞋穿着不舒服；脚宽且脚背高；预算 800 元人民币。" : "For example: a past shoe that felt uncomfortable, wide feet with a high instep, or a budget of 120 USD."}/><div className={styles.noteHint}><span>{noteRequired ? (zh ? "请补充说明后继续。" : "Add the details to continue.") : (zh ? "只填写你愿意分享的信息。" : "Share only what you’re comfortable with.")}</span><span>{answers.note.length}/500</span></div></div>}
      </motion.div></AnimatePresence>
      {submissionError && <p className={styles.reason} role="alert">{zh ? "暂时未能提交，请检查连接后重试。你的答案已保留。" : "Couldn’t send your answers. Check your connection and try again; your answers are saved."}</p>}
      <div className={styles.actions}><button type="button" className={styles.back} disabled={busy} onClick={back}><ArrowLeft size={14}/>{zh ? "上一步" : "Back"}</button><button type="button" className={styles.next} disabled={!valid || busy} onClick={next}>{busy ? <LoaderCircle size={14} className={styles.spinner}/> : null}{review ? (zh ? "确认，开始选鞋" : "Confirm & find my shoes") : editing ? (zh ? "保存选择" : "Save choice") : (zh ? "继续" : "Continue")}{busy ? null : review ? <Check size={14}/> : <ArrowRight size={14}/>}</button></div>
    </>}
  </motion.section>;
}

export function PickerAnswerSummary({ snapshot, zh }: { snapshot: DemoSnapshot; zh: boolean }) {
  if (!snapshot.questions || !snapshot.answers) return null;
  const { questions, answers } = snapshot;
  const lang = zh ? "zh" : "en";
  return <section className={styles.answerSummary} data-picker-confirmed-answers aria-label={zh ? "这次确认的需求" : "Your confirmed preferences"}>
    <span>{zh ? "这次确认的需求" : "YOUR CONFIRMED PREFERENCES"}</span>
    <dl>{questions.questions.filter(question => question.id !== "profile").map(question => <div key={question.id}><dt>{({ age: ["款式年份", "Release year"], fit: ["贴合需求", "Fit"], court: ["场地", "Court"], budget: ["预算", "Budget"], profile: ["原始选择", "Initial choices"] })[question.id][zh ? 0 : 1]}</dt><dd>{pickerQuestionOptions(question.id).find(option => option.value === answers.choices[question.id])?.label[lang]}</dd></div>)}</dl>
    {answers.note && <p><strong>{answers.choices.profile === "adjust" ? (zh ? "你的补充与更正" : "Your additions and corrections") : (zh ? "你的补充" : "Your additional context")}</strong>{answers.note}</p>}
  </section>;
}
