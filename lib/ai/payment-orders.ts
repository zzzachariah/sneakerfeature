import { createAdminClient } from "@/lib/supabase/admin";
import { getPackage } from "@/lib/ai/packages";
import { grantCredits } from "@/lib/ai/credits";
import { matchAmount, matchVerificationCode, ocrImage, type OcrResult } from "@/lib/ai/ocr";

export const PAYMENT_ORDER_TTL_MIN = 5;
export const SCREENSHOT_BUCKET = "payment-screenshots";

export type PaymentMethod = "wechat" | "alipay";

export type PaymentOrderStatus =
  | "pending"
  | "submitted"
  | "auto_approved"
  | "manual_approved"
  | "rejected"
  | "expired";

export type PaymentOrder = {
  id: string;
  user_id: string;
  package_id: string;
  package_label: string;
  credits: number;
  amount_yuan: number;
  verification_code: string;
  payment_method: PaymentMethod;
  status: PaymentOrderStatus;
  screenshot_path: string | null;
  ocr_raw_text: string | null;
  ocr_amount_match: boolean | null;
  ocr_code_match: boolean | null;
  ocr_error: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  expires_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

function generateCode(): string {
  return Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
}

export async function createPaymentOrder(input: {
  userId: string;
  packageId: string;
  paymentMethod: PaymentMethod;
}): Promise<{ ok: true; order: PaymentOrder } | { ok: false; message: string }> {
  const pkg = getPackage(input.packageId);
  if (!pkg) return { ok: false, message: "Unknown package." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Service-role client unavailable." };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_ORDER_TTL_MIN * 60_000);

  const { data, error } = await admin
    .from("ai_payment_orders")
    .insert({
      user_id: input.userId,
      package_id: pkg.id,
      package_label: pkg.label,
      credits: pkg.credits,
      amount_yuan: pkg.priceYuan,
      verification_code: generateCode(),
      payment_method: input.paymentMethod,
      status: "pending" as PaymentOrderStatus,
      expires_at: expiresAt.toISOString()
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[payment-orders] insert failed", error);
    return { ok: false, message: "Failed to create payment order." };
  }
  return { ok: true, order: data as PaymentOrder };
}

export async function getPaymentOrderForUser(orderId: string, userId: string): Promise<PaymentOrder | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("ai_payment_orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as PaymentOrder) ?? null;
}

// Submit a screenshot for an order. Runs OCR; if both the expected amount and
// verification code are detected, auto-approves and grants credits. Otherwise
// leaves the order in "submitted" status for manual admin review.
export async function submitPaymentScreenshot(input: {
  userId: string;
  orderId: string;
  fileBytes: Uint8Array;
  filename: string;
  mimeType: string;
}): Promise<
  | { ok: true; status: "auto_approved"; balance: number; credits: number }
  | { ok: true; status: "submitted"; reason: "amount_mismatch" | "code_mismatch" | "ocr_failed" | "no_match" }
  | { ok: false; message: string; code?: "not_found" | "expired" | "already_submitted" | "storage" | "db" }
> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Service-role client unavailable." };

  const order = await getPaymentOrderForUser(input.orderId, input.userId);
  if (!order) return { ok: false, message: "Order not found.", code: "not_found" };

  if (order.status !== "pending") {
    return { ok: false, message: "This order has already been submitted.", code: "already_submitted" };
  }
  if (new Date(order.expires_at).getTime() < Date.now()) {
    await admin
      .from("ai_payment_orders")
      .update({ status: "expired" as PaymentOrderStatus, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    return { ok: false, message: "Order has expired. Please start a new payment.", code: "expired" };
  }

  // Store the screenshot in a private bucket. Path: <user>/<order>-<timestamp>.<ext>
  const ext = input.filename.toLowerCase().endsWith(".png") || input.mimeType.includes("png") ? "png" : "jpg";
  const storagePath = `${input.userId}/${order.id}-${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from(SCREENSHOT_BUCKET)
    .upload(storagePath, input.fileBytes, { contentType: input.mimeType, upsert: false });
  if (uploadError) {
    console.error("[payment-orders] storage upload failed", uploadError);
    return { ok: false, message: "Failed to upload screenshot.", code: "storage" };
  }

  const ocr: OcrResult = await ocrImage(input.fileBytes, `${order.id}.${ext}`);
  const submittedAt = new Date().toISOString();

  if (!ocr.ok) {
    const { error } = await admin
      .from("ai_payment_orders")
      .update({
        status: "submitted" as PaymentOrderStatus,
        screenshot_path: storagePath,
        ocr_error: ocr.error,
        ocr_amount_match: null,
        ocr_code_match: null,
        ocr_raw_text: null,
        submitted_at: submittedAt,
        updated_at: submittedAt
      })
      .eq("id", order.id);
    if (error) {
      console.error("[payment-orders] update after OCR-fail failed", error);
      return { ok: false, message: "Failed to record submission.", code: "db" };
    }
    return { ok: true, status: "submitted", reason: "ocr_failed" };
  }

  const amountOk = matchAmount(ocr.text, order.amount_yuan);
  const codeOk = matchVerificationCode(ocr.text, order.verification_code);

  if (amountOk && codeOk) {
    // Auto-approve. Grant credits and mark the order approved in one update.
    const balance = await grantCredits(order.user_id, order.credits, `auto:${order.package_label}`);
    const approvedAt = new Date().toISOString();
    const { error } = await admin
      .from("ai_payment_orders")
      .update({
        status: "auto_approved" as PaymentOrderStatus,
        screenshot_path: storagePath,
        ocr_raw_text: ocr.text,
        ocr_amount_match: true,
        ocr_code_match: true,
        ocr_error: null,
        submitted_at: submittedAt,
        approved_at: approvedAt,
        updated_at: approvedAt
      })
      .eq("id", order.id);
    if (error) {
      console.error("[payment-orders] update after auto-approve failed", error);
      // Credits already granted; surface success but log the issue.
    }
    return { ok: true, status: "auto_approved", balance, credits: order.credits };
  }

  // Either amount or code did not match — manual review.
  const { error } = await admin
    .from("ai_payment_orders")
    .update({
      status: "submitted" as PaymentOrderStatus,
      screenshot_path: storagePath,
      ocr_raw_text: ocr.text,
      ocr_amount_match: amountOk,
      ocr_code_match: codeOk,
      ocr_error: null,
      submitted_at: submittedAt,
      updated_at: submittedAt
    })
    .eq("id", order.id);
  if (error) {
    console.error("[payment-orders] update after partial-match failed", error);
    return { ok: false, message: "Failed to record submission.", code: "db" };
  }
  const reason = !amountOk && !codeOk ? "no_match" : !amountOk ? "amount_mismatch" : "code_mismatch";
  return { ok: true, status: "submitted", reason };
}

export async function approvePaymentOrderManually(input: {
  orderId: string;
  adminUserId: string;
}): Promise<{ ok: true; balance: number; credits: number } | { ok: false; message: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Service-role client unavailable." };

  const { data } = await admin
    .from("ai_payment_orders")
    .select("*")
    .eq("id", input.orderId)
    .maybeSingle();
  const order = data as PaymentOrder | null;
  if (!order) return { ok: false, message: "Order not found." };

  if (order.status === "auto_approved" || order.status === "manual_approved") {
    return { ok: false, message: "Order already approved." };
  }
  if (order.status === "rejected") {
    return { ok: false, message: "Order already rejected." };
  }

  const balance = await grantCredits(order.user_id, order.credits, `manual:${order.package_label}`);
  const approvedAt = new Date().toISOString();
  const { error } = await admin
    .from("ai_payment_orders")
    .update({
      status: "manual_approved" as PaymentOrderStatus,
      reviewed_by: input.adminUserId,
      reviewed_at: approvedAt,
      approved_at: approvedAt,
      updated_at: approvedAt
    })
    .eq("id", order.id);
  if (error) {
    console.error("[payment-orders] manual approve update failed", error);
  }
  return { ok: true, balance, credits: order.credits };
}

export async function rejectPaymentOrder(input: {
  orderId: string;
  adminUserId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Service-role client unavailable." };

  const { data } = await admin
    .from("ai_payment_orders")
    .select("status")
    .eq("id", input.orderId)
    .maybeSingle();
  const status = data?.status as PaymentOrderStatus | undefined;
  if (!status) return { ok: false, message: "Order not found." };
  if (status === "auto_approved" || status === "manual_approved") {
    return { ok: false, message: "Cannot reject an already-approved order." };
  }
  if (status === "rejected") return { ok: false, message: "Order already rejected." };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("ai_payment_orders")
    .update({
      status: "rejected" as PaymentOrderStatus,
      rejection_reason: input.reason.trim() || "No reason provided.",
      reviewed_by: input.adminUserId,
      reviewed_at: now,
      updated_at: now
    })
    .eq("id", input.orderId);
  if (error) {
    console.error("[payment-orders] reject update failed", error);
    return { ok: false, message: "Failed to reject order." };
  }
  return { ok: true };
}
