# Supabase Auth email templates

Branded HTML templates for the transactional emails Supabase Auth can send.

> **Where the design actually lives:** these emails are composed by **Supabase**
> and only *relayed* through our SMTP provider (Resend). Resend's own template
> feature does **not** apply to SMTP-relayed mail — so the look is controlled
> here / in the Supabase dashboard, not in Resend.

## Templates & current status

| File | Supabase email | Subject | Status in this app |
| --- | --- | --- | --- |
| `recovery.html` | **Reset Password** | `Reset your sneakerfeature password` | ✅ **Active** — sent from `/forgot-password` |
| `confirmation.html` | **Confirm signup** | `Confirm your sneakerfeature email` | 💤 Dormant — registration auto-confirms (`admin.createUser({ email_confirm: true })`), so this only fires if you enable email confirmation on signup |
| `magic_link.html` | **Magic Link** | `Your sneakerfeature sign-in link` | 💤 Dormant — no magic-link sign-in wired up |
| `email_change.html` | **Change Email Address** | `Confirm your new sneakerfeature email` | 💤 Dormant — settings shows email read-only; no email-change flow |
| `invite.html` | **Invite user** | `You're invited to sneakerfeature` | 💤 Dormant — no admin invite flow |
| `reauthentication.html` | **Reauthentication** | `Your sneakerfeature verification code` | 💤 Dormant — no reauthentication OTP flow |

"Dormant" = the template is ready and on-brand, but the current app never triggers
that email. It costs nothing to have them set; they'll just look right whenever a
feature starts using them.

## How to apply

### Option A — Supabase dashboard (no CLI needed)
For each template: Supabase → **Authentication → Email Templates → <name>** → set
the **Subject** (table above) and paste the file contents into **Message body (HTML)**.
At minimum, set up **Reset Password** (`recovery.html`) since that's the one in use.

### Option B — Supabase CLI (`config.toml`)
```toml
[auth.email.template.recovery]
subject = "Reset your sneakerfeature password"
content_path = "./supabase/templates/recovery.html"

[auth.email.template.confirmation]
subject = "Confirm your sneakerfeature email"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.magic_link]
subject = "Your sneakerfeature sign-in link"
content_path = "./supabase/templates/magic_link.html"

[auth.email.template.email_change]
subject = "Confirm your new sneakerfeature email"
content_path = "./supabase/templates/email_change.html"

[auth.email.template.invite]
subject = "You're invited to sneakerfeature"
content_path = "./supabase/templates/invite.html"

[auth.email.template.reauthentication]
subject = "Your sneakerfeature verification code"
content_path = "./supabase/templates/reauthentication.html"
```

## Template variables (Go template syntax)

- `{{ .ConfirmationURL }}` — full action link (used by every template except
  reauthentication). For recovery it routes through Supabase's `/auth/v1/verify`
  then redirects to `<site>/reset-password?code=...`.
- `{{ .Token }}` — 6-digit code (used by `reauthentication.html`).
- Also available: `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`,
  `{{ .TokenHash }}`, `{{ .RedirectTo }}`.

## Notes

- The "expires in 60 minutes" copy matches Supabase's default email OTP/link
  expiry (**Authentication → Email → Email OTP Expiration**). If you change it,
  update the number in the affected templates.
- For delivery: the `redirectTo` (`<site>/reset-password`) must be in
  **Authentication → URL Configuration → Redirect URLs**, and the sending domain
  must be verified (SPF/DKIM, ideally DMARC) with the SMTP provider.
- Light theme is intentional (best email-client compatibility); templates pin
  `color-scheme: light` to avoid forced dark-mode inversion.
- Brand wordmark is `sneakerfeature`; swap to `snkrfeature` with a find-replace
  if you prefer to match the domain.
