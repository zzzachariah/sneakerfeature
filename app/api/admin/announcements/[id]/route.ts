import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import {
  deleteAnnouncement,
  getAnnouncement,
  updateAnnouncement,
} from "@/lib/announcements/store";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  duration: z.enum(["1 day", "3 days", "1 week", "2 weeks", "1 month", "forever"]).optional(),
  frequency: z.enum(["once", "session", "always"]).optional(),
  dismissible: z.boolean().optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(4000).optional(),
  buttonLabel: z.string().max(80).optional(),
  buttonUrl: z.string().max(2000).optional(),
  titleZh: z.string().max(200).optional(),
  bodyZh: z.string().max(4000).optional(),
  buttonLabelZh: z.string().max(80).optional(),
  // When true, treat this update as a re-publish: reset published_at to now
  // and recompute the expiry from the new duration.
  extendExpiry: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const existing = await getAnnouncement(id);
  if (!existing) {
    return NextResponse.json({ ok: false, message: "Announcement not found." }, { status: 404 });
  }

  try {
    const item = await updateAnnouncement(id, parsed.data, ctx.userId);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error("[admin/announcements] update failed", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Update failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await deleteAnnouncement(id, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/announcements] delete failed", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Delete failed." },
      { status: 500 }
    );
  }
}
