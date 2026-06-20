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
-- 运行顺序：PART 0 先确认/补回你自己的账号 → PART 1 预览要删多少 → PART 2 删除。
-- Order: PART 0 (find/restore your own account) → PART 1 (preview) → PART 2 (delete).
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 脚本零 / PART 0 — 先确认你的账号还在不在，不在就补回来                     ║
-- ║ PART 0 — check whether your account still has a profile row; restore it    ║
-- ║ if missing. (You can still log in via auth.users even with NO profile row.)║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 0a. 关键诊断：你的 auth 用户有没有对应的 profiles 行？
--     Key diagnosis: does your auth user have a matching profiles row?
--     读结果：profile_id 有值 = profile 还在（只是被 110 万垃圾淹没，PART 1a 能查到）；
--             profile_id 为 NULL = profile 丢了 / 从未建过，跑 0b 补回来。
select u.id            as auth_user_id,
       u.email,
       u.created_at    as auth_created_at,
       u.last_sign_in_at,
       p.id            as profile_id,   -- NULL = 没有 profile 行
       p.username,
       p.role
from auth.users u
left join public.profiles p on p.id = u.id
where u.email ilike 'zzzachariah9828@gmail.com';   -- 👈 你自己的邮箱

-- 0b. 仅当 0a 的 profile_id 是 NULL 时才运行：把你的 profile 补回来并设为 admin。
--     Run ONLY if 0a showed profile_id = NULL: recreate your profile as admin.
--     用户名必须唯一；若 'zachariah' 已被占用就换一个。幂等：已存在则只修正 role。
-- insert into public.profiles (id, username, email, role)
-- select u.id, 'zachariah', u.email, 'admin'         -- 👈 改成你想要的用户名
-- from auth.users u
-- where u.email ilike 'zzzachariah9828@gmail.com'     -- 👈 你自己的邮箱
-- on conflict (id) do update
--   set role = 'admin', email = excluded.email;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 脚本一 / PART 1 — 预览（只读，不改任何数据）                               ║
-- ║ PART 1 — preview only (read-only, changes nothing). 整段一起运行。        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1a. 在 profiles 里找到你自己的账号，记下 id（PART 2 会把它列入保护名单）。
--     若这里查不到、但 PART 0a 显示 auth 里有你 → 你的 profile 丢了，先跑 0b 补回来。
--     Find YOUR OWN profile row and copy its id (protected in PART 2). If this
--     returns nothing but PART 0a found you in auth, your profile is missing — run 0b.
select id, username, email, role, created_at
from public.profiles
where email ilike 'zzzachariah9828@gmail.com';   -- 👈 你自己的邮箱/用户名

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
--     默认值即可直接运行。只有当 will_delete 明显小于预期（~1.1M）时，才需要把
--     下面的时间窗放宽（例如把 until 往后挪到 2026-06-30）。其余无需改动。
select count(*) as will_delete
from public.profiles p
join auth.users u on u.id = p.id
where p.created_at >= timestamptz '2026-06-19 00:00:00+00'   -- 窗口开始 (since)
  and p.created_at <  timestamptz '2026-06-21 00:00:00+00'   -- 窗口结束 (until)
  and u.last_sign_in_at is null                              -- 从未登录过（真实用户注册后会自动登录一次，必有值）
  and p.email not ilike 'zzzachariah9828@gmail.com'          -- 保护你自己的账号
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
-- ║ 默认值已可直接用：确认 PART 1 的数字 OK 后，【整段一起运行】即可。        ║
-- ║ Defaults are ready — once PART 1's number looks right, run this WHOLE block║
-- ║ (临时表 spam_suspects 只在同一次执行内有效；时间窗若在 PART 1 调过，这里同步).║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1) 把所有符合条件的"疑似垃圾号"收进一张临时表（条件与 PART 1d 完全一致）。
create temp table spam_suspects as
select p.id
from public.profiles p
join auth.users u on u.id = p.id
where p.created_at >= timestamptz '2026-06-19 00:00:00+00'   -- 与 PART 1d 一致
  and p.created_at <  timestamptz '2026-06-21 00:00:00+00'   -- 与 PART 1d 一致
  and u.last_sign_in_at is null                              -- 从未登录过（真实用户注册后会自动登录一次，必有值）
  and p.email not ilike 'zzzachariah9828@gmail.com'          -- 保护你自己的账号
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
where p.email ilike 'zzzachariah9828@gmail.com';   -- 👈 你自己的邮箱

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
where email ilike 'zzzachariah9828@gmail.com';   -- 👈 你自己的邮箱
