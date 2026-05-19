"use client";

import { useEffect, useState } from "react";
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

type BallSlot =
  | "none"
  | "left-hand"
  | "right-hand"
  | "two-hands"
  | "overhead"
  | "floor-r"
  | "floor-l";

type AnimKey =
  | "pa-breathe"
  | "pa-dribble-bob"
  | "pa-stir-pot"
  | "pa-shake-wrist"
  | "pa-shimmy"
  | "pa-clap"
  | "pa-bounce"
  | "pa-ball-bob"
  | "pa-slow-bounce"
  | "pa-wave-hand";

const ANIM_DURATION: Record<AnimKey, string> = {
  "pa-breathe": "2.8s",
  "pa-dribble-bob": "0.55s",
  "pa-stir-pot": "1.8s",
  "pa-shake-wrist": "0.42s",
  "pa-shimmy": "0.55s",
  "pa-clap": "0.7s",
  "pa-bounce": "1.4s",
  "pa-ball-bob": "0.5s",
  "pa-slow-bounce": "2.4s",
  "pa-wave-hand": "0.7s"
};

const ANIM_TIMING: Record<AnimKey, string> = {
  "pa-stir-pot": "linear",
  "pa-breathe": "ease-in-out",
  "pa-dribble-bob": "ease-in-out",
  "pa-shake-wrist": "ease-in-out",
  "pa-shimmy": "ease-in-out",
  "pa-clap": "ease-in-out",
  "pa-bounce": "ease-in-out",
  "pa-ball-bob": "ease-in-out",
  "pa-slow-bounce": "ease-in-out",
  "pa-wave-hand": "ease-in-out"
};

function animStyle(key?: AnimKey): React.CSSProperties | undefined {
  if (!key) return undefined;
  return { animation: `${key} ${ANIM_DURATION[key]} ${ANIM_TIMING[key]} infinite` };
}

type JointAnims = {
  head?: AnimKey;
  lShoulder?: AnimKey;
  lElbow?: AnimKey;
  lWrist?: AnimKey;
  rShoulder?: AnimKey;
  rElbow?: AnimKey;
  rWrist?: AnimKey;
  lHip?: AnimKey;
  lKnee?: AnimKey;
  lAnkle?: AnimKey;
  rHip?: AnimKey;
  rKnee?: AnimKey;
  rAnkle?: AnimKey;
  body?: AnimKey;
};

type Pose = {
  name: string;
  headTilt: number;
  lShoulder: number;
  lElbow: number;
  lWrist: number;
  rShoulder: number;
  rElbow: number;
  rWrist: number;
  lHip: number;
  lKnee: number;
  lAnkle: number;
  rHip: number;
  rKnee: number;
  rAnkle: number;
  ball: BallSlot;
  bodyShiftY?: number;
  anim?: JointAnims;
};

// Angle convention (SVG, y points down):
//   0   = limb extends straight down from its joint
//   +90 = limb points LEFT of screen (CW 90°)
//   -90 = limb points RIGHT of screen
//   +180 / -180 = limb points UP
// Child rotation is RELATIVE to parent's local frame, so the chain is:
//   absolute = shoulder + elbow + wrist (etc).
const Z = {
  name: "",
  headTilt: 0,
  lShoulder: 0, lElbow: 0, lWrist: 0,
  rShoulder: 0, rElbow: 0, rWrist: 0,
  lHip: 0, lKnee: 0, lAnkle: 0,
  rHip: 0, rKnee: 0, rAnkle: 0,
  ball: "none" as BallSlot
};

function pose(p: Partial<Pose> & { name: string }): Pose {
  return { ...Z, ...p };
}

