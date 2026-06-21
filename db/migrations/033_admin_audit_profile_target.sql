-- Allow audit-logging admin actions that target a member profile (e.g. role
-- promote/demote from the new /admin/users console). The original check
-- constraint only permitted submission / shoe / admin_session targets.
--
-- The role-change endpoint logs best-effort, so the console keeps working even
-- before this migration is applied — applying it just lets those entries land.

alter table admin_audit_logs
  drop constraint if exists admin_audit_logs_target_type_check;

alter table admin_audit_logs
  add constraint admin_audit_logs_target_type_check
  check (target_type in ('submission', 'shoe', 'admin_session', 'profile'));
