/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Service-role client unavailable." }, { status: 500 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

  let query = admin
    .from("ai_payment_orders")
    .select("*, profiles!ai_payment_orders_user_id_fkey(username, email)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && ["pending", "submitted", "auto_approved", "manual_approved", "rejected", "expired"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/payments] list failed", error);
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const orders = (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    username: Array.isArray(row.profiles) ? row.profiles[0]?.username : row.profiles?.username,
    email: Array.isArray(row.profiles) ? row.profiles[0]?.email : row.profiles?.email,
    packageId: row.package_id,
    packageLabel: row.package_label,
    credits: row.credits,
    amountYuan: Number(row.amount_yuan),
    verificationCode: row.verification_code,
    paymentMethod: row.payment_method,
    status: row.status,
    hasScreenshot: Boolean(row.screenshot_path),
    ocrRawText: row.ocr_raw_text,
    ocrAmountMatch: row.ocr_amount_match,
    ocrCodeMatch: row.ocr_code_match,
    ocrError: row.ocr_error,
    rejectionReason: row.rejection_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    createdAt: row.created_at
  }));

  return NextResponse.json({ ok: true, orders });
}
