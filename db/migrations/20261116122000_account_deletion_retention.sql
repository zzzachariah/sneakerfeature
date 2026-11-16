-- Account deletion: keep financial records (anonymized) and never block deletion.
--
-- * stripe_payments / ai_payment_orders previously CASCADE-deleted with the
--   account, destroying the records needed for accounting, refunds and
--   chargeback disputes. They now survive with user_id set to NULL, so they no
--   longer identify the person.
-- * shoes.created_by was ON DELETE NO ACTION, which made deleting any account
--   that ever created a catalogue entry fail outright.

do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and (c.conrelid, a.attname) in (
        ('public.stripe_payments'::regclass, 'user_id'),
        ('public.ai_payment_orders'::regclass, 'user_id'),
        ('public.shoes'::regclass, 'created_by'))
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
    execute format('alter table %s add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
                   r.tbl, r.conname, r.col);
  end loop;
end $$;
