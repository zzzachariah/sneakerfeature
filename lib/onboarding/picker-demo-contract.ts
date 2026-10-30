import { z } from "zod";
import { POSITIONS } from "@/lib/persona/types";
import { DIM_KEYS, DIM_LABELS, type DimKey } from "@/lib/star-rating";
import type { WebReference } from "@/lib/ai/types";

export const demoInputSchema = z.object({
  positions: z.array(z.enum(POSITIONS)).length(2),
  priorities: z.array(z.enum(DIM_KEYS)).length(3),
  shoeIds: z.array(z.uuid()).length(2),
  lang: z.enum(["zh", "en"])
}).strict().refine(v => [v.positions, v.priorities, v.shoeIds].every(a => new Set(a).size === a.length));
export type DemoInput = z.infer<typeof demoInputSchema>;
export const PRIORITY_ZH: Record<DimKey, string> = { cushioning_feel: "缓震脚感", court_feel: "贴地感", bounce: "回弹", stability: "稳定性", traction: "抓地力", fit: "包裹贴合" };
export function priorityName(key: DimKey, zh: boolean) { return zh ? PRIORITY_ZH[key] : DIM_LABELS[key]; }
export function demoPrompt(input: DemoInput, names: string[]) {
  const priorities = input.priorities.map((key, i) => `${i + 1}. ${priorityName(key, input.lang === "zh")}`).join(" > ");
  return input.lang === "zh"
    ? `我在场上打 ${input.positions.join(" / ")}，我的优先顺序是 ${priorities}。我刚刚对 ${names.join(" 和 ")} 感兴趣。请以它们为兴趣参考，从 snkrfeature 目录中为我推荐两双篮球鞋，不必只限于这两双。说明每双如何回应我的三个重点、需要接受的取舍，以及可核对的资料依据。我没有提供场地、身高、体重或脚型，不要假设这些信息。`
    : `I play ${input.positions.join(" / ")}. My priorities, in order: ${priorities}. I was interested in ${names.join(" and ")}. Use those as context and recommend two basketball shoes from the snkrfeature catalog; you may recommend other models. Explain each shoe against my three priorities, its trade-offs and the evidence I can check. I have not supplied my court, height, weight or foot shape; do not assume them.`;
}
export type DemoStage = "catalog" | "shortlist" | "research" | "writing";
export type DemoEvent = {
  id: number; at: string; stage: DemoStage; kind: "status" | "candidates" | "search";
  candidates?: {name: string; slug: string}[]; catalogCount?: number;
  query?: string; state?: "start" | "ok" | "fail"; resultCount?: number; cached?: boolean; sources?: WebReference[];
};
export type DemoShoe = { id: string; slug: string; name: string; brand: string; image: string | null; reason: string; pros: string[]; cons: string[]; references: WebReference[] };
export type DemoSnapshot = {
  status: "idle" | "running" | "complete" | "failed";
  startedAt?: string; input?: DemoInput; prompt?: string; events: DemoEvent[];
  interests?: Pick<DemoShoe,"id"|"name"|"slug"|"image">[];
  shoes?: DemoShoe[]; retryable?: boolean; error?: string;
};
export function safeReferences(values: WebReference[] = []): WebReference[] {
  return values.flatMap(item => { try { const url = new URL(item.url); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? [{title: String(item.title).slice(0, 180), url: url.href}] : []; } catch { return []; } }).slice(0, 6);
}
