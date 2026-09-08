-- Mutation catalog: multiplier is the only display ordering.
-- Temporary mutation effects are exposed as player-visible state.

create or replace function public.get_gem_index_mutation_catalog_v3()
returns table (
  id text, name text, chance numeric, multiplier numeric, description text,
  icon text, color text, enabled boolean, sort_order integer
) language sql stable security definer set search_path = public as $$
  select m.id,m.name,m.chance,m.multiplier,m.description,m.icon,m.color,m.enabled,m.sort_order
  from public.game_mutations m
  where m.enabled=true
  order by m.multiplier desc, m.name asc, m.id asc;
$$;

-- Read-only RPC for active temporary mutation effects.
create or replace function public.get_active_mutation_effects()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(effect)
    from (values
      (case when p.misty_mutation_boost_rolls > 0 then jsonb_build_object(
        'id','misty','name','Misty Mutation Surge','multiplier',power(2.5,p.misty_mutation_boost_stacks),
        'rollsRemaining',p.misty_mutation_boost_rolls,'description','Mutation chance boosted') end),
      (case when p.ancient_relic_boost_rolls > 0 then jsonb_build_object(
        'id','ancient','name','Ancient Relic Hunt','multiplier',1.3,
        'rollsRemaining',p.ancient_relic_boost_rolls,'description','Ancient Relic chance boosted') end),
      (case when p.enchanted_relic_boost_rolls > 0 then jsonb_build_object(
        'id','enchanted','name','Enchanted Relic Hunt','multiplier',1.1,
        'rollsRemaining',p.enchanted_relic_boost_rolls,'description','All relic chances boosted') end)
    ) as effects(effect)
    where effect is not null
  ), '[]'::jsonb)
  from public.players p where p.id=auth.uid();
$$;
grant execute on function public.get_active_mutation_effects() to authenticated;
notify pgrst, 'reload schema';
