import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPackyClient,
  PACKY_MODEL,
  getPackyEnvReport,
  describePackyEnvProblem,
  describePackyError
} from "@/lib/ai/packy-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AI prefill for a shoe's fit data. Returns a suggested structured record for
// the admin to review and save (never writes directly) — the "AI 预填 + 管理员审核"
// flow. Uses the base model with its general knowledge of sizing consensus.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, message: "Database unavailable." }, { status: 500 });
  const { data: shoe } = await db.from("shoes").select("brand, shoe_name, model_line, version_name").eq("id", id).maybeSingle();
  if (!shoe) return NextResponse.json({ ok: false, message: "Shoe not found." }, { status: 404 });

  const client = createPackyClient();
  if (!client) {
    return NextResponse.json({ ok: false, message: describePackyEnvProblem(getPackyEnvReport()) }, { status: 503 });
  }

  const name = [shoe.brand, shoe.model_line, shoe.shoe_name, shoe.version_name].filter(Boolean).join(" ");
  const prompt =
    `你是篮球鞋尺码专家。根据公认的评测与用户共识，判断这双鞋的尺码特性：「${name}」。\n` +
    `只返回一个 JSON 对象，字段如下，不要任何多余文字或 markdown：\n` +
    `{\n` +
    `  "length_bias": "runs_small" | "true_to_size" | "runs_large",  // 长度偏小/标准/偏大\n` +
    `  "adjust_half_sizes": 0 | 1 | 2,  // 建议调整的半码数（0=标准, 1=半码, 2=一码）\n` +
    `  "width_fit": "narrow" | "standard" | "wide",  // 楦型宽窄\n` +
    `  "volume": "low" | "medium" | "high",  // 内部空间/脚背容积\n` +
    `  "confidence": "low" | "medium" | "high",  // 你对以上判断的把握\n` +
    `  "notes_zh": "一句话中文尺码建议，20字以内"\n` +
    `}\n` +
    `如果对这双鞋不了解，就返回 true_to_size / standard / medium / low，并在 notes_zh 里说明信息有限。`;

  try {
    const completion = await client.chat.completions.create({
      model: PACKY_MODEL,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }]
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const oneOf = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
      typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : fallback;
    const half = Number(parsed.adjust_half_sizes);

    const suggestion = {
      length_bias: oneOf(parsed.length_bias, ["runs_small", "true_to_size", "runs_large"], "true_to_size"),
      adjust_half_sizes: Number.isFinite(half) ? Math.min(4, Math.max(0, Math.round(half))) : 0,
      width_fit: oneOf(parsed.width_fit, ["narrow", "standard", "wide"], "standard"),
      volume: oneOf(parsed.volume, ["low", "medium", "high"], "medium"),
      confidence: oneOf(parsed.confidence, ["low", "medium", "high"], "low"),
      notes_zh: typeof parsed.notes_zh === "string" ? parsed.notes_zh.slice(0, 120) : null,
      source: "ai" as const
    };
    return NextResponse.json({ ok: true, suggestion });
  } catch (error) {
    console.error("[admin/shoes/fit/ai] failed", error);
    return NextResponse.json({ ok: false, message: `AI 预填失败：${describePackyError(error)}` }, { status: 502 });
  }
}
