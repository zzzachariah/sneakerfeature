import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { personaSchema } from "@/lib/validation/schemas";
import { isValidPersona } from "@/lib/persona/types";
import { getMemberContext } from "@/lib/subscription/entitlements";
import { isPaidTier } from "@/lib/subscription/tiers";

function invalidateFeedViews() {
  revalidatePath("/", "layout");
}

async function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // no-op in route handler
      }
    }
  });
}

export async function GET() {
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: true, persona: null });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: true, persona: null });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("persona")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  const raw = data?.persona;
  return NextResponse.json({ ok: true, persona: isValidPersona(raw) ? raw : null });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = personaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }

  // The injury deep questionnaire is a paid-tier entitlement: strip it from
  // free members' saves (rather than rejecting) so older clients and expired
  // members can still update the base profile.
  const persona = { ...parsed.data };
  if (persona.injuries !== undefined) {
    const member = await getMemberContext(user.id);
    if (!isPaidTier(member.tier)) delete persona.injuries;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ persona })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  invalidateFeedViews();
  return NextResponse.json({ ok: true, persona, message: "Profile saved." });
}

export async function DELETE() {
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ persona: null })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  invalidateFeedViews();
  return NextResponse.json({ ok: true, message: "Profile cleared." });
}
