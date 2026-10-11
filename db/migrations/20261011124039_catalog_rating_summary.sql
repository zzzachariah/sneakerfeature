-- Aggregate public rating evidence in PostgreSQL; never transfer individual votes.
create or replace function public.catalog_rating_summary()
returns table(shoe_id uuid,rating_count bigint,sums jsonb,dim_counts jsonb)
language sql stable security invoker set search_path = '' as $$
  select shoe_id,count(*) filter(where cushioning_feel between 0.5 and 5 or court_feel between 0.5 and 5 or bounce between 0.5 and 5 or stability between 0.5 and 5 or traction between 0.5 and 5 or fit between 0.5 and 5),
    jsonb_build_object('cushioning_feel',coalesce(sum(cushioning_feel) filter(where cushioning_feel between 0.5 and 5),0),
    'court_feel',coalesce(sum(court_feel) filter(where court_feel between 0.5 and 5),0),
    'bounce',coalesce(sum(bounce) filter(where bounce between 0.5 and 5),0),
    'stability',coalesce(sum(stability) filter(where stability between 0.5 and 5),0),
    'traction',coalesce(sum(traction) filter(where traction between 0.5 and 5),0),
    'fit',coalesce(sum(fit) filter(where fit between 0.5 and 5),0)),
    jsonb_build_object('cushioning_feel',count(cushioning_feel) filter(where cushioning_feel between 0.5 and 5),
    'court_feel',count(court_feel) filter(where court_feel between 0.5 and 5),
    'bounce',count(bounce) filter(where bounce between 0.5 and 5),
    'stability',count(stability) filter(where stability between 0.5 and 5),
    'traction',count(traction) filter(where traction between 0.5 and 5),
    'fit',count(fit) filter(where fit between 0.5 and 5))
  from public.shoe_ratings group by shoe_id;
$$;
revoke all on function public.catalog_rating_summary() from public;
grant execute on function public.catalog_rating_summary() to anon,authenticated,service_role;
