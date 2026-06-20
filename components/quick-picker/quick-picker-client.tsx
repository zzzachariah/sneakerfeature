"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowRight, RotateCcw, Sparkles, UserCircle } from "lucide-react";
import type { Shoe } from "@/lib/types";
import {
  POSITIONS,
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  HEIGHT_MIN,
  HEIGHT_MAX,
  WEIGHT_MIN,
  WEIGHT_MAX,
  type Position,
  type SkillLevel,
  type Persona
} from "@/lib/persona/types";
import { computeMatchScore, getMatchReasons } from "@/lib/match/score";
import { scoreFor, type MetricKey } from "@/components/compare/compare-metrics";
import { ShoeCard } from "@/components/home/shoe-card";
import { usePersona } from "@/components/preferences/persona-provider";
import { useLocale } from "@/components/i18n/locale-provider";

const STEP_COUNT = 4; // position, skill, build, priority

// Optional "what matters most" weighting — blends into the match score so the
// list leans toward the dimension the player cares about.
const PRIORITY_OPTIONS: { key: MetricKey | null; label: string }[] = [
  { key: null, label: "Balanced" },
  { key: "traction", label: "Grip" },
  { key: "cushioning_feel", label: "Cushion" },
  { key: "court_feel", label: "Court" },
  { key: "bounce", label: "Bounce" },
  { key: "stability", label: "Stable" },
  { key: "fit", label: "Fit" }
];

