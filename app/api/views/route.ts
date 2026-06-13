import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordViewSchema } from "@/lib/validation/schemas";

// Records that the signed-in user viewed a shoe (recency + count). Feeds the
// weekly personalized recommendations. No-ops for signed-out visitors.
export async function POST(request: Request) {
  const parsed = recordViewSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: true });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true });

  const { error } = await supabase.rpc("record_shoe_view", { p_shoe_id: parsed.data.shoeId });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
