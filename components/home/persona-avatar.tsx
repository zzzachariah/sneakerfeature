"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { HEIGHT_MAX, HEIGHT_MIN, POSITION_LABEL, WEIGHT_MAX, WEIGHT_MIN, type Persona } from "@/lib/persona/types";

type Props = {
  persona: Persona | null;
  dimmed?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
};

function lerp(t: number, a: number, b: number) {
  return a + (b - a) * t;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function PersonaAvatar({ persona, dimmed = false, onClick, size = "md" }: Props) {
  const { translate } = useLocale();

  const heightT = persona ? clamp01((persona.height_cm - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN)) : 0.55;
  const weightT = persona ? clamp01((persona.weight_kg - WEIGHT_MIN) / (WEIGHT_MAX - WEIGHT_MIN)) : 0.4;

  const torsoH = lerp(heightT, 56, 96);
  const torsoW = lerp(weightT, 28, 52);
  const legH = lerp(heightT, 60, 92);
  const headR = 14;
  const flat = persona?.flat_foot ?? false;
  const firstPos = persona?.positions[0];

  const svgW = 220;
  const svgH = 280;
  const cx = svgW / 2;
  const headCy = 36;
  const torsoTop = headCy + headR + 4;
  const torsoBottom = torsoTop + torsoH;
  const legBottom = torsoBottom + legH;

  const wrapperClass = size === "sm"
    ? "relative inline-flex items-center justify-center"
    : "relative inline-flex items-center justify-center";

  const sizeStyle: React.CSSProperties = size === "sm"
    ? { width: 120, height: 160 }
    : { width: 220, height: 280 };

  const fillColor = dimmed ? "rgb(var(--muted)/0.55)" : "rgb(var(--text)/0.85)";
  const strokeColor = dimmed ? "rgb(var(--muted)/0.7)" : "rgb(var(--text))";

  const body = (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width="100%"
      height="100%"
      aria-label={persona ? translate("Your player avatar") : translate("Log in to personalize")}
      style={{ overflow: "visible" }}
    >
      {firstPos && (
        <g>
          <rect
            x={cx - 22}
            y={4}
            width={44}
            height={18}
            rx={9}
            fill="rgb(var(--bg-elev)/0.9)"
            stroke={strokeColor}
            strokeOpacity={0.4}
            strokeWidth={1}
          />
          <text
            x={cx}
            y={17}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="rgb(var(--text))"
          >
            {POSITION_LABEL[firstPos]}
          </text>
        </g>
      )}

      {/* Head */}
      <circle cx={cx} cy={headCy} r={headR} fill={fillColor} stroke={strokeColor} strokeWidth={1.2} />

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

      {/* Arms */}
      <rect
        x={cx - torsoW / 2 - 10}
        y={torsoTop + 6}
        width={8}
        height={torsoH * 0.7}
        rx={4}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1}
      />
      <rect
        x={cx + torsoW / 2 + 2}
        y={torsoTop + 6}
        width={8}
        height={torsoH * 0.7}
        rx={4}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1}
      />

      {/* Legs */}
      <rect
        x={cx - torsoW / 2 + 2}
        y={torsoBottom}
        width={torsoW / 2 - 4}
        height={legH}
        rx={6}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.2}
        style={{ transition: "all 360ms cubic-bezier(0.22,1,0.36,1)" }}
      />
      <rect
        x={cx + 2}
        y={torsoBottom}
        width={torsoW / 2 - 4}
        height={legH}
        rx={6}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.2}
        style={{ transition: "all 360ms cubic-bezier(0.22,1,0.36,1)" }}
      />

      {/* Feet — flat or arched */}
      {flat ? (
        <>
          <rect
            x={cx - torsoW / 2 - 2}
            y={legBottom}
            width={torsoW / 2 + 2}
            height={8}
            rx={3}
            fill={strokeColor}
          />
          <rect
            x={cx}
            y={legBottom}
            width={torsoW / 2 + 2}
            height={8}
            rx={3}
            fill={strokeColor}
          />
        </>
      ) : (
        <>
          <path
            d={`M ${cx - torsoW / 2 - 2} ${legBottom + 8}
                Q ${cx - torsoW / 4} ${legBottom - 2} ${cx - 2} ${legBottom + 8}`}
            fill={strokeColor}
            stroke={strokeColor}
            strokeWidth={2}
          />
          <path
            d={`M ${cx + 2} ${legBottom + 8}
                Q ${cx + torsoW / 4} ${legBottom - 2} ${cx + torsoW / 2 + 2} ${legBottom + 8}`}
            fill={strokeColor}
            stroke={strokeColor}
            strokeWidth={2}
          />
        </>
      )}
    </svg>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={persona ? translate("Edit your player profile") : translate("Log in to personalize")}
        className={`${wrapperClass} cursor-pointer rounded-2xl border border-transparent transition hover:border-[rgb(var(--text)/0.2)] hover:bg-[rgb(var(--text)/0.04)]`}
        style={sizeStyle}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={wrapperClass} style={sizeStyle}>
      {body}
    </div>
  );
}
