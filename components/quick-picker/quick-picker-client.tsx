"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
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
import { ShoeCard } from "@/components/home/shoe-card";
import { useLocale } from "@/components/i18n/locale-provider";

const STEP_COUNT = 3;

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
  const [step, setStep] = useState(0); // 0..2 = questions, 3 = results
  const [positions, setPositions] = useState<Position[]>([]);
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  const [height, setHeight] = useState(185);
  const [weight, setWeight] = useState(80);
  const [flatFoot, setFlatFoot] = useState(false);

  const persona = useMemo<Persona | null>(() => {
    if (positions.length < 1 || !skill) return null;
    return { positions, skill_level: skill, flat_foot: flatFoot, height_cm: height, weight_kg: weight };
  }, [positions, skill, flatFoot, height, weight]);

  const results = useMemo(() => {
    if (step < STEP_COUNT || !persona) return [];
    return shoes
      .map((shoe) => ({ shoe, score: computeMatchScore(persona, shoe), reasons: getMatchReasons(persona, shoe) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [step, persona, shoes]);

  const togglePos = (p: Position) =>
    setPositions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : prev.length >= 2 ? prev : [...prev, p]));

  const canNext = step === 0 ? positions.length >= 1 : step === 1 ? Boolean(skill) : true;
  const top3 = results.slice(0, 3).map((r) => r.shoe.id);

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
