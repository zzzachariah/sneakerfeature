"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Loader2, UserRound } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { EASE } from "@/lib/motion/constants";
import { HEIGHT_MAX, HEIGHT_MIN, POSITIONS, SKILL_LEVELS, WEIGHT_MAX, WEIGHT_MIN, isValidPersona, type Persona, type Position, type SkillLevel } from "@/lib/persona/types";
import { DIM_KEYS, isValidFocus, type DimKey, type RatingFocus } from "@/lib/star-rating";
import { personaSchema } from "@/lib/validation/schemas";
import { onboardingRequest } from "./form-utils";
import { ScrollHint, useFormScroll } from "./scroll-hint";
import styles from "./onboarding-forms.module.css";

export type OnboardingProfileProps = { onComplete: () => void; onBack?: () => void; initialPositions?: Position[]; initialPicks?: DimKey[] };
type ProfileResponse = { ok: boolean; persona: Persona | null; message?: string };
type FocusResponse = { ok: boolean; focus: RatingFocus | null };
const SKILL_TEXT: Record<SkillLevel, [string, string, string, string]> = {
  beginner: ["刚开始打球", "Just starting", "熟悉球场与动作", "Learning the game"],
  amateur: ["日常爱好者", "Recreational", "规律打球，享受比赛", "Playing regularly"],
  semi_pro: ["半职业球员", "Semi-pro", "参加半职业级别比赛", "Semi-professional play"],
  pro: ["职业球员", "Professional", "以篮球为职业", "Playing professionally"]
};
const POSITION_TEXT: Record<Position, [string, string]> = { PG: ["控卫", "Point"], SG: ["分卫", "Shooting"], SF: ["小前", "Small Fwd"], PF: ["大前", "Power Fwd"], C: ["中锋", "Center"] };
const DIM_TEXT: Record<DimKey, [string, string, string, string]> = {
  cushioning_feel: ["缓震", "Cushioning", "落地的缓冲感", "Impact comfort"],
  court_feel: ["场地感", "Court feel", "贴近地面的控制", "Connected to the floor"],
  bounce: ["回弹", "Bounce", "发力时的回应", "Responsive underfoot"],
  stability: ["稳定", "Stability", "移动中的支撑", "Support in motion"],
  traction: ["抓地", "Traction", "启停的信心", "Grip for quick stops"],
  fit: ["贴合", "Fit", "鞋脚之间的包裹", "A secure feel"]
};

function samePersona(a: Persona | null, b: Persona): boolean {
  return Boolean(a && [...a.positions].sort().join() === [...b.positions].sort().join() && a.skill_level === b.skill_level && a.flat_foot === b.flat_foot && a.height_cm === b.height_cm && a.weight_kg === b.weight_kg);
}

