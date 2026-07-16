-- 042_shoe_fit.sql
--
-- Per-shoe fit / sizing data — the structured backbone of the premium "smart
-- sizing" advisor. One row per shoe (admin- or AI-filled, admin-reviewed).
-- Public-read so the detail page can compute size advice; writes are admin-only
-- via the service-role client.
--
-- Combined with a member's foot scan (foot_length_mm + width class), this turns
-- into a concrete "buy US 9.5, this pair runs half a size small and is narrow"
-- recommendation for Pro/Max members (see lib/foot-scan/fit-advisor.ts).

create table if not exists shoe_fit (
  shoe_id uuid primary key references shoes(id) on delete cascade,
  -- Length direction relative to true-to-size, and magnitude in half-sizes.
  length_bias text not null default 'true_to_size'
    check (length_bias in ('runs_small', 'true_to_size', 'runs_large')),
  adjust_half_sizes int not null default 0 check (adjust_half_sizes between 0 and 4),
  -- How the shoe's last runs across the forefoot.
  width_fit text not null default 'standard' check (width_fit in ('narrow', 'standard', 'wide')),
  -- Internal volume / instep room.
  volume text not null default 'medium' check (volume in ('low', 'medium', 'high')),
  -- Free-text guidance shown to members (English + zh).
  notes text,
  notes_zh text,
  confidence text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  source text not null default 'admin' check (source in ('admin', 'ai', 'community')),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table shoe_fit enable row level security;

-- Public read: the advice is computed on the detail page for any visitor (the
-- premium gate decides whether it's revealed, not RLS).
drop policy if exists "Public read shoe fit" on shoe_fit;
create policy "Public read shoe fit" on shoe_fit
  for select using (true);
-- Writes go through the service-role client (admin panel); no user write policy.

create index if not exists idx_shoe_fit_updated on shoe_fit (updated_at desc);
