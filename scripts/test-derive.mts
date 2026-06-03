import { deriveDetail, detectReplyLang } from "../lib/ai/derive-proscons";
import type { Shoe, BloggerReview } from "../lib/types";

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

const shoe: Shoe = {
  id: "s1",
  slug: "test-shoe",
  brand: "TestBrand",
  shoe_name: "Test Shoe",
  spec: {
    cushioning_feel: "Responsive",
    court_feel: "Low",
    bounce: "Balanced",
    stability: "High",
    traction: "Elite",
    fit: "Good"
  }
} as Shoe;

const reviews: BloggerReview[] = [
  {
    id: "r1",
    shoe_id: "s1",
    blogger_name: "Hooper",
    platform: "bilibili",
    video_url: "https://x",
    pros: ["抓地非常强", "鞋面透气"],
    cons: ["偏重"],
    summary: null
  } as BloggerReview
];

console.log("Test 1 — empty existing, no reviews (pure spec fill, zh):");
{
  const d = deriveDetail({ shoe, reviews: [], focus: null, lang: "zh", existing: {} });
  check("3 pros", d.pros.length === 3, d.pros);
  check("3 cons", d.cons.length === 3, d.cons);
  check("reason non-empty", d.reason.trim().length > 0, d.reason);
  check("pros/cons disjoint", !d.pros.some((p) => d.cons.includes(p)), { pros: d.pros, cons: d.cons });
  console.log("    reason:", d.reason);
  console.log("    pros:", d.pros);
  console.log("    cons:", d.cons);
}

console.log("Test 2 — blogger reviews lead, then spec fills to 3 (zh):");
{
  const d = deriveDetail({ shoe, reviews, focus: null, lang: "zh", existing: {} });
  check("3 pros", d.pros.length === 3, d.pros);
  check("3 cons", d.cons.length === 3, d.cons);
  check("blogger pro present", d.pros.includes("抓地非常强"), d.pros);
  check("blogger pro #2 present", d.pros.includes("鞋面透气"), d.pros);
  check("blogger con present", d.cons.includes("偏重"), d.cons);
  console.log("    pros:", d.pros);
  console.log("    cons:", d.cons);
}

console.log("Test 3 — partial AI output kept first, topped up:");
{
  const d = deriveDetail({
    shoe,
    reviews,
    focus: null,
    lang: "zh",
    existing: { reason: "AI 给的理由", pros: ["AI优点"], cons: ["AI缺点"] }
  });
  check("reason kept from AI", d.reason === "AI 给的理由", d.reason);
  check("first pro is AI's", d.pros[0] === "AI优点", d.pros);
  check("first con is AI's", d.cons[0] === "AI缺点", d.cons);
  check("3 pros", d.pros.length === 3, d.pros);
  check("3 cons", d.cons.length === 3, d.cons);
  console.log("    pros:", d.pros);
  console.log("    cons:", d.cons);
}

console.log("Test 4 — English locale uses English templates + pros_en:");
{
  const d = deriveDetail({ shoe, reviews: [], focus: null, lang: "en", existing: {} });
  check("3 pros", d.pros.length === 3, d.pros);
  check("English reason", /[a-z]/i.test(d.reason) && !/[㐀-鿿]/.test(d.reason), d.reason);
  check("English pros", d.pros.every((p) => !/[㐀-鿿]/.test(p)), d.pros);
  console.log("    reason:", d.reason);
  console.log("    pros:", d.pros);
}

console.log("Test 5 — detectReplyLang:");
{
  check("zh detected", detectReplyLang("后卫 想要缓震好的") === "zh");
  check("en detected", detectReplyLang("guard wants good cushioning") === "en");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