/** A required, explicitly filled profile; ordinary profile editing remains separate. */
export function OnboardingProfile({ onComplete, onBack, initialPositions = [], initialPicks = [] }: OnboardingProfileProps) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const t = (cn: string, en: string) => zh ? cn : en;
  const { username, userId } = useAuthState();
  const reduce = useReducedMotion();
  const id = useId();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [positions, setPositions] = useState<Position[]>([]);
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [flatFoot, setFlatFoot] = useState<boolean | null>(null);
  const [picks, setPicks] = useState<DimKey[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [partial, setPartial] = useState(false);
  const [baseConfirmed, setBaseConfirmed] = useState(false);
  const busyRef = useRef(false);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const { rootRef, viewportRef, scrollRef, targetRef, short } = useFormScroll();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const didChangeStep = useRef(false);
  const lastScrollStep = useRef(step);
  const loadGeneration = useRef(0);
  const accountRef = useRef(userId);
  accountRef.current = userId;
  const completedRef = useRef(false);

  const stepNames = [t("球员身份", "Your game"), t("身体信息", "Your build"), t("选鞋偏好", "Your priorities"), t("确认档案", "Ready to play")];

  const revealField = useCallback((target: HTMLElement | null) => {
    const panel = targetRef.current;
    if (!panel || !target || !panel.getClientRects().length) return;
    const bounds = panel.getBoundingClientRect();
    const field = target.getBoundingClientRect();
    const bottom = bounds.bottom - (short ? rootRef.current?.querySelector<HTMLElement>("[data-form-actions]")?.offsetHeight ?? 0 : 0);
    if (field.top < bounds.top + 8) panel.scrollTop += field.top - bounds.top - 8;
    else if (field.bottom > bottom - 8) panel.scrollTop += field.bottom - bottom + 8;
  }, [rootRef, short, targetRef]);

  useEffect(() => {
    if (message) revealField(feedbackRef.current);
  }, [message, revealField]);

  useEffect(() => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !rootRef.current?.contains(focused)) return;
    const frame = requestAnimationFrame(() => revealField(focused));
    return () => cancelAnimationFrame(frame);
  }, [revealField, rootRef]);

  async function loadSaved() {
    const generation = ++loadGeneration.current;
    const account = accountRef.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const [profileResult, focusResult] = await Promise.allSettled([
        onboardingRequest<ProfileResponse>("/api/preferences/persona"),
        onboardingRequest<FocusResponse>("/api/preferences/rating-focus", {}, 6000)
      ]);
      if (generation !== loadGeneration.current || account !== accountRef.current) return;
      if (profileResult.status !== "fulfilled") throw profileResult.reason;
      const result = profileResult.value;
      if (result.persona !== null && !isValidPersona(result.persona)) throw new Error("Invalid saved profile.");
      if (result.persona) {
        setPositions(result.persona.positions);
        setSkill(result.persona.skill_level);
        setHeight(String(result.persona.height_cm));
        setWeight(String(result.persona.weight_kg));
        setFlatFoot(result.persona.flat_foot);
        setBaseConfirmed(true);
      }
      // Optional preferences never make the base profile unavailable.
      if (focusResult.status === "fulfilled" && isValidFocus(focusResult.value.focus)) {
        const focus = focusResult.value.focus;
        setPicks([focus.primary, focus.secondary, focus.tertiary]);
      }
    } catch {
      if (generation === loadGeneration.current) setLoadFailed(true);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }

  useEffect(() => {
    // Drafts are held only in memory and never shared across signed-in accounts.
    setPositions([...new Set(initialPositions)].filter(p => POSITIONS.includes(p)).slice(0,2)); setSkill(null); setHeight(""); setWeight(""); setFlatFoot(null); setPicks([...new Set(initialPicks)].filter(p => DIM_KEYS.includes(p)).slice(0,3));
    setStep(0); setErrors({}); setMessage(""); setPartial(false); setBaseConfirmed(false);
    completedRef.current = false;
    void loadSaved();
    return () => { loadGeneration.current += 1; };
    // Account changes must discard another account's draft, replay must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!didChangeStep.current || lastScrollStep.current === step) return;
    lastScrollStep.current = step;
    if (targetRef.current) targetRef.current.scrollTop = 0;
    const timer = window.setTimeout(() => {
      if (targetRef.current) targetRef.current.scrollTop = 0;
      stageHeading.current?.focus({ preventScroll: true });
    }, reduce ? 150 : 320);
    return () => window.clearTimeout(timer);
  }, [step, reduce, targetRef]);

  function move(next: number) {
    if (busyRef.current) return;
    setErrors({}); setMessage("");
    didChangeStep.current = true;
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  function validateStep(): boolean {
    const next: Record<string, string> = {};
    if (step === 0) {
      if (!positions.length) next.positions = t("选择 1–2 个你常打的位置。", "Choose one or two positions you play.");
      if (!skill) next.skill = t("选择与你目前最接近的水平。", "Choose the level that best describes you.");
    }
    if (step === 1) {
      const h = Number(height); const w = Number(weight);
      if (!height || !Number.isInteger(h) || h < HEIGHT_MIN || h > HEIGHT_MAX) next.height = t(`填写 ${HEIGHT_MIN}–${HEIGHT_MAX} cm 之间的整数。`, `Enter a whole number from ${HEIGHT_MIN}–${HEIGHT_MAX} cm.`);
      if (!weight || !Number.isInteger(w) || w < WEIGHT_MIN || w > WEIGHT_MAX) next.weight = t(`填写 ${WEIGHT_MIN}–${WEIGHT_MAX} kg 之间的整数。`, `Enter a whole number from ${WEIGHT_MIN}–${WEIGHT_MAX} kg.`);
      if (flatFoot === null) next.flatFoot = t("请选择符合你情况的选项。", "Select the option that applies to you.");
    }
    if (step === 2 && picks.length !== 0 && picks.length !== 3) next.picks = t("按顺序选满 3 项，或暂不设置偏好。", "Pick three in order, or continue without preferences.");
    setErrors(next);
    const firstError = Object.keys(next)[0];
    if (firstError) requestAnimationFrame(() => {
      const group = scrollRef.current?.querySelector<HTMLElement>(`[data-profile-field="${firstError}"]`) ?? null;
      const target = group?.querySelector<HTMLElement>("input, button") ?? group;
      target?.focus({ preventScroll: true });
      revealField(target);
    });
    return !Object.keys(next).length;
  }

  const draft = (): Persona | null => {
    if (skill === null || flatFoot === null) return null;
    const parsed = personaSchema.safeParse({ positions, skill_level: skill, flat_foot: flatFoot, height_cm: height, weight_kg: weight });
    return parsed.success ? parsed.data : null;
  };

  async function saveOptional() {
    if (picks.length !== 3) return;
    const nextFocus: RatingFocus = { primary: picks[0], secondary: picks[1], tertiary: picks[2] };
    const existing = await onboardingRequest<FocusResponse>("/api/preferences/rating-focus");
    if (existing.focus?.primary === nextFocus.primary && existing.focus?.secondary === nextFocus.secondary && existing.focus?.tertiary === nextFocus.tertiary) return;
    await onboardingRequest("/api/preferences/rating-focus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextFocus) });
  }

  async function finish(skipOptional = false) {
    if (busyRef.current || completedRef.current) return;
    const next = draft();
    if (!next) { setMessage(t("档案信息尚未填完，请返回检查。", "A few profile details are missing. Go back and check them.")); return; }
    const account = accountRef.current;
    busyRef.current = true;
    setBusy(true); setMessage("");
    try {
      // Read first on retries: a request can reach the server even if its reply
      // was lost. Do not write the already-persisted base profile a second time.
      let saved = await onboardingRequest<ProfileResponse>("/api/preferences/persona");
      if (!samePersona(saved.persona, next)) {
        await onboardingRequest<ProfileResponse>("/api/preferences/persona", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
        saved = await onboardingRequest<ProfileResponse>("/api/preferences/persona");
      }
      if (account !== accountRef.current) return;
      if (!isValidPersona(saved.persona) || !samePersona(saved.persona, next)) {
        throw new Error("The saved profile could not be confirmed.");
      }
      setBaseConfirmed(true);
      if (!skipOptional && picks.length === 3) {
        try { await saveOptional(); }
        catch {
          if (account !== accountRef.current) return;
          setPartial(true);
          setMessage(t("球员档案已保存。选鞋偏好暂未保存，你可以重试，也可以先开始探索。", "Your player profile is saved. Your optional priorities couldn’t be saved yet. Retry them or start exploring now."));
          return;
        }
      }
      if (account !== accountRef.current) return;
      completedRef.current = true;
      await onComplete();
    } catch {
      completedRef.current = false;
      setMessage(t("暂时无法确认档案已保存。你的填写内容都还在，请检查网络后重试。", "We couldn’t confirm your saved profile. Your entries are kept. Check your connection and retry."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function togglePosition(position: Position) {
    setPositions((current) => current.includes(position) ? current.filter((item) => item !== position) : current.length < 2 ? [...current, position] : current);
    setErrors((current) => ({ ...current, positions: "" }));
  }
  function togglePick(key: DimKey) {
    setPicks((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length < 3 ? [...current, key] : current);
    setErrors((current) => ({ ...current, picks: "" }));
    setPartial(false);
  }
  function error(key: string) { return errors[key] ? <p id={`${id}-${key}-error`} className={styles.fieldError} role="alert">{errors[key]}</p> : null; }

  return <section ref={rootRef} className={styles.formRoot} lang={locale} data-onboarding-profile data-short={short} aria-labelledby={`${id}-title`} aria-busy={busy || loading}>
    <div ref={viewportRef} className={styles.formViewport} role={short ? "region" : undefined} tabIndex={short ? 0 : undefined} aria-label={short ? t("球员档案信息，可滚动", "Player profile details, scrollable") : undefined}>
    <div className={styles.heading}>
      <h2 id={`${id}-title`} className={styles.title}>{t("先认识球场上的你。", "Let’s meet the player.")}</h2>
    </div>
    {loading ? <div ref={scrollRef} className={styles.formScroll} role={short ? undefined : "region"} tabIndex={short ? undefined : 0} aria-label={short ? undefined : t("档案读取状态，可滚动", "Profile loading status, scrollable")}><div className={`${styles.feedback} ${styles.notice}`} role="status"><Loader2 size={16} className={styles.spinner} /><span>{t("正在读取你的球员档案…", "Checking your player profile…")}</span></div><ScrollHint targetRef={targetRef} zh={zh} compact={short} /></div> : loadFailed ? <div className={styles.panelForm}>
      <div ref={scrollRef} className={styles.formScroll} role={short ? undefined : "region"} tabIndex={short ? undefined : 0} aria-label={short ? undefined : t("档案读取状态，可滚动", "Profile loading status, scrollable")}><div className={styles.feedback} role="alert"><AlertCircle size={16} /><span>{t("未能读取档案。请重试，避免覆盖已有信息。", "Your profile couldn’t be loaded. Retry before making changes to existing details.")}</span></div><ScrollHint targetRef={targetRef} zh={zh} compact={short} /></div>
      <div className={styles.formActions} data-form-actions><button type="button" className={styles.primary} onClick={() => void loadSaved()}>{t("重新读取", "Try again")}</button></div>
    </div> : <>
      <div className={styles.steps} aria-hidden="true">{stepNames.map((_, index) => <span key={index} className={styles.stepMark} data-done={index <= step} />)}</div>
      <div className={styles.stepCaption}><span>{stepNames[step]}</span><span>{step + 1} / 4</span></div>
      <form className={styles.panelForm} noValidate onSubmit={(event) => { event.preventDefault(); if (busyRef.current) return; if (step < 3) { if (validateStep()) move(step + 1); } else void finish(); }}>
        <div ref={scrollRef} className={styles.formScroll} role={short ? undefined : "region"} tabIndex={short ? undefined : 0} aria-label={short ? undefined : t("球员档案信息，可滚动", "Player profile details, scrollable")} onFocusCapture={(event) => { if (event.target !== event.currentTarget && event.target !== stageHeading.current && event.target.matches(":focus-visible")) revealField(event.target); }}>
      <div className={styles.scrollIntro}>
        <p className={styles.eyebrow}>{t("为你的打法，建立档案", "Built around the way you play")}</p>
        <p className={styles.description}>{t("几项真实信息，让选鞋更有依据。之后随时可以修改。", "A few details give your shoe choices more context. You can edit them anytime.")}</p>
      </div>
      <motion.div layout className={styles.identityCard} transition={{ duration: reduce ? .14 : .5, ease: EASE }}>
        <motion.div className={styles.avatar} layoutId={`${id}-player-mark`}><UserRound size={25} strokeWidth={1.4} /></motion.div>
        <div style={{ minWidth: 0 }}><div className={styles.identityName}>{username || t("你的球员档案", "Your player profile")}</div><div className={styles.identityDetail}>{positions.length ? positions.join(" / ") : t("你的打法，由你定义", "Your game, in your own terms")}{skill ? ` · ${SKILL_TEXT[skill][zh ? 0 : 1]}` : ""}</div></div>
      </motion.div>
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div key={step} custom={direction} initial={{ opacity: 0, x: reduce ? 0 : direction * 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : direction * -8 }} transition={{ duration: reduce ? .14 : .55, ease: EASE }}>
            <h3 ref={stageHeading} tabIndex={-1} className="sr-only">{stepNames[step]}</h3>
            {step === 0 && <div className={styles.stack}>
              <fieldset className={styles.fieldGroup} data-profile-field="positions" aria-invalid={Boolean(errors.positions)} aria-describedby={errors.positions ? `${id}-positions-error` : undefined}>
                <legend className={styles.legend}>{t("你常打什么位置？", "Where do you play?")} <span className={styles.optional}>{t("选择 1–2 项", "Choose 1–2")}</span></legend>
                <div className={styles.positions}>{POSITIONS.map((position) => <motion.button key={position} type="button" className={styles.position} data-selected={positions.includes(position)} aria-pressed={positions.includes(position)} onClick={() => togglePosition(position)} whileTap={reduce ? undefined : { scale: .97 }}>
                  <strong>{position}</strong><span>{POSITION_TEXT[position][zh ? 0 : 1]}</span>
                </motion.button>)}</div>{error("positions")}
              </fieldset>
              <fieldset className={styles.fieldGroup} data-profile-field="skill" aria-invalid={Boolean(errors.skill)} aria-describedby={errors.skill ? `${id}-skill-error` : undefined}>
                <legend className={styles.legend}>{t("你目前的篮球水平", "Your current level")}</legend>
                <div className={styles.choiceGrid}>{SKILL_LEVELS.map((value) => <button key={value} type="button" className={styles.choice} data-selected={skill === value} aria-pressed={skill === value} onClick={() => { setSkill(value); setErrors((e) => ({ ...e, skill: "" })); }}>
                  <span className={styles.choiceDot}>{skill === value && <Check size={11} />}</span><span className={styles.choiceText}>{SKILL_TEXT[value][zh ? 0 : 1]}<span className={styles.choiceHelp}>{SKILL_TEXT[value][zh ? 2 : 3]}</span></span>
                </button>)}</div>{error("skill")}
              </fieldset>
            </div>}
            {step === 1 && <div className={styles.stack}>
              <div className={styles.measurements}>{([
                ["height", t("身高", "Height"), height, setHeight, "cm", HEIGHT_MIN, HEIGHT_MAX],
                ["weight", t("体重", "Weight"), weight, setWeight, "kg", WEIGHT_MIN, WEIGHT_MAX]
              ] as const).map(([key, label, value, setter, unit, min, max]) => <div key={key} data-profile-field={key}>
                <div className={styles.field}><input id={`${id}-${key}`} name={key} type="text" inputMode="numeric" pattern="[0-9]*" value={value} onChange={(event) => { setter(event.target.value); setErrors((e) => ({ ...e, [key]: "" })); }} autoComplete="off" placeholder=" " aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : `${id}-${key}-hint`} className={`${styles.input} ${styles.unitInput}`} />
                  <label htmlFor={`${id}-${key}`} className={styles.label}>{label}</label><span className={styles.unit}>{unit}</span>
                </div>{error(key)}<p id={`${id}-${key}-hint`} className={styles.hint}>{min}–{max} {unit}</p>
              </div>)}</div>
              <fieldset className={styles.fieldGroup} data-profile-field="flatFoot" aria-invalid={Boolean(errors.flatFoot)} aria-describedby={`${id}-flat-foot-help${errors.flatFoot ? ` ${id}-flatFoot-error` : ""}`}>
                <legend className={styles.legend}>{t("你有扁平足吗？", "Do you have flat feet?")}</legend>
                <div className={styles.choiceGrid}>{[false, true].map((value) => <button key={String(value)} type="button" className={styles.choice} data-selected={flatFoot === value} aria-pressed={flatFoot === value} onClick={() => { setFlatFoot(value); setErrors((e) => ({ ...e, flatFoot: "" })); }}><span className={styles.choiceDot}>{flatFoot === value && <Check size={11} />}</span><span className={styles.choiceText}>{value ? t("有", "Yes") : t("没有", "No")}</span></button>)}</div>
                <p id={`${id}-flat-foot-help`} className={styles.hint}>{t("根据你已了解的自身情况填写，用于选鞋参考。", "Use what you already know about your feet. This adds context to your shoe choices.")}</p>{error("flatFoot")}
              </fieldset>
            </div>}
            {step === 2 && <fieldset className={styles.fieldGroup} data-profile-field="picks" aria-invalid={Boolean(errors.picks)} aria-describedby={errors.picks ? `${id}-picks-error` : undefined}>
              <legend className={styles.legend}>{t("选鞋时，你最看重什么？", "What matters most in a shoe?")} <span className={styles.optional}>{t("可选", "Optional")}</span></legend>
              <p className={styles.hint} style={{ margin: "-4px 0 16px" }}>{t("按重要程度依次选择 3 项。也可以以后再选。", "Choose three, starting with your top priority. Or leave this for later.")}</p>
              <div className={styles.choiceGrid}>{DIM_KEYS.map((key) => { const rank = picks.indexOf(key); return <button key={key} type="button" className={styles.choice} data-selected={rank >= 0} aria-pressed={rank >= 0} aria-label={`${DIM_TEXT[key][zh ? 0 : 1]}${rank >= 0 ? `, ${t("优先级", "priority")} ${rank + 1}` : ""}`} onClick={() => togglePick(key)}>
                <span className={styles.rank}>{rank >= 0 ? rank + 1 : <span aria-hidden="true">—</span>}</span><span className={styles.choiceText}>{DIM_TEXT[key][zh ? 0 : 1]}<span className={styles.choiceHelp}>{DIM_TEXT[key][zh ? 2 : 3]}</span></span>
              </button>; })}</div>{error("picks")}
            </fieldset>}
            {step === 3 && <div>
              <dl className={styles.review}>
                <div className={styles.reviewRow}><dt>{t("位置", "Position")}</dt><dd>{positions.join(" / ")}</dd></div>
                <div className={styles.reviewRow}><dt>{t("水平", "Level")}</dt><dd>{skill ? SKILL_TEXT[skill][zh ? 0 : 1] : "—"}</dd></div>
                <div className={styles.reviewRow}><dt>{t("身体信息", "Build")}</dt><dd>{height} cm · {weight} kg</dd></div>
                <div className={styles.reviewRow}><dt>{t("扁平足", "Flat feet")}</dt><dd>{flatFoot === null ? "—" : flatFoot ? t("有", "Yes") : t("没有", "No")}</dd></div>
                <div className={styles.reviewRow}><dt>{t("选鞋偏好", "Priorities")}</dt><dd>{picks.length ? picks.map((key) => DIM_TEXT[key][zh ? 0 : 1]).join(" → ") : t("以后再设置", "Set later")}</dd></div>
              </dl>
              <p className={styles.hint} style={{ marginTop: 12 }}>{t("保存后即可自由浏览球鞋。档案会为已有的选鞋功能提供参考。", "Save to explore the catalogue. Your profile adds context to the shoe tools you use.")}</p>
            </div>}
          </motion.div>
        </AnimatePresence>
          {message && <div ref={feedbackRef} className={`${styles.feedback} ${styles.profileFeedback} ${partial ? styles.notice : ""}`} role="status">{partial ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{message}</span></div>}
          {partial && baseConfirmed && <div className={styles.partialActions}><button type="button" className={styles.secondary} disabled={busy} onClick={() => void finish()}>{t("重试保存偏好", "Retry saving priorities")}</button></div>}
          {step === 2 && picks.length > 0 && <div className={styles.partialActions}><button type="button" className={styles.secondary} onClick={() => { setPicks([]); move(3); }}>{t("暂不设置偏好，继续", "Continue without priorities")}</button></div>}
          <ScrollHint targetRef={targetRef} zh={zh} compact={short} />
        </div>
        <div className={styles.profileActions} data-form-actions>
          {partial && baseConfirmed ? <>
            <motion.button type="button" className={styles.primary} disabled={busy} onClick={() => void finish(true)} whileTap={reduce ? undefined : { scale: .985 }}>{busy ? <Loader2 size={18} className={styles.spinner} /> : <ArrowRight size={18} />}{t("先开始球鞋探索", "Start exploring now")}</motion.button>
          </> : <motion.button type="submit" className={styles.primary} disabled={busy} whileTap={reduce ? undefined : { scale: .985 }} transition={{ duration: .12 }}>
            {busy ? <Loader2 size={18} className={styles.spinner} /> : null}
            {busy ? t("正在保存并确认…", "Saving & confirming…") : step === 3 ? t("保存档案，继续", "Save profile & continue") : t("继续", "Continue")}
            {!busy && (step === 3 ? <ArrowRight size={18} /> : <ChevronRight size={18} />)}
          </motion.button>}
          <div className={styles.backRow}>{(step > 0 || onBack) && <button type="button" className={styles.secondary} disabled={busy} onClick={() => step > 0 ? move(step - 1) : onBack?.()}><ArrowLeft size={15} />{t("返回", "Back")}</button>}</div>
        </div>
      </form>
    </>}
    </div>
  </section>;
}
