/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearCreditsAsAdmin, getBalance, grantCredits } from "@/lib/ai/credits";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    username: z.string().min(1),
    credits: z.number().int().positive().max(100000),
    note: z.string().max(120).optional()
  }),
  z.object({
    action: z.literal("clear"),
    username: z.string().min(1),
    note: z.string().max(120).optional()
  })
]);

async function findUserIdByUsername(username: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  return data?.id ?? null;
}

export async function GET(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Service-role client unavailable." }, { status: 500 });

  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim();

  const { data, error } = await admin
    .from("ai_credits")
    .select("user_id, balance, updated_at, profiles!ai_credits_user_id_fkey(username, email)")
    .order("balance", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[admin/credits] list failed", error);
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  let rows = (data ?? []).map((row: any) => ({
    userId: row.user_id,
    balance: row.balance,
    updatedAt: row.updated_at,
    username: Array.isArray(row.profiles) ? row.profiles[0]?.username : row.profiles?.username,
    email: Array.isArray(row.profiles) ? row.profiles[0]?.email : row.profiles?.email
  }));
  if (search) {
    const lower = search.toLowerCase();
    rows = rows.filter((r) => (r.username ?? "").toLowerCase().includes(lower) || (r.email ?? "").toLowerCase().includes(lower));
  }

  return NextResponse.json({ ok: true, rows });
}

export async function POST(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const targetUserId = await findUserIdByUsername(parsed.data.username);
  if (!targetUserId) {
    return NextResponse.json({ ok: false, message: `User "${parsed.data.username}" not found.` }, { status: 404 });
  }

  try {
    if (parsed.data.action === "grant") {
      const label = parsed.data.note?.trim() || `admin_grant by ${ctx.username}`;
      const balance = await grantCredits(targetUserId, parsed.data.credits, label);
      return NextResponse.json({ ok: true, balance, granted: parsed.data.credits });
    }
    const note = parsed.data.note?.trim() || `cleared by ${ctx.username}`;
    const previous = await clearCreditsAsAdmin(targetUserId, note);
    return NextResponse.json({ ok: true, balance: await getBalance(targetUserId), previous });
  } catch (e) {
    console.error("[admin/credits] mutation failed", e);
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Mutation failed." }, { status: 500 });
  }
}
