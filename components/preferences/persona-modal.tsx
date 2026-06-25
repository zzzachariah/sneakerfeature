"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Anchor, ArrowRight, Check, Cloud, Footprints, Hand, Info, Magnet, X, Zap } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { useLocale } from "@/components/i18n/locale-provider";
import { SignInValue } from "@/components/auth/sign-in-value";
import {
  HEIGHT_MAX,
  HEIGHT_MIN,
  POSITIONS,
  POSITION_LABEL,
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  WEIGHT_MAX,
  WEIGHT_MIN,
  type Persona,
  type Position,
  type SkillLevel
} from "@/lib/persona/types";
import {
  isFootProfile,
  WIDTH_LABEL,
  INSTEP_LABEL,
  TOE_LABEL,
  TOE_SHORT,
  WIDTH_SCALE,
  INSTEP_SCALE,
  TOE_ORDER,
  type FootProfile,
  type ToeShape
} from "@/lib/foot-scan/types";
import { usePersona } from "@/components/preferences/persona-provider";
import { useRatingFocus } from "@/components/preferences/rating-focus-provider";
import { DIM_KEYS, DIM_LABELS, type DimKey, type RatingFocus } from "@/lib/star-rating";

type Slot = "primary" | "secondary" | "tertiary";
const SLOT_ORDER: Slot[] = ["primary", "secondary", "tertiary"];

const DIM_ICON: Record<DimKey, typeof Cloud> = {
  cushioning_feel: Cloud,
  court_feel: Footprints,
  bounce: Zap,
  stability: Anchor,
  traction: Magnet,
  fit: Hand
};

function focusEquals(a: RatingFocus | null, b: RatingFocus | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.primary === b.primary && a.secondary === b.secondary && a.tertiary === b.tertiary;
}

