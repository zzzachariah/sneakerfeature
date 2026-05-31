// Server-side renderers for the transactional auth emails, used by the Supabase
// "Send Email" hook (app/api/auth/send-email-hook/route.ts) when auth mail is
// routed through Resend's HTTP API instead of Supabase SMTP.
//
// These mirror the dashboard templates in supabase/templates/*.html. The two are
// alternative delivery paths: use the hook (these) OR Supabase SMTP + the .html
// templates — not both at once.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BRAND = "sneakerfeature";

export type AuthEmailInput = {
  /** Pre-built verify/action URL (empty for code-only emails like reauthentication). */
  actionUrl: string;
  /** One-time code (used by reauthentication). */
  token: string;
};

export type RenderedEmail = { subject: string; html: string };

function layout(opts: { preheader: string; eyebrow: string; heading: string; content: string }): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${opts.heading}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { text-decoration: none; }
    .hover-shadow:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.18) !important; }
    @media (max-width: 620px) { .container { width: 100% !important; } .px { padding-left: 24px !important; padding-right: 24px !important; } }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f5f5f7;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${opts.preheader}</div>
  <div style="display:none; max-height:0; overflow:hidden;">&#8204;&#8203;&#8204;&#8203;&#8204;&#8203;&#8204;&#8203;&#8204;&#8203;&#8204;&#8203;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
          <tr>
            <td align="center" style="padding:8px 0 24px;">
              <span style="font-family:${FONT}; font-size:20px; font-weight:700; letter-spacing:-0.02em; color:#1d1d1f;">${BRAND}</span>
            </td>
          </tr>
          <tr>
            <td class="px" style="background-color:#ffffff; border:1px solid #e3e3e8; border-radius:20px; padding:40px 44px;">
              <p style="margin:0 0 14px; font-family:${FONT}; font-size:12px; font-weight:600; letter-spacing:0.16em; text-transform:uppercase; color:#86868b;">${opts.eyebrow}</p>
              <h1 style="margin:0 0 16px; font-family:${FONT}; font-size:26px; line-height:1.2; font-weight:700; letter-spacing:-0.02em; color:#1d1d1f;">${opts.heading}</h1>
              ${opts.content}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 24px 8px;">
              <p style="margin:0 0 4px; font-family:${FONT}; font-size:12px; line-height:1.5; color:#86868b;">${BRAND} · Sneakers scored to your game</p>
              <p style="margin:0; font-family:${FONT}; font-size:12px; line-height:1.5; color:#aeaeb2;">This is an automated message — please don't reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function intro(text: string): string {
  return `<p style="margin:0 0 28px; font-family:${FONT}; font-size:15px; line-height:1.6; color:#3a3a3c;">${text}</p>`;
}

function note(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #ededf0; font-size:0; line-height:0;">&nbsp;</td></tr></table>
              <p style="margin:24px 0 0; font-family:${FONT}; font-size:13px; line-height:1.6; color:#86868b;">${text}</p>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="padding:0 0 28px;">
                <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="25%" fillcolor="#1d1d1f" stroke="f"><w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600;">${label}</center></v:roundrect><![endif]-->
                <!--[if !mso]><!-- --><a class="hover-shadow" href="${url}" target="_blank" style="display:inline-block; background-color:#1d1d1f; color:#ffffff; font-family:${FONT}; font-size:15px; font-weight:600; line-height:48px; text-align:center; text-decoration:none; padding:0 36px; border-radius:12px;">${label}</a><!--<![endif]-->
              </td></tr></table>`;
}

function fallback(url: string): string {
  return `<p style="margin:0 0 8px; font-family:${FONT}; font-size:13px; line-height:1.6; color:#86868b;">Or paste this link into your browser:</p>
              <p style="margin:0 0 28px; font-family:${FONT}; font-size:13px; line-height:1.6; word-break:break-all;"><a href="${url}" target="_blank" style="color:#1d1d1f; text-decoration:underline;">${url}</a></p>`;
}

function codeBlock(token: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="padding:0 0 28px;">
                <div style="display:inline-block; background-color:#f5f5f7; border:1px solid #e3e3e8; border-radius:12px; padding:16px 28px; font-family:'SF Mono',SFMono-Regular,Consolas,Menlo,monospace; font-size:30px; font-weight:700; letter-spacing:0.3em; color:#1d1d1f;">${token}</div>
              </td></tr></table>`;
}

