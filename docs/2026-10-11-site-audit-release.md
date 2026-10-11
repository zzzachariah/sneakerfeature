# Website audit improvements — 2026-10-11

## Scope and evidence

A. Separate public display names from private account, foot-profile and membership data; revoke client allowance operations and protected profile writes.
B. Patch Next.js, Capacitor, sharp and vulnerable nested dependencies. Production dependency audit is clean; the unresolved development-only braces advisory is documented in SECURITY.md.
C. Keep missing evidence unknown, identical scores tied, community votes weighted by per-dimension sample count, and incomplete comparisons inconclusive.
D. Make recommendation heuristics recognize negation and uncertainty, remove unsupported injury/height claims, return conservative no-charge AI fallbacks, and label match scores as estimates. When the catalog lacks profile evidence, Quick Picker offers a clearly labeled catalog shortlist with no personal match score. No regional pricing or new budget/court/width filter was introduced.
E. Put search and quick picking first, collapse the profile form, remove forced language/automatic upsell interruptions, and move comparison conclusions above oversized imagery.
F. Select a deterministic spec version, expose conflicts and missing source links, add an editorial review queue, and avoid presenting derived catalog ranks as structured-data community reviews. Duplicate/conflicting original records are retained for source review.
G. Reserve funds before AI work, serialize requests per account, atomically save/settle replies, release unused reservations, and recover expired holds. Restore missing service-only atomic credit functions required by existing recharge/check-in code.
H. Aggregate ratings in PostgreSQL, paginate full datasets, load detail stories/reviews on demand, and show errors instead of substituting demo shoes in production.
I. Fix chunked session detection, password visibility, localized evidence, submission labels, dialog focus/Escape/return, and platform-specific closet wording.
J. Add a website CI gate, isolated PostgreSQL tests and algorithm fixtures, bounded consent-gated picker feedback, and aggregate AI request health in the admin dashboard.

## Deployment order

The database has legacy numbered migrations. Do not replay every file blindly against an existing project.

1. Confirm the production project is `alptwiszxgattsnqvfbg` for snkrfeature.com.
2. Apply `20261010035831_restrict_allowance_rpc_access.sql`.
3. Apply `20261011123631_reserve_ai_requests.sql`, `20261011124039_catalog_rating_summary.sql`, `20261011125026_prepare_public_profile_cards.sql`, and `20261011125227_reconcile_atomic_credit_functions.sql`. These expansion changes are compatible with the old website.
4. Deploy this website revision and verify comments and moderation author names use `public_profile_cards`.
5. Apply `20261010034930_harden_profile_and_allowance_permissions.sql` to contract private profile access. This file also defines the projection and is safe to replay after preparation.
6. Verify client roles cannot read another private account or invoke billing RPCs; public names remain readable and the backend retains required access.

Use a forward fix after step 5. Reverting to the old website would reintroduce obsolete profile joins. Do not restore public access to private profile data as a rollback technique.

## Verification

- `npm run test:core` includes deep links, widgets, outreach rules, actual PostgreSQL RLS/grants, score ties/permutations/missing data, recommendation evidence/negation/fallbacks, catalog conflicts/pagination, AI reservations/settlement/recovery, rating aggregates, cookie/consent privacy boundaries and atomic credit functions. Tests use isolated PGlite fixtures and no live accounts.
- TypeScript, lint and production website build pass locally. Lint retains pre-existing unused-variable warnings.
- Production npm audit has zero vulnerabilities; full audit has seven development dependency entries for one unresolved braces advisory.
- Independent browser checks used the real 553-shoe catalog. Home/search, PG 6 provenance, comparison ordering, 390px mobile layout, password visibility and keyboard dialog focus/close/return were verified.
- iOS packages resolve to Capacitor 8.5.3 and an unsigned iOS Simulator build succeeds. Physical devices, signing and store uploads were not tested.
- No paid AI requests, real-user credit changes, payment/refund transactions or biometric uploads were performed for testing. These integrations require separately controlled end-to-end checks.

## Measuring outcomes

The existing analytics consent gate is retained. New custom events contain only event names, bounded result counts or one fixed feedback category. No query, shoe/user ID, account detail, body measurement or free-text feedback is sent by these events. iOS native tracking remains blocked.

Compare `quick_picker_started`, `quick_picker_completed`, `comparison_created`, and `recommendation_feedback` over comparable periods in the existing Vercel analytics account. Custom-event availability depends on the existing analytics plan. Refusing consent does not restrict the picker or feedback UI. These counts are consented-event samples, not unique-user conversion rates or proof of recommendation accuracy.

The admin dashboard reports AI reservation states and charged account units for the last 24 hours. Released requests include cancellations, fallbacks and no-charge scans, so they are not an error-rate metric. Account units are not the provider's monetary cost. Expired reservations recover on the next balance read or request; there is no background recovery schedule added here.

There is no claimed performance percentage, physical-fit accuracy rate, real-user satisfaction baseline or Lighthouse score. Establish a post-release baseline before claiming a measured product improvement.
