-- Qualify the value returned by jsonb_each. jsonb_array_elements also exposes
-- a column named value, so the previous unqualified reference was ambiguous.

create or replace function public.compile_research_effects_v014(p_player_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e jsonb; f jsonb;
begin
  select coalesce(jsonb_agg(n.effects),'[]'::jsonb) into e
  from public.player_research_purchases p join public.research_nodes n on n.id=p.node_id
  where p.player_id=p_player_id and n.enabled;
  select coalesce(jsonb_object_agg(x.key,true),'{}'::jsonb) into f
  from (
    select distinct property.value#>>'{}' key
    from jsonb_array_elements(e) as effect(entry)
    cross join lateral jsonb_each(effect.entry) as property(key,value)
    where property.key in('flag','cosmetic')
  ) x;
  insert into public.player_research_effects(
    player_id,luck_multiplier,legendary_luck_multiplier,extreme_luck_multiplier,window_luck_multiplier,
    roll_speed_multiplier,weight_luck_multiplier,gem_value_multiplier,mutation_chance_multiplier,
    mutated_value_multiplier,compound_value_per_mutation,potion_duration_multiplier,potion_strength_multiplier,
    potion_duplicate_chance,masterwork_discount,masterwork_effect_multiplier,inventory_bonus,season_xp_multiplier,
    expedition_discount,statistical_breakthrough,flags,compiled_at)
  select p_player_id,
    1+coalesce(sum((v->>'luck')::numeric),0),1+coalesce(sum((v->>'legendaryLuck')::numeric),0),
    1+coalesce(sum((v->>'extremeLuck')::numeric),0),1+coalesce(sum((v->>'windowLuck')::numeric),0),
    1+coalesce(sum((v->>'speed')::numeric),0),1+coalesce(sum((v->>'weight')::numeric),0),
    1+coalesce(sum((v->>'value')::numeric),0),1+coalesce(sum((v->>'mutationChance')::numeric),0),
    1+coalesce(sum((v->>'mutatedValue')::numeric),0),coalesce(sum((v->>'compoundPerMutation')::numeric),0),
    1+coalesce(sum((v->>'potionDuration')::numeric),0),1+coalesce(sum((v->>'potionStrength')::numeric),0),
    coalesce(sum((v->>'potionDuplicate')::numeric),0),coalesce(sum((v->>'masterworkDiscount')::numeric),0),
    1+coalesce(sum((v->>'masterworkEffect')::numeric),0),coalesce(sum((v->>'inventory')::integer),0),
    1+coalesce(sum((v->>'seasonXp')::numeric),0),coalesce(sum((v->>'expeditionDiscount')::numeric),0),
    coalesce(bool_or((v->>'statisticalBreakthrough')::boolean),false),f,now()
  from jsonb_array_elements(e) v
  on conflict(player_id) do update set
    luck_multiplier=excluded.luck_multiplier,legendary_luck_multiplier=excluded.legendary_luck_multiplier,
    extreme_luck_multiplier=excluded.extreme_luck_multiplier,window_luck_multiplier=excluded.window_luck_multiplier,
    roll_speed_multiplier=excluded.roll_speed_multiplier,weight_luck_multiplier=excluded.weight_luck_multiplier,
    gem_value_multiplier=excluded.gem_value_multiplier,mutation_chance_multiplier=excluded.mutation_chance_multiplier,
    mutated_value_multiplier=excluded.mutated_value_multiplier,compound_value_per_mutation=excluded.compound_value_per_mutation,
    potion_duration_multiplier=excluded.potion_duration_multiplier,potion_strength_multiplier=excluded.potion_strength_multiplier,
    potion_duplicate_chance=excluded.potion_duplicate_chance,masterwork_discount=excluded.masterwork_discount,
    masterwork_effect_multiplier=excluded.masterwork_effect_multiplier,inventory_bonus=excluded.inventory_bonus,
    season_xp_multiplier=excluded.season_xp_multiplier,expedition_discount=excluded.expedition_discount,
    statistical_breakthrough=excluded.statistical_breakthrough,flags=excluded.flags,compiled_at=excluded.compiled_at;
end$$;