const POSES: Pose[] = [
  // ───── Idle / casual ─────
  pose({ name: "idle", lShoulder: 4, rShoulder: -4, anim: { body: "pa-breathe" } }),
  pose({
    name: "ready",
    lShoulder: 12, lElbow: -25, lHip: 8, lKnee: -12,
    rShoulder: -12, rElbow: 25, rHip: -8, rKnee: 12,
    bodyShiftY: 4, anim: { body: "pa-bounce" }
  }),
  pose({
    name: "tip-toe",
    lShoulder: 175, lElbow: -10, rShoulder: -175, rElbow: 10,
    lAnkle: -22, rAnkle: 22, bodyShiftY: -4
  }),
  pose({
    name: "hands-on-knees",
    headTilt: 14,
    lShoulder: 35, lElbow: -110, lWrist: 10,
    rShoulder: -35, rElbow: 110, rWrist: -10,
    lHip: 8, lKnee: -20, rHip: -8, rKnee: 20, bodyShiftY: 6
  }),
  pose({
    name: "arms-crossed",
    lShoulder: 30, lElbow: -135, lWrist: -8,
    rShoulder: -30, rElbow: 135, rWrist: 8,
    anim: { body: "pa-breathe" }
  }),

  // ───── Shooting ─────
  pose({
    name: "set-shot",
    headTilt: -2,
    lShoulder: 95, lElbow: 95, lWrist: 8,
    rShoulder: -150, rElbow: -30, rWrist: -10,
    ball: "overhead"
  }),
  pose({
    name: "jump-shot",
    headTilt: -3,
    lShoulder: 80, lElbow: 110, lWrist: 6,
    rShoulder: -155, rElbow: -25, rWrist: -8,
    lAnkle: -18, rAnkle: 18, bodyShiftY: -8,
    ball: "overhead"
  }),
  pose({
    name: "fadeaway",
    headTilt: -12,
    lShoulder: 95, lElbow: 90, lWrist: 8,
    rShoulder: -160, rElbow: -25, rWrist: -10,
    lHip: -10, lKnee: 15, rHip: 6, rKnee: -8,
    ball: "overhead"
  }),
  pose({
    name: "floater",
    headTilt: -4,
    lShoulder: 15, lElbow: -45,
    rShoulder: -170, rElbow: -10, rWrist: -15,
    lKnee: -12, rHip: -20, rKnee: 35,
    bodyShiftY: -4,
    ball: "right-hand"
  }),
  pose({
    name: "free-throw",
    lShoulder: 30, lElbow: -120, lWrist: -5,
    rShoulder: -30, rElbow: 120, rWrist: 5,
    ball: "two-hands"
  }),
  pose({
    name: "three-pointer",
    headTilt: -4,
    lShoulder: 100, lElbow: 85, lWrist: 12,
    rShoulder: -160, rElbow: -25, rWrist: -14,
    lKnee: -6, rKnee: 6,
    ball: "overhead"
  }),

  // ───── Dribbling ─────
  pose({
    name: "dribble-low",
    headTilt: 6,
    lShoulder: 10, lElbow: -10,
    rShoulder: -5, rElbow: -20, rWrist: 25,
    lHip: 6, lKnee: -10, rHip: -4, rKnee: 8,
    bodyShiftY: 2,
    ball: "right-hand",
    anim: { rWrist: "pa-ball-bob" }
  }),
  pose({
    name: "dribble-high",
    headTilt: 4,
    lShoulder: 12, lElbow: -10,
    rShoulder: -25, rElbow: -110, rWrist: 18,
    ball: "right-hand",
    anim: { rWrist: "pa-ball-bob" }
  }),
  pose({
    name: "crossover",
    headTilt: -6,
    lShoulder: -8, lElbow: -85, lWrist: 18,
    rShoulder: 14, rElbow: 60,
    lHip: 8, lKnee: -14, rHip: -4, rKnee: 8,
    ball: "left-hand"
  }),
  pose({
    name: "between-legs",
    headTilt: 8,
    lShoulder: 18, lElbow: -90,
    rShoulder: -18, rElbow: 90,
    lHip: 4, lKnee: -10, rHip: -22, rKnee: 35,
    bodyShiftY: 3,
    ball: "two-hands"
  }),
  pose({
    name: "behind-back",
    headTilt: 4,
    lShoulder: -25, lElbow: -110, lWrist: -20,
    rShoulder: 25, rElbow: 110, rWrist: 20
  }),

  // ───── Passing ─────
  pose({
    name: "chest-pass",
    lShoulder: 28, lElbow: -105, lWrist: -10,
    rShoulder: -28, rElbow: 105, rWrist: 10,
    ball: "two-hands"
  }),
  pose({
    name: "bounce-pass",
    headTilt: 6,
    lShoulder: 32, lElbow: -65,
    rShoulder: -32, rElbow: 65,
    lKnee: -10, rKnee: 10, bodyShiftY: 4,
    ball: "two-hands"
  }),
  pose({
    name: "overhead-pass",
    headTilt: -4,
    lShoulder: 155, lElbow: 22, lWrist: -8,
    rShoulder: -155, rElbow: -22, rWrist: 8,
    ball: "overhead"
  }),

  // ───── Defense ─────
  pose({
    name: "defend-stance",
    lShoulder: 95, lElbow: -25,
    rShoulder: -95, rElbow: 25,
    lHip: 22, lKnee: -30, lAnkle: 8,
    rHip: -22, rKnee: 30, rAnkle: -8,
    bodyShiftY: 8,
    anim: { body: "pa-bounce" }
  }),
  pose({
    name: "block",
    headTilt: -4,
    lShoulder: 70, lElbow: -110, lWrist: -10,
    rShoulder: -170, rElbow: -10,
    rAnkle: 18, bodyShiftY: -10
  }),
  pose({
    name: "steal-reach",
    headTilt: -10,
    lShoulder: 8, lElbow: -8,
    rShoulder: -110, rElbow: -25, rWrist: -10,
    lHip: 6, lKnee: -12, rHip: -16, rKnee: 22
  }),
  pose({
    name: "box-out",
    headTilt: 8,
    lShoulder: -15, lElbow: -55,
    rShoulder: 15, rElbow: 55,
    lHip: 16, lKnee: -18, rHip: -16, rKnee: 18,
    bodyShiftY: 6
  }),

  // ───── Finishing ─────
  pose({
    name: "layup",
    headTilt: -8,
    lShoulder: 18, lElbow: -45,
    rShoulder: -170, rElbow: -8, rWrist: -10,
    lHip: 6, rHip: -28, rKnee: 50,
    bodyShiftY: -6,
    ball: "right-hand"
  }),
  pose({
    name: "reverse-layup",
    headTilt: 8,
    lShoulder: 170, lElbow: 8, lWrist: 10,
    rShoulder: -18, rElbow: 45,
    lHip: 28, lKnee: 50, rHip: -6,
    bodyShiftY: -6,
    ball: "left-hand"
  }),
  pose({
    name: "dunk",
    headTilt: -3,
    lShoulder: 168, lElbow: 8,
    rShoulder: -168, rElbow: -8,
    lKnee: -12, rKnee: 12, lAnkle: -10, rAnkle: 10,
    bodyShiftY: -14,
    ball: "overhead"
  }),

  // ───── Signature ─────
  pose({
    name: "curry-nightnight",
    headTilt: 14,
    lShoulder: 60, lElbow: -130, lWrist: -22,
    rShoulder: -60, rElbow: 130, rWrist: 22
  }),
  pose({
    name: "curry-shimmy",
    headTilt: -4,
    lShoulder: 28, lElbow: -80,
    rShoulder: -28, rElbow: 80,
    anim: { body: "pa-shimmy", head: "pa-shimmy" }
  }),
  pose({
    name: "curry-3pt-point",
    headTilt: -8,
    lShoulder: -25, lElbow: -55,
    rShoulder: -135, rElbow: 35, rWrist: -10
  }),
  pose({
    name: "harden-stir-pot",
    headTilt: -8,
    lShoulder: 18, lElbow: -120, lWrist: 10,
    rShoulder: -25, rElbow: 0,
    anim: { rElbow: "pa-stir-pot" }
  }),
  pose({
    name: "harden-salt",
    headTilt: 8,
    lShoulder: 14, lElbow: -55,
    rShoulder: -18, rElbow: -65, rWrist: -30,
    anim: { rWrist: "pa-shake-wrist" }
  }),
  pose({
    name: "lebron-silencer",
    headTilt: -4,
    lShoulder: 8, lElbow: -10,
    rShoulder: -28, rElbow: -130, rWrist: -10
  }),
  pose({
    name: "lebron-crown",
    headTilt: 0,
    lShoulder: 130, lElbow: 45, lWrist: -10,
    rShoulder: -130, rElbow: -45, rWrist: 10
  }),
  pose({
    name: "lebron-king-walk",
    headTilt: 6,
    lShoulder: 18, lElbow: -8,
    rShoulder: -10, rElbow: -18,
    lHip: -6, lKnee: 12, rHip: 8, rKnee: -10,
    anim: { body: "pa-slow-bounce" }
  }),
  pose({
    name: "mj-shrug",
    headTilt: 0,
    lShoulder: 65, lElbow: -110, lWrist: -22,
    rShoulder: -65, rElbow: 110, rWrist: 22
  }),
  pose({
    name: "iverson-step-over",
    headTilt: -10,
    lShoulder: 32, lElbow: -65,
    rShoulder: -32, rElbow: 65,
    lHip: 6,
    rHip: -60, rKnee: 90, rAnkle: -20,
    bodyShiftY: -2
  }),
  pose({
    name: "iverson-low-cross",
    headTilt: 12,
    lShoulder: -8, lElbow: -8,
    rShoulder: 25, rElbow: -55, rWrist: 28,
    lHip: 10, lKnee: -22, rHip: -10, rKnee: 22,
    bodyShiftY: 10,
    ball: "right-hand"
  }),
  pose({
    name: "dirk-onefoot-fade",
    headTilt: -14,
    lShoulder: 95, lElbow: 95, lWrist: 8,
    rShoulder: -160, rElbow: -22, rWrist: -10,
    lHip: -4,
    rHip: -55, rKnee: 70,
    bodyShiftY: -8,
    ball: "overhead"
  }),

  // ───── Celebrations / casual ─────
  pose({
    name: "wave",
    headTilt: 8,
    lShoulder: 8, lElbow: -8,
    rShoulder: -150, rElbow: -22,
    anim: { rWrist: "pa-wave-hand" }
  }),
  pose({
    name: "thumbs-up",
    lShoulder: 8, lElbow: -8,
    rShoulder: -22, rElbow: -110, rWrist: -10
  }),
  pose({
    name: "peace-sign",
    headTilt: -4,
    lShoulder: 8, lElbow: -8,
    rShoulder: -35, rElbow: -130, rWrist: -8
  }),
  pose({
    name: "heart-hands",
    headTilt: -3,
    lShoulder: 140, lElbow: 38, lWrist: -10,
    rShoulder: -140, rElbow: -38, rWrist: 10
  }),
  pose({
    name: "bow",
    headTilt: 22,
    lShoulder: 8, lElbow: -10,
    rShoulder: -8, rElbow: 10,
    lHip: 0, rHip: 0,
    bodyShiftY: 6
  }),
  pose({
    name: "clap",
    lShoulder: 22, lElbow: -120, lWrist: -8,
    rShoulder: -22, rElbow: 120, rWrist: 8,
    anim: { lWrist: "pa-clap", rWrist: "pa-clap" }
  }),
  pose({
    name: "jump-celebrate",
    headTilt: -2,
    lShoulder: 168, lElbow: 8,
    rShoulder: -168, rElbow: -8,
    lAnkle: -10, rAnkle: 10,
    bodyShiftY: -10
  }),
  pose({
    name: "point-up",
    headTilt: -10,
    lShoulder: 8, lElbow: -8,
    rShoulder: -172, rElbow: -8
  }),
  pose({
    name: "point-coach",
    headTilt: -4,
    lShoulder: 12, lElbow: -10,
    rShoulder: -100, rElbow: -10
  }),
  pose({
    name: "fist-pump",
    headTilt: 8,
    lShoulder: 4, lElbow: -8,
    rShoulder: -8, rElbow: -130, rWrist: 10,
    anim: { body: "pa-bounce" }
  }),
  pose({
    name: "flex",
    headTilt: 0,
    lShoulder: 85, lElbow: -150, lWrist: -10,
    rShoulder: -85, rElbow: 150, rWrist: 10
  }),
  pose({
    name: "victory-arms-wide",
    headTilt: 0,
    lShoulder: 95, lElbow: -8,
    rShoulder: -95, rElbow: 8,
    anim: { body: "pa-breathe" }
  })
];

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
function lerp(t: number, a: number, b: number) {
  return a + (b - a) * t;
}
function pickRandomPose(): Pose {
  return POSES[Math.floor(Math.random() * POSES.length)];
}

