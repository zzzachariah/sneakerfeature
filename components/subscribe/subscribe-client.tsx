"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check, Crown, Sparkles, Zap, Ruler, Palette, Gauge, ChevronRight, ArrowUp, ArrowDown, LayoutList } from "lucide-react";
import { HOME_SECTIONS, resolveHomeOrder, type HomeSectionId } from "@/lib/home/sections";
import {
  TIERS,
  DURATIONS,
  priceFor,
  monthlyEquivalent,
  type Tier,
  type Duration
} from "@/lib/subscription/tiers";
import { SKINS, SKIN_ORDER, skinPalette, type SkinId } from "@/lib/subscription/skins";

export type SubscribeCurrent = {
  signedIn: boolean;
  isAdmin: boolean;
  tier: Tier;
  isPermanent: boolean;
  expiresAt: string | null;
  skin: SkinId;
  homeOrder: string[];
};

// One luxury membership card, themed by the chosen skin + tier palette.
function MembershipCard({ tier, skin, active }: { tier: "pro" | "max"; skin: SkinId; active: boolean }) {
  const p = skinPalette(skin, tier);
  const cfg = TIERS[tier];
  const reduce = useReducedMotion();
  return (
    <div
      className="relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl p-5"
      style={{
        background: p.cardBg,
        color: p.cardInk,
        boxShadow: active
          ? `0 30px 60px -24px rgba(0,0,0,0.6), 0 0 0 1px ${p.accent}55, inset 0 1px 0 rgba(255,255,255,0.12)`
          : "0 20px 44px -26px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1)"
      }}
    >
      {/* Sheen */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(125deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.1) 100%)",
            mixBlendMode: "screen"
          }}
          animate={{ x: ["-4%", "4%", "-4%"] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="text-[0.7rem] font-bold uppercase tracking-[0.22em]" style={{ color: p.accentSoft }}>
            {cfg.name}
          </span>
          <span className="text-[0.7rem] tracking-wide" style={{ opacity: 0.7 }}>
            sneakerfeature
          </span>
        </div>
        <div
          className="h-7 w-10 rounded-md"
          style={{ background: `linear-gradient(135deg, ${p.accentSoft}, ${p.accent})`, opacity: 0.85 }}
        />
        <div className="text-lg font-semibold tracking-tight">Member</div>
        <div className="flex items-end justify-between">
          <span className="text-2xl leading-none" style={{ color: p.accentSoft }} aria-hidden>
            {p.emblem}
          </span>
          <span className="text-[0.65rem] uppercase tracking-[0.14em]" style={{ opacity: 0.7 }}>
            {tier === "max" ? "Signature" : "Member"}
          </span>
        </div>
      </div>
    </div>
  );
}

function priceLabel(tier: "pro" | "max", duration: Duration): { price: string; per: string | null } {
  const price = priceFor(tier, duration);
  const perMonth = monthlyEquivalent(tier, duration);
  return {
    price: price == null ? "—" : `¥${price}`,
    per: duration === "permanent" ? "一次买断" : perMonth != null ? `≈ ¥${perMonth} / 月` : null
  };
}

const BENEFIT_ROWS: { icon: typeof Zap; label: string; free: string; pro: string; max: string }[] = [
  { icon: Gauge, label: "AI 模型", free: "Haiku · 轻量", pro: "deepseek-v4-pro", max: "Fable · 顶级" },
  { icon: Zap, label: "基础推理", free: "签到计量", pro: "不限次", max: "不限次" },
  { icon: Sparkles, label: "高级模型额度", free: "—", pro: "300 分 / 月", max: "1500 分 / 月" },
  { icon: Ruler, label: "逐款精准尺码", free: "品牌级", pro: "✓ 脚型精准", max: "✓ 更细楦型" },
  { icon: Palette, label: "皮肤 · 徽章 · 个性化", free: "—", pro: "✓", max: "✓ 深度" },
  { icon: Crown, label: "优先级 · 抢先体验", free: "—", pro: "—", max: "✓" }
];

