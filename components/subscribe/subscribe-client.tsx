"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check, Crown, Sparkles, Zap, Ruler, Palette, Gauge, ChevronRight, ArrowUp, ArrowDown, LayoutList, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { HOME_SECTIONS, resolveHomeOrder, type HomeSectionId } from "@/lib/home/sections";
import { useLocale } from "@/components/i18n/locale-provider";
import {
  TIERS,
  DURATIONS,
  CURRENCY,
  priceFor,
  monthlyEquivalent,
  pickerModelInfo,
  type ModelId,
  type Tier,
  type Duration
} from "@/lib/subscription/tiers";
import { purchaseDecision } from "@/lib/subscription/resolve";
import { SKINS, SKIN_ORDER, skinPalette, hexToRgbTriple, darkenHex, isMaxExclusiveSkin, type SkinId } from "@/lib/subscription/skins";
import { Lock } from "lucide-react";
import { MembershipCard } from "@/components/subscribe/membership-card";

// Preset "Signature" accents Max members can pick from (or use the color wheel).
const SIGNATURE_PRESETS = ["#e0559c", "#29c2e6", "#7a5cff", "#d9b45a", "#ff6e40", "#38d39f", "#f0456b", "#12b886"];

// Visible save feedback for the personalization prefs. The writes were always
// real but silent — members couldn't tell whether a pick had landed. Each card
// now shows its own saving → saved (→ auto-fades) / failed status.
type SaveState = "idle" | "saving" | "saved" | "error";

function SaveStatus({ state, zh }: { state: SaveState; zh: boolean }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span role="status" className="inline-flex items-center gap-1 text-[0.7rem] font-medium soft-text">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        {zh ? "保存中…" : "Saving…"}
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span role="status" className="inline-flex items-center gap-1 text-[0.7rem] font-semibold" style={{ color: "#12b886" }}>
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        {zh ? "已保存" : "Saved"}
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-[rgb(var(--error))]">
      {zh ? "保存失败，请重试" : "Save failed — try again"}
    </span>
  );
}

// English duration labels (DURATIONS carries the Chinese ones).
const DURATION_LABEL_EN: Record<Duration, string> = {
  monthly: "1 month",
  quarterly: "3 months",
  yearly: "1 year",
  permanent: "Lifetime"
};

const TAGLINE_EN: Record<"pro" | "max", string> = {
  pro: "For people who pick seriously",
  max: "For enthusiasts & collectors"
};

export type SubscribeCurrent = {
  signedIn: boolean;
  isAdmin: boolean;
  tier: Tier;
  isPermanent: boolean;
  expiresAt: string | null;
  skin: SkinId;
  customAccent: string | null;
  homeOrder: string[];
};

// Percentage saved vs paying month-to-month, for a given tier+duration. Returns
// null for the monthly baseline (nothing saved) and for permanent (no monthly
// equivalent to compare against).
function savingsPct(tier: "pro" | "max", duration: Duration): number | null {
  if (duration === "monthly" || duration === "permanent") return null;
  const monthly = priceFor(tier, "monthly");
  const equiv = monthlyEquivalent(tier, duration);
  if (monthly == null || equiv == null || monthly <= 0) return null;
  const pct = Math.round((1 - equiv / monthly) * 100);
  return pct > 0 ? pct : null;
}

function priceLabel(tier: "pro" | "max", duration: Duration, zh: boolean): { price: string; per: string | null } {
  const price = priceFor(tier, duration);
  const perMonth = monthlyEquivalent(tier, duration);
  return {
    price: price == null ? "—" : `${CURRENCY}${price}`,
    per:
      duration === "permanent"
        ? zh
          ? "一次买断"
          : "One-time"
        : perMonth != null
          ? `≈ ${CURRENCY}${perMonth} / ${zh ? "月" : "mo"}`
          : null
  };
}

type BenefitRow = {
  icon: typeof Zap;
  label: string;
  labelEn: string;
  free: string;
  freeEn: string;
  pro: string;
  proEn: string;
  max: string;
  maxEn: string;
};

// Display name for a model id, straight from the picker catalog, so the
// comparison table can't advertise a model the Smart Picker no longer runs.
const modelName = (id: ModelId | null): string | null => (id ? (pickerModelInfo(id)?.name ?? id) : null);

