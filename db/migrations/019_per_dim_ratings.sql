-- Per-dimension user ratings: split single 0.5-5 rating into six dim columns.

-- 1. Add 6 nullable columns
alter table shoe_ratings
  add column if not exists cushioning_feel numeric(2,1),
  add column if not exists court_feel numeric(2,1),
  add column if not exists bounce numeric(2,1),
  add column if not exists stability numeric(2,1),
  add column if not exists traction numeric(2,1),
  add column if not exists fit numeric(2,1);

-- 2. Migrate the old single value to all 6 columns (only when target is empty).
update shoe_ratings
   set cushioning_feel = coalesce(cushioning_feel, rating),
       court_feel      = coalesce(court_feel, rating),
       bounce          = coalesce(bounce, rating),
       stability       = coalesce(stability, rating),
       traction        = coalesce(traction, rating),
       fit             = coalesce(fit, rating)
 where rating is not null;

-- 3. Add range + 0.5 increment checks per column.
alter table shoe_ratings
  add constraint shoe_ratings_cf_check
    check (cushioning_feel is null or (cushioning_feel between 0.5 and 5.0
           and (cushioning_feel * 2) = floor(cushioning_feel * 2))),
  add constraint shoe_ratings_court_check
    check (court_feel is null or (court_feel between 0.5 and 5.0
           and (court_feel * 2) = floor(court_feel * 2))),
  add constraint shoe_ratings_bounce_check
    check (bounce is null or (bounce between 0.5 and 5.0
           and (bounce * 2) = floor(bounce * 2))),
  add constraint shoe_ratings_stability_check
    check (stability is null or (stability between 0.5 and 5.0
           and (stability * 2) = floor(stability * 2))),
  add constraint shoe_ratings_traction_check
    check (traction is null or (traction between 0.5 and 5.0
           and (traction * 2) = floor(traction * 2))),
  add constraint shoe_ratings_fit_check
    check (fit is null or (fit between 0.5 and 5.0
           and (fit * 2) = floor(fit * 2)));

-- 4. After migration, all rows have the 6 columns populated; require NOT NULL.
alter table shoe_ratings
  alter column cushioning_feel set not null,
  alter column court_feel      set not null,
  alter column bounce          set not null,
  alter column stability       set not null,
  alter column traction        set not null,
  alter column fit             set not null;

-- 5. Drop the legacy single rating column.
alter table shoe_ratings drop column if exists rating;
