import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
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

const PERSONA_READ_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function personaReadError(code: string, message: string, status: number, retryable = false) {
  // Keep errors distinct from the successful "not set up yet" response. In
  // particular, never send persona:null as if a failed read found an empty row.
  return NextResponse.json({ ok: false, code, message, retryable }, { status, headers: PERSONA_READ_HEADERS });
}

export async function GET() {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return personaReadError("not_configured", "Your player profile is temporarily unavailable. Please try again later.", 503, true);
    }

    // getUser verifies the session with Auth. A network outage must not look
    // like an expired session or like a member who never filled in a profile.
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
      const unavailable = !isAuthSessionMissingError(authError) &&
        (!authError.status || authError.status >= 500 || authError.status === 429);
      return unavailable
        ? personaReadError("auth_unavailable", "Your account could not be verified right now. Please retry.", 503, true)
        : personaReadError("authentication_required", "Your session has expired. Please sign in again.", 401);
    }
    if (!auth.user) {
      return personaReadError("authentication_required", "Please sign in to load your player profile.", 401);
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("persona")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) {
      return personaReadError("profile_unavailable", "Your player profile could not be loaded. Please retry.", 503, true);
    }
    if (!data) {
      // Auth creation and the profile insert are separate operations. The
      // onboarding recovery flow can repair that case after verified sign-in.
      return personaReadError("profile_recovery_required", "Your account exists, but profile setup is unfinished. Return to account setup to continue.", 409);
    }

    const raw = data.persona;
    if (raw !== null && !isValidPersona(raw)) {
      return personaReadError("persona_invalid", "Your saved player profile needs attention. Please review it before continuing.", 422);
    }
    // Existing consumers retain the same successful response shape. An
    // existing profile row with an explicitly unset persona is the only null.
    return NextResponse.json({ ok: true, persona: raw }, { headers: PERSONA_READ_HEADERS });
  } catch {
    return personaReadError("profile_unavailable", "Your player profile could not be loaded. Please retry.", 503, true);
  }
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
