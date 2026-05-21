-- App-wide key/value settings (feature flags etc).
-- Currently holds `smart_picker_public_enabled`: when true, all logged-in
-- users can access the Smart Picker; when false (default) only admins can.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

alter table app_settings enable row level security;

-- Public-read is fine: these are non-sensitive feature flags consumed by
-- server code with the service-role client anyway.
drop policy if exists "Public read app settings" on app_settings;
create policy "Public read app settings" on app_settings
  for select using (true);

-- Writes are admin-only and go through the service-role client; no INSERT/
-- UPDATE policy is required for end users.

-- Seed the Smart Picker public-access flag (default: disabled).
insert into app_settings (key, value)
values ('smart_picker_public_enabled', 'false'::jsonb)
on conflict (key) do nothing;
