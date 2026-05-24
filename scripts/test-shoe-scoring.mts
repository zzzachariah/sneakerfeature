import {
  getStabilityScore,
  getTractionScore,
  getFitScore,
  getCushioningFeelScore,
  getCourtFeelScore,
  getBounceScore,
  getPerformanceLabel
} from "../lib/shoe-scoring";

type Case = {
  fn: (s: string) => number;
  dim: string;
  text: string;
  expectMin?: number;
  expectMax?: number;
  expectExact?: number;
  note?: string;
};

const cases: Case[] = [
  // --- Empty / defaults
  { fn: getStabilityScore, dim: "stability", text: "", expectExact: 70, note: "empty" },
  { fn: getCushioningFeelScore, dim: "cushioning", text: "", expectExact: 74, note: "empty" },

  // --- Existing EXACT matches preserved
  { fn: getStabilityScore, dim: "stability", text: "elite", expectExact: 100 },
  { fn: getStabilityScore, dim: "stability", text: "very good", expectExact: 88 },
  { fn: getCushioningFeelScore, dim: "cushioning", text: "very plush", expectExact: 93 },
  { fn: getCushioningFeelScore, dim: "cushioning", text: "plush and springy", expectExact: 90 },
  { fn: getTractionScore, dim: "traction", text: "excellent on clean courts", expectExact: 99 },
  { fn: getFitScore, dim: "fit", text: "secure and supportive", expectExact: 90 },
  { fn: getCourtFeelScore, dim: "courtfeel", text: "moderate", expectExact: 64 },
  { fn: getBounceScore, dim: "bounce", text: "very good", expectExact: 88 },

  // --- Word-boundary fix: "stable" should NOT match inside "unstable"
  { fn: getStabilityScore, dim: "stability", text: "unstable", expectMin: 30, expectMax: 65, note: "unstable should not score as 'stable'=80" },

  // --- Base + modifier no longer double-counts the modifier inside base phrase
  { fn: getCushioningFeelScore, dim: "cushioning", text: "very plush", expectExact: 93, note: "no +5 for 'very' on top of 'very plush' base" },

  // --- Free-form positive text → sentiment fallback boosts above default
  { fn: getCushioningFeelScore, dim: "cushioning", text: "the cushion is amazing and bouncy", expectMin: 90, note: "amazing + bouncy → high" },
  { fn: getStabilityScore, dim: "stability", text: "feels stable and supportive", expectMin: 80 },
  { fn: getBounceScore, dim: "bounce", text: "outstanding bounce", expectMin: 80 },
  { fn: getFitScore, dim: "fit", text: "an incredible glove-like wrap", expectMin: 90 },

  // --- Free-form negative text
  { fn: getCushioningFeelScore, dim: "cushioning", text: "feels flat and dead", expectMax: 65, note: "negative sentiment" },
  { fn: getStabilityScore, dim: "stability", text: "wobbly and concerning", expectMax: 60 },

  // --- Negation handling
  { fn: getCushioningFeelScore, dim: "cushioning", text: "not plush at all", expectMax: 75, note: "negation flips polarity" },
  { fn: getStabilityScore, dim: "stability", text: "not stable", expectMax: 70 },

  // --- Intensifier dampening
  { fn: getCushioningFeelScore, dim: "cushioning", text: "extremely plush and protective", expectMin: 92 },
  { fn: getCushioningFeelScore, dim: "cushioning", text: "slightly soft", expectMin: 70, expectMax: 90, note: "dampener pulls toward default" },

  // --- Long descriptive sentence (no exact / base phrase)
  { fn: getTractionScore, dim: "traction", text: "the outsole grips great even on dusty floors", expectMin: 60, expectMax: 95 },
  { fn: getCourtFeelScore, dim: "courtfeel", text: "very low to the floor, super grounded", expectMin: 80 },

  // --- Realistic seed-data phrases must still produce the original scores
  { fn: getTractionScore, dim: "traction", text: "very good indoors, less loved outdoors", expectExact: 82 },
  { fn: getCushioningFeelScore, dim: "cushioning", text: "responsive and lively", expectExact: 82 },
  { fn: getFitScore, dim: "fit", text: "snug and very secure", expectExact: 92 },
  { fn: getBounceScore, dim: "bounce", text: "good for a foam setup", expectExact: 76 },

  // --- Mixed positive + negative clauses
  { fn: getTractionScore, dim: "traction", text: "great traction but durability concerns", expectMin: 55, expectMax: 95 },
  { fn: getCushioningFeelScore, dim: "cushioning", text: "comfortable but a bit firm", expectMin: 55, expectMax: 80 },

  // --- Stability tier-only word
  { fn: getStabilityScore, dim: "stability", text: "good", expectExact: 74 },
  { fn: getStabilityScore, dim: "stability", text: "wobbly", expectMax: 65 },

  // --- Single sentiment-only word, no anchor in dim dict
  { fn: getStabilityScore, dim: "stability", text: "phenomenal", expectMin: 70, note: "unknown word -> default" },
  { fn: getCushioningFeelScore, dim: "cushioning", text: "awesome", expectMin: 70, expectMax: 100 },

  // --- Punctuation tolerance
  { fn: getStabilityScore, dim: "stability", text: "Elite!", expectExact: 100 },
  { fn: getCushioningFeelScore, dim: "cushioning", text: "very plush.", expectExact: 93 },

  // --- Demo data values used by the public fallback
  { fn: getCushioningFeelScore, dim: "cushioning", text: "Responsive", expectExact: 78 },
  { fn: getCourtFeelScore, dim: "courtfeel", text: "Excellent", expectExact: 98 },
  { fn: getBounceScore, dim: "bounce", text: "High", expectExact: 92 },
  { fn: getStabilityScore, dim: "stability", text: "High", expectExact: 92 },
  { fn: getTractionScore, dim: "traction", text: "Elite", expectExact: 100 },
  { fn: getFitScore, dim: "fit", text: "Snug", expectExact: 86 },
  { fn: getCushioningFeelScore, dim: "cushioning", text: "Plush-responsive", expectMin: 70, expectMax: 95 },
  { fn: getFitScore, dim: "fit", text: "One-to-one", expectExact: 93 },
  { fn: getStabilityScore, dim: "stability", text: "Great", expectMin: 80, note: "great = strong positive" },
  { fn: getBounceScore, dim: "bounce", text: "Medium", expectMin: 50, expectMax: 80, note: "medium ≈ moderate" }
];

