-- 021_fix_shoe_stories_public_read.sql
-- Fix: the public Story slide rendered "No editorial story yet" even when
-- shoe_stories had rows.
--
-- Root cause: migration 007 enabled RLS on shoe_stories and tried to add its
-- public-read policy with `create policy if not exists "..."`. PostgreSQL does
-- NOT support `IF NOT EXISTS` on `CREATE POLICY`, so when the migrations were
-- applied statement-by-statement the `enable row level security` took effect
-- while the policy creation was skipped — leaving the table with RLS on and no
-- SELECT policy for the anon role. The public (anon) client then read zero rows
-- and shoe.story stayed null.
--
-- Recreate both policies with valid, idempotent syntax.

alter table shoe_stories enable row level security;

drop policy if exists "Public read shoe stories" on shoe_stories;
create policy "Public read shoe stories"
  on shoe_stories for select using (true);

drop policy if exists "Admin manage shoe stories" on shoe_stories;
create policy "Admin manage shoe stories"
  on shoe_stories for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