export function SubscribeClient({ current }: { current: SubscribeCurrent }) {
  const [duration, setDuration] = useState<Duration>("yearly");
  const [skin, setSkin] = useState<SkinId>(current.skin);
  const [notice, setNotice] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const canPersonalize = current.isAdmin || current.tier === "pro" || current.tier === "max";

  const [homeOrder, setHomeOrder] = useState<HomeSectionId[]>(resolveHomeOrder(current.homeOrder));

  function moveSection(index: number, dir: -1 | 1) {
    const next = [...homeOrder];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setHomeOrder(next);
    void fetch("/api/member/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeOrder: next })
    }).catch(() => {});
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

  const fade = reduce ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

  function onSubscribe(tier: "pro" | "max") {
    if (current.isAdmin) {
      setNotice("你是管理员 —— 前往「后台 › Members」即可给任意用户（包括自己）手动开通 Pro/Max。在线支付即将上线。");
      return;
    }
    const label = `${TIERS[tier].name} · ${DURATIONS.find((d) => d.id === duration)?.label}`;
    setNotice(`已记录你对 ${label} 的开通意向。目前开通由管理员手动完成，在线支付即将上线 —— 可通过站点底部「联系」告知你的用户名与想要的档位。`);
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
          把选鞋，交给更强的大脑。
        </h1>
        <p className="mx-auto mt-4 max-w-[46ch] text-sm soft-text sm:text-base">
          Pro 与 Max 解锁更强的 AI 模型、逐款精准尺码，以及一整套可自由切换的奢侈皮肤与个性化。
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
            当前：{TIERS[current.tier].name}
            {current.isPermanent
              ? " · 永久"
              : current.expiresAt
                ? ` · 至 ${new Date(current.expiresAt).toLocaleDateString()}`
                : ""}
          </div>
        )}
      </motion.header>

      {/* Skin picker */}
      <motion.section className="mt-10" {...fade} transition={{ duration: 0.45 }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">选一套皮肤</h2>
          <span className="text-xs soft-text">会员可随时在设置里切换</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {SKIN_ORDER.map((id) => {
            const s = SKINS[id];
            const selected = skin === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => chooseSkin(id)}
                className="group relative overflow-hidden rounded-2xl border p-4 text-left transition"
                style={{
                  borderColor: selected ? s.max.accent : "rgb(var(--muted) / 0.4)",
                  boxShadow: selected ? `0 0 0 1px ${s.max.accent}, 0 12px 30px -18px ${s.max.accent}aa` : "none"
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full" style={{ background: s.pro.accent }} />
                  <span className="h-4 w-4 rounded-full" style={{ background: s.max.accent }} />
                  <span className="ml-auto text-[0.65rem] uppercase tracking-widest soft-text">{s.nameEn}</span>
                </div>
                <div className="mt-2 font-medium">{s.name}</div>
                <p className="mt-1 text-xs leading-relaxed soft-text">{s.blurb}</p>
                {selected && (
                  <span
                    className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: s.max.accent, color: s.max.onAccent }}
                  >
                    <Check className="h-3 w-3" />
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
                <span className="relative">{d.label}</span>
              </button>
            );
          })}
        </div>
      </motion.section>

      {/* Tier cards */}
      <section className="mt-10 grid gap-6 md:grid-cols-2">
        {(["pro", "max"] as const).map((tier, i) => {
          const cfg = TIERS[tier];
          const pal = skinPalette(skin, tier);
          const { price, per } = priceLabel(tier, duration);
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
              {tier === "max" && (
                <span
                  className="absolute right-5 top-5 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-widest"
                  style={{ color: cfg.badgeHue, backgroundColor: `${cfg.badgeHue}1f`, border: `1px solid ${cfg.badgeHue}55` }}
                >
                  旗舰
                </span>
              )}
              <div className="mb-5 max-w-[260px]">
                <MembershipCard tier={tier} skin={skin} active />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tracking-tight" style={{ color: cfg.badgeHue }}>
                  {cfg.name}
                </span>
                <span className="text-sm soft-text">· {cfg.tagline}</span>
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
              </div>

              <div
                className="mt-4 flex items-baseline gap-2 rounded-xl px-4 py-3"
                style={{ background: `${cfg.badgeHue}12`, border: `1px solid ${cfg.badgeHue}33` }}
              >
                <span className="num-display text-xl font-bold" style={{ color: cfg.badgeHue }}>
                  {cfg.capabilities.monthlyAllowance}
                </span>
                <span className="text-xs soft-text">分 / 月 高级模型额度 · 基础不限次</span>
              </div>

              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {(tier === "pro"
                  ? ["精准逐款尺码 + 脚型建议", "主力模型不限次", "自定义首页顺序 / 菜单栏", "Pro 皮肤 + 专属徽章"]
                  : ["Pro 全部权益，额度 5×", "解锁顶级 Fable 模型", "更深度个性化 + 抢先体验", "Max 皮肤 + 尊享徽章"]
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
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition active:scale-[0.99]"
                style={{ background: pal.buttonBg, color: pal.onAccent }}
              >
                <Crown className="h-4 w-4" />
                开通 {cfg.name}
                <ChevronRight className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </section>

      <AnimatePresence>
        {notice && (
          <motion.div
            className="mt-6 rounded-2xl border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--surface))] p-4 text-sm soft-text"
            initial={reduce ? undefined : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Benefit matrix */}
      <motion.section className="mt-14" {...fade} transition={{ duration: 0.5 }}>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">逐项对比</h2>
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
                        {r.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 soft-text">{r.free}</td>
                    <td className="px-4 py-3">{r.pro}</td>
                    <td className="px-4 py-3">{r.max}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs soft-text">
          计费为混合制：基础模型对付费会员不限次，高级 Fable 模型从每月额度扣分（永久档每月刷新，不叠加）。价格为初期定价，可能调整。
        </p>
      </motion.section>

      {/* Member personalization (paid tiers). */}
      {canPersonalize && (
        <motion.section className="mt-14" {...fade} transition={{ duration: 0.5 }}>
          <div className="mb-4 flex items-center gap-2">
            <LayoutList className="h-5 w-5" style={{ color: TIERS[current.tier === "max" ? "max" : "pro"].badgeHue }} />
            <h2 className="text-lg font-semibold tracking-tight">会员个性化</h2>
            <span className="text-xs soft-text">仅 Pro / Max</span>
          </div>
          <div className="rounded-2xl border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--bg-elev))] p-5">
            <p className="mb-3 text-sm font-medium">首页板块顺序</p>
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
                      aria-label="上移"
                      disabled={i === 0}
                      onClick={() => moveSection(i, -1)}
                      className="rounded-lg border border-[rgb(var(--muted)/0.5)] p-1.5 transition hover:bg-[rgb(var(--text)/0.05)] disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="下移"
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
            <p className="mt-3 text-xs soft-text">调整会立即保存，下次打开首页即按此顺序展示。皮肤选择见页面上方。</p>
          </div>
        </motion.section>
      )}
    </div>
  );
}
