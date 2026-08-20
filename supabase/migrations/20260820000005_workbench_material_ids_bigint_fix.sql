-- =========================================================
-- Workbench material_ids type fix
--
-- forge_sessions.material_ids was declared uuid[], but
-- inventory_gems.id is bigint (see delete-gem / toggle-gem-lock,
-- which both coerce specimenId with Number()). Every "start" call
-- to the Workbench Edge Function therefore tried to insert bigint
-- gem ids into a uuid[] column and failed with
-- "invalid input syntax for type uuid", which the function reports
-- as a 500 workbench_server_error.
--
-- No session has ever been able to insert successfully under the
-- old type, so there is no existing data to migrate — this simply
-- corrects the column type. Guarded so it is safe to re-run and a
-- no-op once already applied.
-- =========================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'forge_sessions'
      and column_name = 'material_ids'
      and udt_name = '_uuid'
  ) then
    alter table public.forge_sessions
      alter column material_ids type bigint[] using '{}'::bigint[];
  end if;
end
$$;

alter table public.forge_sessions
  alter column material_ids set default '{}'::bigint[];
