import { computeMatchScore, computeDimensions } from "../lib/match/score";
import type { Persona } from "../lib/persona/types";
import type { Shoe } from "../lib/types";

const shoes: Shoe[] = [
  {
    id: "1", slug: "kobe-6", brand: "Nike", shoe_name: "Kobe 6 Protro",
    category: "guard shoe", weight: "12.1 oz",
    spec: {
      cushioning_feel: "responsive low-profile court feel",
      court_feel: "very high court feel quick",
      bounce: "snappy responsive",
      stability: "good stability",
      support: "decent support",
      torsional_rigidity: "high",
      containment: "moderate",
      fit: "snug responsive",
      playstyle_summary: "explosive fast quick",
      tags: ["low", "speed", "quick"]
    }
  },
  {
    id: "2", slug: "lebron-21", brand: "Nike", shoe_name: "LeBron 21",
    category: "big man shoe", weight: "15.5 oz",
    spec: {
      cushioning_feel: "soft plush forgiving",
      court_feel: "low",
      bounce: "decent",
      stability: "excellent stability",
      support: "elite support",
      torsional_rigidity: "very high",
      containment: "strong",
      fit: "stable",
      playstyle_summary: "powerful smooth",
      tags: ["high", "support", "ankle"]
    }
  },
  {
    id: "3", slug: "kd-16", brand: "Nike", shoe_name: "KD 16",
    category: "wing shoe", weight: "13.2 oz",
    spec: {
      cushioning_feel: "balanced",
      court_feel: "moderate court feel",
      bounce: "responsive",
      stability: "good",
      support: "solid",
      torsional_rigidity: "moderate",
      containment: "decent",
      fit: "balanced",
      playstyle_summary: "versatile responsive smooth",
      tags: ["balanced"]
    }
  },
  {
    id: "4", slug: "harden-8", brand: "Adidas", shoe_name: "Harden 8",
    category: "guard shoe", weight: "13.8 oz",
    spec: {
      cushioning_feel: "plush soft",
      court_feel: "low",
      bounce: "decent",
      stability: "moderate",
      support: "decent",
      torsional_rigidity: "moderate",
      containment: "good",
      fit: "stable forgiving",
      playstyle_summary: "smooth easy",
      tags: ["balanced"]
    }
  },
  {
    id: "5", slug: "gt-cut-3", brand: "Nike", shoe_name: "GT Cut 3",
    category: "all-around", weight: "11.8 oz",
    spec: {
      cushioning_feel: "responsive snappy",
      court_feel: "very high court feel",
      bounce: "explosive",
      stability: "good",
      support: "moderate",
      torsional_rigidity: "high",
      containment: "moderate",
      fit: "snug responsive",
      playstyle_summary: "quick fast explosive",
      tags: ["low", "speed", "quick"]
    }
  },
  {
    id: "6", slug: "mb-04", brand: "Puma", shoe_name: "MB.04",
    category: "guard shoe", weight: "12.5 oz",
    spec: {
      cushioning_feel: "soft",
      court_feel: "decent",
      bounce: "moderate",
      stability: "decent",
      support: "moderate",
      torsional_rigidity: "decent",
      containment: "moderate",
      fit: "balanced",
      playstyle_summary: "smooth",
      tags: []
    }
  },
  {
    id: "7", slug: "luka-3", brand: "Jordan", shoe_name: "Luka 3",
    category: "wing shoe", weight: "14.1 oz",
    spec: {
      cushioning_feel: "decent",
      court_feel: "moderate",
      bounce: "moderate",
      stability: "good",
      support: "solid",
      torsional_rigidity: "high",
      containment: "good",
      fit: "balanced",
      playstyle_summary: "stable balanced",
      tags: ["balanced"]
    }
  },
  {
    id: "8", slug: "tatum-2", brand: "Jordan", shoe_name: "Tatum 2",
    category: "wing shoe", weight: "12.9 oz",
    spec: {
      cushioning_feel: "responsive",
      court_feel: "high court feel",
      bounce: "snappy",
      stability: "moderate",
      support: "moderate",
      torsional_rigidity: "moderate",
      containment: "moderate",
      fit: "snug",
      playstyle_summary: "quick smooth",
      tags: ["balanced", "low"]
    }
  },
  {
    id: "9", slug: "jordan-39", brand: "Jordan", shoe_name: "Air Jordan 39",
    category: "all-around", weight: "13.5 oz",
    spec: {
      cushioning_feel: "responsive",
      court_feel: "decent",
      bounce: "snappy",
      stability: "good",
      support: "good",
      torsional_rigidity: "high",
      containment: "good",
      fit: "balanced",
      playstyle_summary: "versatile",
      tags: ["balanced"]
    }
  },
  {
    id: "10", slug: "no-data", brand: "Brand X", shoe_name: "Mystery Shoe",
    category: null, weight: null,
    spec: { tags: [] }
  },
  {
    id: "11", slug: "partial", brand: "Brand Y", shoe_name: "Partial Spec",
    category: "guard shoe", weight: "12.0 oz",
    spec: {
      cushioning_feel: "responsive",
      tags: ["low"]
    }
  },
  {
    id: "12", slug: "old-big", brand: "Reebok", shoe_name: "Big Heritage",
    category: "center", weight: "16.2 oz",
    spec: {
      cushioning_feel: "plush",
      stability: "very high",
      support: "elite",
      torsional_rigidity: "high",
      containment: "strong",
      tags: ["high", "support", "ankle"]
    }
  }
];