// "<base> + <premium>" for a paid tier (Pro: DeepSeek V4 + Fable, Max: … + Opus 5).
function tierModels(tier: Exclude<Tier, "free">): string {
  const cfg = TIERS[tier];
  const premium = modelName(cfg.capabilities.premiumModel);
  return [modelName(cfg.baseModel), premium].filter(Boolean).join(" + ");
}

const BENEFIT_ROWS: BenefitRow[] = [
  {
    icon: Gauge,
    label: "AI 模型",
    labelEn: "AI model",
    free: "Haiku · 轻量",
    freeEn: "Haiku · light",
    pro: tierModels("pro"),
    proEn: tierModels("pro"),
    max: `${tierModels("max")} · 顶级`,
    maxEn: `${tierModels("max")} · flagship`
  },
  { icon: Zap, label: "基础推理", labelEn: "Base reasoning", free: "签到计量", freeEn: "Metered by check-in", pro: "不限次", proEn: "Unlimited", max: "不限次", maxEn: "Unlimited" },
  // Allowance numbers read straight from TIERS — the comparison table used to
  // hardcode them, which silently lied the moment the grants were retuned.
  {
    icon: Sparkles,
    label: "高级模型额度",
    labelEn: "Premium model allowance",
    free: "—",
    freeEn: "—",
    pro: `${TIERS.pro.capabilities.monthlyAllowance} 分 / 月`,
    proEn: `${TIERS.pro.capabilities.monthlyAllowance} / mo`,
    max: `${TIERS.max.capabilities.monthlyAllowance} 分 / 月`,
    maxEn: `${TIERS.max.capabilities.monthlyAllowance} / mo`
  },
  { icon: Ruler, label: "逐款精准尺码", labelEn: "Per-shoe precise sizing", free: "品牌级", freeEn: "Brand-level", pro: "✓ 脚型精准", proEn: "✓ Foot-precise", max: "✓ 更细楦型", maxEn: "✓ Finer last" },
  { icon: Palette, label: "皮肤 · 徽章 · 个性化", labelEn: "Skins · badge · personalization", free: "—", freeEn: "—", pro: "✓", proEn: "✓", max: "✓ 深度", maxEn: "✓ Deep" },
  { icon: Crown, label: "优先级 · 抢先体验", labelEn: "Priority · early access", free: "—", freeEn: "—", pro: "—", proEn: "—", max: "✓", maxEn: "✓" }
];

