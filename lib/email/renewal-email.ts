// Renders the pre-expiry renewal reminder email sent by the daily cron
// (app/api/cron/renewal-reminders/route.ts) via Resend. Self-contained HTML so
// it renders reliably across mail clients; mirrors the brand styling of the
// transactional auth emails without importing their private layout.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BRAND = "sneakerfeature";

export type RenewalEmailInput = {
  username: string | null;
  tier: string; // "pro" | "max"
  daysLeft: number;
  /** Absolute URL to the subscribe page. */
  subscribeUrl: string;
};

export function renderRenewalEmail(input: RenewalEmailInput): { subject: string; html: string } {
  const tierName = input.tier === "max" ? "Max" : "Pro";
  const hello = input.username ? `@${input.username}` : "there";
  const subject = `你的 ${tierName} 会员将在 ${input.daysLeft} 天后到期`;
  const preheader = `续费即可继续享受专属皮肤、逐款精准尺码与更强的 AI 模型。`;

  const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr><td align="center" style="padding:8px 0 24px;">
          <span style="font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#1d1d1f;">${BRAND}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:36px 40px;font-family:${FONT};color:#1d1d1f;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#b8912f;">会员到期提醒</p>
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;letter-spacing:-0.02em;">Hi ${hello}，你的 ${tierName} 会员还有 ${input.daysLeft} 天到期</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3a3a3c;">
            到期后会员皮肤、逐款精准尺码与更强的 AI 模型将暂停。现在续费即可无缝续接，不丢失你的专属设置。
          </p>
          <a href="${input.subscribeUrl}" style="display:inline-block;background:linear-gradient(135deg,#f0d488,#b8912f);color:#1a1305;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:12px;">立即续费</a>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8a8a8e;">
            如果你已续费或不再需要，请忽略本邮件。
          </p>
        </td></tr>
        <tr><td align="center" style="padding:20px 0;font-family:${FONT};font-size:12px;color:#8a8a8e;">
          ${BRAND}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
