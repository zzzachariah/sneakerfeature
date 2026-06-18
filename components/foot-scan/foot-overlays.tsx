// Alignment guides drawn over the camera / shown in photo mode. Redrawn to look
// like an actual foot, with a dark halo so the white outline stays crisp on any
// background, and mirrored to match the foot being scanned (right vs left).

import type { FootSide, ViewId } from "@/lib/foot-scan/types";

// Top-down: a real footprint — five toes (big toe largest) and a medial arch.
// Drawn as a RIGHT foot (big toe on the left); mirrored for the left foot.
function TopOutline() {
  return (
    <g>
      {/* toes, big → little */}
      <ellipse cx="96" cy="54" rx="13" ry="17" />
      <ellipse cx="120" cy="45" rx="10" ry="14" />
      <ellipse cx="138" cy="49" rx="8.5" ry="12" />
      <ellipse cx="152" cy="58" rx="7" ry="10" />
      <ellipse cx="164" cy="70" rx="6" ry="8" />
      {/* foot blade: ball → medial arch → heel → lateral */}
      <path
        d="M84 72
           C74 94 72 114 80 132
           C88 160 86 184 88 208
           C90 242 100 280 120 282
           C140 280 152 246 154 214
           C158 184 162 152 162 126
           C164 102 160 84 150 72 Z"
      />
    </g>
  );
}

// Lateral side profile: heel (left), instep dome along the top, toes (right),
// sole along the bottom.
function SideOutline() {
  return (
    <path
      d="M50 214
         C40 209 38 182 46 170
         C54 160 70 160 82 164
         C104 154 140 154 176 162
         C200 166 220 176 216 196
         C213 210 192 214 168 215
         C120 219 80 220 58 218
         C53 218 51 216 50 214 Z"
    />
  );
}

// Three-quarter / oblique view: foot angled with the instep doming toward the
// viewer (heel lower-left, toes upper-right).
function ObliqueOutline() {
  return (
    <g>
      <path
        d="M80 250
           C68 238 66 214 76 198
           C88 176 108 160 132 148
           C156 136 184 124 200 116
           C210 111 214 120 208 132
           C194 156 172 178 158 200
           C146 220 128 240 104 250
           C94 254 84 256 80 250 Z"
      />
      {/* instep ridge */}
      <path d="M96 222 C122 200 156 170 196 126" opacity={0.7} />
    </g>
  );
}

export function FootOverlay({ view, side = "right" }: { view: ViewId; side?: FootSide }) {
  const mirror = side === "left";
  return (
    <svg
      viewBox="0 0 240 320"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <filter id="fs-halo" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#000" floodOpacity="0.9" />
        </filter>
      </defs>
      <g
        filter="url(#fs-halo)"
        transform={mirror ? "translate(240,0) scale(-1,1)" : undefined}
        fill="none"
        stroke="rgb(255 255 255 / 0.95)"
        strokeWidth={3.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {view === "side" ? <SideOutline /> : view === "oblique" ? <ObliqueOutline /> : <TopOutline />}
      </g>
    </svg>
  );
}
