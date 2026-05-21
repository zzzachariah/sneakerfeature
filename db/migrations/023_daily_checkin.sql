-- Daily check-in bonus for AI Smart Picker users.
-- Adds the timestamp of the last successful claim onto ai_credits so the
-- 24-hour cooldown can be enforced via a single conditional UPDATE.

alter table ai_credits
  add column if not exists last_checkin_at timestamptz;
