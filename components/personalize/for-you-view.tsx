"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { motion, type Variants } from "framer-motion";
import {
  Sparkles,
  GitCompareArrows,
  Star,
  ArrowRight,
  MessageCircle,
  History,
  Trophy,
  Crown,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { SignInValue } from "@/components/auth/sign-in-value";
import { usePersona } from "@/components/preferences/persona-provider";
import { PersonaAvatar } from "@/components/home/persona-avatar";
import { haptics } from "@/lib/native/haptics";
import type { DigestCompareShoe, DigestRecommendation } from "@/lib/personalize/digest";
import { BgRemovedImg } from "@/components/shoe/bg-removed-img";

export type ForYouShoe = { id: string; name: string; slug: string; image: string | null; brand: string };

type Digest = { compare_shoes: unknown; recommendations: unknown } | null;

type Props = {
  signedIn: boolean;
  username: string;
  personaPosition: string | null;
  digest: Digest;
  recentShoes: ForYouShoe[];
  popular: ForYouShoe[];
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } }
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } }
};

const POSITION_ZH: Record<string, string> = { PG: "控卫", SG: "分卫", SF: "小前", PF: "大前", C: "中锋" };
const POSITION_EN: Record<string, string> = {
  PG: "a point guard",
  SG: "a shooting guard",
  SF: "a small forward",
  PF: "a power forward",
  C: "a center"
};

