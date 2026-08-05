// Per-tier prompt differentiation (Strategy A: depth ladder + Max concierge).
//
// One core expert prompt lives in recommend.ts; this module produces the extra
// block appended to the final ask per tier — scaling analysis depth, and giving
// Max a distinct "personal sneaker concierge" voice. Kept separate so the tier
// voice can be tuned without touching the recommendation pipeline.
//
// Every block exists in both languages. These instructions land immediately
// before the model writes, so a Chinese-only depth suffix was one more shove
// toward a Chinese answer for an English request (see lib/ai/lang.ts).

import type { TierPrompt } from "@/lib/subscription/tiers";
import type { ReplyLang } from "@/lib/ai/derive-proscons";

export function buildDepthSuffix(prompt: TierPrompt, lang: ReplyLang = "zh"): string {
  const zh = lang === "zh";
  const parts: string[] = ["\n\n"];

  if (prompt.depth === "concise") {
    parts.push(
      zh
        ? "【输出深度 · 精简】你是快速选鞋助手。理由(reason)一句话点到为止，" +
            "pros/cons 各 3 条、每条 ≤ 12 字，直给结论，不展开长篇分析。"
        : "[DEPTH — CONCISE] You are a quick-pick assistant. One sentence per `reason`; " +
            "exactly 3 pros and 3 cons, each under 8 words. Give the verdict, skip the long analysis."
    );
  } else if (prompt.depth === "standard") {
    parts.push(
      zh
        ? "【输出深度 · 完整】你是懂球的资深店员。每双鞋讲清它为什么适合这位用户，" +
            "reason 里点出与其打法／脚型／预算的具体契合点；pros/cons 要有权衡感（不要只说好话），" +
            "必要时对比同价位替代款。"
        : "[DEPTH — FULL] You are an experienced shop veteran who actually hoops. For each shoe, make it " +
            "clear why it suits THIS user: name the specific match to their playstyle, foot shape or budget " +
            "in `reason`. Pros and cons must feel balanced (not all praise), and compare against " +
            "similarly-priced alternatives where it helps."
    );
  } else {
    parts.push(
      zh
        ? "【输出深度 · 深度】你是这位用户的私人选鞋顾问(concierge)。" +
            "把每双鞋放进用户的完整画像里分析：结合脚型档案(鞋楦宽窄／脚背高低／拇趾外翻等)、位置打法、" +
            "使用场景与预算，给出专家级、可执行的建议——包括尺码／系带／袜子／场地的细节提示，" +
            "以及在什么情况下不建议购买。reason 可写 2-3 句，pros/cons 各 3 条但更具体、更有信息量。"
        : "[DEPTH — DEEP] You are this user's personal sneaker concierge. Analyse every shoe inside their " +
            "full picture: foot profile (last width, instep height, bunion signs), position and playstyle, " +
            "where they play, and budget. Give expert, actionable advice — sizing, lacing, sock choice, " +
            "surface notes — and say when NOT to buy. `reason` may run 2-3 sentences; still exactly 3 pros " +
            "and 3 cons, but more specific and more informative."
    );
  }

  if (prompt.concierge) {
    parts.push(
      zh
        ? " 语气尊贵、克制、专业，像高端买手对熟客说话——自信、不谄媚、不啰嗦。" +
            "在总的 reply 第一段用一句话总结你为这位用户把握到的核心诉求，再展开推荐。"
        : " Keep the tone assured, restrained and professional — a high-end buyer talking to a regular: " +
            "confident, never fawning, never padded. Open the first paragraph of `reply` with one sentence " +
            "summarising the core need you read from this user, then go into the picks."
    );
  }

  if (prompt.followUp) {
    parts.push(
      zh
        ? " 如果用户的需求还缺关键信息(如位置／预算／脚型／场地)，就把最关键的那一个问题写进 follow_up 字段" +
            "（只问一个，一句话）；不要把问题混进 reply 正文。本次仍要照常给出推荐，不要因为追问而不推荐。"
        : " If a key detail is still missing (position, budget, foot shape, court surface), put the single " +
            "most important question in the `follow_up` field — one question, one sentence. Never fold it " +
            "into the `reply` body. Still give the full set of recommendations this turn regardless."
    );
  }

  return parts.join("");
}
