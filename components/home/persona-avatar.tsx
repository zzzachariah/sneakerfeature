"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shuffle } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import {
  POSITION_LABEL,
  SKILL_LEVEL_LABEL,
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

// ───────────────────────────────────────────────────────────────
// FIXED GEOMETRY — all body parts are constants and never scale
// with persona. Persona only drives the text labels.
// ───────────────────────────────────────────────────────────────
const SVG_W = 200;
const SVG_H = 280;
const CX = SVG_W / 2;

const HEAD_R = 13;
const HEAD_CY = 40;

const NECK_H = 4;
const TORSO_W = 34;
const TORSO_H = 64;
const TORSO_TOP = HEAD_CY + HEAD_R + NECK_H; // 57
const TORSO_BOTTOM = TORSO_TOP + TORSO_H; // 121
const WAIST_Y = TORSO_TOP + TORSO_H * 0.55; // chest/belly divider

const UPPER_ARM_H = 27;
const FOREARM_H = 24;
const ARM_W = 5.5;
const HAND_R = 4;

const THIGH_H = 38;
const SHIN_H = 34;
const FOOT_H = 5;
const LEG_W = 8.5;

const L_SHOULDER_X = CX - TORSO_W / 2 + 1;
const R_SHOULDER_X = CX + TORSO_W / 2 - 1;
const SHOULDER_Y = TORSO_TOP + 3;

const L_HIP_X = CX - TORSO_W / 4;
const R_HIP_X = CX + TORSO_W / 4;
const HIP_Y = TORSO_BOTTOM;

const GROUND_Y = HIP_Y + THIGH_H + SHIN_H + FOOT_H; // 191

// Hoop position (upper right of SVG).
const HOOP_BACKBOARD_X = 158;
const HOOP_BACKBOARD_Y = 12;

// ───────────────────────────────────────────────────────────────
// Ball + animation types
// ───────────────────────────────────────────────────────────────
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
  | "pa-bounce"
  | "pa-slow-bounce"
  | "pa-dribble-bob"
  | "pa-ball-bob"
  | "pa-stir-pot"
  | "pa-shake-wrist"
  | "pa-shimmy"
  | "pa-clap"
  | "pa-wave-hand"
  | "pa-zzz"
  | "pa-salt-fall";

const ANIM_DUR: Record<AnimKey, string> = {
  "pa-breathe": "2.8s",
  "pa-bounce": "1.4s",
  "pa-slow-bounce": "2.4s",
  "pa-dribble-bob": "0.55s",
  "pa-ball-bob": "0.5s",
  "pa-stir-pot": "1.6s",
  "pa-shake-wrist": "0.42s",
  "pa-shimmy": "0.55s",
  "pa-clap": "0.7s",
  "pa-wave-hand": "0.7s",
  "pa-zzz": "2.2s",
  "pa-salt-fall": "1.2s"
};

const ANIM_TIMING: Record<AnimKey, string> = {
  "pa-stir-pot": "linear",
  "pa-salt-fall": "ease-in",
  "pa-breathe": "ease-in-out",
  "pa-bounce": "ease-in-out",
  "pa-slow-bounce": "ease-in-out",
  "pa-dribble-bob": "ease-in-out",
  "pa-ball-bob": "ease-in-out",
  "pa-shake-wrist": "ease-in-out",
  "pa-shimmy": "ease-in-out",
  "pa-clap": "ease-in-out",
  "pa-wave-hand": "ease-in-out",
  "pa-zzz": "ease-in-out"
};