export function ForYouView({ signedIn, username, personaPosition, digest, recentShoes, popular }: Props) {
  const { locale, translate, getRankLabel } = useLocale();
  const { persona, isLoggedIn, openModal } = usePersona();

  function handleAvatarClick() {
    haptics.tap();
    if (!isLoggedIn) {
      window.location.href = "/login";
      return;
    }
    openModal();
  }

  const compareShoes = (digest?.compare_shoes as DigestCompareShoe[] | null) ?? [];
  const recommendations = (digest?.recommendations as DigestRecommendation[] | null) ?? [];
  const hasDigest = compareShoes.length > 0 || recommendations.length > 0;

  const hour = new Date().getHours();
  const greetWord =
    locale === "zh"
      ? hour < 5
        ? "夜深了"
        : hour < 12
          ? "早上好"
          : hour < 18
            ? "下午好"
            : "晚上好"
      : hour < 5
        ? "Still up"
        : hour < 12
          ? "Good morning"
          : hour < 18
            ? "Good afternoon"
            : "Good evening";
  const dateStr = new Date().toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "long",
    day: "numeric",
    weekday: "long"
  });
  const insight =
    personaPosition && (locale === "zh" ? POSITION_ZH : POSITION_EN)[personaPosition]
      ? locale === "zh"
        ? `为${POSITION_ZH[personaPosition]}的你精选`
        : `picks for ${POSITION_EN[personaPosition]}`
      : null;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-3xl px-5 py-8 sm:py-12"
    >
      {/* 1. Greeting + player avatar */}
      <motion.header variants={item}>
        <div className="flex items-center gap-2 text-[rgb(var(--accent))]">
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">{translate("Your weekly picks")}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {greetWord}
          {signedIn && username ? (locale === "zh" ? `，${username}` : `, ${username}`) : ""}
        </h1>
        <p className="mt-1 text-sm soft-text">
          {dateStr}
          {insight ? ` · ${insight}` : ""}
        </p>
        {/* Player avatar on its own full-width row (it includes a stats panel, so
            squeezing it beside the greeting pushed it off-screen on phones). The
            frosted-glass card is a light glassmorphism touch. */}
        <div className="glass mt-4 overflow-hidden rounded-2xl p-3">
          <PersonaAvatar persona={persona} dimmed={!isLoggedIn || !persona} onClick={handleAvatarClick} size="sm" />
        </div>
      </motion.header>

      {/* Signed-out / empty: start-browsing guide (popular still shows below) */}
      {!signedIn || (!hasDigest && recentShoes.length === 0) ? (
        <motion.section
          variants={item}
          className="surface-card premium-border mt-6 flex flex-col items-center gap-3 rounded-2xl p-8 text-center"
        >
          <Sparkles className="h-7 w-7 text-[rgb(var(--accent))]" />
          <p className="max-w-sm text-sm soft-text">
            {signedIn
              ? translate("Browse a few shoes and your weekly picks will appear here.")
              : translate("Sign in and browse a few shoes to unlock personalized weekly picks.")}
          </p>
          {!signedIn && <SignInValue className="w-full max-w-xs" />}
          <TapLink
            href={signedIn ? "/" : "/login"}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))]"
          >
            {signedIn ? translate("Browse shoes") : translate("Log in")} <ArrowRight className="h-4 w-4" />
          </TapLink>
        </motion.section>
      ) : null}

      {/* 2. A comparison for you */}
      {compareShoes.length === 2 ? (
        <motion.section variants={item} className="mt-8">
          <SectionTitle icon={<GitCompareArrows className="h-4 w-4" />} text={translate("A comparison for you")} />
          <div className="surface-card premium-border mt-3 rounded-2xl p-5">
            <p className="text-sm">
              <span className="font-medium">{compareShoes[0].name}</span>
              <span className="soft-text"> {translate("vs")} </span>
              <span className="font-medium">{compareShoes[1].name}</span>
            </p>
            <TapLink
              href={`/compare?ids=${compareShoes[0].id},${compareShoes[1].id}` as Route}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))]"
            >
              {translate("Compare these two")} <ArrowRight className="h-4 w-4" />
            </TapLink>
          </div>
        </motion.section>
      ) : null}

      {/* 3. Picked for you (AI) */}
      {recommendations.length > 0 ? (
        <motion.section variants={item} className="mt-8">
          <SectionTitle icon={<Sparkles className="h-4 w-4" />} text={translate("Picked for you")} />
          <ul className="mt-3 space-y-3">
            {recommendations.map((rec) => (
              <li key={rec.id}>
                <TapLink
                  href={`/shoes/${rec.slug}`}
                  className="surface-card premium-border group block rounded-2xl p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium transition group-hover:text-[rgb(var(--accent))]">{rec.name}</p>
                    {typeof rec.stars === "number" ? (
                      <span className="num-display inline-flex items-center gap-1 text-xs soft-text">
                        <Star className="h-3.5 w-3.5 fill-current text-amber-400" /> {rec.stars.toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm leading-6 soft-text">{rec.reason}</p>
                </TapLink>
              </li>
            ))}
          </ul>
          <TapLink
            href="/smart-picker"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--accent))]"
          >
            <MessageCircle className="h-4 w-4" /> {translate("Keep refining in Smart Picker")}
          </TapLink>
        </motion.section>
      ) : null}

      {/* 4. Popular — podium top 3 (moved above "Continue browsing" so it sits
          higher up the For You face) */}
      {popular.length >= 3 ? (
        <motion.section variants={item} className="mt-8">
          <SectionTitle icon={<Trophy className="h-4 w-4" />} text={translate("Popular this week")} />
          <div className="mt-4 grid grid-cols-3 items-end gap-3">
            <PodiumItem shoe={popular[1]} rank={2} rankLabel={getRankLabel(2)} />
            <PodiumItem shoe={popular[0]} rank={1} rankLabel={getRankLabel(1)} />
            <PodiumItem shoe={popular[2]} rank={3} rankLabel={getRankLabel(3)} />
          </div>
        </motion.section>
      ) : null}

      {/* 5. Continue browsing — most recent 3, with an expandable, paginated history */}
      {recentShoes.length > 0 ? (
        <ContinueBrowsing recentShoes={recentShoes} translate={translate} />
      ) : null}
    </motion.div>
  );
}

function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] soft-text">
      {icon} {text}
    </h2>
  );
}

// A Link wrapped in a press-scale motion that also fires a light haptic tap.
function TapLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onTapStart={() => haptics.tap()}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Link href={href as Route} className={className}>
        {children}
      </Link>
    </motion.div>
  );
}