export function PersonaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { translate } = useLocale();
  const { persona, isLoggedIn, savePersona, clearPersona, saving, isRefreshing, message, isError } =
    usePersona();
  const { focus, saveFocus, saving: focusSaving, isRefreshing: focusRefreshing } = useRatingFocus();

  const [picks, setPicks] = useState<Position[]>([]);
  const [skill, setSkill] = useState<SkillLevel>("amateur");
  const [flatFoot, setFlatFoot] = useState(false);
  const [heightStr, setHeightStr] = useState("");
  const [weightStr, setWeightStr] = useState("");
  const [playstylePicks, setPlaystylePicks] = useState<DimKey[]>([]);
  const [showFlatFootHelp, setShowFlatFootHelp] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Whether to surface the Foot Scan entry — only for users who can open the
  // (hidden) tool: admins, or everyone when the public flag is on. Also holds
  // the saved foot profile so we can show it and offer a re-scan.
  const [canScan, setCanScan] = useState(false);
  const [footProfile, setFootProfile] = useState<FootProfile | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !isLoggedIn) return;
    let cancelled = false;
    fetch("/api/foot-scan/access", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setCanScan(Boolean(d?.canUse));
        setFootProfile(isFootProfile(d?.profile) ? d.profile : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, isLoggedIn]);

  useEffect(() => {
    if (open) {
      setPicks(persona ? persona.positions : []);
      setSkill(persona ? persona.skill_level : "amateur");
      setFlatFoot(persona ? persona.flat_foot : false);
      setHeightStr(persona ? String(persona.height_cm) : "");
      setWeightStr(persona ? String(persona.weight_kg) : "");
      setPlaystylePicks(focus ? [focus.primary, focus.secondary, focus.tertiary] : []);
      setShowFlatFootHelp(false);
      setPendingClose(false);
      setLocalError(null);
    }
  }, [open, persona, focus]);

  const busy = saving || isRefreshing || focusSaving || focusRefreshing;

  useEffect(() => {
    if (pendingClose && !busy) {
      setPendingClose(false);
      onCloseRef.current();
    }
  }, [pendingClose, busy]);

  function togglePosition(pos: Position) {
    setPicks((prev) => {
      if (prev.includes(pos)) return prev.filter((p) => p !== pos);
      if (prev.length >= 2) return prev;
      return [...prev, pos];
    });
  }

  function togglePlaystyle(key: DimKey) {
    setPlaystylePicks((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  }

  async function handleSave() {
    setLocalError(null);
    if (picks.length < 1) {
      setLocalError(translate("Pick at least one position."));
      return;
    }
    const height = parseInt(heightStr, 10);
    const weight = parseInt(weightStr, 10);
    if (!Number.isFinite(height) || height < HEIGHT_MIN || height > HEIGHT_MAX) {
      setLocalError(translate("Please enter a valid height."));
      return;
    }
    if (!Number.isFinite(weight) || weight < WEIGHT_MIN || weight > WEIGHT_MAX) {
      setLocalError(translate("Please enter a valid weight."));
      return;
    }
    if (playstylePicks.length !== 0 && playstylePicks.length !== 3) {
      setLocalError(translate("Pick exactly 3 playstyle dimensions in order, or none."));
      return;
    }

    const nextPersona: Persona = {
      positions: picks,
      skill_level: skill,
      flat_foot: flatFoot,
      height_cm: height,
      weight_kg: weight
    };

    const okPersona = await savePersona(nextPersona);
    if (!okPersona) return;

    if (playstylePicks.length === 3) {
      const nextFocus: RatingFocus = {
        primary: playstylePicks[0],
        secondary: playstylePicks[1],
        tertiary: playstylePicks[2]
      };
      if (!focusEquals(nextFocus, focus)) {
        const okFocus = await saveFocus(nextFocus);
        if (!okFocus) return;
      }
    }

    setPendingClose(true);
  }

  async function handleClear() {
    const ok = await clearPersona();
    if (ok) setPendingClose(true);
  }

  const playstyleSlotForKey = new Map<DimKey, Slot>();
  playstylePicks.forEach((k, i) => {
    if (i < SLOT_ORDER.length) playstyleSlotForKey.set(k, SLOT_ORDER[i]);
  });

  return (
    <Modal open={open} onClose={onClose} title="Set up your player profile">
      {!isLoggedIn ? (
        <div className="space-y-4">
          <p className="text-sm text-[rgb(var(--text)/0.82)]">{translate("Sign in to set up your player profile.")}</p>
          <SignInValue />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              {translate("Cancel")}
            </Button>
            <Button type="button" onClick={() => (window.location.href = "/login")}>
              {translate("Log in")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-4">
          <p className="text-sm soft-text">
            {translate(
              "Pick your position(s), skill level, whether you have flat feet, and your height & weight. We will use these to recommend shoes."
            )}
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[0.78rem] font-medium uppercase tracking-[0.12em] soft-text">
                {translate("Position")}
              </label>
              <span className="text-[0.7rem] soft-text">{translate("Pick up to 2 positions")}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {POSITIONS.map((p) => {
                const isPicked = picks.includes(p);
                const order = isPicked ? picks.indexOf(p) + 1 : 0;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePosition(p)}
                    disabled={busy}
                    className={`relative flex flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 py-3 text-center transition disabled:opacity-50 ${
                      isPicked
                        ? "border-amber-400/70 bg-amber-400/10 text-[rgb(var(--text))]"
                        : "border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.4)] soft-text hover:border-[rgb(var(--text)/0.4)]"
                    }`}
                  >
                    <span className="text-sm font-semibold">{translate(POSITION_LABEL[p])}</span>
                    {isPicked && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400/90 px-1 text-[0.6rem] font-bold text-black">
                        {order}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[0.78rem] font-medium uppercase tracking-[0.12em] soft-text">
              {translate("Skill level")}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {SKILL_LEVELS.map((lvl) => {
                const isPicked = skill === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSkill(lvl)}
                    disabled={busy}
                    className={`rounded-2xl border px-2 py-2.5 text-center text-[0.8rem] font-medium transition disabled:opacity-50 ${
                      isPicked
                        ? "border-amber-400/70 bg-amber-400/10 text-[rgb(var(--text))]"
                        : "border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.4)] soft-text hover:border-[rgb(var(--text)/0.4)]"
                    }`}
                  >
                    {translate(SKILL_LEVEL_LABEL[lvl])}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[0.78rem] font-medium uppercase tracking-[0.12em] soft-text">
                {translate("Are you flat-footed?")}
              </label>
              <div className="inline-flex overflow-hidden rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)]">
                <button
                  type="button"
                  onClick={() => setFlatFoot(false)}
                  disabled={busy}
                  className="px-3 py-1.5 text-[0.78rem] font-medium transition"
                  style={{
                    background: !flatFoot ? "rgb(var(--text)/0.92)" : "transparent",
                    color: !flatFoot ? "rgb(var(--bg))" : "rgb(var(--subtext))"
                  }}
                >
                  {translate("No")}
                </button>
                <button
                  type="button"
                  onClick={() => setFlatFoot(true)}
                  disabled={busy}
                  className="border-l border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 py-1.5 text-[0.78rem] font-medium transition"
                  style={{
                    background: flatFoot ? "rgb(var(--text)/0.92)" : "transparent",
                    color: flatFoot ? "rgb(var(--bg))" : "rgb(var(--subtext))"
                  }}
                >
                  {translate("Yes")}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowFlatFootHelp((v) => !v)}
              className="inline-flex items-center gap-1 text-xs underline-offset-2 soft-text hover:underline"
            >
              <Info className="h-3.5 w-3.5" />
              {translate("What is flat foot?")}
            </button>
            {showFlatFootHelp && (
              <div className="rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-3 text-xs soft-text">
                {translate(
                  "Flat foot means your arch is collapsed and your sole touches the ground more flatly. Flat-footed players typically benefit from extra stability and arch support."
                )}
              </div>
            )}
          </div>

          {canScan && (
            <FootTypeSection
              profile={footProfile}
              onScanHref="/foot-scan"
              onCloseModal={onClose}
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[0.78rem] font-medium uppercase tracking-[0.12em] soft-text">
                {translate("Height (cm)")}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={HEIGHT_MIN}
                max={HEIGHT_MAX}
                value={heightStr}
                onChange={(e) => setHeightStr(e.target.value)}
                disabled={busy}
                placeholder="180"
                className="w-full rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-3 py-2 text-sm outline-none transition focus:border-[rgb(var(--text)/0.5)] disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[0.78rem] font-medium uppercase tracking-[0.12em] soft-text">
                {translate("Weight (kg)")}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={WEIGHT_MIN}
                max={WEIGHT_MAX}
                value={weightStr}
                onChange={(e) => setWeightStr(e.target.value)}
                disabled={busy}
                placeholder="75"
                className="w-full rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-3 py-2 text-sm outline-none transition focus:border-[rgb(var(--text)/0.5)] disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-[rgb(var(--muted)/0.25)] pt-3">
            <div className="flex items-center justify-between">
              <label className="text-[0.78rem] font-medium uppercase tracking-[0.12em] soft-text">
                {translate("Playstyle")}
              </label>
              <span className="text-[0.7rem] soft-text">{translate("Pick 3 in order (optional)")}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DIM_KEYS.map((key) => {
                const slot = playstyleSlotForKey.get(key);
                const isPicked = Boolean(slot);
                const order = isPicked ? SLOT_ORDER.indexOf(slot!) + 1 : 0;
                const Icon = DIM_ICON[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePlaystyle(key)}
                    disabled={busy}
                    className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2.5 text-center transition disabled:opacity-50 ${
                      isPicked
                        ? "border-amber-400/70 bg-amber-400/10 text-[rgb(var(--text))]"
                        : "border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.4)] soft-text hover:border-[rgb(var(--text)/0.4)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[0.74rem] font-medium leading-tight">
                      {translate(DIM_LABELS[key])}
                    </span>
                    {isPicked && (
                      <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400/90 px-1 text-[0.6rem] font-bold text-black">
                        {order}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[0.7rem] soft-text">
              {translate("Primary 40% · Secondary 30% · Tertiary 20% · Others share 10%.")}
            </p>
          </div>
        </div>

        <div className="mt-3 border-t border-[rgb(var(--muted)/0.4)] pt-3">
          {localError && <FeedbackMessage message={localError} isError />}
          {message && !localError && <FeedbackMessage message={message} isError={isError} />}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              {persona && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--muted)/0.5)] px-2.5 py-1.5 text-xs soft-text transition hover:border-[rgb(var(--text)/0.4)] disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                  {translate("Clear profile")}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
                {translate("Cancel")}
              </Button>
              <Button type="button" onClick={handleSave} disabled={busy || picks.length < 1}>
                <Check className="mr-1 h-3.5 w-3.5" />
                {busy ? translate("Saving...") : translate("Save profile")}
              </Button>
            </div>
          </div>
        </div>
        </>
      )}
    </Modal>
  );
}

// --- Foot type section ------------------------------------------------------
//
// Lives inside the player profile so the saved foot shape sits next to the
// rest of the persona (positions, height, playstyle). Three-trait grid with
// scale-bar visualisations for width/instep and a toe-shape strip; falls back
// to a single CTA when the user hasn't scanned yet.

function MiniScale({ value }: { value: number }) {
  return (
    <div className="relative mt-1.5 h-1 rounded-full bg-[rgb(var(--text)/0.1)]">
      <span
        className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(var(--text)/0.4)]"
        style={{ left: "50%" }}
      />
      <span
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgb(var(--bg))] bg-amber-400/90"
        style={{ left: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

function FootTypeSection({
  profile,
  onScanHref,
  onCloseModal
}: {
  profile: FootProfile | null;
  onScanHref: Route;
  onCloseModal: () => void;
}) {
  const { translate } = useLocale();

  if (!profile) {
    return (
      <Link
        href={onScanHref}
        onClick={onCloseModal}
        className="group flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[rgb(var(--muted)/0.6)] bg-[rgb(var(--bg-elev)/0.4)] p-3 transition hover:border-amber-400/60 hover:bg-amber-400/5"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/12 text-amber-500">
            <Footprints className="h-4 w-4" />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-medium">{translate("Scan your feet")}</span>
            <span className="text-[0.7rem] soft-text">
              {translate("Width, instep & toe shape — in about a minute")}
            </span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 soft-text transition group-hover:translate-x-0.5" />
      </Link>
    );
  }

  const widthValue = WIDTH_SCALE[profile.foot_width];
  const instepValue = INSTEP_SCALE[profile.instep];

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--muted)/0.5)] bg-gradient-to-b from-amber-400/[0.06] to-transparent">
      {/* header */}
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/15 text-amber-500">
            <Footprints className="h-3.5 w-3.5" />
          </span>
          <span className="text-[0.78rem] font-medium uppercase tracking-[0.12em] soft-text">
            {translate("Foot type")}
          </span>
        </div>
        {profile.foot_length_mm > 0 && (
          <span className="num-display text-[0.7rem] soft-text">
            ~{(profile.foot_length_mm / 10).toFixed(1)} cm
            {profile.foot_width_mm != null && (
              <> · ~{(profile.foot_width_mm / 10).toFixed(1)} cm</>
            )}
          </span>
        )}
      </div>

      {/* 3-trait grid */}
      <div className="mt-2.5 grid grid-cols-3 gap-2 px-3 pb-3">
        <div className="rounded-xl border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--bg-elev)/0.55)] p-2.5">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] soft-text">
            {translate("Width")}
          </p>
          <p className="mt-0.5 truncate text-[0.82rem] font-semibold text-[rgb(var(--text))]">
            {translate(WIDTH_LABEL[profile.foot_width])}
          </p>
          <MiniScale value={widthValue} />
        </div>

        <div className="rounded-xl border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--bg-elev)/0.55)] p-2.5">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] soft-text">
            {translate("Instep")}
          </p>
          <p className="mt-0.5 truncate text-[0.82rem] font-semibold text-[rgb(var(--text))]">
            {translate(INSTEP_LABEL[profile.instep])}
          </p>
          <MiniScale value={instepValue} />
        </div>

        <div className="rounded-xl border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--bg-elev)/0.55)] p-2.5">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] soft-text">
            {translate("Toe")}
          </p>
          <p className="mt-0.5 truncate text-[0.82rem] font-semibold text-[rgb(var(--text))]">
            {translate(TOE_LABEL[profile.toe_shape])}
          </p>
          <div className="mt-1.5 grid grid-cols-4 gap-0.5">
            {TOE_ORDER.map((t: ToeShape) => (
              <span
                key={t}
                className={`h-1 rounded-full ${
                  t === profile.toe_shape ? "bg-amber-400/90" : "bg-[rgb(var(--text)/0.1)]"
                }`}
                title={translate(TOE_SHORT[t])}
              />
            ))}
          </div>
        </div>
      </div>

      {/* re-scan footer */}
      <Link
        href={onScanHref}
        onClick={onCloseModal}
        className="group flex items-center justify-between gap-2 border-t border-[rgb(var(--muted)/0.35)] bg-[rgb(var(--bg-elev)/0.35)] px-3.5 py-2.5 text-sm transition hover:bg-amber-400/8"
      >
        <span className="flex items-center gap-2 font-medium">
          <Footprints className="h-3.5 w-3.5 text-amber-500" />
          {translate("Re-scan my feet")}
        </span>
        <ArrowRight className="h-3.5 w-3.5 soft-text transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
