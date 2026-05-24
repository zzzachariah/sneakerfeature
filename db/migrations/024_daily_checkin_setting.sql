-- Make the daily check-in credit amount admin-configurable via app_settings.
-- Default mirrors the previous hardcoded constant in lib/ai/checkin.ts.

insert into app_settings (key, value)
values ('daily_checkin_credits', '3'::jsonb)
on conflict (key) do nothing;
