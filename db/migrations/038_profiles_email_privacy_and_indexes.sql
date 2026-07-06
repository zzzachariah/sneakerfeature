-- 038_profiles_email_privacy_and_indexes.sql
--
-- Fix: migration 004 added `create policy "Public read profiles" ... using (true)`
-- so the comment list could show usernames. Because RLS is row-level (not
-- column-level), that policy also exposed profiles.email to any client holding
-- the public anon key (e.g. supabase.from('profiles').select('username,email')).
--
-- The comment feature only needs `username`. We keep the public read policy but
-- strip column access to `email` from the API roles. Column-level grants only
-- take effect when there is NO table-wide SELECT grant, so we revoke the table
-- grant and re-grant every column except `email`. Service-role (admin) reads
-- bypass grants, so login/register/admin flows that legitimately need the email
-- are unaffected.

revoke select on profiles from anon, authenticated;

grant select (
  id,
  username,
  avatar_url,
  bio,
  role,
  created_at,
  updated_at,
  rating_focus,
  persona,
  personalized_push_enabled,
  foot_profile
) on profiles to anon, authenticated;

-- Foreign keys that back hot query paths but were never indexed. The catalog
-- load embeds shoe_specs(*) and per-shoe source lookups filter on shoe_id;
-- without these the joins/filters fall back to sequential scans and parent
-- `shoes` deletes have to scan the child tables.
create index if not exists idx_shoe_specs_shoe_id on shoe_specs (shoe_id);
create index if not exists idx_sources_shoe_id on sources (shoe_id);
