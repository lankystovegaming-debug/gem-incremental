begin;

-- @supabase/server's admin client may authenticate with an opaque sb_secret_
-- key. PostgREST still executes it as service_role, but there is no legacy JWT
-- payload from which to populate request.jwt.claim.role. Remove that redundant
-- body guard while preserving each function's current implementation exactly.
-- Function EXECUTE privileges remain the authorization boundary.
do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_rewritten text;
  v_legacy_guard constant text := $guard$  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
$guard$;
begin
  foreach v_function in array array[
    'public.roll_prepare_context(uuid,timestamptz,bigint,bigint)'::regprocedure,
    'public.roll_finish_bookkeeping(uuid,text,jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(v_function) into v_definition;
    v_rewritten := replace(v_definition, v_legacy_guard, '');

    if v_rewritten = v_definition then
      raise exception 'legacy service-role guard not found in %', v_function;
    end if;

    execute v_rewritten;
  end loop;
end;
$migration$;

revoke all on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint)
  to service_role;

revoke all on function public.roll_finish_bookkeeping(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.roll_finish_bookkeeping(uuid, text, jsonb)
  to service_role;

commit;
