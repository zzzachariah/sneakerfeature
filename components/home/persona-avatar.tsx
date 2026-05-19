"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import {
  HEIGHT_MAX,
  HEIGHT_MIN,
  POSITION_LABEL,
  SKILL_LEVEL_LABEL,
  WEIGHT_MAX,
  WEIGHT_MIN,
  type Persona,
  type SkillLevel
} from "@/lib/persona/types";

type Props = {
  persona: Persona | null;
  dimmed?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
};

const SKILL_PIPS: Record<SkillLevel, number> = {
  beginner: 1,
  amateur: 2,
  semi_pro: 3,
  pro: 4
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
function lerp(t: number, a: number, b: number) {
  return a + (b - a) * t;
}

export function PersonaAvatar({ persona, dimmed = false, onClick, size = "md" }: Props) {
  const { translate } = useLocale();

  const heightT = persona ? clamp01((persona.height_cm - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN)) : 0.55;
  const weightT = persona ? clamp01((persona.weight_kg - WEIGHT_MIN) / (WEIGHT_MAX - WEIGHT_MIN)) : 0.4;

  const svgW = 160;
  const svgH = 220;
  const cx = svgW / 2;

  const headR = 12;
  const headCy = 22;
  const neckGap = 4;
  const shoulderTop = headCy + headR + neckGap;

  const torsoH = lerp(heightT, 48, 76);
  const torsoW = lerp(weightT, 30, 56);
  const torsoTop = shoulderTop;
  const torsoBottom = torsoTop + torsoH;

  const legH = lerp(heightT, 56, 90);
  const legTop = torsoBottom;
  const legBottom = legTop + legH;
  const footTop = legBottom;

  const flat = persona?.flat_foot ?? false;
  const positionsText = persona && persona.positions.length > 0
    ? persona.positions.map((p) => POSITION_LABEL[p]).join(" · ")
    : "—";

  const skillPipsCount = persona ? SKILL_PIPS[persona.skill_level] : 0;
  const skillLabel = persona ? translate(SKILL_LEVEL_LABEL[persona.skill_level]) : translate("Skill");

  const maxBodyWidth = size === "sm" ? 110 : 160;

  const fillColor = dimmed ? "rgb(var(--muted)/0.5)" : "rgb(var(--text)/0.85)";
  const strokeColor = dimmed ? "rgb(var(--muted)/0.7)" : "rgb(var(--text))";
  const footColor = dimmed ? "rgb(var(--muted)/0.8)" : "rgb(var(--text))";

  const labelClass = size === "sm" ? "text-[0.62rem]" : "text-[0.72rem]";

  const body = (
    <div className={`flex flex-col items-center ${size === "sm" ? "gap-1" : "gap-1.5"}`}>
      <div
        className={`inline-flex items-center rounded-full border border-[rgb(var(--text)/0.22)] bg-[rgb(var(--bg-elev)/0.7)] px-2.5 ${
          size === "sm" ? "h-5 text-[0.62rem]" : "h-6 text-[0.7rem]"
        } font-bold tracking-[0.04em]`}
      >
        {positionsText}
      </div>

      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        style={{ maxWidth: maxBodyWidth, height: "auto" }}
        aria-label={persona ? translate("Your player avatar") : translate("Log in to personalize")}
      >
        {/* Head */}
        <circle cx={cx} cy={headCy} r={headR} fill={fillColor} stroke={strokeColor} strokeWidth={1.2} />

        {/* Arms */}
        <rect
          x={cx - torsoW / 2 - 8}
          y={torsoTop + 4}
          width={6}
          height={torsoH * 0.72}
          rx={3}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1}
        />
        <rect
          x={cx + torsoW / 2 + 2}
          y={torsoTop + 4}
          width={6}
          height={torsoH * 0.72}
          rx={3}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1}
        />

        {/* Torso */}
        <rect
          x={cx - torsoW / 2}
          y={torsoTop}
          width={torsoW}
          height={torsoH}
          rx={torsoW / 3}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1.2}
          style={{ transition: "all 360ms cubic-bezier(0.22,1,0.36,1)" }}
        />

        {/* Legs */}
        <rect
          x={cx - torsoW / 2 + 2}
          y={legTop}
          width={torsoW / 2 - 4}
          height={legH}
          rx={5}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1.2}
          style={{ transition: "all 360ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        <rect
          x={cx + 2}
          y={legTop}
          width={torsoW / 2 - 4}
          height={legH}
          rx={5}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1.2}
          style={{ transition: "all 360ms cubic-bezier(0.22,1,0.36,1)" }}
        />

        {/* Feet */}
        {flat ? (
          <>
            <rect
              x={cx - torsoW / 2 - 2}
              y={footTop}
              width={torsoW / 2 + 4}
              height={6}
              rx={2}
              fill={footColor}
            />
            <rect
              x={cx - 2}
              y={footTop}
              width={torsoW / 2 + 4}
              height={6}
              rx={2}
              fill={footColor}
            />
          </>
        ) : (
          <>
            <path
              d={`M ${cx - torsoW / 2 - 2} ${footTop + 6}
                  Q ${cx - torsoW / 4} ${footTop - 2} ${cx - 2} ${footTop + 6} Z`}
              fill={footColor}
              stroke={footColor}
              strokeWidth={1}
            />
            <path
              d={`M ${cx + 2} ${footTop + 6}
                  Q ${cx + torsoW / 4} ${footTop - 2} ${cx + torsoW / 2 + 2} ${footTop + 6} Z`}
              fill={footColor}
              stroke={footColor}
              strokeWidth={1}
            />
          </>
        )}
      </svg>

      <div className={`flex items-center gap-1.5 ${labelClass} soft-text`}>
        <span className="font-medium uppercase tracking-[0.08em]">{skillLabel}</span>
        <span className="inline-flex items-center gap-0.5" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-full transition-colors"
              style={{
                background: i <= skillPipsCount ? "rgb(251 191 36 / 0.9)" : "rgb(var(--muted)/0.6)"
              }}
            />
          ))}
        </span>
      </div>

      <div className={`${labelClass} soft-text tabular-nums`}>
        {persona
          ? `${persona.height_cm} ${translate("cm")} · ${persona.weight_kg} ${translate("kg")}`
          : translate("Log in to personalize")}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={persona ? translate("Edit your player profile") : translate("Log in to personalize")}
        className="group flex flex-col items-center rounded-2xl border border-transparent px-3 py-3 transition hover:border-[rgb(var(--text)/0.2)] hover:bg-[rgb(var(--text)/0.04)]"
      >
        {body}
      </button>
    );
  }

  return <div className="flex flex-col items-center px-3 py-3">{body}</div>;
}
