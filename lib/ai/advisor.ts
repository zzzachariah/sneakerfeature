// The AI advisor — a conversational sneaker concierge with memory. Unlike the
// Smart Picker (which returns JSON recommendation cards through a tool loop),
// the advisor streams plain prose: it answers follow-ups, weighs trade-offs and
// remembers the member's persona + foot scan across turns. Reuses the same
// packyapi client + models as the picker; billed from the monthly allowance.

import type OpenAI from "openai";
import type { Persona } from "@/lib/persona/types";
import type { FootProfile } from "@/lib/foot-scan/types";
import type { Shoe } from "@/lib/types";
import { callOptions, hasBudget, type Deadline } from "@/lib/ai/budget";
import { detectReplyLang } from "@/lib/ai/derive-proscons";

export type AdvisorTurn = { role: "user" | "assistant"; content: string };

const SKILL_LABEL_ZH: Record<string, string> = {
  beginner: "初学者",
  amateur: "业余",
  semi_pro: "半职业",
  pro: "职业"
};

const INJURY_ZH: Record<string, string> = {
  ankle: "有崴脚史(需要包裹与支撑)",
  knee: "膝盖有旧伤(需要缓震保护)",
  achilles: "跟腱易紧张(需要后跟缓冲)",
  plantar: "足底筋膜易劳损(需要足弓支撑与抗扭)"
};

const FOOT_WIDTH_ZH: Record<string, string> = { narrow: "偏窄", standard: "标准", wide: "偏宽", extra_wide: "超宽" };
const INSTEP_ZH: Record<string, string> = { low: "低", normal: "正常", high: "偏高" };
const TOE_ZH: Record<string, string> = {
  egyptian: "埃及型(拇趾最长)",
  greek: "希腊型(二趾最长)",
  roman: "罗马型(前几趾齐平)",
  square: "方型(脚趾齐平)"
};

function formatPersona(p: Persona): string {
  const skill = SKILL_LABEL_ZH[p.skill_level] ?? p.skill_level;
  const injuries = p.injuries?.length ? `；伤病史=${p.injuries.map((k) => INJURY_ZH[k] ?? k).join("、")}` : "";
  return `位置=${p.positions.join("/")}；水平=${skill}；扁平足=${p.flat_foot ? "是" : "否"}；身高=${p.height_cm}cm；体重=${p.weight_kg}kg${injuries}`;
}

function formatFoot(fp: FootProfile): string {
  const w = FOOT_WIDTH_ZH[fp.foot_width] ?? fp.foot_width;
  const i = INSTEP_ZH[fp.instep] ?? fp.instep;
  const t = TOE_ZH[fp.toe_shape] ?? fp.toe_shape;
  const len = fp.foot_length_mm ? `；脚长≈${fp.foot_length_mm}mm` : "";
  return `脚宽=${w}；脚背=${i}；脚趾型=${t}${len}`;
}

// A lean catalog digest so the advisor names real shoes from the database
// instead of inventing them. Name · brand · category · rating, top-rated first,
// capped to keep the context small.
function catalogDigest(shoes: Shoe[], limit = 80): string {
  const ranked = [...shoes]
    .sort((a, b) => (b.finalStars ?? 0) - (a.finalStars ?? 0))
    .slice(0, limit);
  return ranked
    .map((s) => {
      const bits = [s.shoe_name, s.brand, s.category ?? "", s.finalStars != null ? `${s.finalStars.toFixed(1)}★` : ""]
        .filter(Boolean)
        .join(" · ");
      return `- ${bits}`;
    })
    .join("\n");
}

