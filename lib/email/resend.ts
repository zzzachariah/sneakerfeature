// Minimal Resend HTTP API sender shared by the Supabase Send Email hook and the
// app's own signup verification mail.

export type SendResult = { ok: true } | { ok: false; status: number; detail: string };

export function emailFrom(): string {
  return process.env.EMAIL_FROM || "sneakerfeature <noreply@snkrfeature.com>";
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, status: 0, detail: "RESEND_API_KEY is not set" };
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: emailFrom(), to: [input.to], subject: input.subject, html: input.html }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    return { ok: false, status: 0, detail: "Could not reach the email provider." };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail };
  }
  return { ok: true };
}
