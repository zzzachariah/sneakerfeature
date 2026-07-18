-- 043_renewal_reminders.sql
-- Track when a member was last sent a pre-expiry renewal reminder email, so the
-- daily cron (/api/cron/renewal-reminders) sends at most once per expiry cycle.
-- After a renewal, subscription_expires_at moves far into the future, so the
-- "reminded within 7 days before expiry" guard naturally re-arms for the next
-- cycle without needing to clear this column.
alter table public.profiles
  add column if not exists renewal_reminded_at timestamptz;
