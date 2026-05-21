import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SCREENSHOT_BUCKET } from "@/lib/ai/payment-orders";

export const runtime = "nodejs";

// Proxy the private screenshot through the server using the service-role
// client. Admins fetch via this endpoint instead of getting a public URL so
// the bucket can stay private.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return new NextResponse("Forbidden", { status: 403 });

  const admin = createAdminClient();
  if (!admin) return new NextResponse("Service unavailable", { status: 500 });

  const { id } = await params;
  const { data: order } = await admin
    .from("ai_payment_orders")
    .select("screenshot_path")
    .eq("id", id)
    .maybeSingle();
  if (!order?.screenshot_path) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await admin.storage.from(SCREENSHOT_BUCKET).download(order.screenshot_path);
  if (error || !data) {
    console.error("[admin/payments/screenshot] download failed", error);
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = order.screenshot_path.toLowerCase().endsWith(".png") ? "png" : "jpeg";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": `image/${ext}`,
      "Cache-Control": "private, max-age=300"
    }
  });
}
