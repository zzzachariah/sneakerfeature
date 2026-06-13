"use client";

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
  Crown
} from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { PersonaAvatar } from "@/components/home/persona-avatar";
import { haptics } from "@/lib/native/haptics";
import type { DigestCompareShoe, DigestRecommendation } from "@/lib/personalize/digest";

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
      <motion.header variants={item} className="flex items-start justify-between gap-4">
        <div className="min-w-0">
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
        </div>
        <div className="w-16 shrink-0 sm:w-20">
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
                      <span className="inline-flex items-center gap-1 text-xs soft-text">
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

      {/* 4. Continue browsing */}
      {recentShoes.length > 0 ? (
        <motion.section variants={item} className="mt-8">
          <SectionTitle icon={<History className="h-4 w-4" />} text={translate("Continue browsing")} />
          <div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {recentShoes.map((shoe) => (
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
        </motion.section>
      ) : null}

      {/* 5. Popular — podium top 3 */}
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
      // eslint-disable-next-line @next/next/no-img-element
      <img
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
