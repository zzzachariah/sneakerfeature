import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ enabled: z.boolean() });

// Reads the personalized-push opt-out flag for the signed-in user.
export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: true, enabled: true });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true, enabled: true });

  const { data, error } = await supabase
    .from("profiles")
    .select("personalized_push_enabled")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, enabled: data?.personalized_push_enabled ?? true });
}

// Turns the weekly personalized recommendation push on or off.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });

  const { error } = await supabase
    .from("profiles")
    .update({ personalized_push_enabled: parsed.data.enabled })
    .eq("id", user.id);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
