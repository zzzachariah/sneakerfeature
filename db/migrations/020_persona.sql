-- 020_persona.sql
-- Adds player persona to profiles for personalized shoe matching.

alter table profiles
  add column if not exists persona jsonb;

comment on column profiles.persona is
  'Player persona for shoe match scoring. Shape: { positions: ("PG"|"SG"|"SF"|"PF"|"C")[1..2], skill_level: "beginner"|"amateur"|"semi_pro"|"pro", flat_foot: boolean, height_cm: 140-230, weight_kg: 35-160 }';
