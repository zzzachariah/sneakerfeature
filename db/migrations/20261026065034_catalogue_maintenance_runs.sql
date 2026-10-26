-- Public, deliberately sanitized snapshots of catalogue maintenance results.
-- Raw admin_audit_logs and user data remain private and are never queried by
-- the public updates page. Only the trusted maintenance writer publishes rows.
create table public.catalogue_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  scheduled_for date not null,
  completed_at timestamptz not null,
  status text not null check (status in ('completed', 'partial', 'failed')),
  report jsonb not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogue_maintenance_report_shape check (
    jsonb_typeof(report) = 'object'
    and report->>'version' = '1'
    and jsonb_typeof(report->'title') = 'object'
    and jsonb_typeof(report->'summary') = 'object'
    and jsonb_typeof(report->'counts') = 'object'
    and jsonb_typeof(report->'entries') = 'array'
    and octet_length(report::text) <= 2097152
  )
);

create index catalogue_maintenance_runs_public_date_idx
  on public.catalogue_maintenance_runs (scheduled_for desc, completed_at desc)
  where is_published;

alter table public.catalogue_maintenance_runs enable row level security;

revoke all on public.catalogue_maintenance_runs from anon, authenticated;
grant select on public.catalogue_maintenance_runs to anon, authenticated;
grant select, insert, update, delete on public.catalogue_maintenance_runs to service_role;

create policy "Read published catalogue maintenance results"
  on public.catalogue_maintenance_runs for select to anon, authenticated
  using (is_published and completed_at <= now());

comment on table public.catalogue_maintenance_runs is
  'Sanitized bilingual public catalogue updates; never store raw audit, account, private submission or secret data.';