const SYSTEM_PROMPT = `你是 sneakerfeature 的专属选鞋顾问，一位懂篮球鞋的资深买手朋友。你的风格：真诚、专业、有主见，像真人聊天而不是列清单。

规则：
1. 只推荐【鞋款目录】里真实存在的鞋，绝不编造型号或参数。可以谈论目录外的通用知识（打法、脚型、护理），但具体推荐必须来自目录。
2. 结合用户的【球员档案】和【脚型档案】给建议——位置、体重、扁平足、伤病史、脚宽脚背都要考虑到。有伤病史时优先保护性（护踝/缓震/支撑）。
3. 这是多轮对话，记住之前聊过的内容，顺着上下文回答追问。
4. 回答简洁、口语化，一般 2-4 句话；需要时才展开。适当用换行让长回答清晰，但不要堆砌 markdown 标题或长列表。
5. 如果用户想要一份完整的逐款打分推荐，可以建议他去用「智能选鞋」（Smart Picker）功能，那里会给出带雷达图的结构化推荐。
6. 【语言】始终用与用户消息相同的语言回答。`;

export type AdvisorOpts = {
  shoes: Shoe[];
  history: AdvisorTurn[];
  message: string;
  persona: Persona | null;
  footProfile: FootProfile | null;
  model: string;
  /** Wall-clock ceiling for the turn; bounds the upstream call (lib/ai/budget.ts). */
  deadline?: Deadline;
};

function buildMessages(opts: AdvisorOpts): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const zh = detectReplyLang(opts.message) === "zh";
  const profile = [
    opts.persona ? `我的球员档案：${formatPersona(opts.persona)}` : "",
    opts.footProfile ? `我的脚型档案：${formatFoot(opts.footProfile)}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const langLine = zh
    ? ""
    : "\n\n[Language] The user is writing in English — reply entirely in English, in a warm, conversational tone.";

  // The relay rejects the OpenAI `system` role, so the prompt + catalog + the
  // member's profile are delivered as the opening user turn plus a canned ack
  // (matching the Smart Picker route), then the real conversation follows.
  const opener =
    `${SYSTEM_PROMPT}\n\n【鞋款目录】(节选，按评分排序)：\n${catalogDigest(opts.shoes)}` +
    (profile ? `\n\n【用户档案】\n${profile}` : "") +
    langLine;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: opener },
    { role: "assistant", content: zh ? "好的，我记住你的情况了，随时问我。" : "Got it — I've noted your profile. Ask me anything." }
  ];
  for (const turn of opts.history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: opts.message });
  return messages;
}

export type AdvisorResult = { text: string };

// Stream the advisor's reply, forwarding each text delta via onDelta. Falls back
// to a single non-streaming completion if the relay rejects stream params (some
// models do), so the caller always gets the full text back either way.
export async function streamAdvice(
  client: OpenAI,
  opts: AdvisorOpts,
  onDelta: (chunk: string) => void
): Promise<AdvisorResult> {
  const messages = buildMessages(opts);
  // Both attempts are bounded by what's left of the turn: a relay that accepts
  // the request and then stalls must not outlive the function's duration limit,
  // or the user loses the whole answer to a dropped connection.
  const reqOpts = callOptions(opts.deadline);

  try {
    const stream = await client.chat.completions.create(
      {
        model: opts.model,
        messages,
        temperature: 0.7,
        max_tokens: 900,
        stream: true
      },
      reqOpts
    );
    let text = "";
    for await (const chunk of stream) {
      // `timeout` above only covers time-to-first-byte; stop reading at the
      // turn's deadline so a stalled relay can't outlive the function and take
      // the already-streamed answer down with it. Breaking aborts the stream.
      if (!hasBudget(opts.deadline, 0)) break;
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        text += delta;
        onDelta(delta);
      }
    }
    if (text.trim()) return { text: text.trim() };
    // Empty stream — fall through to the non-streaming attempt below.
  } catch {
    // Streaming unsupported / rejected — fall back to a plain completion.
  }

  const completion = await client.chat.completions.create(
    {
      model: opts.model,
      messages,
      temperature: 0.7,
      max_tokens: 900
    },
    callOptions(opts.deadline)
  );
  const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
  if (text) onDelta(text);
  return { text };
}
