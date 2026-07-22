-- 046_stripe_payment_refunds.sql
--
-- Stripe one-time membership payments + refund / cancellation support.
--
-- The stripe_payments table records every completed Checkout Session (see
-- lib/stripe/fulfill.ts) and is the idempotency claim for fulfilment: whoever
-- inserts the session_id row first performs the grant. This migration finally
-- gives that table a definition (it had none) AND adds the columns the refund /
-- cancellation flow needs:
--   * payment_intent_id — lets us issue a Stripe refund later and match refund
--     / dispute webhooks back to the originating payment.
--   * status — widened to 'refunded' | 'partially_refunded' | 'disputed'.
--   * refund bookkeeping (refund_id, refund_reason, refunded_at, refunded_by).
--
-- A refund (admin-initiated, or a Stripe-Dashboard refund / chargeback that
-- arrives by webhook) reverts the member to the free tier; the tier-change lock
-- policy then unlocks new purchases again.

create table if not exists stripe_payments (
  session_id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  tier text not null,
  duration text not null,
  amount_total bigint,
  currency text,
  status text not null default 'paid',
  payment_intent_id text,
  refund_id text,
  refund_reason text,
  refunded_at timestamptz,
  refunded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Additive columns for databases where stripe_payments already existed before
-- this migration (created out-of-band). Each is a no-op if already present.
alter table stripe_payments
  add column if not exists payment_intent_id text,
  add column if not exists refund_id text,
  add column if not exists refund_reason text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid references profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Allow the refund / dispute states. Drop the auto-named check first so re-runs
-- and any pre-existing table converge on the same constraint.
alter table stripe_payments drop constraint if exists stripe_payments_status_check;
alter table stripe_payments add constraint stripe_payments_status_check
  check (status in ('paid', 'refunded', 'partially_refunded', 'disputed'));

create index if not exists idx_stripe_payments_user_created
  on stripe_payments (user_id, created_at desc);
create index if not exists idx_stripe_payments_payment_intent
  on stripe_payments (payment_intent_id);

alter table stripe_payments enable row level security;

-- Members may read their own payment history; admins read everything. All writes
-- go through the service-role client, so there is no user INSERT/UPDATE policy.
drop policy if exists "User reads own payments" on stripe_payments;
create policy "User reads own payments" on stripe_payments
  for select using (auth.uid() = user_id);

drop policy if exists "Admin reads all payments" on stripe_payments;
create policy "Admin reads all payments" on stripe_payments
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
