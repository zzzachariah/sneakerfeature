import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import { createAnnouncement, listAnnouncements } from "@/lib/announcements/store";

const inputSchema = z.object({
  enabled: z.boolean().default(true),
  duration: z.enum(["1 day", "3 days", "1 week", "2 weeks", "1 month", "forever"]),
  frequency: z.enum(["once", "session", "always"]),
  dismissible: z.boolean().default(true),
  title: z.string().max(200).default(""),
  body: z.string().max(4000).default(""),
  buttonLabel: z.string().max(80).default(""),
  buttonUrl: z.string().max(2000).default(""),
  titleZh: z.string().max(200).default(""),
  bodyZh: z.string().max(4000).default(""),
  buttonLabelZh: z.string().max(80).default(""),
});

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  const items = await listAnnouncements();
  return NextResponse.json({ ok: true, items });
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
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  if (!parsed.data.title && !parsed.data.titleZh) {
    return NextResponse.json(
      { ok: false, message: "Provide a title (English or 中文)." },
      { status: 400 }
    );
  }

  try {
    const item = await createAnnouncement(parsed.data, ctx.userId);
    revalidateTag("announcements");
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error("[admin/announcements] create failed", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Create failed." },
      { status: 500 }
    );
  }
}
