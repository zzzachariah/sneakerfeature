// Schematic foot outlines drawn over the live camera as alignment guides. They
// are intentionally simple — the goal is "put your foot roughly here, at this
// orientation", not anatomical accuracy.

import type { ViewId } from "@/lib/foot-scan/types";

const STROKE = "rgb(255 255 255 / 0.9)";
const DASH = "10 8";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 200 300"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {children}
    </svg>
  );
}

// Top-down footprint silhouette (used for both feet's top view).
function TopOutline() {
  return (
    <path
      d="M100 18
         C122 18 135 40 135 70
         C135 95 128 110 128 135
         C128 160 140 175 140 205
         C140 250 122 285 100 285
         C78 285 60 250 60 205
         C60 175 72 160 72 135
         C72 110 65 95 65 70
         C65 40 78 18 100 18 Z"
      fill="none"
      stroke={STROKE}
      strokeWidth={2.5}
      strokeDasharray={DASH}
    />
  );
}

// Side profile (heel left, toes right) — for the lateral side view.
function SideOutline() {
  return (
    <path
      d="M25 210
         C20 180 30 165 55 162
         C95 158 120 150 150 132
         C168 122 182 120 188 132
         C193 143 182 156 165 168
         C150 178 150 195 152 210 Z"
      fill="none"
      stroke={STROKE}
      strokeWidth={2.5}
      strokeDasharray={DASH}
    />
  );
}

// Three-quarter / oblique view — top of the foot domed toward the viewer.
function ObliqueOutline() {
  return (
    <>
      <path
        d="M55 235
           C50 200 60 170 95 150
           C125 133 150 120 170 110
           C182 104 190 112 184 124
           C170 150 150 175 140 205
           C133 225 120 245 95 248
           C75 250 58 250 55 235 Z"
        fill="none"
        stroke={STROKE}
        strokeWidth={2.5}
        strokeDasharray={DASH}
      />
      {/* instep ridge hint */}
      <path d="M95 175 C115 165 135 150 160 130" fill="none" stroke={STROKE} strokeWidth={1.5} opacity={0.6} />
    </>
  );
}

export function FootOverlay({ view }: { view: ViewId }) {
  return (
    <Frame>
      {view === "side" ? <SideOutline /> : view === "oblique" ? <ObliqueOutline /> : <TopOutline />}
    </Frame>
  );
}