function linkEmail(opts: {
  subject: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  introText: string;
  label: string;
  noteText: string;
  actionUrl: string;
}): RenderedEmail {
  return {
    subject: opts.subject,
    html: layout({
      preheader: opts.preheader,
      eyebrow: opts.eyebrow,
      heading: opts.heading,
      content: intro(opts.introText) + button(opts.actionUrl, opts.label) + fallback(opts.actionUrl) + note(opts.noteText)
    })
  };
}

/**
 * Render the right branded email for a Supabase auth action type.
 * `type` is the `email_action_type` from the Send Email hook payload.
 */
export function renderAuthEmail(type: string, input: AuthEmailInput): RenderedEmail {
  switch (type) {
    case "recovery":
      return linkEmail({
        subject: `Reset your ${BRAND} password`,
        preheader: `Reset your ${BRAND} password — this link expires in 60 minutes and can only be used once.`,
        eyebrow: "Account security",
        heading: "Reset your password",
        introText: `We received a request to reset the password for your ${BRAND} account. Click the button below to choose a new password.`,
        label: "Reset password",
        noteText: `This link expires in <strong style="color:#3a3a3c;">60 minutes</strong> and can only be used once. If you didn't request a password reset, you can safely ignore this email — your password won't change.`,
        actionUrl: input.actionUrl
      });
    case "signup":
      return linkEmail({
        subject: `Confirm your ${BRAND} email`,
        preheader: `Confirm your ${BRAND} email to activate your account.`,
        eyebrow: "Welcome",
        heading: "Confirm your email",
        introText: `Thanks for joining ${BRAND}. Confirm your email address to activate your account and start rating, comparing, and discussing sneakers.`,
        label: "Confirm email",
        noteText: `If you didn't create a ${BRAND} account, you can safely ignore this email.`,
        actionUrl: input.actionUrl
      });
    case "magiclink":
    case "login":
      return linkEmail({
        subject: `Your ${BRAND} sign-in link`,
        preheader: `Your ${BRAND} sign-in link — expires in 60 minutes and can only be used once.`,
        eyebrow: "Sign in",
        heading: "Your sign-in link",
        introText: `Click the button below to sign in to ${BRAND}. No password needed.`,
        label: "Sign in",
        noteText: `This link expires in <strong style="color:#3a3a3c;">60 minutes</strong> and can only be used once. If you didn't try to sign in, you can safely ignore this email.`,
        actionUrl: input.actionUrl
      });
    case "email_change":
    case "email_change_new":
      return linkEmail({
        subject: `Confirm your new ${BRAND} email`,
        preheader: `Confirm your new email address for your ${BRAND} account.`,
        eyebrow: "Account security",
        heading: "Confirm your new email",
        introText: `We received a request to change the email address on your ${BRAND} account. Confirm this address to finish the update.`,
        label: "Confirm new email",
        noteText: `If you didn't request this change, you can safely ignore this email — your account email won't change.`,
        actionUrl: input.actionUrl
      });
    case "invite":
      return linkEmail({
        subject: `You're invited to ${BRAND}`,
        preheader: `You've been invited to join ${BRAND}.`,
        eyebrow: "Invitation",
        heading: `You're invited to ${BRAND}`,
        introText: `You've been invited to join ${BRAND}. Accept the invitation to set up your account and get started.`,
        label: "Accept invitation",
        noteText: `If you weren't expecting this invitation, you can safely ignore this email.`,
        actionUrl: input.actionUrl
      });
    case "reauthentication":
      return {
        subject: `Your ${BRAND} verification code`,
        html: layout({
          preheader: `Your ${BRAND} verification code.`,
          eyebrow: "Account security",
          heading: "Your verification code",
          content:
            `<p style="margin:0 0 24px; font-family:${FONT}; font-size:15px; line-height:1.6; color:#3a3a3c;">Enter this code to confirm it's you:</p>` +
            codeBlock(input.token) +
            note(`This code expires in <strong style="color:#3a3a3c;">60 minutes</strong>. If you didn't request it, you can safely ignore this email.`)
        })
      };
    default:
      // Unknown/future action type — fall back to a generic branded action email.
      return linkEmail({
        subject: `${BRAND} account notification`,
        preheader: `Action required for your ${BRAND} account.`,
        eyebrow: "Account",
        heading: `Confirm this action`,
        introText: `Click the button below to continue with your ${BRAND} account.`,
        label: "Continue",
        noteText: `If you didn't request this, you can safely ignore this email.`,
        actionUrl: input.actionUrl
      });
  }
}
