# Public catalogue maintenance records

The public `/updates` archive presents a compact, clickable card for each
published maintenance run, grouped by week. Cards link to `/updates/[runId]`;
the archive does not serialize complete shoe lists or source evidence. The
homepage explicitly says the basketball-shoe catalogue is updated weekly and
links to this archive, across all five homepage skins. The page is also available from the desktop More menu,
mobile menu and content-page footer. It does not use the announcement popup.

## Public data boundary

`catalogue_maintenance_runs` stores one public report per run ID. The website
reads only `id`, `scheduled_for`, `completed_at`, `status` and `report`, where
`is_published = true`, completion is not in the future, and `report.version = 1`.
The database migration defines the corresponding published-only read policy.
The public client cannot insert, edit or delete a report.

Apply `db/migrations/20261026065034_catalogue_maintenance_runs.sql` before
deploying the page. It creates only the dedicated public snapshot table and
does not grant access to administrator audits, profiles or private submissions.

The report contract and closed Zod schemas live in `lib/catalogue-updates.ts`.
Each text has explicit `en` and `zh` content. Report entries are added, updated,
verified-and-unchanged, pending, or unpublished candidates. Pending results and
unsuccessful runs remain part of the public record. Attempted rechecks and
verified rechecks have distinct counts. A run finishing on Monday remains under
the Beijing calendar week of its scheduled date; actual completion time is
displayed separately in Asia/Shanghai.

Publish a purpose-built public projection, never a raw management audit log.
Do not include actor IDs, accounts, private submissions, private moderation
details, full audit payloads, credentials, or price research. Public shoe names,
slugs, changed catalogue facts, evidence URLs and unresolved factual questions
belong in the report. Source links must be actual HTTP(S) URLs without URL
credentials; React renders report text as text, without HTML injection.

## Weekly publishing procedure

1. Complete the catalogue run and retain its original run ID across retries.
   Confirm catalogue writes by reading back actual fields and public content.
   Count only confirmed additions and updates as successful changes.
   New entries require a verified real product image as well as complete
   non-price text. Rotating older entries also include the selected main image:
   download and inspect the actual photograph, check generation and variant,
   and retain original source-page/image provenance. Approval status or an HTTP
   response alone does not prove image identity. Upload real bytes to Storage
   before adding metadata, preserve old records when replacing errors, and
   verify anonymous image display. An image addition is an update to an
   existing shoe, not a new shoe model.
2. Build the public report with shoe-by-shoe outcomes, concrete changes, source
   publishers, source URLs, actual read dates and remaining limitations. Record
   unsuccessful or partly completed work honestly, including all unresolved
   entries. A failure report must not claim database or page checks that did
   not happen.
3. Validate the public row JSON before publishing:

   ```sh
   npm run catalogue-updates:validate -- public-run.json
   ```

   The file contains the five read columns above, either one row or an array.
   `report` is the version 1 DTO, rather than an HTML report or raw audit data.
   Unknown fields, invalid source URLs, invalid dates, duplicate shoes and
   inconsistent counts are rejected. Do not suppress an error to make a run
   appear complete.
4. Using the authorized maintenance connection, upsert the validated report
   into the correct production project under the existing run ID. Publishing
   sets `is_published` true. Normal content publication requires no website
   code change, announcement, user-session interaction or new deployment.
   No identity field should impersonate an administrator.
5. Read the public row back through an anonymous client. On a new page request,
   independently inspect `/updates`, `/updates/[runId]` and the homepage entry. All read published
   reports without a persistent data cache, so corrections do not require a
   deployment or a background cache refresh. Confirm actual shoe names, counts,
   pending reasons and source links. A successful HTTP status alone is insufficient. Check the
   two locales and mobile layout when UI changes, and report the real extent
   of screenshot and interaction verification.

`is_published = false` withdraws a report from public reads without deleting its
record. A correction or retry updates the same run; it does not inflate totals
by creating another report for the same execution. Historical reports are read
with stable ordered pagination rather than silently stopping at the default
PostgREST row limit.

If the publishing connection is unavailable, retain a local public-report
draft and report that publication failed. Publish that recorded outcome once
connectivity returns; do not invent a successful website posting.

## Implementation and checks

- `lib/data/catalogue-updates.ts` reads the public table with `cache: "no-store"`
  and validates every row. React `cache()` deduplicates within a server render
  only; it does not retain a report between page requests. Empty state is distinct
  from unavailable or malformed data. Infrastructure errors and private payloads are never sent to the public interface.
- `components/updates/updates-timeline.tsx` renders the archive cards, with one
  link per run, dates, status and concise counts. `update-detail.tsx` provides
  the full report with category filters, search and progressive entry browsing.
  Before/after comparisons and source notes use keyboard-accessible disclosure
  controls. All five result categories and verification limits remain available.
- Detail routes use a fresh, anonymous exact-ID query with the same public
  filters and strict report validation. Missing or unpublished records return
  the local not-found view; an unavailable source returns a retry state instead
  of pretending the report does not exist. Published detail URLs are in the sitemap.
- `components/updates/latest-update-entry.tsx` receives only a small summary;
  the homepage does not serialize complete reports and evidence lists.
- `npm run test:catalogue-updates` checks the data boundary, unsafe URLs, count
  integrity, duplicate entries, unsuccessful runs, Beijing week grouping, and
  next-read freshness after a report correction using the actual data readers.
  This test is also included in the existing website quality CI gate.
- Continue running the normal lint, type checks and production build for code
  changes. Do not alter the existing weekly email digest cron to publish these
  catalogue records; it serves a different feature.

## AI API maintenance reports

The same public archive also accepts `report.category = "ai_api"`. Omitted
category means `catalogue`, preserving existing weekly records. The homepage,
archive cards, category filters and detail view label AI checks as checks rather
than shoe additions. The JSON version, table and published-only access remain
unchanged. Deploy category support before publishing the first AI report.

For each daily AI run, retain one run ID across retries and publish a bilingual,
sanitized report after verification, including healthy/no-change and unsuccessful
runs. Use entries for concrete checks: `unchanged` for passed checks without a
change, `updated` for verified fixes, `pending` for attempted unresolved checks.
Counts must agree with entries. Put elapsed time, model, actual search successes
and failures, source-link counts, and verification limits in the summaries.
Unexercised models or photo flows belong in explicit limitations; don't imply
they passed. Link public PRs where useful. Do not publish account identifiers,
keys, raw logs, private user prompts/profiles, balances or internal request IDs.

Follow the same validation, readback and public-page verification procedure.
No database schema change or new deploy is needed for subsequent reports.
Do not alter the weekly catalogue automation. Update the existing daily AI
automation to publish this category even when no chat notification is needed.
