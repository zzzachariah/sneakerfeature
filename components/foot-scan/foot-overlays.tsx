// Alignment guides drawn over the camera / shown in photo mode. Clean but
// anatomically plausible foot line-art, with a dark halo so the white outline
// stays crisp on any background, and mirrored to match the foot being scanned.

import type { FootSide, ViewId } from "@/lib/foot-scan/types";

// Top-down: a real footprint — five fanned toes (big toe largest), the ball, a
// medial arch concavity and a rounded heel. Drawn as a RIGHT foot (big toe on
// the left); mirrored for the left foot.
function TopOutline() {
  return (
    <g>
      {/* toes, big → little, slightly fanned outward */}
      <ellipse cx="92" cy="60" rx="13" ry="18" transform="rotate(-10 92 60)" />
      <ellipse cx="116" cy="49" rx="9.5" ry="15" transform="rotate(-5 116 49)" />
      <ellipse cx="135" cy="52" rx="8.5" ry="13" />
      <ellipse cx="150" cy="60" rx="7.5" ry="11" transform="rotate(7 150 60)" />
      <ellipse cx="162" cy="72" rx="6.5" ry="9" transform="rotate(14 162 72)" />
      {/* foot blade: medial ball → arch → heel → lateral ball */}
      <path
        d="M80 80
           C70 98 68 116 78 134
           C90 158 90 184 88 208
           C90 240 100 284 120 286
           C142 284 154 242 156 206
           C160 178 166 152 166 130
           C168 108 164 90 152 80 Z"
      />
    </g>
  );
}

// Lateral side profile: ankle/achilles (upper-left), instep dome along the top,
// toes (right), a lifted arch under the midfoot, rounded heel (lower-left).
function SideOutline() {
  return (
    <g>
      <path
        d="M62 146
           C54 150 50 168 52 186
           C53 200 60 210 74 214
           C92 218 112 215 128 214
           C150 212 172 210 188 206
           C204 202 216 200 215 188
           C214 178 200 174 184 172
           C150 166 120 158 96 148
           C86 144 72 142 62 146 Z"
      />
      {/* arch hint under the midfoot */}
      <path d="M86 214 C108 202 140 202 168 208" opacity={0.55} />
    </g>
  );
}

// Three-quarter / oblique view: foot angled with the instep doming toward the
// viewer (heel lower-left, toes upper-right).
function ObliqueOutline() {
  return (
    <g>
      <path
        d="M86 252
           C72 240 70 214 80 196
           C92 172 112 156 136 144
           C158 133 184 122 200 114
           C210 109 214 118 208 130
           C196 152 178 172 166 192
           C154 214 136 238 110 250
           C100 255 90 257 86 252 Z"
      />
      {/* instep ridge */}
      <path d="M100 226 C128 202 164 170 200 124" opacity={0.6} />
      {/* toe hints near the front */}
      <ellipse cx="197" cy="120" rx="8" ry="5.5" transform="rotate(-32 197 120)" />
      <ellipse cx="184" cy="133" rx="7" ry="5" transform="rotate(-32 184 133)" />
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