function Chip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border px-4 py-2.5 text-sm font-medium leading-none transition duration-150 active:scale-95 ${
        active
          ? "border-[rgb(var(--text))] bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
          : "border-[rgb(var(--glass-stroke-soft)/0.55)] text-[rgb(var(--subtext))] hover:border-[rgb(var(--text)/0.35)] hover:text-[rgb(var(--text))]"
      }`}
    >
      {children}
    </button>
  );
}

export function QuickPickerClient({ shoes }: { shoes: Shoe[] }) {
  const { translate } = useLocale();
  const { persona: savedPersona } = usePersona();
  const [step, setStep] = useState(0); // 0..3 = questions, 4 = results
  const [positions, setPositions] = useState<Position[]>([]);
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  const [height, setHeight] = useState(185);
  const [weight, setWeight] = useState(80);
  const [flatFoot, setFlatFoot] = useState(false);
  const [priority, setPriority] = useState<MetricKey | null>(null);

  const personaInput = useMemo<Persona | null>(() => {
    if (positions.length < 1 || !skill) return null;
    return { positions, skill_level: skill, flat_foot: flatFoot, height_cm: height, weight_kg: weight };
  }, [positions, skill, flatFoot, height, weight]);

  const results = useMemo(() => {
    if (step < STEP_COUNT || !personaInput) return [];
    return shoes
      .map((shoe) => {
        const score = computeMatchScore(personaInput, shoe);
        const reasons = getMatchReasons(personaInput, shoe);
        // Blend the chosen priority dimension into the ranking (keep the match%
        // as the headline number; just re-order toward what the player wants).
        const rank = priority ? Math.round(score * 0.6 + scoreFor(shoe, priority) * 0.4) : score;
        return { shoe, score, reasons, rank };
      })
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 12);
  }, [step, personaInput, priority, shoes]);

  function applySavedProfile() {
    if (!savedPersona) return;
    setPositions(savedPersona.positions);
    setSkill(savedPersona.skill_level);
    setHeight(savedPersona.height_cm);
    setWeight(savedPersona.weight_kg);
    setFlatFoot(savedPersona.flat_foot);
    setStep(STEP_COUNT - 1); // jump to the priority step; results are one tap away
  }

  const togglePos = (p: Position) =>
    setPositions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : prev.length >= 2 ? prev : [...prev, p]));

  const canNext = step === 0 ? positions.length >= 1 : step === 1 ? Boolean(skill) : true;
  const top3 = results.slice(0, 3).map((r) => r.shoe.id);

  const savedSummary = savedPersona
    ? `${savedPersona.positions.join(" / ")} · ${translate(SKILL_LEVEL_LABEL[savedPersona.skill_level])} · ${savedPersona.height_cm}cm · ${savedPersona.weight_kg}kg`
    : "";

  return (
    <main className="container-shell has-mobile-nav-pad py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        <p className="t-eyebrow mb-2">{translate("Quick Picker")}</p>
        <h1 className="t-display-sm mb-6" style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
          {translate("Find your pair in 30 seconds")}
        </h1>

        {step < STEP_COUNT ? (
          <>
            <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-[rgb(var(--muted)/0.4)]">
              <div
                className="h-full rounded-full bg-[rgb(var(--brand))] transition-[width] duration-300"
                style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
              />
            </div>

            {step === 0 && savedPersona && (
              <button
                type="button"
                onClick={applySavedProfile}
                className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-[rgb(var(--brand)/0.35)] bg-[rgb(var(--brand)/0.08)] p-4 text-left transition hover:border-[rgb(var(--brand)/0.55)] active:scale-[0.995]"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--brand))] text-[rgb(var(--brand-contrast))]">
                  <UserCircle className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.92rem] font-semibold">{translate("Use my saved profile")}</span>
                  <span className="block truncate text-[0.8rem] soft-text">{savedSummary}</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-[rgb(var(--brand))]" />
              </button>
            )}

            <div className="surface-card premium-border rounded-2xl p-5 md:p-7">
              {step === 0 && (
                <div>
                  <h2 className="mb-1 text-lg font-semibold">{translate("What position do you play?")}</h2>
                  <p className="mb-4 text-sm soft-text">{translate("Pick up to 2")}</p>
                  <div className="flex flex-wrap gap-2">
                    {POSITIONS.map((p) => (
                      <Chip key={p} active={positions.includes(p)} onClick={() => togglePos(p)}>
                        {p}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h2 className="mb-4 text-lg font-semibold">{translate("Your skill level?")}</h2>
                  <div className="flex flex-wrap gap-2">
                    {SKILL_LEVELS.map((s) => (
                      <Chip key={s} active={skill === s} onClick={() => setSkill(s)}>
                        {translate(SKILL_LEVEL_LABEL[s])}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <h2 className="text-lg font-semibold">{translate("Your build")}</h2>
                  <label className="block">
                    <span className="mb-1 flex items-center justify-between text-sm soft-text">
                      {translate("Height (cm)")}
                      <span className="num-display font-semibold text-[rgb(var(--text))]">{height}</span>
                    </span>
                    <input
                      type="range"
                      min={HEIGHT_MIN}
                      max={HEIGHT_MAX}
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="w-full accent-[rgb(var(--brand))]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 flex items-center justify-between text-sm soft-text">
                      {translate("Weight (kg)")}
                      <span className="num-display font-semibold text-[rgb(var(--text))]">{weight}</span>
                    </span>
                    <input
                      type="range"
                      min={WEIGHT_MIN}
                      max={WEIGHT_MAX}
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value))}
                      className="w-full accent-[rgb(var(--brand))]"
                    />
                  </label>
                  <div>
                    <span className="mb-2 block text-sm soft-text">{translate("Are you flat-footed?")}</span>
                    <div className="flex gap-2">
                      <Chip active={!flatFoot} onClick={() => setFlatFoot(false)}>
                        {translate("No")}
                      </Chip>
                      <Chip active={flatFoot} onClick={() => setFlatFoot(true)}>
                        {translate("Yes")}
                      </Chip>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h2 className="mb-1 text-lg font-semibold">{translate("What matters most?")}</h2>
                  <p className="mb-4 text-sm soft-text">{translate("Optional — we'll rank your matches by this.")}</p>
                  <div className="flex flex-wrap gap-2">
                    {PRIORITY_OPTIONS.map((opt) => (
                      <Chip
                        key={opt.label}
                        active={priority === opt.key}
                        onClick={() => setPriority(opt.key)}
                      >
                        {translate(opt.label)}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.55)] px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> {translate("Back")}
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--text))] px-5 py-2.5 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {step === STEP_COUNT - 1 ? translate("See my picks") : translate("Next")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{translate("Your top matches")}</h2>
              <div className="flex flex-wrap gap-2">
                {top3.length >= 2 && (
                  <Link
                    href={`/compare?ids=${top3.join(",")}` as Route}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3.5 py-2 text-sm font-medium transition hover:border-[rgb(var(--text)/0.35)]"
                  >
                    {translate("Compare top 3")}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3.5 py-2 text-sm font-medium transition hover:border-[rgb(var(--text)/0.35)]"
                >
                  <RotateCcw className="h-4 w-4" /> {translate("Refine")}
                </button>
              </div>
            </div>

            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {results.map(({ shoe, score, reasons }) => (
                <ShoeCard key={shoe.id} shoe={shoe} matchScore={score} reasons={reasons} showChips />
              ))}
            </ul>

            <Link
              href={"/smart-picker" as Route}
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--brand))] transition hover:opacity-80"
            >
              <Sparkles className="h-4 w-4" /> {translate("Want a deeper pick? Try the AI picker")}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
