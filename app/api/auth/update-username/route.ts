import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const updateUsernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username must be 20 characters or fewer.")
});

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("duplicate") || message.includes("unique");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = updateUsernameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const username = parsed.data.username;

  const supabase = await createServerClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Service role key is not configured." }, { status: 400 });

  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .neq("id", user.id)
    .maybeSingle();

  if (taken) {
    return NextResponse.json({ ok: false, message: "That username is already taken." }, { status: 409 });
  }

  const { error: updateError } = await admin.from("profiles").update({ username }).eq("id", user.id);

  if (updateError) {
    if (isUniqueViolation(updateError)) {
      return NextResponse.json({ ok: false, message: "That username is already taken." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Username updated successfully.", username });
}
