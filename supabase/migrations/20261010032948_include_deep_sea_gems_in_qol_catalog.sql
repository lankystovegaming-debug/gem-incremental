begin;

-- Deep Sea discoveries use the same per-name Gem Filter rules as ordinary
-- gems, but the settings catalogue previously sourced only the ordinary
-- catalogue. Include enabled event gems after the player has discovered them.
create or replace function public.get_qol_gem_catalog()
returns table(name text, rarity numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with discovered as (
    select distinct d.gem_name
    from public.player_gem_mutation_combinations d
    where d.player_id = (select auth.uid())
  ), catalog as (
    select g.name, g.rarity::numeric as rarity
    from public.private_feature_gems g
    union all
    select g.name, g.rarity::numeric as rarity
    from public.deep_sea_gems g
    where g.enabled
  )
  select c.name, max(c.rarity)::numeric as rarity
  from catalog c
  join discovered d on d.gem_name = c.name
  group by c.name
  order by max(c.rarity), c.name;
$$;

revoke all on function public.get_qol_gem_catalog() from public, anon;
grant execute on function public.get_qol_gem_catalog() to authenticated;

comment on function public.get_qol_gem_catalog() is
  'Returns the signed-in player''s discovered ordinary and enabled Deep Sea gems for per-gem filter configuration.';

commit;
