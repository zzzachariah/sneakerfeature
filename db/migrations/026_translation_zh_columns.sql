-- 026: Chinese (zh) translation columns for sneaker tech + story content.
--
-- These hold AI-translated (packyapi / Claude) Simplified-Chinese versions of the
-- English source fields, stored alongside the originals so the zh UI reads them
-- directly instead of machine-translating at render time. This also lifts the old
-- "forefoot/heel midsole tech is never translated" restriction — proprietary tech
-- names now get a proper, reviewable Chinese rendering from the LLM.
--
-- All columns are nullable and additive; the English source columns are untouched.
-- When a *_zh value is null/empty the UI falls back to the English value.
-- Reads are already public (see 001 "Public read specs/shoes"); writes go through
-- the service-role client, so no RLS changes are needed.

alter table shoe_specs
  add column if not exists forefoot_midsole_tech_zh text,
  add column if not exists heel_midsole_tech_zh text,
  add column if not exists outsole_tech_zh text,
  add column if not exists upper_tech_zh text,
  add column if not exists cushioning_feel_zh text,
  add column if not exists court_feel_zh text,
  add column if not exists bounce_zh text,
  add column if not exists stability_zh text,
  add column if not exists traction_zh text,
  add column if not exists fit_zh text,
  add column if not exists containment_zh text,
  add column if not exists support_zh text,
  add column if not exists torsional_rigidity_zh text,
  add column if not exists playstyle_summary_zh text,
  add column if not exists story_summary_zh text;

alter table shoe_stories
  add column if not exists title_zh text,
  add column if not exists content_zh text;
