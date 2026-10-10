-- Compatible with the currently deployed website: backend service calls keep working.
begin;
revoke all on function public.refresh_allowance(uuid, int, bigint) from public, anon, authenticated;
revoke all on function public.spend_allowance(uuid, int, int, bigint) from public, anon, authenticated;
grant execute on function public.refresh_allowance(uuid, int, bigint) to service_role;
grant execute on function public.spend_allowance(uuid, int, int, bigint) to service_role;
commit;
