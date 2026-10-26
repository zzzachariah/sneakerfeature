import assert from "node:assert/strict";
import {
  authSchema, blockUserSchema, closetAddSchema, closetUpdateSchema, closetWearSchema,
  commentSchema, deleteCommentSchema, deleteComparisonSchema, personaSchema,
  pushTokenSchema, ratingDeleteSchema, ratingFocusSchema, ratingUpsertSchema,
  recordViewSchema, reportCommentSchema, saveComparisonSchema, submissionSchema
} from "../lib/validation/schemas";
import { catalogueMaintenanceRunSchema, catalogueUpdateEntrySchema } from "../lib/catalogue-updates";

// These accepted identifiers predate the dependency migration. PostgreSQL UUID
// columns and the former validator accept all canonical hexadecimal groups,
// including imported identifiers whose variant/version bits are not RFC UUIDs.
const storedIds = [
  "c4d36268-0bba-45d2-b86e-9658e7d89a34",
  "11111111-1111-1111-1111-111111111111",
  "ABCDEF12-3456-FFFF-1234-ABCDEF123456",
  "00000000-0000-0000-0000-000000000000"
];
for (const id of storedIds) {
  for (const schema of [recordViewSchema, ratingDeleteSchema, closetAddSchema, closetUpdateSchema]) {
    assert.equal(schema.safeParse({ shoeId: id }).success, true, `Stored shoe identifier remains usable: ${id}`);
  }
  assert.equal(commentSchema.safeParse({ shoeId: id, content: "Useful review", verificationToken: "token" }).success, true);
  assert.equal(deleteCommentSchema.safeParse({ commentId: id }).success, true);
  assert.equal(reportCommentSchema.safeParse({ commentId: id, reason: "spam" }).success, true);
  assert.equal(blockUserSchema.safeParse({ userId: id, action: "block" }).success, true);
  assert.equal(deleteComparisonSchema.safeParse({ id }).success, true);
}
for (const id of ["", "not-an-id", "11111111111111111111111111111111", "11111111-1111-1111-1111-11111111111g", ` ${storedIds[0]}`]) {
  const parsed = recordViewSchema.safeParse({ shoeId: id });
  assert.equal(parsed.success, false, "Migration must not turn identifiers into arbitrary strings");
  if (!parsed.success) assert.equal(parsed.error.flatten().fieldErrors.shoeId?.[0], "Invalid shoe identifier.");
}

const submission = {
  shoe_name: "Example basketball shoe", brand: "Example",
  raw_text: "Verified source notes for a basketball shoe.", verificationToken: "token"
};
assert.equal(submissionSchema.parse(submission).submission_type, "new_shoe", "Omitted submission type keeps its existing default");
assert.equal(submissionSchema.parse({ ...submission, submission_type: undefined }).submission_type, "new_shoe");
assert.equal(submissionSchema.safeParse({ ...submission, submission_type: "correction" }).success, false);
assert.equal(submissionSchema.parse({ ...submission, submission_type: "correction", target_shoe_id: storedIds[1] }).target_shoe_id, storedIds[1]);
assert.equal(submissionSchema.parse({ ...submission, release_year: "2020" }).release_year, 2020, "Form number coercion remains supported");
for (const extra of [{ raw_text: "x".repeat(19) }, { raw_text: "x".repeat(20001) }, { source_links: "x".repeat(2001) }, { story_notes: "x".repeat(5001) }]) {
  assert.equal(submissionSchema.safeParse({ ...submission, ...extra }).success, false, "Input size limits remain enforced");
}
assert.equal("untrustedField" in submissionSchema.parse({ ...submission, untrustedField: "ignored" }), false, "Submission allowlist still strips unknown fields");

const persona = { positions: ["PG"], skill_level: "amateur", flat_foot: false, height_cm: "180", weight_kg: "75" };
const parsedPersona = personaSchema.parse(persona);
assert.equal(parsedPersona.height_cm, 180);
assert.equal(parsedPersona.weight_kg, 75);
assert.equal(Object.hasOwn(parsedPersona, "injuries"), false, "Legacy personas do not gain an injury list implicitly");
assert.equal(personaSchema.safeParse({ ...persona, positions: ["PG", "PG"] }).success, false);
assert.equal(personaSchema.safeParse({ ...persona, injuries: ["knee", "knee"] }).success, false);
assert.equal(personaSchema.safeParse({ ...persona, height_cm: 139 }).success, false);
assert.equal(personaSchema.safeParse({ ...persona, weight_kg: 161 }).success, false);

