# Security Policy

## Reporting a Vulnerability

If you believe you've found a security vulnerability in sneakerfeature,
please report it privately. Do **not** open a public GitHub issue.

- Open a private security advisory via GitHub:
  https://github.com/zzzachariah/sneakerfeature/security/advisories/new
- Or email the maintainer directly (see the GitHub profile linked from the
  repository).

Please include:

- A description of the issue and the impact.
- Steps to reproduce (PoC URL, request payload, etc.).
- Any relevant logs or screenshots.

We aim to acknowledge reports within 72 hours and to ship a fix (or a
mitigation) for confirmed issues within 14 days. We're happy to credit you
in the fix's release notes.

## Scope

In scope:

- The production site at `snkrfeature.com`
- The Next.js app and API routes in this repository
- The Capacitor mobile shells and the Electron desktop shell
- Supabase RLS policies in `db/migrations/`

Out of scope:

- Vulnerabilities in third-party services (Vercel, Supabase, Cloudflare,
  packyapi, etc.) — please report those to the vendor directly.
- Reports based solely on automated scanner output without a working PoC.
- Denial-of-service via volumetric load.
- Self-XSS (issues that require the victim to paste attacker-controlled
  content into their own browser console).

## Hardening

The following baseline protections are in place:

- HTTPS-only with HSTS preload-eligible policy (`next.config.ts`).
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- CSRF: cross-origin mutating requests to `/api/*` are rejected at the
  edge (`middleware.ts`); webhook/cron endpoints verify their own
  signatures.
- Auth: Cloudflare Turnstile on login / signup / password reset; Supabase
  session cookies are HttpOnly + SameSite.
- Database: Row Level Security enabled on every user-data table
  (`db/migrations/`). Service-role key is server-only.
- Image proxy: outbound fetches restricted to an allowlist of hosts
  (`app/api/image-proxy/route.ts`).
- CodeQL static analysis runs on every pull request
  (`.github/workflows/codeql.yml`).
- Dependabot files weekly security/version updates
  (`.github/dependabot.yml`).