const personas: Array<{ name: string; persona: Persona }> = [
  { name: "扁平足新手矮个 PG", persona: { positions: ["PG"], skill_level: "beginner", flat_foot: true, height_cm: 170, weight_kg: 65 } },
  { name: "中等身材业余 SG", persona: { positions: ["SG"], skill_level: "amateur", flat_foot: false, height_cm: 185, weight_kg: 75 } },
  { name: "高个非扁平足半职业 PF", persona: { positions: ["PF"], skill_level: "semi_pro", flat_foot: false, height_cm: 200, weight_kg: 95 } },
  { name: "重量级职业 C(扁平足)", persona: { positions: ["C"], skill_level: "pro", flat_foot: true, height_cm: 210, weight_kg: 115 } },
  { name: "矮个职业 PG", persona: { positions: ["PG", "SG"], skill_level: "pro", flat_foot: false, height_cm: 172, weight_kg: 68 } },
  { name: "中等业余 SF", persona: { positions: ["SF"], skill_level: "amateur", flat_foot: false, height_cm: 188, weight_kg: 80 } }
];

function histogram(scores: number[]): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (let i = 30; i < 100; i += 10) {
    buckets[`${i}-${i + 9}`] = 0;
  }
  for (const s of scores) {
    const bucket = Math.min(90, Math.floor(s / 10) * 10);
    const key = `${bucket}-${bucket + 9}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return buckets;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

const allScores: number[] = [];
const allPasses: boolean[] = [];

for (const { name, persona } of personas) {
  const results = shoes.map((shoe) => ({
    shoe,
    score: computeMatchScore(persona, shoe),
    dims: computeDimensions(persona, shoe)
  }));
  const scores = results.map((r) => r.score).sort((a, b) => a - b);
  allScores.push(...scores);

  console.log(`\n=== ${name} ===`);
  console.log(`身高 ${persona.height_cm}cm 体重 ${persona.weight_kg}kg 扁平足=${persona.flat_foot} ${persona.skill_level} ${persona.positions.join(",")}`);
  console.log(`min=${scores[0]} p25=${percentile(scores, 0.25)} p50=${percentile(scores, 0.5)} p75=${percentile(scores, 0.75)} max=${scores[scores.length - 1]}`);
  console.log(`spread (p75-p25): ${percentile(scores, 0.75) - percentile(scores, 0.25)}`);

  const hist = histogram(scores);
  console.log("直方图: " + Object.entries(hist).map(([k, v]) => `${k}:${v}`).join(" "));

  const sorted = [...results].sort((a, b) => b.score - a.score);
  console.log(`top3: ${sorted.slice(0, 3).map((r) => `${r.shoe.shoe_name}(${r.score})`).join(", ")}`);
  console.log(`bot3: ${sorted.slice(-3).map((r) => `${r.shoe.shoe_name}(${r.score})`).join(", ")}`);

  const nonEmptyBuckets = Object.values(hist).filter((v) => v > 0).length;
  const maxBucketPct = Math.max(...Object.values(hist)) / scores.length;
  const spread = percentile(scores, 0.75) - percentile(scores, 0.25);
  const pass = nonEmptyBuckets >= 3 && spread >= 15 && maxBucketPct <= 0.5;
  console.log(`通过(>=3 buckets, p75-p25>=15, no bucket>50%): ${pass ? "✓" : "✗"} (buckets=${nonEmptyBuckets}, spread=${spread}, maxPct=${(maxBucketPct * 100).toFixed(0)}%)`);
  allPasses.push(pass);
}

console.log("\n=== 总体 ===");
const sortedAll = [...allScores].sort((a, b) => a - b);
console.log(`所有分数: min=${sortedAll[0]} p25=${percentile(sortedAll, 0.25)} p50=${percentile(sortedAll, 0.5)} p75=${percentile(sortedAll, 0.75)} max=${sortedAll[sortedAll.length - 1]}`);
console.log(`所有 personas 通过率: ${allPasses.filter(Boolean).length}/${allPasses.length}`);
const overallHist = histogram(sortedAll);
console.log("总体直方图: " + Object.entries(overallHist).map(([k, v]) => `${k}:${v}`).join(" "));
