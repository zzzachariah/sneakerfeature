import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushTokenSchema } from "@/lib/validation/schemas";

// Stores a device push token for the signed-in user so the weekly digest job
// can reach them. Tokens are unique; re-registering refreshes ownership/time.
export async function POST(request: Request) {
  const parsed = pushTokenSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: user.id,
      token: parsed.data.token,
      platform: parsed.data.platform,
      updated_at: new Date().toISOString()
    },
    { onConflict: "token" }
  );
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

// Removes a token (e.g. on sign-out or when notifications are disabled).
export async function DELETE(request: Request) {
  const parsed = pushTokenSchema.partial().safeParse(await request.json().catch(() => ({})));
  const token = parsed.success ? parsed.data.token : undefined;
  if (!token) return NextResponse.json({ ok: false, message: "token is required." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });

  const { error } = await supabase.from("push_tokens").delete().eq("user_id", user.id).eq("token", token);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
