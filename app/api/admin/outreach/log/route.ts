import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";

// Manual log entry: a date and a note, against exactly one creator or one
// channel. The database enforces the "exactly one owner" half
// (outreach_log_one_owner); this schema refuses it earlier so the operator
// gets a sentence instead of a constraint name.

const schema = z
  .object({
    creator_id: z.number().int().positive().nullable().optional(),
    channel_id: z.string().regex(/^C\d+$/).nullable().optional(),
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD."),
    note: z.string().min(1, "A log entry needs a note.").max(4000)
  })
  .refine(
    (v) => (v.creator_id != null) !== (v.channel_id != null),
    "A log entry belongs to exactly one creator or one channel."
  );

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

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

  const { error } = await auth.supabase.from("outreach_log").insert({
    creator_id: parsed.data.creator_id ?? null,
    channel_id: parsed.data.channel_id ?? null,
    entry_date: parsed.data.entry_date,
    action: null,
    note: parsed.data.note
  });

  if (error) {
    console.error("[admin/outreach/log] insert failed", error);
    return NextResponse.json({ ok: false, message: "Could not save the log entry." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
