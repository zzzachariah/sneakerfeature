# Supabase Auth email templates

These are the HTML templates for the transactional emails Supabase Auth sends.

> **Where the design actually lives:** the reset-password email is composed by
> **Supabase** (via `auth.resetPasswordForEmail`) and only *relayed* through our
> SMTP provider (Resend). Resend's own template feature does **not** apply to
> SMTP-relayed mail — so the email's look is controlled here / in the Supabase
> dashboard, not in Resend.

## Files

| File | Supabase email | Triggered by |
| --- | --- | --- |
| `recovery.html` | **Reset Password** | `supabase.auth.resetPasswordForEmail()` from `/forgot-password` |

## How to apply

### Option A — Supabase dashboard (no CLI needed)
1. Supabase → **Authentication → Email Templates → Reset Password**
2. **Subject:** `Reset your sneakerfeature password`
3. **Message body (HTML):** paste the full contents of `recovery.html`
4. Save, then test from `/forgot-password` with a real, registered account email.

### Option B — Supabase CLI (`config.toml`)
If you manage the project with the Supabase CLI, wire it up in `supabase/config.toml`:

```toml
[auth.email.template.recovery]
subject = "Reset your sneakerfeature password"
content_path = "./supabase/templates/recovery.html"
```

## Template variables

Supabase substitutes these at send time (Go template syntax):

- `{{ .ConfirmationURL }}` — the full reset link (routes through Supabase's
  `/auth/v1/verify` then redirects to `<site>/reset-password?code=...`). Used by
  the CTA button and the plain-text fallback link.
- Also available: `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .Token }}`,
  `{{ .TokenHash }}`, `{{ .RedirectTo }}`.

## Notes

- The "expires in 60 minutes" copy matches Supabase's default email OTP/link
  expiry. If you change **Authentication → Email → Email OTP Expiration**, update
  the number in `recovery.html` to match.
- For delivery, the `redirectTo` (`<site>/reset-password`) must be in
  **Authentication → URL Configuration → Redirect URLs**, and the sending domain
  must be verified (SPF/DKIM, ideally DMARC) with the SMTP provider.
- Light theme is intentional (best email-client compatibility); the template
  pins `color-scheme: light` to avoid forced dark-mode inversion.