const ratings = { shoeId: storedIds[0], cushioning_feel: 0.5, court_feel: 5, bounce: 2.5, stability: 3, traction: 4.5, fit: 4 };
assert.deepEqual(ratingUpsertSchema.parse(ratings), ratings);
for (const rating of [0, 5.5, 2.25, NaN, Infinity]) assert.equal(ratingUpsertSchema.safeParse({ ...ratings, traction: rating }).success, false);
assert.equal(ratingFocusSchema.safeParse({ primary: "traction", secondary: "fit", tertiary: "stability" }).success, true);
assert.equal(ratingFocusSchema.safeParse({ primary: "traction", secondary: "fit", tertiary: "traction" }).success, false);

assert.deepEqual(closetUpdateSchema.parse({ shoeId: storedIds[0] }), { shoeId: storedIds[0] }, "PATCH omission must not clear stored values");
assert.deepEqual(closetUpdateSchema.parse({ shoeId: storedIds[0], sizeLabel: null, purchasedAt: null }), { shoeId: storedIds[0], sizeLabel: null, purchasedAt: null }, "Explicit null retains its clearing semantics");
assert.equal(closetWearSchema.parse({ shoeId: storedIds[0], hours: "1.5", note: " session " }).hours, 1.5);
assert.equal(closetWearSchema.parse({ shoeId: storedIds[0], hours: 1, note: " session " }).note, "session");
assert.equal(closetWearSchema.safeParse({ shoeId: storedIds[0], hours: 0 }).success, false);
assert.equal(closetWearSchema.safeParse({ shoeId: storedIds[0], hours: 24.1 }).success, false);
assert.equal(saveComparisonSchema.parse({ title: " Compare ", shoeIds: [storedIds[0], storedIds[1]] }).title, "Compare");
assert.equal(saveComparisonSchema.safeParse({ title: "Compare", shoeIds: [storedIds[0]] }).success, false);
assert.equal(pushTokenSchema.partial().safeParse({ platform: "ios" }).success, true);
assert.equal(authSchema.safeParse({ identifier: "member", password: "password", verificationToken: "token", email: "member@example.com" }).success, true);
assert.equal(authSchema.safeParse({ identifier: "member", password: "short", verificationToken: "token" }).success, false);

const text = { en: "Public evidence", zh: "公开证据" };
const entry = catalogueUpdateEntrySchema.parse({ kind: "unchanged", name: "Example shoe", summary: text, sources: [{ publisher: "Example", url: "https://example.com/review", readDate: "2026-10-26" }] });
assert.deepEqual(entry.changes, []);
assert.deepEqual(entry.sources[0].supports, []);
const run = {
  id: storedIds[1], scheduled_for: "2026-10-25", completed_at: "2026-10-26T00:00:00Z", status: "completed",
  report: { version: 1, title: text, summary: text, counts: { added: 0, updated: 0, recheckAttempted: 1, recheckVerified: 1, pending: 0, candidates: 0 }, entries: [entry], verification: { databaseReadback: true, anonymousReadback: true, publicBody: true, visualScreenshot: false, limitations: [] } }
};
assert.deepEqual(catalogueMaintenanceRunSchema.parse(run).report.notes, []);
assert.equal(catalogueMaintenanceRunSchema.safeParse({ ...run, privateAudit: "never publish" }).success, false, "Public update DTO stays strict");
assert.equal(catalogueMaintenanceRunSchema.safeParse({ ...run, report: { ...run.report, counts: { ...run.report.counts, updated: 1 } } }).success, false, "Public update counts must still match entries");
console.log("Validation contracts passed: imported IDs, defaults, correction requirements, allowlists, form coercion, PATCH omission/null, rating boundaries and public update DTOs.");
