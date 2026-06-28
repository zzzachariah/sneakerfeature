-- 037: One-line "verdict" pro/con summaries per shoe (+ zh translations).
--
-- A single editorial advantage sentence (pro_summary) and a single drawback
-- sentence (con_summary) per shoe. The detail page composes them into a verdict
-- like "如果你喜欢…(pro)，并且可以接受…(con)，那么这双鞋就是为你准备的". Content is
-- authored externally (Claude chat) and bulk-loaded as CSV through the admin
-- "Verdict import" panel (/admin/verdicts).
--
-- Mirrors the migration 026 pattern: an English source column plus a *_zh column
-- that the zh UI reads first, falling back to the English value when null/empty.
-- All columns are nullable + additive; reads are already public (001 "Public read
-- specs"), writes go through the service-role client, so no RLS changes needed.
--
-- INTENTIONAL DIVERGENCE FROM 026: this content is Chinese-first and the English
-- column is authored by hand (both sides come straight from the CSV), so these
-- fields are deliberately NOT registered in SPEC_TRANSLATABLE_FIELDS — the
-- auto-translate job must never derive/overwrite them from the other language.

alter table shoe_specs
  add column if not exists pro_summary text,
  add column if not exists pro_summary_zh text,
  add column if not exists con_summary text,
  add column if not exists con_summary_zh text;
