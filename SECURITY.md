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

## Dependency review (2026-10-10)

Next.js 15.5.27, Capacitor 8.5.3 and sharp 0.35.5 include the available
security fixes without a framework major-version migration. The lockfile
overrides keep nested sharp, PostCSS, tar and selector-parser copies on patched
versions. The xcode override uses uuid 11.1.1, which retains the CommonJS `v4`
API used by the native project generator.

Validation: production build, TypeScript, PNG resizing, WebP conversion through
sharp, Capacitor's InputAsset pipeline, and xcode project parsing/UUID generation.
`npm audit --omit=dev` reports zero vulnerabilities for this lockfile. Mobile
binaries still need rebuilding and device testing before their next release.

One unresolved **development-only** advisory remains: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
braces 3.0.3 has no patched release; Tailwind 3 and Next's lint tooling bring it
in through seven dependent package entries. These tools consume repository
glob patterns at build/lint time, not HTTP request patterns. Do not expose
them to user-supplied patterns. Track the upstream fix; do not suppress new
advisories or use `npm audit fix --force` to silently migrate frameworks.

Native manifests were synchronized with `cap sync`. The iOS pin was verified
against the upstream 8.5.3 Git tag. After connectivity recovered on 2026-10-11,
Xcode package resolution and an unsigned iOS Simulator build both passed.
Physical-device behavior, signing and store distribution remain separate release checks.
