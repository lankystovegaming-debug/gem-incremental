begin;

-- Gem Index V3: the public mutation catalog used by the browser.
-- This intentionally has a new function name and only selects columns the
-- Gem Index actually needs. It is SECURITY DEFINER so public players can see
-- admin-created mutations without exposing write access to game_mutations.
create or replace function public.get_gem_index_mutation_catalog_v3()
returns table (
  id text,
  name text,
  chance numeric,
  multiplier numeric,
  description text,
  icon text,
  color text,
  enabled boolean,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.name,
    m.chance,
    m.multiplier,
    m.description,
    m.icon,
    m.color,
    m.enabled,
    m.sort_order
  from public.game_mutations m
  where m.enabled = true
  order by m.sort_order asc, m.name asc, m.id asc;
$$;

revoke all on function public.get_gem_index_mutation_catalog_v3() from public;
grant execute on function public.get_gem_index_mutation_catalog_v3() to anon, authenticated;

-- Make sure the table can also be read directly by the browser as a
-- compatibility fallback. RLS still limits that path to enabled rows.
alter table if exists public.game_mutations enable row level security;
drop policy if exists game_mutations_enabled_public_read on public.game_mutations;
create policy game_mutations_enabled_public_read
  on public.game_mutations
  for select
  to anon, authenticated
  using (enabled = true);

grant select (
  id, name, chance, multiplier, description, icon, color, enabled, sort_order
)
on public.game_mutations to anon, authenticated;

notify pgrst, 'reload schema';

commit;
