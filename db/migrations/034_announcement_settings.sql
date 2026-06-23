-- Make announcements editable from the admin UI by storing them in the same
-- key/value app_settings table the rest of the site flags use. The "current"
-- key holds the popup that's actively shown; the "history" key holds the
-- archive that powers /announcements (newest first).
--
-- The existing GitHub Actions "Publish Announcement" workflow continues to
-- write public/announcement.json + public/announcements-history.json on the
-- default branch — those files are now the seed/fallback used the first time
-- the admin UI runs (and when SUPABASE_SERVICE_ROLE_KEY is unset locally).
insert into app_settings (key, value)
values ('announcement_current', 'null'::jsonb)
on conflict (key) do nothing;

insert into app_settings (key, value)
values ('announcement_history', '[]'::jsonb)
on conflict (key) do nothing;
