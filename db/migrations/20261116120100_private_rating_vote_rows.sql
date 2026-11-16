-- Step 2 of 2 — apply AFTER the app code that uses shoe_rating_summary /
-- comment_vote_totals is live. Until now anyone holding the public anon key could
-- list every user's individual ratings and likes/dislikes by user_id.
drop policy if exists "Public read shoe ratings" on public.shoe_ratings;
drop policy if exists "Own rating read" on public.shoe_ratings;
create policy "Own rating read" on public.shoe_ratings
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Public read comment votes" on public.comment_votes;
drop policy if exists "Own vote read" on public.comment_votes;
create policy "Own vote read" on public.comment_votes
  for select to authenticated using ((select auth.uid()) = user_id);
