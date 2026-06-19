// Channel B depth-measurement tests (spec §11, extended).
//
// Synthetic foot: a solid half-ellipsoid (known length/width/height) sampled
// above a flat floor. The measurement core must recover the dimensions from the
// point cloud. Run: npx tsx scripts/test-foot-depth.mts

import { measureFootCloud, type Vec3 } from "../lib/foot-scan/depth";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}

// Build a cloud: floor (z=0) + a solid half-ellipsoid foot above it.
// Semi-axes a/b/c → length 2a, width 2b, height c. Units = mm (unitToMm = 1).
const a = 120; // → length 240
const b = 45; //  → width 90
const c = 55; //  → height 55
const points: Vec3[] = [];

// Floor, wider than the foot so it's the dominant plane.
for (let x = -200; x <= 200; x += 8) for (let y = -160; y <= 160; y += 8) points.push([x, y, 0]);

// Solid half-ellipsoid (foot), sampled as columns up to the surface height.
for (let x = -a; x <= a; x += 6) {
  for (let y = -b; y <= b; y += 5) {
    const t = 1 - (x / a) ** 2 - (y / b) ** 2;
    if (t <= 0) continue;
    const zmax = c * Math.sqrt(t);
    for (let z = 0; z < zmax; z += 6) points.push([x, y, z]);
    points.push([x, y, zmax]); // include the surface apex
  }
}

// Expected extents = the actual span of points ABOVE the 5 mm floor cut-off
// (the top-surface silhouette, slightly inside the ideal ±a/±b ellipsoid axes —
// which is the physically correct thing a depth scan from above measures).
const footPts = points.filter((p) => p[2] > 5);
const expLen = Math.max(...footPts.map((p) => p[0])) - Math.min(...footPts.map((p) => p[0]));
const expWid = Math.max(...footPts.map((p) => p[1])) - Math.min(...footPts.map((p) => p[1]));

const m = measureFootCloud(points, { unitToMm: 1, planeTolMm: 5, seed: 7 });
check("returns a measurement", m !== null, m);
if (m) {
  check(`length ≈ ${expLen} (got ${m.foot_length_mm})`, Math.abs(m.foot_length_mm - expLen) <= 4, m.foot_length_mm);
  check(`width ≈ ${expWid} (got ${m.foot_width_mm})`, Math.abs(m.foot_width_mm - expWid) <= 4, m.foot_width_mm);
  check(`instep height ≈ 55 (got ${m.instep_height_mm})`, Math.abs(m.instep_height_mm - 55) <= 5, m.instep_height_mm);
  check(`ball girth present + plausible (got ${m.ball_girth_mm})`, m.ball_girth_mm !== null && m.ball_girth_mm > m.foot_width_mm, m.ball_girth_mm);
}

// Too few points → null, never a bogus measurement.
check("too-sparse cloud → null", measureFootCloud([[0, 0, 0]], { unitToMm: 1 }) === null);

console.log(`\nfoot depth: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
