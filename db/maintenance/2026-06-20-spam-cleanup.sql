-- ============================================================================
-- 一次性清理：2026-06-20 凌晨机器人批量注册的垃圾账号
-- One-off cleanup of the bot mass-signup spam (burst ~2026-06-20 02:00 UTC,
-- >40,000 requests/hour). ~1.1M fake @outlook.* accounts in auth.users +
-- public.profiles.
--
-- 在 Supabase Dashboard → SQL Editor 里运行。
-- Run in Supabase Dashboard → SQL Editor.
--
-- ⚠️ 删除不可逆。开始前务必先在 Dashboard → Database → Backups 做一次快照/备份。
-- ⚠️ Deletions are irreversible. Take a snapshot (Database → Backups) FIRST.
--
-- 思路 / How it works:
--   * 只删 auth.users（删它会通过外键级联自动删掉 public.profiles 和该用户的
--     所有内容；同时清掉撑高 MAU 计费的 1.1M 个 auth 用户）。
--     Delete from auth.users only — the FK `profiles.id references auth.users(id)
--     on delete cascade` removes the profile (and all that user's content) too,
--     and clears the inflated Auth-user count that drives MAU billing.
--   * 多重安全闸：时间窗 + 从未登录过 + outlook 域名 + 非管理员 + 零活动 +
--     排除你自己的 id。只有"在攻击时间窗内注册、从没登录过、也从没发过任何
--     评论/投稿/收藏/评分/支付"的账号才会被删。任何真正登录过网站、或有过任何
--     活动的真实用户（哪怕也是 outlook 邮箱）都不会被删。
--     Multiple guards: time window + NEVER signed in + outlook domain + non-admin
--     + ZERO activity + your own id excluded. Any account that ever logged in or
--     did anything at all is left untouched.
--
-- 分两步运行：先跑【脚本一】预览确认，再跑【脚本二】删除。
-- Two parts: run PART 1 (preview) first, eyeball the numbers, then run PART 2.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 脚本一 / PART 1 — 预览（只读，不改任何数据）                               ║
-- ║ PART 1 — preview only (read-only, changes nothing). 整段一起运行。        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1a. 找到你自己的账号，记下 id（下面 PART 2 要把它列入保护名单）。
--     Find YOUR OWN account and copy its id (you'll protect it in PART 2).
--     把邮箱换成你自己的；这里预填了登录上下文里的邮箱作为示例。
select id, username, email, role, created_at
from public.profiles
where email ilike 'mathilde_aperiamov@mail.com';   -- 👈 改成你自己的邮箱/用户名

-- 1b. 看注册量按小时分布，确认攻击爆发的时间窗（应能看到 6/20 凌晨的尖峰）。
--     Registrations per hour — confirm the attack burst window.
select date_trunc('hour', created_at) as hour, count(*) as signups
from public.profiles
group by 1
order by signups desc
limit 24;

-- 1c. 按邮箱域名统计，确认垃圾号确实是 outlook 系。
--     Counts by email domain — confirm the spam really is outlook-family.
select split_part(lower(email), '@', 2) as domain, count(*)
from public.profiles
group by 1
order by count desc
limit 20;

-- 1d. 按"将被删除"的完整条件，预览到底会删多少条（务必先看这个数字！）。
--     Preview EXACTLY how many rows the delete below would remove. CHECK THIS!
--     ↓↓↓ 改这 3 个值，要和 PART 2 里完全一致 ↓↓↓
select count(*) as will_delete
from public.profiles p
join auth.users u on u.id = p.id
where p.created_at >= timestamptz '2026-06-19 00:00:00+00'   -- 👈 窗口开始 (since)
  and p.created_at <  timestamptz '2026-06-21 00:00:00+00'   -- 👈 窗口结束 (until)
  and u.last_sign_in_at is null                              -- 从未登录过（真实用户注册后会自动登录一次，必有值）
  and p.id <> '00000000-0000-0000-0000-000000000000'         -- 👈 换成你自己的 user id（1a 查到的）
  and p.role <> 'admin'
  and (lower(p.email) like '%@outlook.%'
       or lower(p.email) like '%@hotmail.%'
       or lower(p.email) like '%@live.%'
       or lower(p.email) like '%@msn.com')
  and not exists (select 1 from public.comments          t where t.user_id = p.id)
  and not exists (select 1 from public.user_submissions  t where t.user_id = p.id)
  and not exists (select 1 from public.saved_comparisons t where t.user_id = p.id)
  and not exists (select 1 from public.comment_votes     t where t.user_id = p.id)
  and not exists (select 1 from public.shoe_ratings      t where t.user_id = p.id)
  and not exists (select 1 from public.favorites         t where t.user_id = p.id)
  and not exists (select 1 from public.foot_scans        t where t.user_id = p.id)
  and not exists (select 1 from public.ai_payment_orders t where t.user_id = p.id);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 脚本二 / PART 2 — 删除（不可逆！先备份！）                                ║
-- ║ PART 2 — the delete (irreversible! back up first!).                       ║
-- ║ 把下面 3 个 👈 占位值改成和 PART 1 一致，然后【整段一起运行】。           ║
-- ║ Edit the 3 placeholders to match PART 1, then run this WHOLE block at once ║
-- ║ (临时表 spam_suspects 只在同一次执行内有效).                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1) 把所有符合条件的"疑似垃圾号"收进一张临时表（单一事实来源）。
create temp table spam_suspects as
select p.id
from public.profiles p
join auth.users u on u.id = p.id
where p.created_at >= timestamptz '2026-06-19 00:00:00+00'   -- 👈 与 PART 1 一致
  and p.created_at <  timestamptz '2026-06-21 00:00:00+00'   -- 👈 与 PART 1 一致
  and u.last_sign_in_at is null                              -- 从未登录过（真实用户注册后会自动登录一次，必有值）
  and p.id <> '00000000-0000-0000-0000-000000000000'         -- 👈 你自己的 user id
  and p.role <> 'admin'
  and (lower(p.email) like '%@outlook.%'
       or lower(p.email) like '%@hotmail.%'
       or lower(p.email) like '%@live.%'
       or lower(p.email) like '%@msn.com')
  and not exists (select 1 from public.comments          t where t.user_id = p.id)
  and not exists (select 1 from public.user_submissions  t where t.user_id = p.id)
  and not exists (select 1 from public.saved_comparisons t where t.user_id = p.id)
  and not exists (select 1 from public.comment_votes     t where t.user_id = p.id)
  and not exists (select 1 from public.shoe_ratings      t where t.user_id = p.id)
  and not exists (select 1 from public.favorites         t where t.user_id = p.id)
  and not exists (select 1 from public.foot_scans        t where t.user_id = p.id)
  and not exists (select 1 from public.ai_payment_orders t where t.user_id = p.id);

create index on spam_suspects (id);

-- 2) 最后一道保险：确认你自己的账号【不在】待删集合里（必须返回 0 行）。
--    Safety check: your own account must NOT be in the suspect set (expect 0 rows).
select p.id, p.username, p.email
from public.profiles p
join spam_suspects s on s.id = p.id
where p.email ilike 'mathilde_aperiamov@mail.com';   -- 👈 你自己的邮箱

