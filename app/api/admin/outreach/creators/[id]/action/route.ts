import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { VERIFICATION_STATES } from "@/lib/outreach/types";

// Quick actions. Each one delegates to a Postgres function from migration 048
// so the several fields it touches AND the log row it writes commit or roll
// back together. There is deliberately no route here that advances a stage
// without also writing its date — that combination silently disables the
// follow-up timer, which is how a record ends up nagged forever or never.
//
// The verification gate and the wave gate are enforced inside those functions
// too, so this endpoint cannot be used to send to an unverified contact even
// with a hand-rolled request.

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sent"), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal("followed_up"), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal("replied"), note: z.string().max(2000).optional() }),
  z.object({
    action: z.literal("verify"),
    verified: z.enum(VERIFICATION_STATES),
    verify_note: z.string().max(2000).nullable().optional()
  })
]);

/** Postgres SQLSTATEs the functions raise on purpose: a refused domain rule is
 *  the caller's fault (400), not a server fault (500). */
const DOMAIN_ERROR_CODES = new Set(["23514", "P0002"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const { id } = await params;
  const creatorId = Number(id);
  if (!Number.isInteger(creatorId)) {
    return NextResponse.json({ ok: false, message: "Invalid creator id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const { error } =
    input.action === "verify"
      ? await auth.supabase.rpc("outreach_set_verified", {
          p_creator_id: creatorId,
          p_verified: input.verified,
          p_verify_note: input.verify_note ?? null
        })
      : await auth.supabase.rpc(
          input.action === "sent"
            ? "outreach_mark_sent"
            : input.action === "followed_up"
              ? "outreach_mark_followed_up"
              : "outreach_mark_replied",
          { p_creator_id: creatorId, p_note: input.note ?? null }
        );

  if (error) {
    // The refusal messages are written for the operator ("not verified — contact
    // must be confirmed on a public page before sending") and carry no personal
    // data, so passing them through is useful rather than leaky.
    if (DOMAIN_ERROR_CODES.has(error.code ?? "")) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("[admin/outreach/action] failed", error);
    return NextResponse.json({ ok: false, message: "Action failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