const POSE_TRANSITION = "transform 640ms cubic-bezier(0.22,1,0.36,1)";

function Ball({ r = 7, dimmed = false }: { r?: number; dimmed?: boolean }) {
  const fill = dimmed ? "#a3a3a3" : "#f97316";
  const stroke = dimmed ? "#525252" : "#7c2d12";
  return (
    <g>
      <circle r={r} fill={fill} stroke={stroke} strokeWidth={0.9} />
      <path d={`M ${-r} 0 Q 0 ${-r * 0.5} ${r} 0`} fill="none" stroke={stroke} strokeWidth={0.9} />
      <path d={`M 0 ${-r} Q ${r * 0.5} 0 0 ${r}`} fill="none" stroke={stroke} strokeWidth={0.9} />
      <line x1={-r} y1={0} x2={r} y2={0} stroke={stroke} strokeWidth={0.6} opacity={0.7} />
    </g>
  );
}

export function PersonaAvatar({ persona, dimmed = false, onClick, size = "md" }: Props) {
  const { translate } = useLocale();

  // SSR-safe: idle on server, randomize on mount.
  // Dev / preview escape hatch: `?avatar-pose=<name>` pins a specific pose for
  // visual QA. Falls back to random when the name doesn't match.
  const [pose, setPose] = useState<Pose>(POSES[0]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forcedName = params.get("avatar-pose");
    if (forcedName) {
      const match = POSES.find((p) => p.name === forcedName);
      if (match) {
        setPose(match);
        return;
      }
    }
    setPose(pickRandomPose());
  }, []);

  const heightT = persona ? clamp01((persona.height_cm - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN)) : 0.55;
  const weightT = persona ? clamp01((persona.weight_kg - WEIGHT_MIN) / (WEIGHT_MAX - WEIGHT_MIN)) : 0.4;

  // Viewport — generous top margin so overhead-ball / dunk / jump don't clip.
  const svgW = 180;
  const svgH = 280;
  const cx = svgW / 2;

  const headR = 12;
  const headCy = 36; // head center

  const torsoTop = headCy + headR + 4; // 52
  const torsoH = lerp(heightT, 50, 76);
  const torsoW = lerp(weightT, 30, 56);
  const torsoBottom = torsoTop + torsoH;

  // Arm chain proportions.
  const armTotalH = torsoH * 0.78;
  const upperArmH = armTotalH * 0.5;
  const forearmH = armTotalH * 0.42;
  const armW = 5.5;
  const handR = 4;

  // Leg chain proportions.
  const legTotalH = lerp(heightT, 64, 100);
  const thighH = legTotalH * 0.52;
  const shinH = legTotalH * 0.44;
  const legW = Math.max(5, torsoW / 2 - 4);
  const footH = 5;

  // Shoulder anchors: top corners of torso, with a slight inward inset.
  const lShoulderX = cx - torsoW / 2 + 2;
  const rShoulderX = cx + torsoW / 2 - 2;
  const shoulderY = torsoTop + 3;

  // Hip anchors: bottom of torso.
  const lHipX = cx - torsoW / 4;
  const rHipX = cx + torsoW / 4;
  const hipY = torsoBottom;

  const flat = persona?.flat_foot ?? false;

  const positionsText =
    persona && persona.positions.length > 0
      ? persona.positions.map((p) => POSITION_LABEL[p]).join(" · ")
      : "—";
  const skillPipsCount = persona ? SKILL_PIPS[persona.skill_level] : 0;
  const skillLabel = persona ? translate(SKILL_LEVEL_LABEL[persona.skill_level]) : translate("Skill");

  const maxBodyWidth = size === "sm" ? 110 : 160;

  const fillColor = dimmed ? "rgb(var(--muted)/0.5)" : "rgb(var(--text)/0.85)";
  const strokeColor = dimmed ? "rgb(var(--muted)/0.7)" : "rgb(var(--text))";
  const footColor = dimmed ? "rgb(var(--muted)/0.8)" : "rgb(var(--text))";
  const handColor = fillColor;

  const labelClass = size === "sm" ? "text-[0.62rem]" : "text-[0.72rem]";

  // Hand + (optional) ball at the wrist's local origin.
  const HandAndBall = ({ slot }: { slot: "left-hand" | "right-hand" }) => (
    <>
      <circle cx={0} cy={handR + 1} r={handR} fill={handColor} stroke={strokeColor} strokeWidth={0.9} />
      {pose.ball === slot && (
        <g transform={`translate(0 ${handR * 2 + 6})`}>
          <Ball dimmed={dimmed} />
        </g>
      )}
    </>
  );

  const Foot = ({ side }: { side: "l" | "r" }) =>
    flat ? (
      <rect
        x={side === "l" ? -legW / 2 - 1 : -legW / 2 - 1}
        y={0}
        width={legW + 6}
        height={footH}
        rx={2}
        fill={footColor}
      />
    ) : (
      <path
        d={`M ${-legW / 2 - 1} ${footH} Q 0 ${-2} ${legW / 2 + 5} ${footH} Z`}
        fill={footColor}
        stroke={footColor}
        strokeWidth={0.8}
      />
    );

  const body = (
    <div className={`flex flex-col items-center ${size === "sm" ? "gap-1" : "gap-1.5"}`}>
      <style>{`
        @keyframes pa-breathe       { 0%,100% { transform: translateY(0) }   50% { transform: translateY(-1px) } }
        @keyframes pa-bounce        { 0%,100% { transform: translateY(0) }   50% { transform: translateY(-2px) } }
        @keyframes pa-slow-bounce   { 0%,100% { transform: translateY(0) }   50% { transform: translateY(-1.5px) } }
        @keyframes pa-dribble-bob   { 0%,100% { transform: translateY(0) }   50% { transform: translateY(7px) } }
        @keyframes pa-ball-bob      { 0%,100% { transform: translateY(0) }   50% { transform: translateY(7px) } }
        @keyframes pa-stir-pot      { from    { transform: rotate(0deg) }    to  { transform: rotate(360deg) } }
        @keyframes pa-shake-wrist   { 0%,100% { transform: rotate(-15deg) }  50% { transform: rotate(15deg) } }
        @keyframes pa-shimmy        { 0%,100% { transform: translateX(0) }   25% { transform: translateX(-1.5px) } 75% { transform: translateX(1.5px) } }
        @keyframes pa-clap          { 0%,100% { transform: translateY(0) }   50% { transform: translateY(-2px) } }
        @keyframes pa-wave-hand     { 0%,100% { transform: rotate(-22deg) }  50% { transform: rotate(22deg) } }
      `}</style>

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
        {/* Whole-body shift (for jumps/crouches) — torso itself never rotates. */}
        <g
          transform={`translate(0 ${pose.bodyShiftY ?? 0})`}
          style={{ ...animStyle(pose.anim?.body), transition: POSE_TRANSITION }}
        >
          {/* Torso (STATIC — never rotates) */}
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

          {/* Head */}
          <g
            transform={`translate(${cx} ${headCy}) rotate(${pose.headTilt})`}
            style={{ transition: POSE_TRANSITION }}
          >
            <g style={animStyle(pose.anim?.head)}>
              <circle cx={0} cy={0} r={headR} fill={fillColor} stroke={strokeColor} strokeWidth={1.2} />
              {/* tiny eyes */}
              {!dimmed && (
                <>
                  <circle cx={-4} cy={-1} r={1.1} fill="rgb(var(--bg))" />
                  <circle cx={4} cy={-1} r={1.1} fill="rgb(var(--bg))" />
                </>
              )}
            </g>
          </g>

          {/* LEFT arm chain */}
          <g
            transform={`translate(${lShoulderX} ${shoulderY}) rotate(${pose.lShoulder})`}
            style={{ transition: POSE_TRANSITION }}
          >
            <g style={animStyle(pose.anim?.lShoulder)}>
              <rect x={-armW / 2} y={0} width={armW} height={upperArmH} rx={armW / 2} fill={fillColor} stroke={strokeColor} strokeWidth={0.9} />
              <g
                transform={`translate(0 ${upperArmH}) rotate(${pose.lElbow})`}
                style={{ transition: POSE_TRANSITION }}
              >
                <g style={animStyle(pose.anim?.lElbow)}>
                  <rect x={-armW / 2} y={0} width={armW} height={forearmH} rx={armW / 2} fill={fillColor} stroke={strokeColor} strokeWidth={0.9} />
                  <g
                    transform={`translate(0 ${forearmH}) rotate(${pose.lWrist})`}
                    style={{ transition: POSE_TRANSITION }}
                  >
                    <g style={animStyle(pose.anim?.lWrist)}>
                      <HandAndBall slot="left-hand" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>

          {/* RIGHT arm chain */}
          <g
            transform={`translate(${rShoulderX} ${shoulderY}) rotate(${pose.rShoulder})`}
            style={{ transition: POSE_TRANSITION }}
          >
            <g style={animStyle(pose.anim?.rShoulder)}>
              <rect x={-armW / 2} y={0} width={armW} height={upperArmH} rx={armW / 2} fill={fillColor} stroke={strokeColor} strokeWidth={0.9} />
              <g
                transform={`translate(0 ${upperArmH}) rotate(${pose.rElbow})`}
                style={{ transition: POSE_TRANSITION }}
              >
                <g style={animStyle(pose.anim?.rElbow)}>
                  <rect x={-armW / 2} y={0} width={armW} height={forearmH} rx={armW / 2} fill={fillColor} stroke={strokeColor} strokeWidth={0.9} />
                  <g
                    transform={`translate(0 ${forearmH}) rotate(${pose.rWrist})`}
                    style={{ transition: POSE_TRANSITION }}
                  >
                    <g style={animStyle(pose.anim?.rWrist)}>
                      <HandAndBall slot="right-hand" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>

          {/* LEFT leg chain */}
          <g
            transform={`translate(${lHipX} ${hipY}) rotate(${pose.lHip})`}
            style={{ transition: POSE_TRANSITION }}
          >
            <g style={animStyle(pose.anim?.lHip)}>
              <rect x={-legW / 2} y={0} width={legW} height={thighH} rx={legW / 2.4} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
              <g
                transform={`translate(0 ${thighH}) rotate(${pose.lKnee})`}
                style={{ transition: POSE_TRANSITION }}
              >
                <g style={animStyle(pose.anim?.lKnee)}>
                  <rect x={-legW / 2} y={0} width={legW} height={shinH} rx={legW / 2.4} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
                  <g
                    transform={`translate(0 ${shinH}) rotate(${pose.lAnkle})`}
                    style={{ transition: POSE_TRANSITION }}
                  >
                    <g style={animStyle(pose.anim?.lAnkle)}>
                      <Foot side="l" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>

          {/* RIGHT leg chain */}
          <g
            transform={`translate(${rHipX} ${hipY}) rotate(${pose.rHip})`}
            style={{ transition: POSE_TRANSITION }}
          >
            <g style={animStyle(pose.anim?.rHip)}>
              <rect x={-legW / 2} y={0} width={legW} height={thighH} rx={legW / 2.4} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
              <g
                transform={`translate(0 ${thighH}) rotate(${pose.rKnee})`}
                style={{ transition: POSE_TRANSITION }}
              >
                <g style={animStyle(pose.anim?.rKnee)}>
                  <rect x={-legW / 2} y={0} width={legW} height={shinH} rx={legW / 2.4} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
                  <g
                    transform={`translate(0 ${shinH}) rotate(${pose.rAnkle})`}
                    style={{ transition: POSE_TRANSITION }}
                  >
                    <g style={animStyle(pose.anim?.rAnkle)}>
                      <Foot side="r" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>

          {/* Free-floating balls (drawn outside the joint chains) */}
          {pose.ball === "two-hands" && (
            <g transform={`translate(${cx} ${torsoTop + torsoH * 0.42})`}>
              <Ball dimmed={dimmed} />
            </g>
          )}
          {pose.ball === "overhead" && (
            <g transform={`translate(${cx} ${headCy - headR - 8})`}>
              <Ball dimmed={dimmed} />
            </g>
          )}
          {pose.ball === "floor-r" && (
            <g transform={`translate(${cx + torsoW * 0.45} ${hipY + legTotalH + 4})`}>
              <Ball dimmed={dimmed} />
            </g>
          )}
          {pose.ball === "floor-l" && (
            <g transform={`translate(${cx - torsoW * 0.45} ${hipY + legTotalH + 4})`}>
              <Ball dimmed={dimmed} />
            </g>
          )}
        </g>
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
