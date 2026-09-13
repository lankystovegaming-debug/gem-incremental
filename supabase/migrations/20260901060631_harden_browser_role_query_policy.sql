-- Browser roles only need ordinary Data API privileges. Remove database-level
-- capabilities that RLS does not meaningfully protect or the browser cannot use.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- This permissive policy made the existing owner-only SELECT policy ineffective
-- and exposed every column of every player row to any authenticated session.
drop policy if exists "Authenticated users can read player usernames"
  on public.players;

-- Supabase grants EXECUTE to PUBLIC by default. Remove anonymous execution from
-- privileged, non-read entry points while retaining intentional get_*/catalog
-- projections needed by logged-out public pages. Authenticated application
-- sessions retain their existing grants in this first hardening phase.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname !~ '^(get_|am_i_|share_index_price$|share_price_at$|submit_bug_report$)'
  loop
    execute format('revoke execute on function %s from public, anon', v_function);
  end loop;
end
$$;

-- Prevent future public-schema functions from silently becoming callable by
-- browser roles. Migrations must grant each intended API function explicitly.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
