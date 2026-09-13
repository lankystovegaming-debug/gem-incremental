begin;

-- @supabase/server's admin client may authenticate with an opaque sb_secret_
-- key. PostgREST still executes it as service_role, but there is no legacy JWT
-- payload from which to populate request.jwt.claim.role. Function ACLs are the
-- actual authorization boundary, so keep them explicit and supply the legacy
-- setting only inside these already service-role-only functions.
revoke all on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint)
  to service_role;
alter function public.roll_prepare_context(uuid, timestamptz, bigint, bigint)
  set "request.jwt.claim.role" = 'service_role';

revoke all on function public.roll_finish_bookkeeping(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.roll_finish_bookkeeping(uuid, text, jsonb)
  to service_role;
alter function public.roll_finish_bookkeeping(uuid, text, jsonb)
  set "request.jwt.claim.role" = 'service_role';

commit;
