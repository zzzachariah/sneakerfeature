import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/auth";
import { submitPaymentScreenshot } from "@/lib/ai/payment-orders";

export const runtime = "nodejs";
// OCR + storage upload are I/O heavy; bump the limit to be safe.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid multipart body." }, { status: 400 });
  }

  const orderId = form.get("orderId");
  const file = form.get("screenshot");
  if (typeof orderId !== "string" || !orderId) {
    return NextResponse.json({ ok: false, message: "Missing orderId." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Missing screenshot file." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, message: `Screenshot must be 1 byte – ${MAX_BYTES / (1024 * 1024)} MB.` },
      { status: 400 }
    );
  }
  const mime = file.type || "image/jpeg";
  if (!mime.startsWith("image/")) {
    return NextResponse.json({ ok: false, message: "Screenshot must be an image." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await submitPaymentScreenshot({
    userId: user.id,
    orderId,
    fileBytes: bytes,
    filename: file.name || "screenshot.jpg",
    mimeType: mime
  });

  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "expired" || result.code === "already_submitted" ? 409 : 500;
    return NextResponse.json({ ok: false, message: result.message, code: result.code }, { status });
  }

  if (result.status === "auto_approved") {
    return NextResponse.json({
      ok: true,
      status: result.status,
      balance: result.balance,
      credits: result.credits
    });
  }
  return NextResponse.json({ ok: true, status: result.status, reason: result.reason });
}
