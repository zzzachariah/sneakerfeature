-- Hidden Foot Scan feature: scan history + the current foot profile.
--
-- We persist the DERIVED results only (measurements + traits), never the raw
-- foot photos, for privacy. `profiles.foot_profile` holds the latest snapshot
-- the user chose to keep — it's what the AI Smart Picker reads for fit-aware
-- recommendations. `foot_scans` is the append-only history for left/right and
-- over-time comparison.

create table if not exists foot_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Full FootScanResult (see lib/foot-scan/types.ts).
  result jsonb not null
);

create index if not exists foot_scans_user_idx on foot_scans(user_id, created_at desc);

alter table foot_scans enable row level security;

create policy "Foot scans manage own" on foot_scans
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Latest kept foot profile (subset of a scan result). Shape: see FootProfile in
-- lib/foot-scan/types.ts — { foot_width, instep, toe_shape, foot_length_mm,
-- foot_width_mm, scanned_at }.
alter table profiles add column if not exists foot_profile jsonb;

comment on column profiles.foot_profile is
  'Latest kept foot-shape profile for fit-aware recommendations. Shape: { foot_width: "narrow"|"standard"|"wide"|"extra_wide", instep: "low"|"normal"|"high", toe_shape: "egyptian"|"greek"|"roman"|"square", foot_length_mm: number, foot_width_mm: number|null, scanned_at: ISO string }';