function animStyle(key?: AnimKey): React.CSSProperties | undefined {
  if (!key) return undefined;
  return { animation: `${key} ${ANIM_DUR[key]} ${ANIM_TIMING[key]} infinite` };
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

type Decoration =
  | "zzz"
  | "salt"
  | "question"
  | "sparkle"
  | "crown"
  | "shh"
  | "three-fingers"
  | "heart"
  | "stars";

type Pose = {
  name: string;
  label: string; // English display name; goes through translate()
  headTilt: number;
  lShoulder: number; lElbow: number; lWrist: number;
  rShoulder: number; rElbow: number; rWrist: number;
  lHip: number; lKnee: number; lAnkle: number;
  rHip: number; rKnee: number; rAnkle: number;
  ball: BallSlot;
  bodyShiftY?: number;
  hasHoop?: boolean;
  hasDefender?: boolean;
  decoration?: Decoration;
  anim?: JointAnims;
};

// Angle convention (SVG, y points down):
//   0   = limb extends straight down from its joint
//   +90 = limb points LEFT (clockwise 90° on screen)
//   -90 = limb points RIGHT
//   ±180 = limb points UP
// Child rotation is RELATIVE to parent's (already rotated) frame.

// ───────────────────────────────────────────────────────────────
// New action-sequence types (multi-frame choreography upgrade)
// ───────────────────────────────────────────────────────────────

type View = "front" | "side-r" | "side-l";

type HandPose =
  | "relaxed"
  | "fist"
  | "open-palm"
  | "gripping-ball"
  | "point-index"
  | "three-fingers"
  | "thumbs-up"
  | "peace";

type Expression = "neutral" | "smile" | "open-mouth" | "focus";

type ActionCategory =
  | "idle"
  | "shooting"
  | "dribbling"
  | "passing"
  | "defense"
  | "finishing"
  | "signature"
  | "celebration";

type EffectKey =
  | "motion-lines-r"
  | "motion-lines-l"
  | "motion-lines-up"
  | "sweat-drops"
  | "dust-puff"
  | "impact-rings"
  | "shake-cam"
  | "slash"
  | "swish"
  | "trail-arm"
  | "flash-pop"
  | "confetti";

type SceneBgKey =
  | "three-pt-arc"
  | "free-throw-line"
  | "paint-zone"
  | "court-floor"
  | "scoreboard"
  | "spotlight"
  | "bench";

type ZOrderConfig = {
  hoop?: "back" | "front";
  ball?: "back" | "front";
  defender?: "back" | "front";
  decoration?: "back" | "front-of-head" | "above-all";
};

// Full visual snapshot of the skeleton at one instant.
type Skeleton = {
  headTilt: number;
  lShoulder: number; lElbow: number; lWrist: number;
  rShoulder: number; rElbow: number; rWrist: number;
  lHip: number; lKnee: number; lAnkle: number;
  rHip: number; rKnee: number; rAnkle: number;
  ball: BallSlot;
  bodyShiftY: number;
  bodyShiftX: number;
  lHandPose: HandPose;
  rHandPose: HandPose;
  expression: Expression;
};

// A frame is a delta — only restate fields that change from the prior frame.
type Frame = Partial<Skeleton> & {
  effects?: EffectKey[];
  decoration?: Decoration | null;
  anim?: JointAnims;
  hold?: number;        // ms to stay after the transition settles (default 0)
  enterMs?: number;     // ms to interpolate INTO this frame (default 640; 0 = snap)
  view?: View;          // per-frame view override
  ballScale?: number;
  zOrder?: ZOrderConfig;
};

type ActionSequence = {
  name: string;
  label: string;
  category: ActionCategory;
  view?: View;          // default "front"
  frames: Frame[];      // length >= 1
  loop?: boolean;       // default true
  hasHoop?: boolean;
  hasDefender?: boolean;
  sceneBg?: SceneBgKey;
  decoration?: Decoration;
  anim?: JointAnims;
  ballScale?: number;
  zOrder?: ZOrderConfig;
};

// Effects that loop continuously while the action plays (rendered union over
// all frames). One-shot effects only render on the current frame and remount
// via a key that includes runKey + frameIdx so the CSS animation restarts.
const EFFECT_LOOPING = new Set<EffectKey>([
  "sweat-drops",
  "motion-lines-r",
  "motion-lines-l",
  "motion-lines-up",
  "confetti",
  "trail-arm"
]);

// Z-layer per effect: "back" renders behind the body group, "front" renders on top.
const EFFECT_LAYER: Record<EffectKey, "back" | "front"> = {
  "motion-lines-r": "back",
  "motion-lines-l": "back",
  "motion-lines-up": "back",
  "sweat-drops": "front",
  "dust-puff": "front",
  "impact-rings": "back",
  "shake-cam": "front",  // applied to wrapper, not actually rendered here
  "slash": "front",
  "swish": "back",
  "trail-arm": "back",
  "flash-pop": "front",
  "confetti": "front"
};

const Z = {
  headTilt: 0,
  lShoulder: 0, lElbow: 0, lWrist: 0,
  rShoulder: 0, rElbow: 0, rWrist: 0,
  lHip: 0, lKnee: 0, lAnkle: 0,
  rHip: 0, rKnee: 0, rAnkle: 0,
  ball: "none" as BallSlot
};

// Zero skeleton — the implicit "starting point" all Frame deltas are folded onto.
const Z_SKEL: Skeleton = {
  headTilt: 0,
  lShoulder: 0, lElbow: 0, lWrist: 0,
  rShoulder: 0, rElbow: 0, rWrist: 0,
  lHip: 0, lKnee: 0, lAnkle: 0,
  rHip: 0, rKnee: 0, rAnkle: 0,
  ball: "none",
  bodyShiftY: 0,
  bodyShiftX: 0,
  lHandPose: "relaxed",
  rHandPose: "relaxed",
  expression: "neutral"
};

function pose(p: Partial<Pose> & Pick<Pose, "name" | "label">): Pose {
  return { ...Z, ...p };
}

// Fold frames[0..idx] left-to-right over Z_SKEL to get the absolute snapshot.
function resolveSkeleton(action: ActionSequence, idx: number): Skeleton {
  let s: Skeleton = { ...Z_SKEL };
  const limit = Math.min(idx, action.frames.length - 1);
  for (let i = 0; i <= limit; i++) {
    const f = action.frames[i];
    s = {
      ...s,
      ...(f.headTilt !== undefined && { headTilt: f.headTilt }),
      ...(f.lShoulder !== undefined && { lShoulder: f.lShoulder }),
      ...(f.lElbow !== undefined && { lElbow: f.lElbow }),
      ...(f.lWrist !== undefined && { lWrist: f.lWrist }),
      ...(f.rShoulder !== undefined && { rShoulder: f.rShoulder }),
      ...(f.rElbow !== undefined && { rElbow: f.rElbow }),
      ...(f.rWrist !== undefined && { rWrist: f.rWrist }),
      ...(f.lHip !== undefined && { lHip: f.lHip }),
      ...(f.lKnee !== undefined && { lKnee: f.lKnee }),
      ...(f.lAnkle !== undefined && { lAnkle: f.lAnkle }),
      ...(f.rHip !== undefined && { rHip: f.rHip }),
      ...(f.rKnee !== undefined && { rKnee: f.rKnee }),
      ...(f.rAnkle !== undefined && { rAnkle: f.rAnkle }),
      ...(f.ball !== undefined && { ball: f.ball }),
      ...(f.bodyShiftY !== undefined && { bodyShiftY: f.bodyShiftY }),
      ...(f.bodyShiftX !== undefined && { bodyShiftX: f.bodyShiftX }),
      ...(f.lHandPose !== undefined && { lHandPose: f.lHandPose }),
      ...(f.rHandPose !== undefined && { rHandPose: f.rHandPose }),
      ...(f.expression !== undefined && { expression: f.expression })
    };
  }
  return s;
}

function frameDurationMs(frame: Frame): number {
  return (frame.enterMs ?? 640) + (frame.hold ?? 0);
}

// Wrap a legacy Pose into a 1-frame ActionSequence for backward compatibility.
function actionFromPose(p: Pose): ActionSequence {
  return {
    name: p.name,
    label: p.label,
    category: "idle",  // legacy poses get a placeholder category
    frames: [
      {
        headTilt: p.headTilt,
        lShoulder: p.lShoulder, lElbow: p.lElbow, lWrist: p.lWrist,
        rShoulder: p.rShoulder, rElbow: p.rElbow, rWrist: p.rWrist,
        lHip: p.lHip, lKnee: p.lKnee, lAnkle: p.lAnkle,
        rHip: p.rHip, rKnee: p.rKnee, rAnkle: p.rAnkle,
        ball: p.ball,
        bodyShiftY: p.bodyShiftY ?? 0,
        anim: p.anim
      }
    ],
    hasHoop: p.hasHoop,
    hasDefender: p.hasDefender,
    decoration: p.decoration,
    anim: p.anim
  };
}

const POSES: Pose[] = [
  // ── Signature ──────────────────────────────────────────────
  pose({
    name: "curry-nightnight", label: "Curry · Night-night",
    headTilt: 14,
    lShoulder: 70, lElbow: -130, lWrist: -28,
    rShoulder: -70, rElbow: 130, rWrist: 28,
    decoration: "zzz", anim: { head: "pa-zzz" }
  }),
  pose({
    name: "curry-shimmy", label: "Curry · Shimmy",
    headTilt: -4,
    lShoulder: 30, lElbow: -82,
    rShoulder: -30, rElbow: 82,
    anim: { body: "pa-shimmy", head: "pa-shimmy" }
  }),
  pose({
    name: "curry-3pt-point", label: "Curry · Three fingers",
    headTilt: -8,
    lShoulder: -16, lElbow: -50,
    rShoulder: -135, rElbow: 30, rWrist: -10,
    decoration: "three-fingers"
  }),
  pose({
    name: "harden-stir-pot", label: "Harden · Stir the pot",
    headTilt: -8,
    lShoulder: 22, lElbow: -120, lWrist: 10,
    rShoulder: -22, rElbow: -2,
    anim: { rElbow: "pa-stir-pot" }
  }),
  pose({
    name: "harden-salt", label: "Harden · Sprinkle salt",
    headTilt: 8,
    lShoulder: 14, lElbow: -55,
    rShoulder: -22, rElbow: -65, rWrist: -32,
    decoration: "salt", anim: { rWrist: "pa-shake-wrist" }
  }),
  pose({
    name: "lebron-silencer", label: "LeBron · Silencer",
    headTilt: -4,
    lShoulder: 8, lElbow: -10,
    rShoulder: -28, rElbow: -132, rWrist: -10,
    decoration: "shh"
  }),
  pose({
    name: "lebron-crown", label: "LeBron · Crown",
    headTilt: 0,
    lShoulder: 132, lElbow: 48, lWrist: -10,
    rShoulder: -132, rElbow: -48, rWrist: 10,
    decoration: "crown"
  }),
  pose({
    name: "lebron-king-walk", label: "LeBron · King walk",
    headTilt: 6,
    lShoulder: 18, lElbow: -8,
    rShoulder: -10, rElbow: -22,
    lHip: -6, lKnee: 14, rHip: 10, rKnee: -10,
    anim: { body: "pa-slow-bounce" }
  }),
  pose({
    name: "mj-shrug", label: "MJ · Shrug",
    headTilt: 0,
    lShoulder: 70, lElbow: -110, lWrist: -22,
    rShoulder: -70, rElbow: 110, rWrist: 22,
    decoration: "question"
  }),
  pose({
    name: "iverson-step-over", label: "Iverson · Step-over",
    headTilt: -10,
    lShoulder: 32, lElbow: -65,
    rShoulder: -32, rElbow: 65,
    lHip: 6,
    rHip: -65, rKnee: 95, rAnkle: -22,
    bodyShiftY: -2, hasDefender: true
  }),
  pose({
    name: "iverson-low-cross", label: "Iverson · Low crossover",
    headTilt: 12,
    lShoulder: -8, lElbow: -8,
    rShoulder: 25, rElbow: -55, rWrist: 28,
    lHip: 10, lKnee: -22, rHip: -10, rKnee: 22,
    bodyShiftY: 10, ball: "right-hand"
  }),
  pose({
    name: "dirk-onefoot-fade", label: "Dirk · One-foot fade",
    headTilt: -14,
    lShoulder: 38, lElbow: 100, lWrist: -8,
    rShoulder: -88, rElbow: -100, rWrist: -10,
    lHip: -4,
    rHip: -58, rKnee: 75,
    bodyShiftY: -8, ball: "overhead", hasHoop: true
  }),

  // ── Celebrations / casual ──────────────────────────────────
  pose({
    name: "wave", label: "Wave",
    headTilt: 8,
    lShoulder: 8, lElbow: -8,
    rShoulder: -148, rElbow: -22,
    anim: { rWrist: "pa-wave-hand" }
  }),
  pose({
    name: "thumbs-up", label: "Thumbs up",
    lShoulder: 8, lElbow: -8,
    rShoulder: -22, rElbow: -108, rWrist: -10
  }),
  pose({
    name: "peace-sign", label: "Peace",
    headTilt: -4,
    lShoulder: 8, lElbow: -8,
    rShoulder: -32, rElbow: -130, rWrist: -8
  }),
  pose({
    name: "heart-hands", label: "Heart hands",
    headTilt: -3,
    lShoulder: 138, lElbow: 38, lWrist: -10,
    rShoulder: -138, rElbow: -38, rWrist: 10,
    decoration: "heart"
  }),
  pose({
    name: "bow", label: "Bow",
    headTilt: 22,
    lShoulder: 8, lElbow: -10,
    rShoulder: -8, rElbow: 10,
    bodyShiftY: 6
  }),
  pose({
    name: "clap", label: "Clap",
    lShoulder: 22, lElbow: -120, lWrist: -8,
    rShoulder: -22, rElbow: 120, rWrist: 8,
    anim: { lWrist: "pa-clap", rWrist: "pa-clap" }
  }),
  pose({
    name: "jump-celebrate", label: "Jump for joy",
    headTilt: -2,
    lShoulder: 168, lElbow: 8,
    rShoulder: -168, rElbow: -8,
    lAnkle: -10, rAnkle: 10,
    bodyShiftY: -10, decoration: "stars"
  }),
  pose({
    name: "point-up", label: "Point up",
    headTilt: -10,
    lShoulder: 8, lElbow: -8,
    rShoulder: -174, rElbow: -8
  }),
  pose({
    name: "point-coach", label: "Coaching",
    headTilt: -4,
    lShoulder: 12, lElbow: -10,
    rShoulder: -100, rElbow: -10
  }),
  pose({
    name: "fist-pump", label: "Fist pump",
    headTilt: 8,
    lShoulder: 4, lElbow: -8,
    rShoulder: -8, rElbow: -130, rWrist: 10,
    anim: { body: "pa-bounce" }
  }),
  pose({
    name: "flex", label: "Flex",
    headTilt: 0,
    lShoulder: 80, lElbow: -148, lWrist: -10,
    rShoulder: -80, rElbow: 148, rWrist: 10
  }),
  pose({
    name: "victory-arms-wide", label: "Arms wide",
    headTilt: 0,
    lShoulder: 95, lElbow: -8,
    rShoulder: -95, rElbow: 8,
    anim: { body: "pa-breathe" }
  })
];

// ───────────────────────────────────────────────────────────────
// ACTIONS — multi-frame, view-aware action sequences. Each action
// is choreographed to be recognizable at a glance (action + person).
// Until a name is here, the legacy POSES entry is wrapped via
// actionFromPose() in the runtime fallback path.
// ───────────────────────────────────────────────────────────────
const ACTIONS: ActionSequence[] = [
  // ── Idle / casual ───────────────────────────────────────────
  {
    name: "idle",
    label: "Idle",
    category: "idle",
    view: "front",
    anim: { body: "pa-breathe" },
    frames: [
      {
        lShoulder: 4,
        rShoulder: -4,
        lHandPose: "relaxed",
        rHandPose: "relaxed",
        expression: "neutral",
        hold: 0
      }
    ]
  },
  {
    name: "ready",
    label: "Ready stance",
    category: "idle",
    view: "front",
    sceneBg: "court-floor",
    anim: { body: "pa-bounce" },
    frames: [
      {
        // Athletic stance: slight knee bend, hands ready
        lShoulder: 14, lElbow: -28,
        rShoulder: -14, rElbow: 28,
        lHip: 10, lKnee: -22, rHip: -10, rKnee: 22,
        bodyShiftY: 8,
        lHandPose: "open-palm",
        rHandPose: "open-palm",
        expression: "focus",
        enterMs: 520, hold: 200
      },
      {
        // Tiny weight-shift left
        bodyShiftX: -1,
        enterMs: 520, hold: 200
      },
      {
        // Tiny weight-shift right
        bodyShiftX: 1,
        enterMs: 520, hold: 200
      }
    ]
  },
  {
    name: "tip-toe",
    label: "Tip-toe stretch",
    category: "idle",
    view: "front",
    frames: [
      {
        // Inhale: arms up
        lShoulder: 172, lElbow: -8,
        rShoulder: -172, rElbow: 8,
        lAnkle: -22, rAnkle: 22,
        bodyShiftY: -6,
        lHandPose: "open-palm", rHandPose: "open-palm",
        expression: "smile",
        enterMs: 900, hold: 500
      },
      {
        // Exhale: arms slightly relax
        lShoulder: 165, lElbow: -14,
        rShoulder: -165, rElbow: 14,
        bodyShiftY: -3,
        enterMs: 600, hold: 200
      }
    ]
  },
  {
    name: "hands-on-knees",
    label: "Catching breath",
    category: "idle",
    view: "side-r",
    anim: { body: "pa-breathe" },
    frames: [
      {
        // Bent over, hands on knees, gasping
        headTilt: 20,
        lShoulder: 30, lElbow: -110, lWrist: 8,
        rShoulder: -25, rElbow: 100, rWrist: -8,
        lHip: 8, lKnee: -24, rHip: -8, rKnee: 22,
        bodyShiftY: 6,
        lHandPose: "gripping-ball",
        rHandPose: "gripping-ball",
        expression: "open-mouth",
        effects: ["sweat-drops"],
        enterMs: 720, hold: 1400
      },
      {
        // Slight head lift (recovering)
        headTilt: 14,
        bodyShiftY: 4,
        expression: "open-mouth",
        enterMs: 600, hold: 600
      }
    ]
  },
  {
    name: "arms-crossed",
    label: "Arms crossed",
    category: "idle",
    view: "front",
    anim: { body: "pa-breathe" },
    frames: [
      {
        lShoulder: 30, lElbow: -130, lWrist: -8,
        rShoulder: -30, rElbow: 130, rWrist: 8,
        lHandPose: "fist",
        rHandPose: "fist",
        expression: "focus"
      }
    ]
  },

  // ── Shooting ────────────────────────────────────────────────
  {
    name: "set-shot",
    label: "Set shot",
    category: "shooting",
    view: "side-r",
    hasHoop: true,
    frames: [
      // Setup: ball cradled at chest, knees slight bent
      {
        headTilt: -2,
        lShoulder: 38, lElbow: 100,
        rShoulder: -50, rElbow: -90, rWrist: -8,
        lHip: 6, lKnee: -10, rHip: -6, rKnee: 10,
        ball: "two-hands",
        lHandPose: "gripping-ball", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 520, hold: 180
      },
      // Release: ball overhead, right arm extending
      {
        headTilt: -4,
        lShoulder: 38, lElbow: 105, lWrist: -8,
        rShoulder: -88, rElbow: -100, rWrist: -10,
        ball: "overhead",
        lHandPose: "open-palm", rHandPose: "open-palm",
        effects: ["trail-arm"],
        enterMs: 280, hold: 80
      },
      // Follow-through: gooseneck wrist, ball gone, swish at rim
      {
        headTilt: -4,
        rWrist: -28,
        ball: "none",
        effects: ["swish"],
        enterMs: 320, hold: 600
      }
    ]
  },
  {
    name: "jump-shot",
    label: "Jump shot",
    category: "shooting",
    view: "side-r",
    hasHoop: true,
    frames: [
      // Crouch (gather)
      {
        headTilt: -2,
        lShoulder: 35, lElbow: -75,
        rShoulder: -35, rElbow: 75,
        lHip: 8, lKnee: -22, rHip: -8, rKnee: 22,
        ball: "two-hands",
        bodyShiftY: 8,
        lHandPose: "gripping-ball", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 380, hold: 140
      },
      // Takeoff (up and reaching)
      {
        headTilt: -3,
        lShoulder: 38, lElbow: 105, lWrist: -8,
        rShoulder: -90, rElbow: -110, rWrist: -10,
        lHip: 0, lKnee: -4, rHip: 0, rKnee: 4,
        lAnkle: -18, rAnkle: 18,
        ball: "overhead",
        bodyShiftY: -22,
        lHandPose: "open-palm", rHandPose: "open-palm",
        effects: ["motion-lines-up"],
        enterMs: 320, hold: 60
      },
      // Apex release with follow
      {
        rWrist: -28,
        ball: "none",
        effects: ["trail-arm", "swish"],
        enterMs: 280, hold: 240
      },
      // Landing
      {
        lShoulder: 14, lElbow: -22,
        rShoulder: -14, rElbow: 22,
        lKnee: -16, rKnee: 16,
        bodyShiftY: 6,
        enterMs: 380, hold: 600
      }
    ]
  },
  {
    name: "fadeaway",
    label: "Fadeaway",
    category: "shooting",
    view: "side-r",
    hasHoop: true,
    frames: [
      // Load
      {
        headTilt: -8,
        lShoulder: 95, lElbow: 90, lWrist: 8,
        rShoulder: -100, rElbow: -100, rWrist: -10,
        lHip: 18, lKnee: -8, rHip: 6, rKnee: -10,
        ball: "overhead",
        lHandPose: "gripping-ball", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 420, hold: 140
      },
      // Fade back + release
      {
        headTilt: -14,
        bodyShiftX: 3,
        bodyShiftY: -8,
        ball: "none",
        lHandPose: "open-palm", rHandPose: "open-palm",
        effects: ["trail-arm"],
        enterMs: 360, hold: 180
      },
      // Swish (follow through with hand still up)
      {
        headTilt: -16,
        rWrist: -32,
        effects: ["swish"],
        enterMs: 300, hold: 700
      }
    ]
  },
  {
    name: "floater",
    label: "Floater",
    category: "shooting",
    view: "side-r",
    hasHoop: true,
    frames: [
      // Stride lift
      {
        headTilt: -4,
        lShoulder: 15, lElbow: -45,
        rShoulder: -110, rElbow: -65, rWrist: -12,
        lHip: -6, lKnee: 10,
        rHip: -22, rKnee: 38,
        bodyShiftY: -10,
        ball: "right-hand",
        rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 380, hold: 120
      },
      // Soft toss release (ball flicks up)
      {
        rShoulder: -170, rElbow: -10, rWrist: -22,
        ballScale: 1.3,
        ball: "right-hand",
        rHandPose: "open-palm",
        effects: ["motion-lines-up"],
        enterMs: 320, hold: 100
      },
      // Drop and soft net contact
      {
        ball: "none",
        effects: ["swish"],
        enterMs: 360, hold: 600
      }
    ]
  },
  {
    name: "free-throw",
    label: "Free throw",
    category: "shooting",
    view: "front",
    hasHoop: true,
    sceneBg: "free-throw-line",
    frames: [
      // Dribble settle (centered, focused)
      {
        lShoulder: 22, lElbow: -85,
        rShoulder: -22, rElbow: 85,
        ball: "two-hands",
        lHandPose: "gripping-ball", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 480, hold: 320
      },
      // Lift / bend knees
      {
        lShoulder: 30, lElbow: -120, lWrist: -5,
        rShoulder: -30, rElbow: 120, rWrist: 5,
        lKnee: -10, rKnee: 10,
        bodyShiftY: 4,
        ball: "two-hands",
        enterMs: 420, hold: 180
      },
      // Release overhead
      {
        lShoulder: 38, lElbow: 105, lWrist: -8,
        rShoulder: -38, rElbow: -105, rWrist: -10,
        lKnee: 0, rKnee: 0,
        bodyShiftY: -2,
        ball: "none",
        lHandPose: "open-palm", rHandPose: "open-palm",
        effects: ["trail-arm"],
        enterMs: 320, hold: 100
      },
      // Follow-through gooseneck + swish
      {
        rWrist: -28, lWrist: 28,
        effects: ["swish"],
        enterMs: 320, hold: 720
      }
    ]
  },
  {
    name: "three-pointer",
    label: "Three-pointer",
    category: "shooting",
    view: "side-r",
    hasHoop: true,
    sceneBg: "three-pt-arc",
    decoration: "sparkle",
    frames: [
      // Setup
      {
        headTilt: -2,
        lShoulder: 35, lElbow: 95,
        rShoulder: -50, rElbow: -90, rWrist: -8,
        lKnee: -6, rKnee: 6,
        ball: "two-hands",
        lHandPose: "gripping-ball", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 420, hold: 140
      },
      // Release with slight hop
      {
        headTilt: -4,
        lShoulder: 38, lElbow: 105, lWrist: -8,
        rShoulder: -88, rElbow: -100, rWrist: -10,
        bodyShiftY: -6,
        ball: "overhead",
        lHandPose: "open-palm", rHandPose: "open-palm",
        effects: ["motion-lines-up"],
        enterMs: 300, hold: 80
      },
      // Follow + swish + spark
      {
        rWrist: -32,
        ball: "none",
        effects: ["swish", "flash-pop"],
        enterMs: 320, hold: 800
      }
    ]
  },

  // ── Dribbling ───────────────────────────────────────────────
  {
    name: "dribble-low",
    label: "Low dribble",
    category: "dribbling",
    view: "side-r",
    sceneBg: "court-floor",
    anim: { rWrist: "pa-ball-bob" },
    frames: [
      // Down (hand pressing ball into floor)
      {
        headTilt: 4,
        lShoulder: 12, lElbow: -10,
        rShoulder: -5, rElbow: -15, rWrist: 25,
        lHip: 10, lKnee: -22, rHip: -8, rKnee: 16,
        bodyShiftY: 10,
        ball: "right-hand",
        ballScale: 0.95,
        lHandPose: "open-palm", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 220, hold: 60
      },
      // Up (slight rise as ball bounces back)
      {
        bodyShiftY: 6,
        rWrist: 18,
        enterMs: 220, hold: 60
      }
    ]
  },
  {
    name: "dribble-high",
    label: "High dribble",
    category: "dribbling",
    view: "side-r",
    sceneBg: "court-floor",
    anim: { rWrist: "pa-ball-bob" },
    frames: [
      {
        headTilt: 2,
        lShoulder: 14, lElbow: -10,
        rShoulder: -30, rElbow: -110, rWrist: 20,
        lHip: 4, lKnee: -10,
        ball: "right-hand",
        lHandPose: "open-palm", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 280, hold: 60
      },
      {
        rWrist: 12,
        bodyShiftY: -2,
        enterMs: 280, hold: 60
      }
    ]
  },
  {
    name: "crossover",
    label: "Crossover",
    category: "dribbling",
    view: "front",
    sceneBg: "court-floor",
    frames: [
      // Ball right, weight on right leg
      {
        headTilt: -8,
        lShoulder: -10, lElbow: -75, lWrist: 18,
        rShoulder: 16, rElbow: 60,
        lHip: -6, lKnee: 8, rHip: 12, rKnee: -18,
        bodyShiftY: 8,
        ball: "right-hand",
        lHandPose: "open-palm", rHandPose: "gripping-ball",
        expression: "focus",
        effects: ["motion-lines-r"],
        enterMs: 360, hold: 60
      },
      // Ball crosses mid (two-hands transient + slash)
      {
        headTilt: 0,
        lShoulder: 12, lElbow: -60,
        rShoulder: -12, rElbow: 60,
        ball: "two-hands",
        ballScale: 0.85,
        effects: ["slash"],
        enterMs: 180, hold: 0
      },
      // Ball lands in left hand, weight shifts left
      {
        headTilt: 8,
        lShoulder: -16, lElbow: -60, lWrist: -25,
        rShoulder: 10, rElbow: 75,
        lHip: 12, lKnee: -18, rHip: -6, rKnee: 8,
        ball: "left-hand",
        lHandPose: "gripping-ball", rHandPose: "open-palm",
        effects: ["motion-lines-l"],
        enterMs: 360, hold: 60
      },
      // Settle low
      {
        bodyShiftY: 10,
        enterMs: 280, hold: 120
      }
    ]
  },
  {
    name: "between-legs",
    label: "Between the legs",
    category: "dribbling",
    view: "front",
    sceneBg: "court-floor",
    frames: [
      // Deep crouch with ball at right side — much deeper than before
      {
        headTilt: 8,
        lShoulder: 22, lElbow: -100, lWrist: 8,
        rShoulder: -8, rElbow: -20, rWrist: 30,
        lHip: 14, lKnee: -38, rHip: -20, rKnee: 42,
        bodyShiftY: 22,
        ball: "right-hand",
        lHandPose: "open-palm", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 360, hold: 100
      },
      // Ball passes between the splayed legs (slash + smaller ball)
      {
        headTilt: 10,
        lShoulder: 22, lElbow: -100,
        rShoulder: -22, rElbow: 100,
        lHip: 18, lKnee: -50, rHip: -28, rKnee: 52,
        bodyShiftY: 24,
        ball: "two-hands",
        ballScale: 0.85,
        effects: ["slash"],
        enterMs: 200, hold: 20
      },
      // Ball catches on left side, still low
      {
        headTilt: 8,
        lShoulder: 8, lElbow: 20, lWrist: -30,
        rShoulder: -22, rElbow: 100,
        ball: "left-hand",
        ballScale: 0.95,
        lHandPose: "gripping-ball", rHandPose: "open-palm",
        enterMs: 320, hold: 100
      },
      // Recover slightly
      {
        bodyShiftY: 18,
        enterMs: 320, hold: 200
      }
    ]
  },
  {
    name: "behind-back",
    label: "Behind-the-back",
    category: "dribbling",
    view: "side-l",
    sceneBg: "court-floor",
    frames: [
      // Right hand starts with ball forward
      {
        headTilt: 4,
        lShoulder: -10, lElbow: -8,
        rShoulder: 18, rElbow: -40, rWrist: 18,
        lHip: -6, lKnee: 8, rHip: 8, rKnee: -10,
        bodyShiftY: 6,
        ball: "right-hand",
        rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 360, hold: 60
      },
      // Sweep behind (slash, transient two-hands suggests pass crossing)
      {
        rShoulder: 80, rElbow: -130, rWrist: -10,
        ball: "two-hands",
        ballScale: 0.85,
        effects: ["slash"],
        enterMs: 200, hold: 0
      },
      // Land in left hand on the other side
      {
        lShoulder: -28, lElbow: -110, lWrist: -20,
        rShoulder: 28, rElbow: 110, rWrist: 20,
        ball: "left-hand",
        lHandPose: "gripping-ball", rHandPose: "relaxed",
        enterMs: 380, hold: 280
      }
    ]
  },

  // ── Passing ─────────────────────────────────────────────────
  {
    name: "chest-pass",
    label: "Chest pass",
    category: "passing",
    view: "front",
    sceneBg: "court-floor",
    frames: [
      // Load: ball at chest
      {
        lShoulder: 26, lElbow: -100, lWrist: -10,
        rShoulder: -26, rElbow: 100, rWrist: 10,
        ball: "two-hands",
        lHandPose: "gripping-ball", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 360, hold: 120
      },
      // Extend: arms push forward, ball gone
      {
        lShoulder: 60, lElbow: -40,
        rShoulder: -60, rElbow: 40,
        ball: "none",
        ballScale: 1.2,
        lHandPose: "open-palm", rHandPose: "open-palm",
        effects: ["motion-lines-r"],
        enterMs: 200, hold: 0
      },
      // Recoil
      {
        lShoulder: 28, lElbow: -90,
        rShoulder: -28, rElbow: 90,
        enterMs: 320, hold: 360
      }
    ]
  },
  {
    name: "bounce-pass",
    label: "Bounce pass",
    category: "passing",
    view: "side-r",
    sceneBg: "court-floor",
    frames: [
      // Load low
      {
        headTilt: 6,
        lShoulder: 38, lElbow: -75,
        rShoulder: -38, rElbow: 75,
        lKnee: -10, rKnee: 10,
        bodyShiftY: 4,
        ball: "two-hands",
        lHandPose: "gripping-ball", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 360, hold: 100
      },
      // Drive ball down and forward (gone)
      {
        lShoulder: 65, lElbow: -22,
        rShoulder: -65, rElbow: 22,
        ball: "none",
        lHandPose: "open-palm", rHandPose: "open-palm",
        effects: ["dust-puff", "motion-lines-r"],
        enterMs: 220, hold: 0
      },
      // Recoil
      {
        lShoulder: 38, lElbow: -75,
        rShoulder: -38, rElbow: 75,
        enterMs: 320, hold: 320
      }
    ]
  },
  {
    name: "overhead-pass",
    label: "Overhead pass",
    category: "passing",
    view: "front",
    frames: [
      // Load behind head
      {
        headTilt: -2,
        lShoulder: 140, lElbow: 40,
        rShoulder: -140, rElbow: -40,
        ball: "overhead",
        lHandPose: "gripping-ball", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 360, hold: 120
      },
      // Whip forward, ball released
      {
        headTilt: -4,
        lShoulder: 155, lElbow: 22,
        rShoulder: -155, rElbow: -22,
        ball: "none",
        ballScale: 1.3,
        lHandPose: "open-palm", rHandPose: "open-palm",
        effects: ["motion-lines-up"],
        enterMs: 200, hold: 0
      },
      // Recoil
      {
        lShoulder: 132, lElbow: 50,
        rShoulder: -132, rElbow: -50,
        enterMs: 360, hold: 360
      }
    ]
  },

  // ── Defense ─────────────────────────────────────────────────
  {
    name: "defend-stance",
    label: "Defending",
    category: "defense",
    view: "front",
    sceneBg: "court-floor",
    anim: { body: "pa-bounce" },
    frames: [
      // Wide stance, arms out, weight shifting left
      {
        lShoulder: 100, lElbow: -22,
        rShoulder: -100, rElbow: 22,
        lHip: 26, lKnee: -36, lAnkle: 10,
        rHip: -26, rKnee: 36, rAnkle: -10,
        bodyShiftY: 14,
        bodyShiftX: -2,
        lHandPose: "open-palm", rHandPose: "open-palm",
        expression: "focus",
        effects: ["sweat-drops"],
        enterMs: 380, hold: 220
      },
      // Shift right
      {
        bodyShiftX: 2,
        enterMs: 380, hold: 220
      }
    ]
  },
  {
    name: "block",
    label: "Block",
    category: "defense",
    view: "side-r",
    hasHoop: true,
    sceneBg: "paint-zone",
    frames: [
      // Windup: load knees
      {
        headTilt: -2,
        lShoulder: 25, lElbow: -55,
        rShoulder: -25, rElbow: 55,
        lHip: 6, lKnee: -22, rHip: -6, rKnee: 22,
        bodyShiftY: 10,
        lHandPose: "open-palm", rHandPose: "open-palm",
        expression: "focus",
        enterMs: 320, hold: 80
      },
      // Spike: leap up, right hand swatting at the rim
      {
        headTilt: -6,
        lShoulder: 70, lElbow: -100, lWrist: -10,
        rShoulder: -178, rElbow: -8,
        lHip: 0, lKnee: -4, rHip: 0, rKnee: 4,
        rAnkle: 18,
        bodyShiftY: -22,
        effects: ["impact-rings", "shake-cam", "motion-lines-up"],
        enterMs: 200, hold: 60
      },
      // Land
      {
        headTilt: 4,
        lShoulder: 18, lElbow: -22,
        rShoulder: -18, rElbow: 22,
        lKnee: -18, rKnee: 18,
        bodyShiftY: 8,
        effects: ["dust-puff"],
        enterMs: 360, hold: 600
      }
    ]
  },
  {
    name: "steal-reach",
    label: "Reach for steal",
    category: "defense",
    view: "side-r",
    sceneBg: "court-floor",
    frames: [
      // Cock right arm back
      {
        headTilt: -10,
        lShoulder: 8, lElbow: -8,
        rShoulder: -60, rElbow: -10,
        lHip: 6, lKnee: -10, rHip: -10, rKnee: 18,
        bodyShiftY: 6,
        lHandPose: "open-palm",
        rHandPose: "open-palm",
        expression: "focus",
        enterMs: 280, hold: 80
      },
      // Swipe forward (the steal)
      {
        rShoulder: -110, rElbow: -25, rWrist: -12,
        bodyShiftX: 2,
        rHandPose: "open-palm",
        effects: ["slash", "motion-lines-r"],
        enterMs: 200, hold: 0
      },
      // Recoil
      {
        rShoulder: -80, rElbow: -22,
        bodyShiftX: 0,
        enterMs: 320, hold: 340
      }
    ]
  },
  {
    name: "box-out",
    label: "Box out",
    category: "defense",
    view: "side-r",
    sceneBg: "paint-zone",
    frames: [
      // Wide low stance, arms back
      {
        headTilt: 6,
        lShoulder: -18, lElbow: -50,
        rShoulder: 18, rElbow: 50,
        lHip: 18, lKnee: -22, rHip: -18, rKnee: 22,
        bodyShiftY: 12,
        lHandPose: "open-palm", rHandPose: "open-palm",
        expression: "focus",
        effects: ["sweat-drops"],
        enterMs: 420, hold: 240
      },
      // Lower
      {
        bodyShiftY: 16,
        lKnee: -28, rKnee: 28,
        enterMs: 420, hold: 240
      }
    ]
  },

  // ── Finishing ───────────────────────────────────────────────
  {
    name: "layup",
    label: "Layup",
    category: "finishing",
    view: "side-r",
    hasHoop: true,
    sceneBg: "paint-zone",
    frames: [
      // Takeoff: load
      {
        headTilt: -4,
        lShoulder: 30, lElbow: -60,
        rShoulder: -30, rElbow: -50,
        lHip: 6, lKnee: -22, rHip: -22, rKnee: 32,
        bodyShiftY: 8,
        ball: "right-hand",
        rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 320, hold: 100
      },
      // Mid-rise (knee high)
      {
        headTilt: -8,
        lShoulder: 14, lElbow: -42,
        rShoulder: -150, rElbow: -10, rWrist: -8,
        lHip: 6, lKnee: -8, rHip: -32, rKnee: 55,
        bodyShiftY: -14,
        effects: ["motion-lines-up"],
        enterMs: 260, hold: 80
      },
      // Apex release
      {
        rShoulder: -172, rElbow: -8, rWrist: -12,
        bodyShiftY: -22,
        ball: "none",
        rHandPose: "open-palm",
        effects: ["trail-arm", "swish"],
        enterMs: 240, hold: 100
      },
      // Land
      {
        lShoulder: 14, lElbow: -28,
        rShoulder: -14, rElbow: 28,
        lKnee: -16, rKnee: 16,
        bodyShiftY: 8,
        effects: ["dust-puff"],
        enterMs: 380, hold: 600
      }
    ]
  },
  {
    name: "reverse-layup",
    label: "Reverse layup",
    category: "finishing",
    view: "side-l",
    hasHoop: true,
    sceneBg: "paint-zone",
    frames: [
      // Mirror of layup: takeoff
      {
        headTilt: 4,
        lShoulder: 30, lElbow: 50,
        rShoulder: -30, rElbow: 60,
        lHip: 22, lKnee: -32, rHip: -6, rKnee: 22,
        bodyShiftY: 8,
        ball: "left-hand",
        lHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 320, hold: 100
      },
      // Mid-rise
      {
        headTilt: 8,
        lShoulder: 150, lElbow: 10, lWrist: 8,
        rShoulder: -14, rElbow: 42,
        lHip: 32, lKnee: 55, rHip: -6,
        bodyShiftY: -14,
        effects: ["motion-lines-up"],
        enterMs: 260, hold: 80
      },
      // Apex release reverse
      {
        lShoulder: 172, lElbow: 8, lWrist: 12,
        bodyShiftY: -22,
        ball: "none",
        lHandPose: "open-palm",
        effects: ["trail-arm", "swish"],
        enterMs: 240, hold: 100
      },
      // Land
      {
        lShoulder: 14, lElbow: 28,
        rShoulder: -14, rElbow: -28,
        lKnee: 16, rKnee: -16,
        bodyShiftY: 8,
        effects: ["dust-puff"],
        enterMs: 380, hold: 600
      }
    ]
  },
  {
    name: "dunk",
    label: "Dunk",
    category: "finishing",
    view: "side-r",
    hasHoop: true,
    sceneBg: "paint-zone",
    decoration: "stars",
    loop: false,
    frames: [
      // 0: Crouch / gather (load knees, two-hand ball)
      {
        headTilt: -2,
        lShoulder: 30, lElbow: -60,
        rShoulder: -30, rElbow: 60,
        lHip: 18, lKnee: -36, rHip: -18, rKnee: 36,
        bodyShiftY: 14,
        ball: "two-hands",
        lHandPose: "gripping-ball", rHandPose: "gripping-ball",
        expression: "focus",
        enterMs: 280, hold: 100
      },
      // 1: Mid leap (knees straightening, arms sweeping up)
      {
        lShoulder: 90, lElbow: 40,
        rShoulder: -90, rElbow: -40,
        lHip: 0, lKnee: -8, rHip: 0, rKnee: 8,
        bodyShiftY: 4,
        ball: "two-hands",
        effects: ["motion-lines-up", "dust-puff"],
        enterMs: 220, hold: 60
      },
      // 2: Apex (arms overhead, ball held)
      {
        headTilt: -4,
        lShoulder: 172, lElbow: 8,
        rShoulder: -172, rElbow: -8,
        lKnee: -8, rKnee: 8, lAnkle: -10, rAnkle: 10,
        bodyShiftY: -22,
        ball: "overhead",
        expression: "open-mouth",
        effects: ["trail-arm"],
        enterMs: 280, hold: 60
      },
      // 3: HAMMER — snap arms down, ball gone (in the rim)
      {
        lShoulder: 150, lElbow: 40,
        rShoulder: -150, rElbow: -40,
        bodyShiftY: -10,
        ball: "none",
        lHandPose: "fist", rHandPose: "fist",
        effects: ["impact-rings", "shake-cam"],
        enterMs: 90, hold: 200    // snap!
      },
      // 4: Land + brag (hang on shimmy)
      {
        headTilt: 4,
        lShoulder: 18, lElbow: -8,
        rShoulder: -18, rElbow: 8,
        lKnee: -14, rKnee: 14,
        bodyShiftY: 8,
        anim: { body: "pa-shimmy" },
        expression: "smile",
        effects: ["dust-puff", "confetti"],
        enterMs: 320, hold: 1500
      }
    ]
  }
];

function pickRandomAction(exclude?: string): ActionSequence {
  // Prefer ACTIONS once populated; fall back to POSES wrapped as 1-frame actions.
  const wrapped = POSES
    .filter((p) => !ACTIONS.some((a) => a.name === p.name))
    .map(actionFromPose);
  const all = ACTIONS.concat(wrapped);
  const pool = exclude ? all.filter((a) => a.name !== exclude) : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

function findAction(name: string): ActionSequence | undefined {
  return (
    ACTIONS.find((a) => a.name === name) ??
    (POSES.find((p) => p.name === name)
      ? actionFromPose(POSES.find((p) => p.name === name)!)
      : undefined)
  );
}

// Resolves an (action, frameIdx) pair into the runtime visual state used by
// the renderer. Includes the merged Skeleton plus action/frame-level flags.
type RuntimePose = {
  name: string;
  label: string;
  // Skeleton
  headTilt: number;
  lShoulder: number; lElbow: number; lWrist: number;
  rShoulder: number; rElbow: number; rWrist: number;
  lHip: number; lKnee: number; lAnkle: number;
  rHip: number; rKnee: number; rAnkle: number;
  ball: BallSlot;
  bodyShiftY: number;
  bodyShiftX: number;
  lHandPose: HandPose;
  rHandPose: HandPose;
  expression: Expression;
  // Action / frame flags
  hasHoop?: boolean;
  hasDefender?: boolean;
  decoration?: Decoration;
  anim?: JointAnims;
  view: View;
  ballScale: number;
  enterMs: number;
  effects: EffectKey[];           // current frame's one-shot effects (filtered by !EFFECT_LOOPING)
  loopingEffects: EffectKey[];    // union across the whole action
  shakeCam: boolean;              // true if current frame triggers a one-shot camera shake
  sceneBg?: SceneBgKey;
  zOrder?: ZOrderConfig;
};

function resolveRuntimePose(action: ActionSequence, idx: number): RuntimePose {
  const safeIdx = Math.max(0, Math.min(idx, action.frames.length - 1));
  const skel = resolveSkeleton(action, safeIdx);
  const frame = action.frames[safeIdx];
  // Decoration: frame overrides action; null explicitly clears.
  const decoration =
    frame.decoration !== undefined
      ? frame.decoration === null
        ? undefined
        : frame.decoration
      : action.decoration;
  // Anim: frame replaces action (not merged).
  const anim = frame.anim ?? action.anim;
  const view = frame.view ?? action.view ?? "front";
  const slotScale = BALL_SLOT_SCALE[skel.ball] ?? 1;
  const ballScale = slotScale * (frame.ballScale ?? action.ballScale ?? 1);

  // Effects: split looping (union over all frames) vs one-shot (current frame).
  const loopingEffects: EffectKey[] = [];
  const seen = new Set<EffectKey>();
  for (const f of action.frames) {
    for (const e of f.effects ?? []) {
      if (EFFECT_LOOPING.has(e) && !seen.has(e)) {
        seen.add(e);
        loopingEffects.push(e);
      }
    }
  }
  const frameEffects = (frame.effects ?? []).filter((e) => !EFFECT_LOOPING.has(e) && e !== "shake-cam");
  const shakeCam = (frame.effects ?? []).includes("shake-cam");

  return {
    name: action.name,
    label: action.label,
    headTilt: skel.headTilt,
    lShoulder: skel.lShoulder, lElbow: skel.lElbow, lWrist: skel.lWrist,
    rShoulder: skel.rShoulder, rElbow: skel.rElbow, rWrist: skel.rWrist,
    lHip: skel.lHip, lKnee: skel.lKnee, lAnkle: skel.lAnkle,
    rHip: skel.rHip, rKnee: skel.rKnee, rAnkle: skel.rAnkle,
    ball: skel.ball,
    bodyShiftY: skel.bodyShiftY,
    bodyShiftX: skel.bodyShiftX,
    lHandPose: skel.lHandPose,
    rHandPose: skel.rHandPose,
    expression: skel.expression,
    hasHoop: action.hasHoop,
    hasDefender: action.hasDefender,
    decoration,
    anim,
    view,
    ballScale,
    enterMs: frame.enterMs ?? 640,
    effects: frameEffects,
    loopingEffects,
    shakeCam,
    sceneBg: action.sceneBg,
    zOrder: frame.zOrder ?? action.zOrder
  };
}

// String produced for the `transition` CSS property based on the current
// frame's enterMs. enterMs === 0 yields a 0ms (snap) transition.
function poseTransitionFor(enterMs: number): string {
  return `transform ${enterMs}ms cubic-bezier(0.22,1,0.36,1)`;
}

// ───────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────

// Hand rendered at the wrist's local origin. The hand extends "down" in
// the wrist's local frame (which the wrist rotation places correctly).
// Wrist socket = (0, 0); palm center ≈ (0, 5); fingers extend toward (0, 11+).
function Hand({
  pose,
  side,
  dimmed
}: {
  pose: HandPose;
  side: "l" | "r";
  dimmed?: boolean;
}) {
  const fill = dimmed ? "rgb(var(--muted)/0.5)" : "rgb(var(--text)/0.85)";
  const stroke = dimmed ? "rgb(var(--muted)/0.7)" : "rgb(var(--text))";
  // sign: +1 if right hand (thumb on viewer-left), -1 if left hand (mirror).
  const s = side === "r" ? 1 : -1;

  const finger = (cx: number, cy: number, len = 3, w = 1.4) => (
    <rect
      x={cx - w / 2}
      y={cy}
      width={w}
      height={len}
      rx={w / 2}
      fill={fill}
      stroke={stroke}
      strokeWidth={0.6}
    />
  );

  switch (pose) {
    case "fist":
      return (
        <g>
          {/* Compact, slightly larger than relaxed ball */}
          <ellipse cx={0} cy={5} rx={3.8} ry={4.2} fill={fill} stroke={stroke} strokeWidth={0.9} />
          {/* Knuckle ridges */}
          <line x1={-2.4} y1={3.5} x2={2.4} y2={3.5} stroke={stroke} strokeWidth={0.5} opacity={0.6} />
          <line x1={-2.4} y1={5.5} x2={2.4} y2={5.5} stroke={stroke} strokeWidth={0.5} opacity={0.6} />
          {/* Thumb bump on the thumb-side */}
          <circle cx={s * 3} cy={4.5} r={1.2} fill={fill} stroke={stroke} strokeWidth={0.6} />
        </g>
      );
    case "open-palm":
      return (
        <g>
          {/* Palm */}
          <rect x={-3} y={2.5} width={6} height={5.5} rx={2.5} fill={fill} stroke={stroke} strokeWidth={0.8} />
          {/* 4 fingers fanned downward */}
          {finger(-2.2, 7.5, 3.8)}
          {finger(-0.7, 8, 4.2)}
          {finger(0.7, 8, 4.2)}
          {finger(2.2, 7.5, 3.8)}
          {/* Thumb out the side */}
          <rect
            x={s * 2.5 - 0.7}
            y={3.5}
            width={1.4}
            height={3.4}
            rx={0.7}
            transform={`rotate(${s * 40} ${s * 2.5} 5)`}
            fill={fill}
            stroke={stroke}
            strokeWidth={0.6}
          />
        </g>
      );
    case "gripping-ball":
      return (
        <g>
          {/* Curved hand cupping a ball */}
          <path
            d={`M -3.5 3 Q -4 7 -2 9 L 2 9 Q 4 7 3.5 3 Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={0.8}
          />
          {/* Finger separators */}
          <line x1={-1.5} y1={4} x2={-1.5} y2={8.5} stroke={stroke} strokeWidth={0.4} opacity={0.5} />
          <line x1={0} y1={4} x2={0} y2={8.5} stroke={stroke} strokeWidth={0.4} opacity={0.5} />
          <line x1={1.5} y1={4} x2={1.5} y2={8.5} stroke={stroke} strokeWidth={0.4} opacity={0.5} />
        </g>
      );
    case "point-index": {
      // The index points downward; others curl into palm.
      // For the "right" hand, the index sits slightly toward viewer-left of center.
      return (
        <g>
          {/* Small palm */}
          <ellipse cx={0} cy={4.5} rx={2.8} ry={3} fill={fill} stroke={stroke} strokeWidth={0.7} />
          {/* Index finger (long) */}
          {finger(0, 6.5, 6.5, 1.5)}
          {/* Other 3 curled — visible as small bumps */}
          <circle cx={-2} cy={6.5} r={1} fill={fill} stroke={stroke} strokeWidth={0.4} />
          <circle cx={2} cy={6.5} r={1} fill={fill} stroke={stroke} strokeWidth={0.4} />
          {/* Thumb tucked */}
          <circle cx={s * 2.5} cy={4} r={1} fill={fill} stroke={stroke} strokeWidth={0.4} />
        </g>
      );
    }
    case "three-fingers":
      return (
        <g>
          {/* Palm */}
          <ellipse cx={0} cy={4.5} rx={3} ry={3} fill={fill} stroke={stroke} strokeWidth={0.7} />
          {/* 3 fingers fanned down */}
          {finger(-1.6, 6.5, 5, 1.3)}
          {finger(0, 7, 5.5, 1.3)}
          {finger(1.6, 6.5, 5, 1.3)}
          {/* 2 curled (pinky + thumb) as bumps */}
          <circle cx={s * 2.8} cy={5} r={0.9} fill={fill} stroke={stroke} strokeWidth={0.4} />
          <circle cx={-s * 2.6} cy={6.2} r={0.8} fill={fill} stroke={stroke} strokeWidth={0.4} />
        </g>
      );
    case "thumbs-up":
      return (
        <g>
          {/* Closed fist */}
          <ellipse cx={0} cy={5} rx={3.5} ry={4} fill={fill} stroke={stroke} strokeWidth={0.9} />
          {/* Thumb pointing UP (away from wrist) */}
          <rect
            x={-1}
            y={-3.5}
            width={2}
            height={4}
            rx={1}
            fill={fill}
            stroke={stroke}
            strokeWidth={0.7}
          />
          {/* Finger ridges */}
          <line x1={-2.4} y1={4} x2={2.4} y2={4} stroke={stroke} strokeWidth={0.5} opacity={0.55} />
          <line x1={-2.4} y1={6} x2={2.4} y2={6} stroke={stroke} strokeWidth={0.5} opacity={0.55} />
        </g>
      );
    case "peace":
      return (
        <g>
          {/* Palm */}
          <ellipse cx={0} cy={4.5} rx={2.8} ry={3} fill={fill} stroke={stroke} strokeWidth={0.7} />
          {/* Index + middle splayed in V */}
          <rect x={-1.4 - 0.7} y={6} width={1.4} height={5.5} rx={0.7} transform={`rotate(-10 -1.4 6)`} fill={fill} stroke={stroke} strokeWidth={0.6} />
          <rect x={1.4 - 0.7} y={6} width={1.4} height={5.5} rx={0.7} transform={`rotate(10 1.4 6)`} fill={fill} stroke={stroke} strokeWidth={0.6} />
          {/* Curled fingers */}
          <circle cx={s * 2.7} cy={5} r={0.9} fill={fill} stroke={stroke} strokeWidth={0.4} />
          <circle cx={-s * 2.5} cy={6.5} r={0.8} fill={fill} stroke={stroke} strokeWidth={0.4} />
        </g>
      );
    case "relaxed":
    default:
      return (
        <g>
          {/* Soft hand: palm ellipse + 3 finger bumps */}
          <ellipse cx={0} cy={5} rx={3} ry={3.3} fill={fill} stroke={stroke} strokeWidth={0.8} />
          <circle cx={-1.5} cy={7.8} r={1} fill={fill} stroke={stroke} strokeWidth={0.4} />
          <circle cx={0} cy={8.1} r={1.1} fill={fill} stroke={stroke} strokeWidth={0.4} />
          <circle cx={1.5} cy={7.8} r={1} fill={fill} stroke={stroke} strokeWidth={0.4} />
        </g>
      );
  }
}

const BALL_BASE_R = 7;

// Default visual scale per ball slot. Per-frame ballScale further multiplies.
const BALL_SLOT_SCALE: Record<BallSlot, number> = {
  none: 1,
  "left-hand": 1.0,
  "right-hand": 1.0,
  "two-hands": 1.15,
  overhead: 1.3,
  "floor-r": 0.9,
  "floor-l": 0.9
};

function Ball({ scale = 1, dimmed = false }: { scale?: number; dimmed?: boolean }) {
  const r = BALL_BASE_R * scale;
  const fill = dimmed ? "#a3a3a3" : "#f97316";
  const stroke = dimmed ? "#525252" : "#7c2d12";
  const highlight = dimmed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.45)";
  return (
    <g>
      <circle r={r} fill={fill} stroke={stroke} strokeWidth={0.9} />
      <path d={`M ${-r} 0 Q 0 ${-r * 0.5} ${r} 0`} fill="none" stroke={stroke} strokeWidth={0.9} />
      <path d={`M 0 ${-r} Q ${r * 0.5} 0 0 ${r}`} fill="none" stroke={stroke} strokeWidth={0.9} />
      <line x1={-r} y1={0} x2={r} y2={0} stroke={stroke} strokeWidth={0.6} opacity={0.7} />
      {/* Extra curve for depth */}
      <path d={`M 0 ${-r} Q ${-r * 0.5} 0 0 ${r}`} fill="none" stroke={stroke} strokeWidth={0.6} opacity={0.6} />
      {/* Highlight (upper-left) */}
      <ellipse cx={-r * 0.4} cy={-r * 0.45} rx={r * 0.28} ry={r * 0.22} fill={highlight} />
    </g>
  );
}

function Hoop({ dimmed }: { dimmed?: boolean }) {
  const pole = dimmed ? "rgb(var(--muted)/0.6)" : "rgb(var(--text)/0.6)";
  const rim = dimmed ? "#a3a3a3" : "#f97316";
  const net = dimmed ? "rgb(var(--muted)/0.5)" : "rgb(var(--text)/0.45)";
  const board = dimmed ? "rgb(var(--muted)/0.35)" : "rgb(var(--bg-elev))";
  const boardStroke = dimmed ? "rgb(var(--muted)/0.6)" : "rgb(var(--text)/0.7)";

  return (
    <g transform={`translate(${HOOP_BACKBOARD_X} ${HOOP_BACKBOARD_Y})`}>
      {/* Pole */}
      <rect x={20} y={0} width={2} height={60} fill={pole} />
      {/* Backboard */}
      <rect x={0} y={0} width={22} height={16} rx={1} fill={board} stroke={boardStroke} strokeWidth={1.1} />
      <rect x={6} y={6} width={10} height={6} fill="none" stroke={boardStroke} strokeWidth={0.8} />
      {/* Rim (front view, ellipse) */}
      <ellipse cx={-2} cy={18} rx={10} ry={2.5} fill="none" stroke={rim} strokeWidth={2} />
      {/* Net (3 strands) */}
      <path
        d={`M ${-10} ${19} L ${-7} ${30} M ${-2} ${20.5} L ${-2} ${31} M ${7} ${19} L ${4} ${30} M ${-7} ${30} L ${4} ${30}`}
        fill="none"
        stroke={net}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
    </g>
  );
}

function SceneBg({ kind, dimmed }: { kind?: SceneBgKey; dimmed?: boolean }) {
  if (!kind) return null;
  const line = dimmed ? "rgb(var(--muted)/0.4)" : "rgb(var(--text)/0.22)";
  const lineMuted = dimmed ? "rgb(var(--muted)/0.25)" : "rgb(var(--text)/0.12)";

  switch (kind) {
    case "three-pt-arc":
      // Arc near the figure's feet to evoke the 3-pt line.
      return (
        <path
          d={`M ${CX - 70} ${GROUND_Y - 6} Q ${CX} ${GROUND_Y - 40} ${CX + 70} ${GROUND_Y - 6}`}
          fill="none"
          stroke={line}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      );
    case "free-throw-line":
      return (
        <g>
          <line
            x1={CX - 50}
            y1={GROUND_Y - 2}
            x2={CX + 50}
            y2={GROUND_Y - 2}
            stroke={line}
            strokeWidth={1.4}
            strokeDasharray="3 3"
          />
          <line
            x1={CX - 50}
            y1={GROUND_Y - 2}
            x2={CX - 50}
            y2={GROUND_Y - 24}
            stroke={lineMuted}
            strokeWidth={1}
          />
          <line
            x1={CX + 50}
            y1={GROUND_Y - 2}
            x2={CX + 50}
            y2={GROUND_Y - 24}
            stroke={lineMuted}
            strokeWidth={1}
          />
        </g>
      );
    case "paint-zone":
      return (
        <path
          d={`M ${CX - 48} ${GROUND_Y - 2} L ${CX - 32} ${GROUND_Y - 60} L ${CX + 32} ${GROUND_Y - 60} L ${CX + 48} ${GROUND_Y - 2} Z`}
          fill={lineMuted}
          stroke={line}
          strokeWidth={0.8}
          opacity={0.7}
        />
      );
    case "court-floor":
      return (
        <g>
          <line x1={20} y1={GROUND_Y} x2={SVG_W - 20} y2={GROUND_Y} stroke={line} strokeWidth={1} />
          <line x1={40} y1={GROUND_Y + 4} x2={50} y2={GROUND_Y + 4} stroke={lineMuted} strokeWidth={0.7} />
          <line x1={150} y1={GROUND_Y + 4} x2={160} y2={GROUND_Y + 4} stroke={lineMuted} strokeWidth={0.7} />
        </g>
      );
    case "scoreboard":
      return (
        <g transform="translate(12 12)">
          <rect width={38} height={20} rx={3} fill={lineMuted} stroke={line} strokeWidth={0.8} />
          <text x={19} y={14} fontSize="8" textAnchor="middle" fill={line} fontWeight={700}>
            00 : 02
          </text>
        </g>
      );
    case "spotlight":
      return (
        <circle cx={CX} cy={HEAD_CY + 30} r={80} fill="url(#pa-spotlight)" opacity={0.55} />
      );
    case "bench":
      return (
        <g transform={`translate(0 ${GROUND_Y - 14})`}>
          <line x1={20} y1={0} x2={SVG_W - 20} y2={0} stroke={line} strokeWidth={0.9} />
          {[30, 60, 90, 120, 150, 180].map((x, i) => (
            <line key={i} x1={x} y1={0} x2={x} y2={6} stroke={lineMuted} strokeWidth={0.7} />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function Effect({
  kind,
  dimmed,
  refreshKey
}: {
  kind: EffectKey;
  dimmed?: boolean;
  refreshKey: string;
}) {
  const accent = dimmed ? "rgb(var(--muted)/0.7)" : "rgb(var(--text)/0.8)";
  const gold = dimmed ? "#a3a3a3" : "#fbbf24";
  const orange = dimmed ? "#a3a3a3" : "#f97316";
  const ringStroke = dimmed ? "rgb(var(--muted)/0.7)" : "rgb(var(--text)/0.7)";

  // Per-effect rendering. One-shot effects use refreshKey via React `key`
  // on the wrapper to force remount and restart their CSS animation.
  switch (kind) {
    case "motion-lines-r":
      return (
        <g key={refreshKey} opacity={0.78}>
          <line x1={CX + 30} y1={TORSO_TOP + 12} x2={CX + 46} y2={TORSO_TOP + 12} stroke={accent} strokeWidth={1.4} strokeLinecap="round" />
          <line x1={CX + 28} y1={TORSO_TOP + 26} x2={CX + 50} y2={TORSO_TOP + 26} stroke={accent} strokeWidth={1.4} strokeLinecap="round" />
          <line x1={CX + 30} y1={TORSO_TOP + 40} x2={CX + 46} y2={TORSO_TOP + 40} stroke={accent} strokeWidth={1.2} strokeLinecap="round" />
        </g>
      );
    case "motion-lines-l":
      return (
        <g key={refreshKey} opacity={0.78}>
          <line x1={CX - 30} y1={TORSO_TOP + 12} x2={CX - 46} y2={TORSO_TOP + 12} stroke={accent} strokeWidth={1.4} strokeLinecap="round" />
          <line x1={CX - 28} y1={TORSO_TOP + 26} x2={CX - 50} y2={TORSO_TOP + 26} stroke={accent} strokeWidth={1.4} strokeLinecap="round" />
          <line x1={CX - 30} y1={TORSO_TOP + 40} x2={CX - 46} y2={TORSO_TOP + 40} stroke={accent} strokeWidth={1.2} strokeLinecap="round" />
        </g>
      );
    case "motion-lines-up":
      return (
        <g key={refreshKey} opacity={0.78}>
          <line x1={CX - 12} y1={GROUND_Y + 4} x2={CX - 12} y2={GROUND_Y + 18} stroke={accent} strokeWidth={1.3} strokeLinecap="round" />
          <line x1={CX} y1={GROUND_Y + 8} x2={CX} y2={GROUND_Y + 22} stroke={accent} strokeWidth={1.3} strokeLinecap="round" />
          <line x1={CX + 12} y1={GROUND_Y + 4} x2={CX + 12} y2={GROUND_Y + 18} stroke={accent} strokeWidth={1.3} strokeLinecap="round" />
        </g>
      );
    case "sweat-drops":
      return (
        <g key={refreshKey} style={{ animation: "pa-sweat 1.2s ease-in-out infinite" }}>
          <ellipse cx={CX - HEAD_R - 1} cy={HEAD_CY - 4} rx={1.4} ry={2.2} fill="#60a5fa" stroke="#1d4ed8" strokeWidth={0.4} />
          <ellipse cx={CX - HEAD_R - 3} cy={HEAD_CY + 4} rx={1.2} ry={1.8} fill="#60a5fa" stroke="#1d4ed8" strokeWidth={0.4} opacity={0.85} />
        </g>
      );
    case "dust-puff":
      return (
        <g key={refreshKey} style={{ animation: "pa-dust 480ms ease-out forwards" }}>
          <ellipse cx={CX - 14} cy={GROUND_Y + 1} rx={7} ry={2.2} fill={accent} opacity={0.55} />
          <ellipse cx={CX + 14} cy={GROUND_Y + 1} rx={7} ry={2.2} fill={accent} opacity={0.55} />
          <ellipse cx={CX} cy={GROUND_Y + 3} rx={6} ry={1.6} fill={accent} opacity={0.4} />
        </g>
      );
    case "impact-rings":
      return (
        <g
          key={refreshKey}
          transform={`translate(${HOOP_BACKBOARD_X - 2} ${HOOP_BACKBOARD_Y + 18})`}
          style={{ animation: "pa-impact 600ms ease-out forwards" }}
        >
          <circle r={4} fill="none" stroke={ringStroke} strokeWidth={1.4} />
          <circle r={7} fill="none" stroke={ringStroke} strokeWidth={1} opacity={0.7} />
        </g>
      );
    case "slash":
      return (
        <g key={refreshKey} style={{ animation: "pa-flash 360ms ease-out forwards" }}>
          <path
            d={`M ${CX - 22} ${TORSO_TOP + TORSO_H * 0.6} Q ${CX} ${TORSO_TOP + TORSO_H * 0.4} ${CX + 22} ${TORSO_TOP + TORSO_H * 0.6}`}
            fill="none"
            stroke={accent}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </g>
      );
    case "swish":
      return (
        <g
          key={refreshKey}
          transform={`translate(${HOOP_BACKBOARD_X - 2} ${HOOP_BACKBOARD_Y + 26})`}
          style={{ animation: "pa-swish 560ms ease-out forwards" }}
        >
          <path
            d={`M -8 0 Q 0 6 8 0`}
            fill="none"
            stroke={orange}
            strokeWidth={1.4}
            strokeDasharray="20 20"
            strokeLinecap="round"
          />
        </g>
      );
    case "trail-arm":
      // Subtle ghost arm hint near the right shoulder area.
      return (
        <g key={refreshKey} opacity={0.35}>
          <line
            x1={R_SHOULDER_X}
            y1={SHOULDER_Y}
            x2={R_SHOULDER_X + 14}
            y2={SHOULDER_Y - 18}
            stroke={accent}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <line
            x1={R_SHOULDER_X}
            y1={SHOULDER_Y}
            x2={R_SHOULDER_X + 8}
            y2={SHOULDER_Y - 22}
            stroke={accent}
            strokeWidth={1.8}
            strokeLinecap="round"
            opacity={0.7}
          />
        </g>
      );
    case "flash-pop":
      return (
        <g
          key={refreshKey}
          transform={`translate(${CX} ${HEAD_CY + 30})`}
          style={{ animation: "pa-flash 360ms ease-out forwards" }}
        >
          <circle r={48} fill={gold} opacity={0.35} />
        </g>
      );
    case "confetti":
      return (
        <g key={refreshKey}>
          {[
            { x: CX - 28, c: "#f97316" },
            { x: CX - 14, c: "#fbbf24" },
            { x: CX, c: "#ef4444" },
            { x: CX + 14, c: "#10b981" },
            { x: CX + 28, c: "#3b82f6" },
            { x: CX - 7, c: "#a855f7" },
            { x: CX + 21, c: "#fbbf24" }
          ].map((d, i) => (
            <rect
              key={i}
              x={d.x}
              y={HEAD_CY - 24}
              width={2}
              height={3}
              rx={0.5}
              fill={d.c}
              style={{ animation: `pa-confetti ${1.4 + (i % 3) * 0.3}s ${i * 0.12}s ease-in infinite` }}
            />
          ))}
        </g>
      );
    case "shake-cam":
      // Handled at the wrapper level (class toggle), nothing to render here.
      return null;
    default:
      return null;
  }
}

function Effects({
  list,
  layer,
  runKey,
  frameIdx,
  dimmed
}: {
  list: EffectKey[];
  layer: "back" | "front";
  runKey: number;
  frameIdx: number;
  dimmed?: boolean;
}) {
  return (
    <>
      {list
        .filter((e) => EFFECT_LAYER[e] === layer)
        .map((e) => (
          <Effect
            key={`${e}-${EFFECT_LOOPING.has(e) ? "loop" : `${runKey}-${frameIdx}`}`}
            kind={e}
            dimmed={dimmed}
            refreshKey={`${e}-${runKey}-${frameIdx}`}
          />
        ))}
    </>
  );
}

function Defender({ dimmed }: { dimmed?: boolean }) {
  const fill = dimmed ? "rgb(var(--muted)/0.4)" : "rgb(var(--muted)/0.65)";
  const stroke = dimmed ? "rgb(var(--muted)/0.6)" : "rgb(var(--text)/0.55)";

  return (
    <g transform={`translate(${CX + 30} ${GROUND_Y - 6})`}>
      {/* Prone body (ellipse) */}
      <ellipse cx={0} cy={0} rx={28} ry={6} fill={fill} stroke={stroke} strokeWidth={0.9} />
      {/* Head */}
      <circle cx={-24} cy={-2} r={6} fill={fill} stroke={stroke} strokeWidth={0.9} />
      {/* Sprawled arms */}
      <line x1={-10} y1={2} x2={2} y2={10} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <line x1={-12} y1={-1} x2={-22} y2={-8} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      {/* Sprawled legs */}
      <line x1={14} y1={2} x2={30} y2={-2} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <line x1={16} y1={-1} x2={28} y2={4} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      {/* Dazed X eyes */}
      <text x={-26} y={0} fontSize="5" textAnchor="middle" fill={stroke}>×</text>
      <text x={-22} y={0} fontSize="5" textAnchor="middle" fill={stroke}>×</text>
    </g>
  );
}

function Decorations({ kind, dimmed }: { kind?: Decoration; dimmed?: boolean }) {
  if (!kind) return null;

  const accent = dimmed ? "rgb(var(--muted)/0.7)" : "rgb(var(--text)/0.7)";
  const gold = dimmed ? "#a3a3a3" : "#fbbf24";
  const goldStroke = dimmed ? "#525252" : "#92400e";
  const rose = dimmed ? "#a3a3a3" : "#ef4444";

  switch (kind) {
    case "zzz":
      return (
        <g style={animStyle("pa-zzz")}>
          <text x={CX + 16} y={HEAD_CY - 8} fontSize="11" fontWeight="700" fontStyle="italic" fill={accent}>z</text>
          <text x={CX + 24} y={HEAD_CY - 16} fontSize="9" fontWeight="700" fontStyle="italic" fill={accent}>z</text>
          <text x={CX + 30} y={HEAD_CY - 22} fontSize="7" fontWeight="700" fontStyle="italic" fill={accent}>z</text>
        </g>
      );
    case "salt":
      return (
        <g style={animStyle("pa-salt-fall")}>
          <circle cx={CX + 22} cy={HIP_Y + 18} r={1} fill={accent} />
          <circle cx={CX + 26} cy={HIP_Y + 24} r={1} fill={accent} />
          <circle cx={CX + 20} cy={HIP_Y + 30} r={1} fill={accent} />
          <circle cx={CX + 28} cy={HIP_Y + 36} r={0.8} fill={accent} />
          <circle cx={CX + 22} cy={HIP_Y + 42} r={0.8} fill={accent} />
        </g>
      );
    case "question":
      return (
        <text x={CX} y={HEAD_CY - 22} fontSize="14" fontWeight="800" textAnchor="middle" fill={accent}>?</text>
      );
    case "shh":
      return (
        <g>
          <text x={CX + 18} y={HEAD_CY - 10} fontSize="9" fontWeight="700" fill={accent}>·</text>
          <text x={CX + 22} y={HEAD_CY - 14} fontSize="8" fontWeight="700" fill={accent}>·</text>
          <text x={CX + 26} y={HEAD_CY - 18} fontSize="7" fontWeight="700" fill={accent}>·</text>
        </g>
      );
    case "crown":
      return (
        <g transform={`translate(${CX} ${HEAD_CY - HEAD_R - 6})`}>
          <path
            d="M -12 4 L -10 -6 L -5 0 L 0 -8 L 5 0 L 10 -6 L 12 4 Z"
            fill={gold}
            stroke={goldStroke}
            strokeWidth={0.9}
          />
          <circle cx={-10} cy={-7} r={1.2} fill={rose} />
          <circle cx={0} cy={-9} r={1.2} fill={rose} />
          <circle cx={10} cy={-7} r={1.2} fill={rose} />
        </g>
      );
    case "three-fingers":
      // Three small marks above the figure's pointing wrist (top of right-hand).
      return (
        <g transform={`translate(${CX + 32} ${HEAD_CY - 16})`}>
          <text x={0} y={0} fontSize="11" fontWeight="800" textAnchor="middle" fill={accent}>3</text>
        </g>
      );
    case "heart":
      return (
        <g transform={`translate(${CX} ${HEAD_CY - HEAD_R - 4})`}>
          <path
            d="M 0 6 L -7 -1 A 4 4 0 0 1 0 -3 A 4 4 0 0 1 7 -1 Z"
            fill={rose}
            stroke={rose}
            strokeWidth={0.6}
          />
        </g>
      );
    case "stars":
      return (
        <g>
          <text x={CX - 24} y={HEAD_CY - 4} fontSize="10" fill={gold}>✦</text>
          <text x={CX + 16} y={HEAD_CY - 12} fontSize="8" fill={gold}>✦</text>
          <text x={CX + 24} y={HEAD_CY + 4} fontSize="6" fill={gold}>✦</text>
          <text x={CX - 30} y={HEAD_CY + 10} fontSize="6" fill={gold}>✦</text>
        </g>
      );
    case "sparkle":
      return (
        <g>
          <text x={CX + 14} y={HEAD_CY - 8} fontSize="10" fill={gold}>✦</text>
          <text x={CX - 18} y={HEAD_CY + 2} fontSize="6" fill={gold}>✦</text>
        </g>
      );
    default:
      return null;
  }
}

// ───────────────────────────────────────────────────────────────
// Main component
// ───────────────────────────────────────────────────────────────
export function PersonaAvatar({ persona, dimmed = false, onClick, size = "md" }: Props) {
  const { translate } = useLocale();

  // SSR-safe: idle on server, randomize on mount. The renderer reads from
  // `activePose` (the resolved RuntimePose for the current action + frameIdx).
  const [activeAction, setActiveAction] = useState<ActionSequence>(() =>
    actionFromPose(POSES[0])
  );
  const [frameIdx, setFrameIdx] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const timeoutRef = useRef<number | null>(null);

  // Debug URL params parsed once on mount.
  const [debugFrame, setDebugFrame] = useState<number | null>(null);
  const [debugStep, setDebugStep] = useState(false);
  const [debugSpeed, setDebugSpeed] = useState(1);
  const [debugView, setDebugView] = useState<View | null>(null);

  // URL ?avatar-pose=<name> forces a specific action; else pick random on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forcedFrame = params.get("avatar-frame");
    if (forcedFrame !== null) setDebugFrame(parseInt(forcedFrame, 10));
    if (params.get("avatar-step") === "1") setDebugStep(true);
    const speed = params.get("avatar-speed");
    if (speed) {
      const f = parseFloat(speed);
      if (!isNaN(f) && f > 0) setDebugSpeed(f);
    }
    const v = params.get("avatar-view");
    if (v === "front" || v === "side-r" || v === "side-l") setDebugView(v);

    const forced = params.get("avatar-pose");
    if (forced) {
      const match = findAction(forced);
      if (match) {
        setActiveAction(match);
        setRunKey((k) => k + 1);
        return;
      }
    }
    setActiveAction(pickRandomAction());
    setRunKey((k) => k + 1);
  }, []);

  // Reset frame index whenever the active action changes or shuffle bumps runKey.
  useEffect(() => {
    if (debugFrame !== null) {
      setFrameIdx(Math.max(0, Math.min(debugFrame, activeAction.frames.length - 1)));
    } else {
      setFrameIdx(0);
    }
  }, [activeAction, runKey, debugFrame]);

  // Schedule the next frame advance. The CSS transition handles smooth
  // interpolation; we just bump frameIdx at the right time.
  useEffect(() => {
    if (debugFrame !== null) return; // freeze
    if (debugStep) return; // manual step mode
    if (activeAction.frames.length <= 1) return;
    const frame = activeAction.frames[frameIdx];
    if (!frame) return;
    const dur = frameDurationMs(frame) * debugSpeed;
    timeoutRef.current = window.setTimeout(() => {
      const next = frameIdx + 1;
      if (next < activeAction.frames.length) {
        setFrameIdx(next);
      } else if (activeAction.loop !== false) {
        setFrameIdx(0);
      }
      // else: stop on last frame, no further schedule
    }, dur);
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [activeAction, frameIdx, runKey, debugFrame, debugStep, debugSpeed]);

  const handleStepFrame = useCallback(() => {
    setFrameIdx((cur) => {
      const next = cur + 1;
      if (next < activeAction.frames.length) return next;
      return activeAction.loop !== false ? 0 : cur;
    });
  }, [activeAction]);

  const handleShuffle = useCallback(() => {
    setActiveAction((cur) => pickRandomAction(cur.name));
    setRunKey((k) => k + 1);
  }, []);

  // Derived runtime snapshot used by the renderer below.
  const activePose: RuntimePose = useMemo(() => {
    const base = resolveRuntimePose(activeAction, frameIdx);
    return debugView ? { ...base, view: debugView } : base;
  }, [activeAction, frameIdx, debugView]);

  const poseTransition = poseTransitionFor(activePose.enterMs);

  const flat = persona?.flat_foot ?? false;

  const positionsText =
    persona && persona.positions.length > 0
      ? persona.positions.map((p) => POSITION_LABEL[p]).join(" · ")
      : "—";
  const skillPipsCount = persona ? SKILL_PIPS[persona.skill_level] : 0;
  const skillLabel = persona ? translate(SKILL_LEVEL_LABEL[persona.skill_level]) : translate("Skill");

  const figureWidth = size === "sm" ? 96 : 130;
  const figureClass = onClick
    ? "rounded-2xl border border-transparent p-1.5 transition hover:border-[rgb(var(--text)/0.2)] hover:bg-[rgb(var(--text)/0.04)]"
    : "p-1.5";

  const fillColor = dimmed ? "rgb(var(--muted)/0.5)" : "rgb(var(--text)/0.85)";
  const strokeColor = dimmed ? "rgb(var(--muted)/0.7)" : "rgb(var(--text))";

  // Hand + (optional) held ball at the wrist's local origin.
  // ActionSequence frames can set lHandPose / rHandPose; legacy POSES (via
  // actionFromPose) fall back to "relaxed".
  const HandAndBall = ({ slot }: { slot: "left-hand" | "right-hand" }) => {
    const side: "l" | "r" = slot === "left-hand" ? "l" : "r";
    const handPose = side === "l" ? activePose.lHandPose : activePose.rHandPose;
    const ballScale = activePose.ballScale;
    return (
      <>
        <Hand pose={handPose} side={side} dimmed={dimmed} />
        {activePose.ball === slot && (
          <g transform={`translate(0 ${HAND_R * 2 + 6 + (ballScale - 1) * 4})`}>
            <Ball scale={ballScale} dimmed={dimmed} />
          </g>
        )}
      </>
    );
  };

  // Sneaker: a darker sole + lighter upper. Foot extends toward +x ("forward").
  const soleColor = dimmed ? "rgb(var(--muted)/0.95)" : "rgb(var(--text))";
  const upperColor = dimmed ? "rgb(var(--muted)/0.5)" : "rgb(var(--bg-elev))";
  const Foot = () => (
    <g>
      {/* Sole (dark, full length, extends forward) */}
      <rect
        x={-LEG_W / 2 - 1.5}
        y={2}
        width={LEG_W + 7}
        height={3}
        rx={1.5}
        fill={soleColor}
        stroke={strokeColor}
        strokeWidth={0.4}
      />
      {/* Upper (lighter, sits on sole) — arched figures get a slight lift at toe */}
      <rect
        x={-LEG_W / 2 - 0.5}
        y={flat ? -1 : -1.5}
        width={LEG_W + 5}
        height={3.5}
        rx={1.4}
        fill={upperColor}
        stroke={strokeColor}
        strokeWidth={0.6}
      />
      {/* Toe accent at the front */}
      <ellipse
        cx={LEG_W / 2 + 3.5}
        cy={1}
        rx={1.4}
        ry={1.1}
        fill={soleColor}
        opacity={0.55}
      />
      {/* Heel detail */}
      <line
        x1={-LEG_W / 2 - 1}
        y1={2}
        x2={-LEG_W / 2 - 1}
        y2={4.6}
        stroke={strokeColor}
        strokeWidth={0.6}
        opacity={0.6}
      />
    </g>
  );

  // Small filled circle drawn at a joint's local origin to make the bone
  // structure read. Color matches the limb so it blends in but adds a subtle
  // articulation hint.
  const JointDot = ({ r = 1.6 }: { r?: number }) => (
    <circle cx={0} cy={0} r={r} fill={fillColor} stroke={strokeColor} strokeWidth={0.5} />
  );

  // Arm chain — one helper, parameterized by side. Far-side arms in side
  // view get a reduced opacity to hint at occlusion.
  const ArmChain = ({
    side,
    opacity = 1
  }: {
    side: "l" | "r";
    opacity?: number;
  }) => {
    const anchorX = side === "l" ? L_SHOULDER_X : R_SHOULDER_X;
    const shoulder = side === "l" ? activePose.lShoulder : activePose.rShoulder;
    const elbow = side === "l" ? activePose.lElbow : activePose.rElbow;
    const wrist = side === "l" ? activePose.lWrist : activePose.rWrist;
    const animShoulder = side === "l" ? activePose.anim?.lShoulder : activePose.anim?.rShoulder;
    const animElbow = side === "l" ? activePose.anim?.lElbow : activePose.anim?.rElbow;
    const animWrist = side === "l" ? activePose.anim?.lWrist : activePose.anim?.rWrist;
    const slot: "left-hand" | "right-hand" = side === "l" ? "left-hand" : "right-hand";
    return (
      <g
        transform={`translate(${anchorX} ${SHOULDER_Y}) rotate(${shoulder})`}
        style={{ transition: "var(--pose-transition)", opacity }}
      >
        <g style={animStyle(animShoulder)}>
          <rect x={-ARM_W / 2} y={0} width={ARM_W} height={UPPER_ARM_H} rx={ARM_W / 2} fill={fillColor} stroke={strokeColor} strokeWidth={0.9} />
          <JointDot />
          <g
            transform={`translate(0 ${UPPER_ARM_H}) rotate(${elbow})`}
            style={{ transition: "var(--pose-transition)" }}
          >
            <g style={animStyle(animElbow)}>
              <rect x={-ARM_W / 2} y={0} width={ARM_W} height={FOREARM_H} rx={ARM_W / 2} fill={fillColor} stroke={strokeColor} strokeWidth={0.9} />
              <JointDot />
              <g
                transform={`translate(0 ${FOREARM_H}) rotate(${wrist})`}
                style={{ transition: "var(--pose-transition)" }}
              >
                <g style={animStyle(animWrist)}>
                  <JointDot r={1.4} />
                  <HandAndBall slot={slot} />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    );
  };

  // Leg chain — mirror structure of ArmChain.
  const LegChain = ({
    side,
    opacity = 1
  }: {
    side: "l" | "r";
    opacity?: number;
  }) => {
    const anchorX = side === "l" ? L_HIP_X : R_HIP_X;
    const hip = side === "l" ? activePose.lHip : activePose.rHip;
    const knee = side === "l" ? activePose.lKnee : activePose.rKnee;
    const ankle = side === "l" ? activePose.lAnkle : activePose.rAnkle;
    const animHip = side === "l" ? activePose.anim?.lHip : activePose.anim?.rHip;
    const animKnee = side === "l" ? activePose.anim?.lKnee : activePose.anim?.rKnee;
    const animAnkle = side === "l" ? activePose.anim?.lAnkle : activePose.anim?.rAnkle;
    return (
      <g
        transform={`translate(${anchorX} ${HIP_Y}) rotate(${hip})`}
        style={{ transition: "var(--pose-transition)", opacity }}
      >
        <g style={animStyle(animHip)}>
          <rect x={-LEG_W / 2} y={0} width={LEG_W} height={THIGH_H} rx={LEG_W / 2.4} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
          <JointDot r={1.8} />
          <g
            transform={`translate(0 ${THIGH_H}) rotate(${knee})`}
            style={{ transition: "var(--pose-transition)" }}
          >
            <g style={animStyle(animKnee)}>
              <rect x={-LEG_W / 2} y={0} width={LEG_W} height={SHIN_H} rx={LEG_W / 2.4} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
              <JointDot r={1.8} />
              <g
                transform={`translate(0 ${SHIN_H}) rotate(${ankle})`}
                style={{ transition: "var(--pose-transition)" }}
              >
                <g style={animStyle(animAnkle)}>
                  <JointDot r={1.5} />
                  <Foot />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    );
  };

  // Torso + head + neck + waist. View determines narrowness of torso and
  // adds profile features (nose, ear, single eye) when sideways.
  const TorsoAndHead = () => {
    const isFront = activePose.view === "front";
    const sideR = activePose.view === "side-r";
    const torsoW = isFront ? TORSO_W : TORSO_W * 0.55;
    const facingSign = sideR ? 1 : -1;
    return (
      <>
        {/* Neck */}
        <line
          x1={CX}
          y1={HEAD_CY + HEAD_R - 1}
          x2={CX}
          y2={TORSO_TOP + 1}
          stroke={strokeColor}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.85}
        />
        {/* Torso */}
        <rect
          x={CX - torsoW / 2}
          y={TORSO_TOP}
          width={torsoW}
          height={TORSO_H}
          rx={torsoW / 3}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1.2}
          style={{ transition: "all 360ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        {/* Waist divider */}
        <line
          x1={CX - torsoW / 2 + 2}
          y1={WAIST_Y}
          x2={CX + torsoW / 2 - 2}
          y2={WAIST_Y}
          stroke={strokeColor}
          strokeWidth={0.6}
          opacity={0.55}
        />
        {/* Head */}
        <g
          transform={`translate(${CX} ${HEAD_CY}) rotate(${activePose.headTilt})`}
          style={{ transition: "var(--pose-transition)" }}
        >
          <g style={animStyle(activePose.anim?.head)}>
            <circle cx={0} cy={0} r={HEAD_R} fill={fillColor} stroke={strokeColor} strokeWidth={1.2} />
            {!dimmed && (
              <>
                {/* Profile features when sideways */}
                {!isFront && (
                  <>
                    {/* Nose: small triangle bump on facing side */}
                    <path
                      d={`M ${facingSign * HEAD_R * 0.92} -1 L ${facingSign * (HEAD_R + 3)} 0 L ${facingSign * HEAD_R * 0.92} 2 Z`}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={0.7}
                    />
                    {/* Ear: small arc on far side */}
                    <path
                      d={`M ${-facingSign * (HEAD_R - 1)} -2 Q ${-facingSign * (HEAD_R + 2)} 0 ${-facingSign * (HEAD_R - 1)} 3`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={0.9}
                    />
                  </>
                )}
                {/* Eyes — front shows both, side shows only the viewer-facing one */}
                {isFront ? (
                  <>
                    <circle cx={-4} cy={-1} r={1.2} fill="rgb(var(--bg))" />
                    <circle cx={4} cy={-1} r={1.2} fill="rgb(var(--bg))" />
                  </>
                ) : (
                  <circle cx={facingSign * 4} cy={-1} r={1.2} fill="rgb(var(--bg))" />
                )}
                {activePose.expression === "focus" && (
                  <>
                    <line x1={-6} y1={-5} x2={-2.5} y2={-3.5} stroke="rgb(var(--bg))" strokeWidth={0.7} strokeLinecap="round" />
                    <line x1={6} y1={-5} x2={2.5} y2={-3.5} stroke="rgb(var(--bg))" strokeWidth={0.7} strokeLinecap="round" />
                  </>
                )}
                {/* Mouth */}
                {activePose.expression === "smile" ? (
                  <path d="M -2.5 4.5 Q 0 6.5 2.5 4.5" fill="none" stroke="rgb(var(--bg))" strokeWidth={0.9} strokeLinecap="round" />
                ) : activePose.expression === "open-mouth" ? (
                  <ellipse cx={0} cy={5} rx={1.4} ry={1.6} fill="rgb(var(--bg))" />
                ) : activePose.expression === "focus" ? (
                  <line x1={-1.5} y1={5} x2={1.5} y2={5} stroke="rgb(var(--bg))" strokeWidth={1.1} strokeLinecap="round" />
                ) : isFront ? (
                  <line x1={-2} y1={5} x2={2} y2={5} stroke="rgb(var(--bg))" strokeWidth={0.9} strokeLinecap="round" />
                ) : (
                  // Side view neutral mouth: shorter line shifted toward facing side
                  <line x1={facingSign * 0.5} y1={5} x2={facingSign * 3} y2={5} stroke="rgb(var(--bg))" strokeWidth={0.9} strokeLinecap="round" />
                )}
              </>
            )}
          </g>
        </g>
      </>
    );
  };

  // Trigger a one-shot CSS class on the wrapper when the current frame fires
  // a `shake-cam` effect. Auto-clears after the keyframe completes.
  const [shakeTick, setShakeTick] = useState(0);
  useEffect(() => {
    if (activePose.shakeCam) {
      setShakeTick((t) => t + 1);
      const t = window.setTimeout(() => setShakeTick(0), 280);
      return () => window.clearTimeout(t);
    }
  }, [activePose.shakeCam, runKey, frameIdx]);

  const allEffects = activePose.effects.concat(activePose.loopingEffects);

  const figure = (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width="100%"
      style={{ maxWidth: figureWidth, height: "auto" }}
      aria-label={persona ? translate("Your player avatar") : translate("Log in to personalize")}
    >
      <defs>
        <radialGradient id="pa-spotlight" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={dimmed ? "rgb(var(--muted))" : "rgb(251,191,36)"} stopOpacity="0.65" />
          <stop offset="100%" stopColor={dimmed ? "rgb(var(--muted))" : "rgb(251,191,36)"} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Scene background (lowest z-order) */}
      <SceneBg kind={activePose.sceneBg} dimmed={dimmed} />

      {/* Decorative hoop (drawn behind body) */}
      {activePose.hasHoop && <Hoop dimmed={dimmed} />}

      {/* Back-layer effects (motion lines, swish, impact rings, ghost trails) */}
      <Effects list={allEffects} layer="back" runKey={runKey} frameIdx={frameIdx} dimmed={dimmed} />

      {/* Whole-body translate (jump / crouch). Torso ITSELF never rotates. */}
      <g
        transform={`translate(${activePose.bodyShiftX} ${activePose.bodyShiftY})`}
        style={{
          ...animStyle(activePose.anim?.body),
          // CSS variable cascades to all child joint groups so a single
          // per-frame enterMs change drives the whole skeleton's interpolation.
          ["--pose-transition" as string]: poseTransition,
          transition: "var(--pose-transition)"
        }}
      >
        {/* Limb + torso order depends on view:
            - front: torso/head first, then both arms, then both legs
            - side-r: far (L) limbs first (behind torso), then torso/head,
                      then near (R) limbs (on top)
            - side-l: mirror of side-r */}
        {activePose.view === "front" ? (
          <>
            <TorsoAndHead />
            <ArmChain side="l" />
            <ArmChain side="r" />
            <LegChain side="l" />
            <LegChain side="r" />
          </>
        ) : activePose.view === "side-r" ? (
          <>
            <LegChain side="l" opacity={0.7} />
            <ArmChain side="l" opacity={0.55} />
            <TorsoAndHead />
            <LegChain side="r" />
            <ArmChain side="r" />
          </>
        ) : (
          // side-l: figure faces left; near limbs are L, far limbs are R.
          <>
            <LegChain side="r" opacity={0.7} />
            <ArmChain side="r" opacity={0.55} />
            <TorsoAndHead />
            <LegChain side="l" />
            <ArmChain side="l" />
          </>
        )}

        {/* Free-floating balls (not in any joint chain). Scale combines the
            ball slot default with any per-frame / per-action override. */}
        {activePose.ball === "two-hands" && (
          <g transform={`translate(${CX} ${TORSO_TOP + TORSO_H * 0.42})`}>
            <Ball scale={activePose.ballScale} dimmed={dimmed} />
          </g>
        )}
        {activePose.ball === "overhead" && (
          <g
            transform={`translate(${CX} ${HEAD_CY - HEAD_R - BALL_BASE_R * activePose.ballScale - 2})`}
          >
            <Ball scale={activePose.ballScale} dimmed={dimmed} />
          </g>
        )}
        {activePose.ball === "floor-r" && (
          <g transform={`translate(${CX + TORSO_W * 0.55} ${HIP_Y + THIGH_H + SHIN_H + 2})`}>
            <Ball scale={activePose.ballScale} dimmed={dimmed} />
          </g>
        )}
        {activePose.ball === "floor-l" && (
          <g transform={`translate(${CX - TORSO_W * 0.55} ${HIP_Y + THIGH_H + SHIN_H + 2})`}>
            <Ball scale={activePose.ballScale} dimmed={dimmed} />
          </g>
        )}
      </g>

      {/* Defender lies on the ground (drawn outside the body transform). */}
      {activePose.hasDefender && <Defender dimmed={dimmed} />}

      {/* Front-layer effects (sweat, dust, slash, confetti, flash) */}
      <Effects list={allEffects} layer="front" runKey={runKey} frameIdx={frameIdx} dimmed={dimmed} />

      {/* Decorations float over everything (drawn last). */}
      <Decorations kind={activePose.decoration} dimmed={dimmed} />
    </svg>
  );

  return (
    <div
      className={`flex items-center ${size === "sm" ? "gap-2" : "gap-3"}`}
      style={
        shakeTick > 0
          ? { animation: "pa-cam-shake 240ms ease-in-out" }
          : undefined
      }
    >
      <style>{`
        @keyframes pa-breathe      { 0%,100% { transform: translateY(0) }    50% { transform: translateY(-1px) } }
        @keyframes pa-bounce       { 0%,100% { transform: translateY(0) }    50% { transform: translateY(-2px) } }
        @keyframes pa-slow-bounce  { 0%,100% { transform: translateY(0) }    50% { transform: translateY(-1.5px) } }
        @keyframes pa-dribble-bob  { 0%,100% { transform: translateY(0) }    50% { transform: translateY(7px) } }
        @keyframes pa-ball-bob     { 0%,100% { transform: translateY(0) }    50% { transform: translateY(7px) } }
        @keyframes pa-stir-pot     { from    { transform: rotate(0deg) }     to  { transform: rotate(360deg) } }
        @keyframes pa-shake-wrist  { 0%,100% { transform: rotate(-15deg) }   50% { transform: rotate(15deg) } }
        @keyframes pa-shimmy       { 0%,100% { transform: translateX(0) }    25% { transform: translateX(-1.5px) } 75% { transform: translateX(1.5px) } }
        @keyframes pa-clap         { 0%,100% { transform: translateY(0) }    50% { transform: translateY(-2px) } }
        @keyframes pa-wave-hand    { 0%,100% { transform: rotate(-22deg) }   50% { transform: rotate(22deg) } }
        @keyframes pa-zzz          { 0%,100% { opacity: 0.55; transform: translateY(0) } 50% { opacity: 1; transform: translateY(-3px) } }
        @keyframes pa-salt-fall    { 0% { opacity: 0; transform: translateY(-4px) } 60% { opacity: 1; transform: translateY(0) } 100% { opacity: 0; transform: translateY(8px) } }
        @keyframes pa-sweat        { 0% { opacity: 0; transform: translate(0,-2px) } 30% { opacity: 1 } 100% { opacity: 0; transform: translate(0,10px) } }
        @keyframes pa-dust         { 0% { opacity: 0; transform: scaleX(0.4) } 30% { opacity: 0.9 } 100% { opacity: 0; transform: scaleX(1.4) } }
        @keyframes pa-impact       { 0% { opacity: 0.9; transform: scale(0.4) } 100% { opacity: 0; transform: scale(1.8) } }
        @keyframes pa-cam-shake    { 0%,100% { transform: translate(0,0) } 25% { transform: translate(-1.2px,1px) } 50% { transform: translate(1px,-0.6px) } 75% { transform: translate(-0.8px,0.6px) } }
        @keyframes pa-swish        { 0% { stroke-dashoffset: 20; opacity: 0 } 30% { opacity: 1 } 100% { stroke-dashoffset: 0; opacity: 0 } }
        @keyframes pa-flash        { 0% { opacity: 0.85; transform: scale(0.4) } 100% { opacity: 0; transform: scale(2) } }
        @keyframes pa-confetti     { 0% { opacity: 0; transform: translate(0,-4px) } 20% { opacity: 1 } 100% { opacity: 0; transform: translate(0,22px) } }
        @keyframes pa-motion-fade  { 0% { opacity: 0; transform: translateX(0) } 30% { opacity: 0.8 } 100% { opacity: 0; transform: translateX(-6px) } }
      `}</style>

      {onClick ? (
        <button type="button" onClick={onClick} className={figureClass} aria-label={persona ? translate("Edit your player profile") : translate("Log in to personalize")}>
          {figure}
        </button>
      ) : (
        <div className={figureClass}>{figure}</div>
      )}

      <div className={`flex min-w-0 flex-col ${size === "sm" ? "gap-1" : "gap-1.5"}`}>
        <div
          className={`inline-flex w-fit items-center rounded-full border border-[rgb(var(--text)/0.22)] bg-[rgb(var(--bg-elev)/0.7)] px-2.5 ${
            size === "sm" ? "h-5 text-[0.62rem]" : "h-6 text-[0.7rem]"
          } font-bold tracking-[0.04em]`}
        >
          {positionsText}
        </div>

        <div className={`flex items-center gap-1.5 ${size === "sm" ? "text-[0.62rem]" : "text-[0.72rem]"} soft-text`}>
          <span className="font-medium uppercase tracking-[0.08em]">{skillLabel}</span>
          <span className="inline-flex items-center gap-0.5" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 rounded-full transition-colors"
                style={{
                  background:
                    i <= skillPipsCount ? "rgb(251 191 36 / 0.9)" : "rgb(var(--muted)/0.6)"
                }}
              />
            ))}
          </span>
        </div>

        <div className={`${size === "sm" ? "text-[0.62rem]" : "text-[0.72rem]"} soft-text tabular-nums`}>
          {persona
            ? `${persona.height_cm} ${translate("cm")} · ${persona.weight_kg} ${translate("kg")}`
            : translate("Log in to personalize")}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <span
            className={`truncate font-semibold tracking-[-0.01em] ${
              size === "sm" ? "text-[0.7rem]" : "text-[0.8rem]"
            }`}
            style={{ color: "rgb(var(--text))" }}
            title={translate(activePose.label)}
          >
            {translate(activePose.label)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShuffle}
            aria-label={translate("Change move")}
            className={`group/shuffle inline-flex w-fit items-center gap-1 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--bg-elev)/0.7)] transition hover:border-[rgb(var(--text)/0.35)] hover:bg-[rgb(var(--text)/0.06)] ${
              size === "sm" ? "h-5 px-2 text-[0.62rem]" : "h-6 px-2.5 text-[0.68rem]"
            }`}
          >
            <Shuffle className="h-3 w-3 transition group-hover/shuffle:rotate-12" />
            <span>{translate("Change move")}</span>
          </button>
          {debugStep && (
            <button
              type="button"
              onClick={handleStepFrame}
              className={`inline-flex w-fit items-center gap-1 rounded-full border border-[rgb(var(--text)/0.4)] bg-[rgb(var(--bg-elev)/0.7)] font-mono ${
                size === "sm" ? "h-5 px-2 text-[0.62rem]" : "h-6 px-2.5 text-[0.68rem]"
              }`}
              title={`Frame ${frameIdx + 1} / ${activeAction.frames.length}`}
            >
              <span>
                Frame {frameIdx + 1}/{activeAction.frames.length} →
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
