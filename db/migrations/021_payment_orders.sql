-- Payment orders for AI credit purchases.
-- User flow: create pending order with 6-digit verification code, user pays via
-- WeChat/Alipay with the code as the remark, then uploads a screenshot of the
-- bill detail page. The server OCRs the screenshot and auto-grants credits if
-- both the expected amount and verification code are found; otherwise the
-- order is left for manual admin review.

-- Defensive: the ai_credits / ai_credit_transactions tables are used by
-- lib/ai/credits.ts but were not previously in a migration. Create them here
-- only if missing so a fresh database can stand up the full feature.
create table if not exists ai_credits (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists ai_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  delta int not null,
  reason text not null,
  package_label text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_credit_transactions_user_created
  on ai_credit_transactions (user_id, created_at desc);

alter table ai_credits enable row level security;
alter table ai_credit_transactions enable row level security;

create policy if not exists "User reads own credits" on ai_credits
  for select using (auth.uid() = user_id);
create policy if not exists "Admin reads all credits" on ai_credits
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy if not exists "User reads own credit txns" on ai_credit_transactions
  for select using (auth.uid() = user_id);
create policy if not exists "Admin reads all credit txns" on ai_credit_transactions
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Payment orders.
create table if not exists ai_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  package_id text not null,
  package_label text not null,
  credits int not null check (credits > 0),
  amount_yuan numeric(10, 2) not null check (amount_yuan > 0),
  verification_code text not null check (verification_code ~ '^[0-9]{6}$'),
  payment_method text not null check (payment_method in ('wechat', 'alipay')),
  status text not null check (status in (
    'pending', 'submitted', 'auto_approved', 'manual_approved', 'rejected', 'expired'
  )),
  screenshot_path text,
  ocr_raw_text text,
  ocr_amount_match boolean,
  ocr_code_match boolean,
  ocr_error text,
  rejection_reason text,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  expires_at timestamptz not null,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_payment_orders_user_created
  on ai_payment_orders (user_id, created_at desc);
create index if not exists idx_ai_payment_orders_status_created
  on ai_payment_orders (status, created_at desc);

alter table ai_payment_orders enable row level security;

create policy if not exists "User reads own payment orders" on ai_payment_orders
  for select using (auth.uid() = user_id);
create policy if not exists "Admin reads all payment orders" on ai_payment_orders
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Private bucket for payment screenshots. Reads only happen server-side via
-- the service-role client, so no SELECT policy is required for end users.
insert into storage.buckets (id, name, public)
values ('payment-screenshots', 'payment-screenshots', false)
on conflict (id) do update set public = excluded.public;
