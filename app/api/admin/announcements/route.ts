import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import {
  DURATION_OPTIONS,
  FREQUENCY_OPTIONS,
  deleteHistoryEntry,
  getAnnouncementHistory,
  getCurrentAnnouncement,
  publishAnnouncement,
  takeDownCurrentAnnouncement,
  updateCurrentAnnouncement,
  updateHistoryEntry
} from "@/lib/admin/announcements";

export const dynamic = "force-dynamic";

const durationEnum = z.enum(DURATION_OPTIONS);
const frequencyEnum = z.enum(FREQUENCY_OPTIONS);

const publishSchema = z.object({
  action: z.literal("publish"),
  title: z.string().min(1).max(280),
  body: z.string().min(1).max(4000),
  buttonLabel: z.string().max(120).optional(),
  buttonUrl: z.string().max(2000).optional(),
  titleZh: z.string().max(280).optional(),
  bodyZh: z.string().max(4000).optional(),
  buttonLabelZh: z.string().max(120).optional(),
  duration: durationEnum.optional(),
  frequency: frequencyEnum.optional(),
  dismissible: z.boolean().optional()
});

const editSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  body: z.string().min(1).max(4000).optional(),
  buttonLabel: z.string().max(120).optional(),
  buttonUrl: z.string().max(2000).optional(),
  titleZh: z.string().max(280).optional(),
  bodyZh: z.string().max(4000).optional(),
  buttonLabelZh: z.string().max(120).optional(),
  duration: durationEnum.optional(),
  frequency: frequencyEnum.optional(),
  dismissible: z.boolean().optional(),
  enabled: z.boolean().optional()
});

const updateCurrentSchema = editSchema.extend({ action: z.literal("update_current") });
const updateHistorySchema = editSchema.extend({
  action: z.literal("update_history"),
  id: z.string().min(1)
});
const takedownSchema = z.object({ action: z.literal("takedown") });
const deleteSchema = z.object({ action: z.literal("delete_history"), id: z.string().min(1) });

const schema = z.discriminatedUnion("action", [
  publishSchema,
  updateCurrentSchema,
  updateHistorySchema,
  takedownSchema,
  deleteSchema
]);

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const [current, history] = await Promise.all([
    getCurrentAnnouncement(),
    getAnnouncementHistory()
  ]);
  return NextResponse.json({ ok: true, current, history });
}

export async function POST(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

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

  try {
    const data = parsed.data;
    if (data.action === "publish") {
      const fresh = await publishAnnouncement(
        {
          title: data.title,
          body: data.body,
          buttonLabel: data.buttonLabel,
          buttonUrl: data.buttonUrl,
          titleZh: data.titleZh,
          bodyZh: data.bodyZh,
          buttonLabelZh: data.buttonLabelZh,
          duration: data.duration,
          frequency: data.frequency,
          dismissible: data.dismissible
        },
        ctx.userId
      );
      return NextResponse.json({ ok: true, current: fresh });
    }
    if (data.action === "update_current") {
      const updated = await updateCurrentAnnouncement(
        {
          title: data.title,
          body: data.body,
          buttonLabel: data.buttonLabel,
          buttonUrl: data.buttonUrl,
          titleZh: data.titleZh,
          bodyZh: data.bodyZh,
          buttonLabelZh: data.buttonLabelZh,
          duration: data.duration,
          frequency: data.frequency,
          dismissible: data.dismissible,
          enabled: data.enabled
        },
        ctx.userId
      );
      return NextResponse.json({ ok: true, current: updated });
    }
    if (data.action === "update_history") {
      const updated = await updateHistoryEntry(
        data.id,
        {
          title: data.title,
          body: data.body,
          buttonLabel: data.buttonLabel,
          buttonUrl: data.buttonUrl,
          titleZh: data.titleZh,
          bodyZh: data.bodyZh,
          buttonLabelZh: data.buttonLabelZh,
          duration: data.duration,
          frequency: data.frequency,
          dismissible: data.dismissible,
          enabled: data.enabled
        },
        ctx.userId
      );
      if (!updated) {
        return NextResponse.json({ ok: false, message: "History entry not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, entry: updated });
    }
    if (data.action === "takedown") {
      await takeDownCurrentAnnouncement(ctx.userId);
      return NextResponse.json({ ok: true });
    }
    if (data.action === "delete_history") {
      const removed = await deleteHistoryEntry(data.id, ctx.userId);
      if (!removed) {
        return NextResponse.json({ ok: false, message: "History entry not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, message: "Unsupported action." }, { status: 400 });
  } catch (e) {
    console.error("[admin/announcements] update failed", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Update failed." },
      { status: 500 }
    );
  }
}