export function SubscribeClient({ current }: { current: SubscribeCurrent }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const t = (z: string, e: string) => (zh ? z : e);

  const [duration, setDuration] = useState<Duration>("yearly");
  const [skin, setSkin] = useState<SkinId>(current.skin);
  const [pending, setPending] = useState<"pro" | "max" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  // The duration that saves the most vs month-to-month (Pro as the reference),
  // surfaced as a "最划算 / Best" tag on the toggle.
  const bestValueDuration: Duration = (["quarterly", "yearly"] as Duration[]).reduce(
    (best, d) => ((savingsPct("pro", d) ?? 0) > (savingsPct("pro", best) ?? 0) ? d : best),
    "yearly" as Duration
  );

  const canPersonalize = current.isAdmin || current.tier === "pro" || current.tier === "max";

  // Membership-change policy surface: a signed-in member on an ACTIVE paid tier
  // is locked to it until it expires (renew/extend the same tier is fine;
  // switching tiers is not). Admins bypass so they can test both checkouts.
  const activePaid = current.signedIn && !current.isAdmin && (current.tier === "pro" || current.tier === "max");

  const [homeOrder, setHomeOrder] = useState<HomeSectionId[]>(resolveHomeOrder(current.homeOrder));
  const [accentSave, setAccentSave] = useState<SaveState>("idle");
  const [orderSave, setOrderSave] = useState<SaveState>("idle");
  const saveSeq = useRef({ accent: 0, order: 0 });

  // Persist a prefs patch with visible status. The seq guard keeps rapid edits
  // (arrow taps, color-wheel drags) from letting a slow early response
  // overwrite the status of a later one; "saved" auto-fades after a beat.
  function persistPrefs(patch: Record<string, unknown>, kind: "accent" | "order", set: (s: SaveState) => void) {
    const seq = ++saveSeq.current[kind];
    set("saving");
    void fetch("/api/member/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    })
      .then((res) => res.json())
      .then((data) => {
        if (saveSeq.current[kind] !== seq) return;
        set(data?.ok ? "saved" : "error");
        if (data?.ok) {
          setTimeout(() => {
            if (saveSeq.current[kind] === seq) set("idle");
          }, 2200);
        }
      })
      .catch(() => {
        if (saveSeq.current[kind] === seq) set("error");
      });
  }

  function moveSection(index: number, dir: -1 | 1) {
    const next = [...homeOrder];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setHomeOrder(next);
    persistPrefs({ homeOrder: next }, "order", setOrderSave);
  }

  function chooseSkin(id: SkinId) {
    setSkin(id);
    // Paid members' choice persists; for everyone else it's just a live preview.
    if (!canPersonalize) return;
    void fetch("/api/member/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skin: id })
    }).catch(() => {});
  }

  const [customAccent, setCustomAccent] = useState<string | null>(current.customAccent);
  const canSignature = current.tier === "max" || current.isAdmin;

  // Push the accent to the whole page immediately for live feedback; null clears
  // back to the chosen skin's accent. MemberThemeApplier persists it on next sync.
  function applyBrandLive(hex: string | null) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const isDark =
      root.classList.contains("dark") ||
      (!root.classList.contains("light") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const maxPal = skinPalette(skin, "max");
    const dark = hex ?? maxPal.accent;
    const light = hex ? darkenHex(hex) : maxPal.accentLight ?? maxPal.accent;
    const triple = hexToRgbTriple(isDark ? dark : light);
    if (triple) root.style.setProperty("--brand", triple);
  }

  function chooseAccent(hex: string | null) {
    setCustomAccent(hex);
    applyBrandLive(hex);
    if (!canSignature) return;
    persistPrefs({ customAccent: hex }, "accent", setAccentSave);
  }

  const fade = reduce ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

  async function onSubscribe(tier: "pro" | "max") {
    if (pending) return;
    // Client mirror of the server policy: block switching tiers while an active
    // paid plan exists. The server (/api/stripe/checkout) is the real guard.
    if (!current.isAdmin && !purchaseDecision(current.tier, tier).allowed) return;
    setError(null);
    setPending(tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, duration })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.message || t("创建支付会话失败，请重试。", "Couldn't start checkout. Please try again."));
      }
      // Hand off to Stripe's hosted checkout page.
      window.location.assign(data.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("出错了，请重试。", "Something went wrong. Please try again."));
      setPending(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      {/* Hero */}
      <motion.header
        className="relative overflow-hidden rounded-3xl border border-[rgb(var(--muted)/0.4)] px-6 py-12 text-center sm:py-16"
        style={{
          background:
            "radial-gradient(900px 380px at 70% -10%, rgba(76,134,224,0.14), transparent 60%), radial-gradient(700px 320px at 15% 0%, rgba(217,180,90,0.1), transparent 55%), rgb(var(--surface))"
        }}
        initial={reduce ? undefined : { opacity: 0, y: 20 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.24em] soft-text">Premium Membership</p>
        <h1 className="mx-auto mt-3 max-w-[16ch] text-balance text-3xl font-bold tracking-tight sm:text-5xl">
          {t("把选鞋，交给更强的大脑。", "Give your shoe picks a smarter brain.")}
        </h1>
        <p className="mx-auto mt-4 max-w-[46ch] text-sm soft-text sm:text-base">
          {t(
            "Pro 与 Max 解锁更强的 AI 模型、逐款精准尺码，以及一整套可自由切换的奢侈皮肤与个性化。",
            "Pro and Max unlock a stronger AI model, per-shoe precise sizing, and a full set of switchable luxury skins and personalization."
          )}
        </p>

        {current.signedIn && current.tier !== "free" && (
          <div
            className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium"
            style={{
              color: TIERS[current.tier].badgeHue,
              backgroundColor: `${TIERS[current.tier].badgeHue}1f`,
              border: `1px solid ${TIERS[current.tier].badgeHue}55`
            }}
          >
            <Crown className="h-4 w-4" />
            {t("当前：", "Current: ")}
            {TIERS[current.tier].name}
            {current.isPermanent
              ? t(" · 永久", " · Permanent")
              : current.expiresAt
                ? `${t(" · 至 ", " · until ")}${new Date(current.expiresAt).toLocaleDateString()}`
                : ""}
          </div>
        )}
      </motion.header>

      {/* Skin picker */}
      <motion.section className="mt-10" {...fade} transition={{ duration: 0.45 }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{t("选一套皮肤", "Pick a skin")}</h2>
          <span className="text-xs soft-text">{t("会员可随时在设置里切换", "Members can switch anytime")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SKIN_ORDER.map((id) => {
            const s = SKINS[id];
            const selected = skin === id;
            const exclusive = isMaxExclusiveSkin(id);
            const locked = exclusive && !canSignature;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (locked) return;
                  chooseSkin(id);
                }}
                aria-disabled={locked}
                className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition ${locked ? "cursor-not-allowed opacity-70" : ""}`}
                style={{
                  borderColor: selected ? s.max.accent : "rgb(var(--muted) / 0.4)",
                  boxShadow: selected ? `0 0 0 1px ${s.max.accent}, 0 12px 30px -18px ${s.max.accent}aa` : "none"
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full" style={{ background: s.pro.accent }} />
                  <span className="h-4 w-4 rounded-full" style={{ background: s.max.accent }} />
                  {exclusive && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wide"
                      style={{ color: "#1a1305", background: "linear-gradient(135deg, #ffe38a, #c99a2a)" }}
                    >
                      {t("Max 限定", "Max only")}
                    </span>
                  )}
                  <span className="ml-auto text-[0.65rem] uppercase tracking-widest soft-text">{s.nameEn}</span>
                </div>
                <div className="mt-2 font-medium">{zh ? s.name : s.nameEn}</div>
                <p className="mt-1 text-xs leading-relaxed soft-text">{zh ? s.blurb : s.blurbEn}</p>
                {selected && !locked && (
                  <span
                    className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: s.max.accent, color: s.max.onAccent }}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                )}
                {locked && (
                  <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(var(--text)/0.1)]">
                    <Lock className="h-3 w-3 soft-text" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </motion.section>

      {/* Duration toggle */}
      <motion.section className="mt-10" {...fade} transition={{ duration: 0.45 }}>
        <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--surface))] p-1">
          {DURATIONS.map((d) => {
            const active = duration === d.id;
            const isBest = d.id === bestValueDuration;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDuration(d.id)}
                className="relative rounded-full px-4 py-1.5 text-sm font-medium transition"
                style={{ color: active ? "rgb(var(--bg-elev))" : "rgb(var(--subtext))" }}
              >
                {active && (
                  <motion.span
                    layoutId="dur-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "rgb(var(--text))" }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{zh ? d.label : DURATION_LABEL_EN[d.id]}</span>
                {isBest && (
                  <span
                    className="pointer-events-none absolute -right-1.5 -top-2 rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold leading-none tracking-wide"
                    style={{
                      color: "#1a1305",
                      background: "linear-gradient(135deg, #f0d488, #b8912f)",
                      boxShadow: "0 4px 10px -4px rgba(0,0,0,0.5)"
                    }}
                  >
                    {t("最划算", "Best")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </motion.section>

      {/* Active-member policy reminder: you already hold a paid plan and can't
          switch tiers until it expires (renewing the same tier stays open). */}
      {activePaid && (
        <motion.div
          className="mt-8 flex items-start gap-3 rounded-2xl border p-4"
          style={{ borderColor: `${TIERS[current.tier].badgeHue}55`, background: `${TIERS[current.tier].badgeHue}12` }}
          {...fade}
          transition={{ duration: 0.4 }}
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: TIERS[current.tier].badgeHue }} />
          <div className="text-sm">
            <p className="font-semibold" style={{ color: TIERS[current.tier].badgeHue }}>
              {t(`你已是 ${TIERS[current.tier].name} 会员`, `You're already on ${TIERS[current.tier].name}`)}
              {current.isPermanent
                ? t("（永久）", " (Lifetime)")
                : current.expiresAt
                  ? t(
                      `（${new Date(current.expiresAt).toLocaleDateString()} 到期）`,
                      ` (until ${new Date(current.expiresAt).toLocaleDateString()})`
                    )
                  : ""}
            </p>
            <p className="mt-1 soft-text">
              {current.isPermanent
                ? t(
                    "永久会员暂不支持更换其他档位，你已享有当前会员的全部权益。",
                    "Lifetime members can't switch tiers for now — you already have everything your plan includes."
                  )
                : t(
                    "根据会员政策，当前会员到期前不可更换其他档位；但你可以随时续费延长同一档位。",
                    "Per our membership policy, you can't switch tiers until your current plan expires — but you can renew or extend the same tier anytime."
                  )}
            </p>
          </div>
        </motion.div>
      )}

      {/* Tier cards */}
      <section className="mt-10 grid gap-6 md:grid-cols-2">
        {(["pro", "max"] as const).map((tier, i) => {
          const cfg = TIERS[tier];
          const pal = skinPalette(skin, tier);
          const { price, per } = priceLabel(tier, duration, zh);
          const saved = savingsPct(tier, duration);
          // Policy gate for this card: lock the OTHER tier while a paid plan is
          // active; the CURRENT tier's CTA becomes a renew/extend action.
          const gate = purchaseDecision(current.tier, tier);
          const locked = activePaid && !gate.allowed;
          const isRenew = current.signedIn && gate.allowed && gate.kind === "extend";
          return (
            <motion.div
              key={tier}
              className="relative flex flex-col overflow-hidden rounded-3xl border p-6"
              style={{
                borderColor: tier === "max" ? `${cfg.badgeHue}44` : "rgb(var(--muted) / 0.4)",
                background: "rgb(var(--bg-elev))"
              }}
              initial={reduce ? undefined : { opacity: 0, y: 24 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className="absolute right-5 top-5 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-widest"
                style={{ color: cfg.badgeHue, backgroundColor: `${cfg.badgeHue}1f`, border: `1px solid ${cfg.badgeHue}55` }}
              >
                {tier === "max" ? t("旗舰", "Flagship") : t("最受欢迎", "Most popular")}
              </span>
              <div className="mb-5 max-w-[260px]">
                <MembershipCard tier={tier} skin={skin} active />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tracking-tight" style={{ color: cfg.badgeHue }}>
                  {cfg.name}
                </span>
                <span className="text-sm soft-text">· {zh ? cfg.tagline : TAGLINE_EN[tier]}</span>
              </div>

              <div className="mt-4 flex items-end gap-2">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={`${tier}-${duration}`}
                    className="num-display text-4xl font-bold tracking-tight"
                    initial={reduce ? undefined : { opacity: 0, y: 8 }}
                    animate={reduce ? undefined : { opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {price}
                  </motion.span>
                </AnimatePresence>
                {per && <span className="pb-1 text-xs soft-text">{per}</span>}
                {saved != null && (
                  <span
                    className="mb-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold"
                    style={{ color: cfg.badgeHue, backgroundColor: `${cfg.badgeHue}1f`, border: `1px solid ${cfg.badgeHue}44` }}
                  >
                    {t(`省 ${saved}%`, `Save ${saved}%`)}
                  </span>
                )}
              </div>

              <div
                className="mt-4 flex items-baseline gap-2 rounded-xl px-4 py-3"
                style={{ background: `${cfg.badgeHue}12`, border: `1px solid ${cfg.badgeHue}33` }}
              >
                <span className="num-display text-xl font-bold" style={{ color: cfg.badgeHue }}>
                  {cfg.capabilities.monthlyAllowance}
                </span>
                <span className="text-xs soft-text">
                  {t("分 / 月 高级模型额度 · 基础不限次", "/ mo premium-model allowance · base unlimited")}
                </span>
              </div>

              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {(tier === "pro"
                  ? zh
                    ? ["精准逐款尺码 + 脚型建议", "主力模型不限次", "自定义首页顺序 / 菜单栏", "Pro 皮肤 + 专属徽章"]
                    : ["Per-shoe precise sizing + foot advice", "Unlimited main model", "Custom home order / menu", "Pro skins + member badge"]
                  : zh
                    ? ["Pro 全部权益，额度 5×", `解锁顶级 ${modelName(TIERS.max.capabilities.premiumModel)} 模型`, "更深度个性化 + 抢先体验", "Max 皮肤 + 尊享徽章"]
                    : [
                        "Everything in Pro, 5× allowance",
                        `Unlock the top ${modelName(TIERS.max.capabilities.premiumModel)} model`,
                        "Deeper personalization + early access",
                        "Max skins + signature badge"
                      ]
                ).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: cfg.badgeHue }} />
                    <span className="soft-text">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => onSubscribe(tier)}
                disabled={pending !== null || locked}
                aria-disabled={locked}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-70"
                style={
                  locked
                    ? { background: "rgb(var(--text) / 0.06)", color: "rgb(var(--subtext))", cursor: "not-allowed" }
                    : { background: pal.buttonBg, color: pal.onButton }
                }
              >
                {locked ? (
                  <>
                    <Lock className="h-4 w-4" />
                    {t("到期前不可更换", "Locked until expiry")}
                  </>
                ) : (
                  <>
                    {isRenew ? <RefreshCw className="h-4 w-4" /> : <Crown className="h-4 w-4" />}
                    {pending === tier
                      ? t("跳转中…", "Redirecting…")
                      : isRenew
                        ? t(`续费 ${cfg.name}`, `Renew ${cfg.name}`)
                        : `${t("开通", "Get")} ${cfg.name}`}
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
              {locked && (
                <p className="mt-2 text-center text-xs soft-text">
                  {t("当前会员到期后可更换此档位", "Available to switch once your current plan expires")}
                </p>
              )}
            </motion.div>
          );
        })}
      </section>

      {error && (
        <p className="mt-6 rounded-2xl border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--surface))] p-4 text-center text-sm soft-text">
          {error}
        </p>
      )}

      {/* Benefit matrix */}
      <motion.section className="mt-14" {...fade} transition={{ duration: 0.5 }}>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">{t("逐项对比", "Compare plans")}</h2>
        <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--muted)/0.4)]">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--muted)/0.35)] text-left soft-text">
                <th className="px-4 py-3 font-medium"> </th>
                <th className="px-4 py-3 font-medium">Free</th>
                <th className="px-4 py-3 font-medium" style={{ color: TIERS.pro.badgeHue }}>Pro</th>
                <th className="px-4 py-3 font-medium" style={{ color: TIERS.max.badgeHue }}>Max</th>
              </tr>
            </thead>
            <tbody>
              {BENEFIT_ROWS.map((r) => {
                const Icon = r.icon;
                return (
                  <tr key={r.label} className="border-b border-[rgb(var(--muted)/0.2)] last:border-0">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium">
                        <Icon className="h-4 w-4 soft-text" />
                        {zh ? r.label : r.labelEn}
                      </span>
                    </td>
                    <td className="px-4 py-3 soft-text">{zh ? r.free : r.freeEn}</td>
                    <td className="px-4 py-3">{zh ? r.pro : r.proEn}</td>
                    <td className="px-4 py-3">{zh ? r.max : r.maxEn}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs soft-text">
          {t(
            `计费为混合制：基础模型对付费会员不限次，高级模型（Pro 用 ${modelName(TIERS.pro.capabilities.premiumModel)}，Max 用 ${modelName(TIERS.max.capabilities.premiumModel)}）从每月额度扣分（永久档每月刷新，不叠加）。价格为初期定价，可能调整。`,
            `Hybrid billing: the base model is unlimited for paid members; the premium models (${modelName(TIERS.pro.capabilities.premiumModel)} on Pro, ${modelName(TIERS.max.capabilities.premiumModel)} on Max) draw from a monthly allowance (permanent plans refresh monthly, no roll-over). Launch pricing, subject to change.`
          )}
        </p>
      </motion.section>

      {/* Member personalization (paid tiers). */}
      {canPersonalize && (
        <motion.section className="mt-14" {...fade} transition={{ duration: 0.5 }}>
          <div className="mb-4 flex items-center gap-2">
            <LayoutList className="h-5 w-5" style={{ color: TIERS[current.tier === "max" ? "max" : "pro"].badgeHue }} />
            <h2 className="text-lg font-semibold tracking-tight">{t("会员个性化", "Member personalization")}</h2>
            <span className="text-xs soft-text">{t("仅 Pro / Max", "Pro / Max only")}</span>
          </div>

          {canSignature && (
            <div className="mb-4 rounded-2xl border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--bg-elev))] p-5">
              <div className="mb-2 flex items-center gap-2">
                <Palette className="h-4 w-4" style={{ color: TIERS.max.badgeHue }} />
                <p className="text-sm font-medium">{t("专属签名色", "Signature accent")}</p>
                <span
                  className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide"
                  style={{ color: TIERS.max.badgeHue, backgroundColor: `${TIERS.max.badgeHue}1f`, border: `1px solid ${TIERS.max.badgeHue}55` }}
                >
                  Max
                </span>
                <span className="ml-auto">
                  <SaveStatus state={accentSave} zh={zh} />
                </span>
              </div>
              <p className="mb-3 text-xs soft-text">
                {t(
                  "为整站挑一个只属于你的强调色——按钮、激活态、焦点环都会跟着它走。选一个预设或用取色器。",
                  "Pick a site-wide accent that's yours alone — buttons, active states and focus rings all follow it. Choose a preset or use the color wheel."
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {SIGNATURE_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => chooseAccent(c)}
                    aria-label={c}
                    className="h-7 w-7 rounded-full transition"
                    style={{
                      background: c,
                      boxShadow: customAccent?.toLowerCase() === c ? `0 0 0 2px rgb(var(--bg-elev)), 0 0 0 4px ${c}` : "inset 0 0 0 1px rgba(255,255,255,0.2)"
                    }}
                  />
                ))}
                <label
                  className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-[rgb(var(--muted)/0.6)]"
                  aria-label={t("自定义取色", "Custom color")}
                >
                  <Palette className="h-3.5 w-3.5 soft-text" />
                  <input
                    type="color"
                    value={customAccent ?? skinPalette(skin, "max").accent}
                    onChange={(e) => chooseAccent(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
                {customAccent && (
                  <button
                    type="button"
                    onClick={() => chooseAccent(null)}
                    className="ml-1 rounded-full border border-[rgb(var(--muted)/0.5)] px-2.5 py-1 text-xs soft-text transition hover:bg-[rgb(var(--text)/0.05)]"
                  >
                    {t("重置", "Reset")}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--bg-elev))] p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{t("首页板块顺序", "Home section order")}</p>
              <SaveStatus state={orderSave} zh={zh} />
            </div>
            <ul className="flex flex-col gap-2">
              {homeOrder.map((id, i) => {
                const meta = HOME_SECTIONS.find((s) => s.id === id);
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-xl border border-[rgb(var(--muted)/0.35)] bg-[rgb(var(--surface))] px-4 py-2.5"
                  >
                    <span className="num-display text-sm soft-text">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium">{meta?.label ?? id}</span>
                    <button
                      type="button"
                      aria-label={t("上移", "Move up")}
                      disabled={i === 0}
                      onClick={() => moveSection(i, -1)}
                      className="rounded-lg border border-[rgb(var(--muted)/0.5)] p-1.5 transition hover:bg-[rgb(var(--text)/0.05)] disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("下移", "Move down")}
                      disabled={i === homeOrder.length - 1}
                      onClick={() => moveSection(i, 1)}
                      className="rounded-lg border border-[rgb(var(--muted)/0.5)] p-1.5 transition hover:bg-[rgb(var(--text)/0.05)] disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs soft-text">
              {t(
                "调整会立即保存，下次打开首页即按此顺序展示。皮肤选择见页面上方。启用「整站质感」皮肤时，首页会改用该皮肤自己的编排，此顺序仅作用于标准外观。",
                "Changes save instantly and apply next time you open the home page. Skin selection is above. When a Premium UI skin is active, the home page uses that skin's own layout — this order applies to the standard look only."
              )}
            </p>
          </div>
        </motion.section>
      )}
    </div>
  );
}
