-- Fix live mutation catalog after sort_order removal.
-- Drop first because PostgreSQL cannot change OUT row types in-place.
drop function if exists public.get_gem_index_mutation_catalog_v3();

alter table public.game_mutations drop column if exists sort_order;

create function public.get_gem_index_mutation_catalog_v3()
returns table (
  id text, name text, chance numeric, multiplier numeric, description text,
  description_credit text, icon text, color text, enabled boolean
) language sql stable security definer set search_path = public as $$
  select m.id,m.name,m.chance,m.multiplier,m.description,
         coalesce(m.description_credit,''),m.icon,m.color,m.enabled
  from public.game_mutations m
  where m.enabled=true
  order by m.multiplier asc, m.name asc, m.id asc;
$$;

grant execute on function public.get_gem_index_mutation_catalog_v3() to authenticated, anon, service_role;

create or replace function public.get_active_mutation_effects()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(effect order by (effect->>'name'))
    from (values
      (case when coalesce(p.misty_mutation_boost_rolls,0)>0 then jsonb_build_object('id','misty','name','Misty Mutation Surge','multiplier',power(2.5,coalesce(p.misty_mutation_boost_stacks,1)),'rollsRemaining',p.misty_mutation_boost_rolls,'description','Mutation chance boosted') end),
      (case when coalesce(p.ancient_relic_boost_rolls,0)>0 then jsonb_build_object('id','ancient','name','Ancient Relic Hunt','multiplier',1.3,'rollsRemaining',p.ancient_relic_boost_rolls,'description','Ancient Relic chance boosted') end),
      (case when coalesce(p.enchanted_relic_boost_rolls,0)>0 then jsonb_build_object('id','enchanted','name','Enchanted Relic Hunt','multiplier',1.1,'rollsRemaining',p.enchanted_relic_boost_rolls,'description','All relic chances boosted') end)
    ) effects(effect) where effect is not null
  ),'[]'::jsonb) from public.players p where p.id=auth.uid();
$$;
grant execute on function public.get_active_mutation_effects() to authenticated;
notify pgrst,'reload schema';