-- 3) 分批删除 auth.users（每批 5000，避免长事务/超时）。
--    级联会自动删掉对应的 profiles 和该用户的所有内容。
--    Batched delete from auth.users (5000/batch). Cascades to profiles + content.
--    进度通过 RAISE NOTICE 打到 SQL Editor 的 "Messages" 里。
do $$
declare
  removed int;
  total   int := 0;
begin
  loop
    with batch as (
      select id from spam_suspects limit 5000
    ), del_auth as (
      delete from auth.users u using batch b where u.id = b.id returning u.id
    )
    delete from spam_suspects s using batch b where s.id = b.id;

    get diagnostics removed = row_count;
    total := total + removed;
    raise notice 'cleared % (running total %)', removed, total;
    exit when removed = 0;
  end loop;
  raise notice 'DONE. removed % spam accounts', total;
end $$;

drop table if exists spam_suspects;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 脚本三 / PART 3 — 删除后核对                                              ║
-- ║ PART 3 — verify after cleanup.                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
select
  (select count(*) from public.profiles) as profiles_left,
  (select count(*) from auth.users)      as auth_users_left;

-- 你的账号应该还在：
select id, username, email, role from public.profiles
where email ilike 'mathilde_aperiamov@mail.com';   -- 👈 你自己的邮箱