function ShoeThumb({
  shoe,
  className,
  fit = "cover"
}: {
  shoe: ForYouShoe;
  className?: string;
  fit?: "cover" | "contain";
}) {
  if (shoe.image) {
    return (
      <BgRemovedImg
        src={shoe.image}
        alt={shoe.name}
        loading="lazy"
        className={`${fit === "contain" ? "object-contain" : "object-cover"} ${className ?? ""}`}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-[rgb(var(--muted)/0.3)] ${className ?? ""}`}>
      <span className="text-2xl">👟</span>
    </div>
  );
}

function PodiumItem({ shoe, rank, rankLabel }: { shoe: ForYouShoe; rank: 1 | 2 | 3; rankLabel: string }) {
  const tall = rank === 1;
  const medal = rank === 1 ? "text-amber-400" : rank === 2 ? "text-slate-300" : "text-amber-700";
  return (
    <TapLink href={`/shoes/${shoe.slug}`} className="block">
      <div className="flex flex-col items-center gap-1.5">
        {/* Crown sits ABOVE the image; the fixed-height slot keeps all 3 aligned. */}
        <div className="flex h-5 items-end justify-center">
          {rank === 1 ? <Crown className="h-5 w-5 text-amber-400" /> : null}
        </div>
        <div
          className={`w-full overflow-hidden rounded-2xl border bg-[rgb(var(--bg-elev)/0.5)] ${
            tall ? "border-[rgb(var(--accent)/0.55)]" : "border-[rgb(var(--muted)/0.45)]"
          }`}
        >
          <ShoeThumb shoe={shoe} fit="contain" className={tall ? "h-28 w-full" : "h-24 w-full"} />
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${medal}`}>
          <Trophy className="h-3 w-3" /> {rankLabel}
        </span>
        <p className="line-clamp-2 text-center text-[11px] font-medium leading-tight">{shoe.name}</p>
      </div>
    </TapLink>
  );
}

// "Continue browsing" shows the 3 most recent views by default, then expands
// into a paginated history (10 per page) so the section stays compact and the
// blocks above it (e.g. Popular) keep their spot near the top of the feed.
function ContinueBrowsing({
  recentShoes,
  translate
}: {
  recentShoes: ForYouShoe[];
  translate: (s: string) => string;
}) {
  const COLLAPSED_COUNT = 3;
  const PAGE_SIZE = 10;
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(recentShoes.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = recentShoes.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const canExpand = recentShoes.length > COLLAPSED_COUNT;

  return (
    <motion.section variants={item} className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle icon={<History className="h-4 w-4" />} text={translate("Continue browsing")} />
        {canExpand ? (
          <button
            type="button"
            onClick={() => {
              haptics.tap();
              setPage(0);
              setExpanded((v) => !v);
            }}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[rgb(var(--accent))] transition hover:opacity-80"
          >
            {expanded ? (
              <>
                {translate("Collapse")}
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                {translate("Show history")}
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        ) : null}
      </div>

      {!expanded ? (
        <div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {recentShoes.slice(0, COLLAPSED_COUNT).map((shoe) => (
            <TapLink
              key={shoe.id}
              href={`/shoes/${shoe.slug}`}
              className="surface-card premium-border block w-32 shrink-0 overflow-hidden rounded-2xl"
            >
              <ShoeThumb shoe={shoe} className="h-24 w-full" />
              <p className="truncate px-3 py-2 text-xs font-medium">{shoe.name}</p>
            </TapLink>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pageItems.map((shoe) => (
              <TapLink
                key={shoe.id}
                href={`/shoes/${shoe.slug}`}
                className="surface-card premium-border block overflow-hidden rounded-2xl"
              >
                <ShoeThumb shoe={shoe} fit="contain" className="h-24 w-full" />
                <p className="truncate px-3 py-2 text-xs font-medium">{shoe.name}</p>
              </TapLink>
            ))}
          </div>

          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => {
                  haptics.tap();
                  setPage((p) => Math.max(0, p - 1));
                }}
                aria-label={translate("Previous page")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgb(var(--glass-stroke-soft)/0.5)] text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[3rem] text-center text-xs font-medium soft-text">
                {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount - 1}
                onClick={() => {
                  haptics.tap();
                  setPage((p) => Math.min(pageCount - 1, p + 1));
                }}
                aria-label={translate("Next page")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgb(var(--glass-stroke-soft)/0.5)] text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </motion.section>
  );
}