let pass = 0;
let fail = 0;
const failures: string[] = [];

for (const c of cases) {
  const score = c.fn(c.text);
  let ok = true;
  if (c.expectExact !== undefined && score !== c.expectExact) ok = false;
  if (c.expectMin !== undefined && score < c.expectMin) ok = false;
  if (c.expectMax !== undefined && score > c.expectMax) ok = false;

  const expectStr =
    c.expectExact !== undefined
      ? `== ${c.expectExact}`
      : `${c.expectMin ?? "-"} - ${c.expectMax ?? "-"}`;
  const line = `  [${ok ? "PASS" : "FAIL"}] ${c.dim.padEnd(12)} "${c.text}" → ${score} (expect ${expectStr})${c.note ? "  // " + c.note : ""}`;
  console.log(line);
  if (ok) pass++;
  else {
    fail++;
    failures.push(line);
  }
}

console.log("");
console.log(`Total: ${pass} pass, ${fail} fail (out of ${cases.length})`);

// Performance label sanity
console.log("\nPerformance labels:");
for (const s of [0, 24, 25, 39, 40, 54, 55, 64, 65, 74, 75, 84, 85, 94, 95, 100]) {
  console.log(`  ${s} → ${getPerformanceLabel(s)}`);
}

if (fail > 0) process.exit(1);
