-- Widen `announcements.id` from uuid to text so legacy ids published by the
-- GitHub Action — e.g. "20260623-062931-2", which uses a timestamp+run-number
-- shape that isn't a valid UUID — can be imported into the table when an
-- admin first edits a file-backed announcement. New rows still get
-- auto-generated UUID strings via `gen_random_uuid()::text`, so the id-
-- generation behaviour for fresh admin-published announcements is unchanged.
--
-- Safe to apply against an existing table: the implicit `::text` cast turns
-- any uuid value into its canonical 36-character textual form, preserving
-- equality / lookups everywhere.

alter table announcements alter column id drop default;
alter table announcements alter column id type text using id::text;
alter table announcements alter column id set default (gen_random_uuid()::text);
