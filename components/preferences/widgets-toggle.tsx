"use client";

// Settings for the home-screen widgets, the Lock Screen ring and the Dynamic
// Island — the user's own switchboard for everything that leaves the app and
// appears on their phone.
//
// It's here rather than buried in the closet because these surfaces are a
// system-level thing, not a closet feature: the same section a member visits to
// silence push is where they'd look to silence a Live Activity.
//
// The whole section hides when the shell can't host any of it (web, or an app
// build from before the widget extension shipped). A switch that provably does
// nothing is worse than no switch. Live Activity rows hide separately, since a
// device on iOS 16.0 has widgets but no Island.

import { useEffect, useState } from "react";
import { LayoutGrid, Minus, Plus, Radio, Sparkles, Timer } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import { liveWidgetsSupport } from "@/lib/native/live-widgets";
import {
  DEFAULT_WIDGET_PREFS,
  readWidgetPrefs,
  writeWidgetPrefs,
  type WidgetFeature,
  type WidgetPrefs
} from "@/lib/native/widget-prefs";

const GOAL_MIN = 1;
const GOAL_MAX = 40;
const GOAL_STEP = 1;

export function WidgetsToggle() {
  const { translate } = useLocale();
  const [prefs, setPrefs] = useState<WidgetPrefs | null>(null);
  const [support, setSupport] = useState<{ widgets: boolean; liveActivities: boolean } | null>(null);

  useEffect(() => {
    setPrefs(readWidgetPrefs());
    void liveWidgetsSupport().then((s) =>
      setSupport({ widgets: s.widgets, liveActivities: s.liveActivities })
    );
  }, []);

  if (!prefs || !support || (!support.widgets && !support.liveActivities)) return null;

  function update(patch: Partial<WidgetPrefs>) {
    setPrefs((prev) => {
      const next = { ...(prev ?? DEFAULT_WIDGET_PREFS), ...patch };
      // Persisting also broadcasts, which is what makes WidgetSync re-publish —
      // so a switch takes effect on the home screen before the user leaves
      // this page, not on the next launch.
      writeWidgetPrefs(next);
      return next;
    });
  }

  function toggle(feature: WidgetFeature) {
    const next = !prefs![feature];
    haptics.selection();
    update({ [feature]: next } as Partial<WidgetPrefs>);
  }

  function nudgeGoal(delta: number) {
    const next = Math.min(GOAL_MAX, Math.max(GOAL_MIN, prefs!.weekGoalHours + delta));
    if (next === prefs!.weekGoalHours) return;
    haptics.selection();
    update({ weekGoalHours: next });
  }

  return (
    <section className="glass glass-rim glass-clip relative rounded-2xl p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] soft-text">
        {translate("Widgets & Live Activities")}
      </h3>
      <p className="mt-2 text-xs soft-text">
        {translate("Choose what sneakerfeature is allowed to show outside the app. Anything you switch off stops being copied out of the app at all.")}
      </p>

      {support.widgets ? (
        <div className="mt-5 space-y-1">
          <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] soft-text">
            {translate("Home & Lock Screen")}
          </p>
          <Row
            icon={Timer}
            title={translate("Closet mileage")}
            description={translate("Your rotation's hours, sessions and cost per run.")}
            checked={prefs.closetWidget}
            onToggle={() => toggle("closetWidget")}
          />
          <Row
            icon={Sparkles}
            title={translate("Shoe of the day")}
            description={translate("Your weekly pick, one tap from its page.")}
            checked={prefs.dailyWidget}
            onToggle={() => toggle("dailyWidget")}
          />
          <Row
            icon={LayoutGrid}
            title={translate("Favorites & compare")}
            description={translate("Saved pairs, one tap from a comparison.")}
            checked={prefs.favoritesWidget}
            onToggle={() => toggle("favoritesWidget")}
          />
          <Row
            icon={Radio}
            title={translate("Lock Screen ring")}
            description={translate("This week's court hours as a progress ring.")}
            checked={prefs.lockScreenWeek}
            onToggle={() => toggle("lockScreenWeek")}
          />

          {prefs.lockScreenWeek ? (
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-[rgb(var(--text)/0.04)] px-3.5 py-3">
              <div>
                <p className="text-sm font-medium">{translate("Weekly goal")}</p>
                <p className="mt-0.5 text-xs soft-text">
                  {translate("What a full ring means.")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <StepButton
                  label={translate("Decrease the goal")}
                  icon={Minus}
                  disabled={prefs.weekGoalHours <= GOAL_MIN}
                  onClick={() => nudgeGoal(-GOAL_STEP)}
                />
                <span className="num-display w-12 text-center text-sm font-semibold tabular-nums">
                  {prefs.weekGoalHours}h
                </span>
                <StepButton
                  label={translate("Increase the goal")}
                  icon={Plus}
                  disabled={prefs.weekGoalHours >= GOAL_MAX}
                  onClick={() => nudgeGoal(GOAL_STEP)}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {support.liveActivities ? (
        <div className="mt-6 space-y-1">
          <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] soft-text">
            {translate("Dynamic Island")}
          </p>
          <Row
            icon={Timer}
            title={translate("Court timer")}
            description={translate("Keep a running session in the Dynamic Island and on the Lock Screen.")}
            checked={prefs.courtActivity}
            onToggle={() => toggle("courtActivity")}
          />
          <Row
            icon={Sparkles}
            title={translate("Smart Picker progress")}
            description={translate("Watch the AI work while you do something else.")}
            checked={prefs.pickerActivity}
            onToggle={() => toggle("pickerActivity")}
          />
        </div>
      ) : null}
    </section>
  );
}

function Row({
  icon: Icon,
  title,
  description,
  checked,
  onToggle
}: {
  icon: typeof Timer;
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
          {title}
        </p>
        <p className="mt-1 text-xs soft-text">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={onToggle}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-[rgb(var(--accent))]" : "bg-[rgb(var(--muted)/0.8)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-[rgb(var(--brand-contrast))] shadow-[0_1px_2px_rgb(var(--shadow)/0.35)] transition-all ${
            checked ? "left-[1.375rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function StepButton({
  label,
  icon: Icon,
  disabled,
  onClick
}: {
  label: string;
  icon: typeof Plus;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="tap-44 grid h-8 w-8 place-items-center rounded-full bg-[rgb(var(--text)/0.08)] transition hover:bg-[rgb(var(--text)/0.16)] disabled:opacity-35"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
