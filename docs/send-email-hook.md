# Auth "Send Email" hook → Resend HTTP API

By default Supabase sends auth emails (password reset, etc.) **synchronously over
SMTP**, which adds ~2–3s per send. This hook lets Supabase hand the email to our
own endpoint instead, which sends via **Resend's HTTP API** — much faster and more
reliable, and the verify links it builds work **cross-device** (no PKCE
same-browser limitation).

- Endpoint: `app/api/auth/send-email-hook/route.ts`
- Templates: `lib/email/auth-emails.ts` (mirror of `supabase/templates/*.html`)

> **Optional & inert until enabled.** Nothing changes until you point Supabase at
> this endpoint and set the env vars. If anything misbehaves, disable the hook in
> Supabase to instantly fall back to SMTP.

## How it works

1. Supabase calls `POST /api/auth/send-email-hook` with a signed payload
   (`user` + `email_data`).
2. We verify the **Standard Webhooks** signature with `SEND_EMAIL_HOOK_SECRET`.
3. We build the verify link
   `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=<token_hash>&type=<action>&redirect_to=<redirect_to>`
   (for reauthentication we show the 6-digit `token` instead).
4. We render the branded template and send it through Resend.

## Setup

### 1. Resend
- Verify your sending domain (`snkrfeature.com`) in Resend (SPF/DKIM, ideally DMARC).
- Create an API key.

### 2. Environment variables (deployment + local `.env`)
```
RESEND_API_KEY=re_xxx
EMAIL_FROM="sneakerfeature <noreply@snkrfeature.com>"   # must be a verified Resend sender
SEND_EMAIL_HOOK_SECRET=                                  # filled in step 3
# NEXT_PUBLIC_SUPABASE_URL is already set
```

### 3. Enable the hook in Supabase
- **Authentication → Hooks (Send Email)** → enable, type **HTTPS**.
- URL: `https://<your-domain>/api/auth/send-email-hook`
- Supabase generates a **secret** (`v1,whsec_...`). Copy it into
  `SEND_EMAIL_HOOK_SECRET` and redeploy.

### 4. Test (and rollback)
- Trigger a password reset from `/forgot-password` with a **real, registered** email.
- Check **Resend → Emails** for the send, and your inbox.
- **Rollback:** if anything fails, turn the hook **off** in Supabase — auth emails
  immediately go back to the SMTP path. (You can keep `supabase/templates/*.html`
  set as the SMTP templates so the fallback is also branded.)

## Notes
- While the hook is enabled it handles **all** auth emails (signup confirm, magic
  link, email change, invite, reauthentication) — all are rendered in
  `lib/email/auth-emails.ts`. Only password reset is currently triggered by the app.
- "Expires in 60 minutes" copy matches Supabase's default OTP/link expiry; adjust
  in `lib/email/auth-emails.ts` if you change it.
- Keep `EMAIL_FROM` on a Resend-verified domain or sends will be rejected.
