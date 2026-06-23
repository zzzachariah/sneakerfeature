import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordAnnouncementView } from "@/lib/announcements/views";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // 36-char uuid (with hyphens) or empty when the visitor is logged in.
  clientId: z.string().min(1).max(64).optional(),
});

/**
 * Visitors' announcement-popup component POSTs to this endpoint once when a
 * given announcement first appears for them. We dedupe by (user_id) for
 * logged-in viewers and by (client_id) for anonymous ones.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  let parsed: { clientId?: string } = {};
  try {
    parsed = bodySchema.parse(await request.json().catch(() => ({})));
  } catch {
    // Treat malformed bodies as anonymous-no-client-id; recordAnnouncementView
    // bails when there's no identifier, so we just no-op.
  }

  let userId: string | null = null;
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  await recordAnnouncementView({
    announcementId: id,
    userId,
    clientId: parsed.clientId ?? null,
  });
  return NextResponse.json({ ok: true });
}
