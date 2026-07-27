-- 047_subscription_source.sql
--
-- Where a membership CAME FROM: a real Stripe payment, or a gift.
--
-- Until now a comped/gifted Pro was byte-for-byte identical to a purchased one,
-- which caused two problems:
--   1. The admin "Refund" button was offered for gifted memberships. It then
--      refunded the member's most recent `paid` stripe_payments row — which for
--      a gifted member is a PREVIOUS, fully-consumed purchase. Real money left
--      the account for a membership term that had already been delivered.
--   2. Nothing in the UI told the member (or the admin) that the membership was
--      a gift, so "why can't I get a refund?" had no visible answer.
--
-- `subscription_source` closes both: refunds are gated on 'paid', and every
-- membership surface can label a gift as a gift.
--
-- Values:
--   'paid' — granted by a completed Stripe Checkout Session (grantFromPayment).
--   'gift' — comped by an admin (setSubscription) or handed out by the bulk
--            全站送会员 flow (giftAllMembers). Never refundable.
--   NULL   — no paid tier (free member), or a pre-047 row we couldn't classify.
--
-- Money is never downgraded: once a membership is 'paid', a later gift that
-- extends or upgrades it KEEPS 'paid', so the buyer stays refundable. Only
-- revokeSubscription (cancel / refund / dispute) clears the column back to NULL.

alter table profiles
  add column if not exists subscription_source text
    check (subscription_source is null or subscription_source in ('paid', 'gift'));

comment on column profiles.subscription_source is
  'paid = bought via Stripe (refundable) | gift = comped/bulk-gifted (never refundable) | NULL = free tier';

-- Backfill existing paid tiers: anyone with a settled Stripe payment on file is
-- treated as a buyer, everyone else as a gift recipient. Deliberately generous
-- towards 'paid' — mislabelling a buyer as a gift would silently strip their
-- right to a refund, while the reverse merely leaves the refund button enabled.
update profiles p
set subscription_source = case
      when exists (
        select 1 from stripe_payments s
        where s.user_id = p.id and s.status = 'paid'
      ) then 'paid'
      else 'gift'
    end
where p.subscription_tier in ('pro', 'max')
  and p.subscription_source is null;

-- Lets the admin console filter "who is on a gifted plan" without a table scan.
create index if not exists idx_profiles_subscription_source
  on profiles (subscription_source)
  where subscription_source is not null;
