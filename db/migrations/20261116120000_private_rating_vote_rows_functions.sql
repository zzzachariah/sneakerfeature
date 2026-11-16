-- Step 1 of 2 (safe to apply BEFORE deploying the matching app code; additive only).
-- Aggregate-only read paths for ratings and comment votes, so the per-user rows
-- can stop being world-readable in step 2.

-- Catalog summary must keep working once public SELECT on shoe_ratings is gone.
alter function public.catalog_rating_summary() security definer;

create or replace function public.shoe_rating_summary(p_shoe_id uuid)
returns table(rating_count bigint, avgs jsonb)
language sql stable security definer set search_path = '' as $$
  select count(*),
    case when count(*) = 0 then null else jsonb_build_object(
      'cushioning_feel', avg(coalesce(cushioning_feel, 0)),
      'court_feel',      avg(coalesce(court_feel, 0)),
      'bounce',          avg(coalesce(bounce, 0)),
      'stability',       avg(coalesce(stability, 0)),
      'traction',        avg(coalesce(traction, 0)),
      'fit',             avg(coalesce(fit, 0))) end
  from public.shoe_ratings where shoe_id = p_shoe_id;
$$;
revoke all on function public.shoe_rating_summary(uuid) from public;
grant execute on function public.shoe_rating_summary(uuid) to anon, authenticated, service_role;

create or replace function public.comment_vote_totals(p_comment_ids uuid[])
returns table(comment_id uuid, likes bigint, dislikes bigint)
language sql stable security definer set search_path = '' as $$
  select v.comment_id,
         count(*) filter (where v.vote_type = 'like'),
         count(*) filter (where v.vote_type = 'dislike')
  from public.comment_votes v
  where v.comment_id = any (p_comment_ids[1:1000])
  group by v.comment_id;
$$;
revoke all on function public.comment_vote_totals(uuid[]) from public;
grant execute on function public.comment_vote_totals(uuid[]) to anon, authenticated, service_role;
