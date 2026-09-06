begin;

CREATE OR REPLACE FUNCTION public.masterwork_equipment_beta(p_equipment_row_id bigint, p_action text, p_choice text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item public.player_equipment%rowtype;
  v_pool text[];
  v_candidates text[];
  v_next integer;
  v_money_mult numeric;
  v_relic_mult numeric;
  v_ancient_mult numeric;
  v_money numeric := 0;
  v_enchant integer := 0;
  v_ancient integer := 0;
  v_base_reroll numeric;
  v_base_relic integer;
  v_new_passive text;
  v_choices text[];
  v_count integer;
  v_balance double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if p_action = 'convert_relics' then
    v_money := 2000000;
    v_enchant := 12;
  else
    select * into v_item from public.player_equipment
    where id = p_equipment_row_id and player_id = v_uid for update;
    if not found then raise exception 'equipment_not_found'; end if;
    if v_item.tier < 10 then raise exception 'masterwork_tier_locked'; end if;

    v_pool := case v_item.category
      when 'pickaxe' then array['deep_survey','mutation_resonance','careful_extraction','steady_hand']
      when 'lantern' then array['overclocked_flame','potion_afterglow','focused_beam','flashpoint']
      when 'boots' then array['heavy_step','sure_footing','fortune_walker','trailblazer']
      else null end;
    if v_pool is null then raise exception 'invalid_equipment'; end if;

    v_money_mult := case
      when v_item.tier >= 17 then 3 when v_item.tier = 16 then 2.5 when v_item.tier = 15 then 2.2 when v_item.tier = 14 then 1.9 when v_item.tier >= 13 then 1.65
      when v_item.tier = 12 then 1.4
      when v_item.tier = 11 then 1.2
      else 1
    end;
    v_relic_mult := case when v_item.tier >= 17 then 2.25 when v_item.tier = 16 then 2 when v_item.tier = 15 then 1.8 when v_item.tier = 14 then 1.65 when v_item.tier >= 13 then 1.5 when v_item.tier = 12 then 1.3 when v_item.tier = 11 then 1.15 else 1 end;
    v_ancient_mult := case when v_item.tier >= 17 then 2 when v_item.tier = 16 then 1.85 when v_item.tier = 15 then 1.7 when v_item.tier = 14 then 1.55 when v_item.tier >= 13 then 1.4 when v_item.tier = 12 then 1.2 else 1 end;

    if p_action = 'upgrade' then
      if v_item.masterwork_level >= 5 then raise exception 'masterwork_maxed'; end if;
      v_next := v_item.masterwork_level + 1;
      v_money := (array[1000000,2500000,6000000,15000000,25000000])[v_next] * v_money_mult;
      v_enchant := ceil((array[2,4,6,8,10])[v_next] * v_relic_mult);
      v_ancient := ceil((array[0,0,1,1,3])[v_next] * v_ancient_mult);
      if v_next = 3 then
        v_new_passive := v_pool[1 + floor(random() * array_length(v_pool, 1))::integer];
      end if;
    elsif p_action in ('reroll','insight','imprint') then
      if v_item.masterwork_level < 3 or v_item.masterwork_choices is not null then raise exception 'passive_unavailable'; end if;
      v_base_reroll := (array[2000000,3500000,6000000,10000000,15000000])[least(v_item.masterwork_rerolls + 1, 5)];
      v_base_relic := (array[2,3,4,5,6])[least(v_item.masterwork_rerolls + 1, 5)];
      v_money := v_base_reroll * least(2, v_money_mult) * case when p_action = 'imprint' then 5 else 1 end;
      v_enchant := ceil(v_base_relic * v_relic_mult);
      v_ancient := case when p_action = 'insight' then 1 when p_action = 'imprint' then 3 else 0 end;
      select array_agg(x order by random()) into v_candidates from unnest(v_pool) x where x <> v_item.masterwork_passive;
      if p_action = 'reroll' then v_new_passive := v_candidates[1];
      elsif p_action = 'insight' then v_choices := v_candidates[1:3];
      else
        if p_choice is null or not (p_choice = any(v_pool)) or p_choice = v_item.masterwork_passive then raise exception 'invalid_passive'; end if;
        v_new_passive := p_choice;
      end if;
    elsif p_action = 'choose' then
      if v_item.masterwork_choices is null or not (p_choice = any(v_item.masterwork_choices)) then raise exception 'invalid_passive'; end if;
      update public.player_equipment set masterwork_passive = p_choice, masterwork_choices = null where id = v_item.id;
      return jsonb_build_object('equipment', (select to_jsonb(e) from public.player_equipment e where e.id = v_item.id));
    elsif p_action = 'attune' then
      if v_item.category <> 'pickaxe' or v_item.masterwork_level < 4 then raise exception 'attunement_locked'; end if;
      if p_choice is null or p_choice not in ('amplified','resonant','specialized') or p_choice is not distinct from v_item.masterwork_attunement then raise exception 'invalid_attunement'; end if;
      v_money := 10000000 * v_money_mult;
      v_enchant := ceil(5 * v_relic_mult);
      v_ancient := ceil(1 * v_ancient_mult);
    else raise exception 'invalid_action'; end if;
  end if;

  update public.players set money = money - v_money where id = v_uid and money >= v_money returning money into v_balance;
  if not found then raise exception 'not_enough_money'; end if;

  if v_enchant > 0 then
    with spent as (select id from public.inventory_gems where player_id=v_uid and gem_name='Enchant Relic' and not locked order by id limit v_enchant for update),
    deleted as (delete from public.inventory_gems where id in (select id from spent) returning id)
    select count(*) into v_count from deleted;
    if v_count <> v_enchant then raise exception 'not_enough_enchant_relics'; end if;
  end if;
  if v_ancient > 0 then
    with spent as (select id from public.inventory_gems where player_id=v_uid and gem_name='Ancient Relic' and not locked order by id limit v_ancient for update),
    deleted as (delete from public.inventory_gems where id in (select id from spent) returning id)
    select count(*) into v_count from deleted;
    if v_count <> v_ancient then raise exception 'not_enough_ancient_relics'; end if;
  end if;

  if p_action = 'convert_relics' then
    insert into public.inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,value,locked)
    values(v_uid,'Ancient Relic',1500,0,0,1,0,0,0,false);
    return jsonb_build_object('money',v_balance,'converted',true);
  elsif p_action = 'upgrade' then
    update public.player_equipment set masterwork_level=v_next,
      masterwork_passive=coalesce(v_new_passive,masterwork_passive),
      masterwork_passive_rank=case when v_next=3 then 1 when v_next>=4 then 2 else masterwork_passive_rank end,
      masterwork_perfected_at=case when v_next=5 then now() else masterwork_perfected_at end
    where id=v_item.id;
  elsif p_action in ('reroll','imprint') then
    update public.player_equipment set masterwork_passive=v_new_passive, masterwork_rerolls=masterwork_rerolls+1 where id=v_item.id;
  elsif p_action='insight' then
    update public.player_equipment set masterwork_choices=v_choices, masterwork_rerolls=masterwork_rerolls+1 where id=v_item.id;
  elsif p_action='attune' then
    update public.player_equipment set masterwork_attunement=p_choice where id=v_item.id;
  end if;

  return jsonb_build_object('money',v_balance,'spentMoney',v_money,'spentEnchantRelics',v_enchant,'spentAncientRelics',v_ancient,
    'equipment',(select to_jsonb(e) from public.player_equipment e where e.id=v_item.id));
end;
$function$

;

-- Locked recipes. Preserve progress on the revamped T13 recipe.
insert into public.game_recipes(id,recipe) values('bottomless-singularity', $recipe${"id":"bottomless-singularity","name":"Bottomless Singularity Bag","category":"bag","moneyCost":200000000,"includedSpecimens":true,"description":"Heavy specimens are included in the material totals. Each gem fills at most one specimen slot. Deposit specimens first; remaining space is reserved for them.","requirements":[{"type":"equipment","equipmentId":"singularity-vault"},{"id":"bottomless-singularity-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":600},{"id":"bottomless-singularity-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":200},{"id":"bottomless-singularity-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":10},{"id":"bottomless-singularity-exalted","type":"gem-count","label":"Exalted","minimumRarity":1000000,"maximumRarity":9999999,"amount":1},{"id":"bottomless-singularity-specimen-0","type":"specimen-condition","includedInBulk":true,"minimumRarity":1000,"minimumWeightMultiplier":4,"amount":10,"label":"10 Legendary+ ≥4× final weight (included in totals)"},{"type":"lifetime-rolls","rolls":200000}],"reward":{"id":"bottomless-singularity","name":"Bottomless Singularity Bag","category":"bag","tier":13,"bonus":{"weightMultiplier":1.2}}}$recipe$::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('event-horizon-vault', $recipe${"id":"event-horizon-vault","name":"Event Horizon Vault","category":"bag","moneyCost":325000000,"includedSpecimens":true,"description":"Heavy specimens are included in the material totals. Each gem fills at most one specimen slot. Deposit specimens first; remaining space is reserved for them.","requirements":[{"type":"equipment","equipmentId":"bottomless-singularity"},{"id":"event-horizon-vault-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":1500},{"id":"event-horizon-vault-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":500},{"id":"event-horizon-vault-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":25},{"id":"event-horizon-vault-exalted","type":"gem-count","label":"Exalted","minimumRarity":1000000,"maximumRarity":9999999,"amount":1},{"id":"event-horizon-vault-specimen-0","type":"specimen-condition","includedInBulk":true,"minimumRarity":1000,"minimumWeightMultiplier":5,"amount":20,"label":"20 Legendary+ ≥5× final weight (included in totals)"},{"id":"event-horizon-vault-specimen-1","type":"specimen-condition","includedInBulk":true,"minimumRarity":10000,"minimumWeightMultiplier":5,"amount":5,"label":"5 Mythic+ ≥5× final weight (included in totals)"},{"type":"lifetime-rolls","rolls":325000}],"reward":{"id":"event-horizon-vault","name":"Event Horizon Vault","category":"bag","tier":14,"bonus":{"weightMultiplier":1.35}}}$recipe$::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('omnidimensional-vault', $recipe${"id":"omnidimensional-vault","name":"Omnidimensional Vault","category":"bag","moneyCost":500000000,"includedSpecimens":true,"description":"Heavy specimens are included in the material totals. Each gem fills at most one specimen slot. Deposit specimens first; remaining space is reserved for them.","requirements":[{"type":"equipment","equipmentId":"event-horizon-vault"},{"id":"omnidimensional-vault-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":3000},{"id":"omnidimensional-vault-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":1200},{"id":"omnidimensional-vault-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":75},{"id":"omnidimensional-vault-exalted","type":"gem-count","label":"Exalted","minimumRarity":1000000,"maximumRarity":9999999,"amount":2},{"id":"omnidimensional-vault-cosmic","type":"gem-count","label":"Cosmic","minimumRarity":10000000,"maximumRarity":99999999,"amount":1},{"id":"omnidimensional-vault-specimen-0","type":"specimen-condition","includedInBulk":true,"minimumRarity":1000,"minimumWeightMultiplier":5,"amount":30,"label":"30 Legendary+ ≥5× final weight (included in totals)"},{"id":"omnidimensional-vault-specimen-1","type":"specimen-condition","includedInBulk":true,"minimumRarity":10000,"minimumWeightMultiplier":6,"amount":15,"label":"15 Mythic+ ≥6× final weight (included in totals)"},{"type":"lifetime-rolls","rolls":425000}],"reward":{"id":"omnidimensional-vault","name":"Omnidimensional Vault","category":"bag","tier":15,"bonus":{"weightMultiplier":1.5}}}$recipe$::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('plastic-shopping-bag', $recipe${"id":"plastic-shopping-bag","name":"Plastic Shopping Bag","category":"bag","moneyCost":500000000.1,"includedSpecimens":true,"description":"Somehow holds more than the Omnidimensional Vault. Costs 10¢ at checkout. Heavy specimens are included in bulk totals.","requirements":[{"type":"equipment","equipmentId":"omnidimensional-vault"},{"id":"plastic-shopping-bag-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":10000},{"id":"plastic-shopping-bag-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":4000},{"id":"plastic-shopping-bag-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":500},{"id":"plastic-shopping-bag-exalted","type":"gem-count","label":"Exalted","minimumRarity":1000000,"maximumRarity":9999999,"amount":50},{"id":"plastic-shopping-bag-transcendent","type":"gem-count","label":"Transcendent","minimumRarity":100000000,"maximumRarity":999999999,"amount":1},{"id":"plastic-shopping-bag-specimen-0","type":"specimen-condition","includedInBulk":true,"minimumRarity":10000,"minimumWeightMultiplier":7,"amount":15,"label":"15 Mythic+ ≥7× final weight (included in totals)"},{"id":"plastic-shopping-bag-specimen-1","type":"specimen-condition","includedInBulk":true,"minimumRarity":100000,"minimumWeightMultiplier":8,"amount":5,"label":"5 Exotic+ ≥8× final weight (included in totals)"},{"id":"plastic-shopping-bag-specimen-2","type":"specimen-condition","includedInBulk":true,"minimumRarity":1000000,"minimumWeightMultiplier":8,"amount":1,"label":"1 Exalted+ ≥8× final weight (included in totals)"},{"type":"lifetime-rolls","rolls":1000000},{"type":"consumable","consumableId":"plastic-bag","amount":67}],"reward":{"id":"plastic-shopping-bag","name":"Plastic Shopping Bag","category":"bag","tier":16,"bonus":{"weightMultiplier":1.55}}}$recipe$::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('neutron-boots', $recipe${"id":"neutron-boots","name":"Neutron Boots","category":"boots","moneyCost":100000000,"includedSpecimens":true,"description":"Heavy specimens are included in the material totals. Each gem fills at most one specimen slot. Deposit specimens first; remaining space is reserved for them.","requirements":[{"type":"equipment","equipmentId":"gravitational-boots"},{"id":"neutron-boots-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":500},{"id":"neutron-boots-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":175},{"id":"neutron-boots-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":10},{"id":"neutron-boots-specimen-0","type":"specimen-condition","includedInBulk":true,"minimumRarity":1000,"minimumWeightMultiplier":5,"amount":15,"label":"15 Legendary+ ≥5× final weight (included in totals)"},{"id":"neutron-boots-specimen-1","type":"specimen-condition","includedInBulk":true,"minimumRarity":10000,"minimumWeightMultiplier":5,"amount":5,"label":"5 Mythic+ ≥5× final weight (included in totals)"},{"type":"lifetime-rolls","rolls":200000}],"reward":{"id":"neutron-boots","name":"Neutron Boots","category":"boots","tier":13,"bonus":{"weightLuck":8}}}$recipe$::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('spacetime-walkers', $recipe${"id":"spacetime-walkers","name":"Spacetime Walkers","category":"boots","moneyCost":200000000,"includedSpecimens":true,"description":"Heavy specimens are included in the material totals. Each gem fills at most one specimen slot. Deposit specimens first; remaining space is reserved for them.","requirements":[{"type":"equipment","equipmentId":"neutron-boots"},{"id":"spacetime-walkers-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":1250},{"id":"spacetime-walkers-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":450},{"id":"spacetime-walkers-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":25},{"id":"spacetime-walkers-exalted","type":"gem-count","label":"Exalted","minimumRarity":1000000,"maximumRarity":9999999,"amount":1},{"id":"spacetime-walkers-specimen-0","type":"specimen-condition","includedInBulk":true,"minimumRarity":1000,"minimumWeightMultiplier":5,"amount":25,"label":"25 Legendary+ ≥5× final weight (included in totals)"},{"id":"spacetime-walkers-specimen-1","type":"specimen-condition","includedInBulk":true,"minimumRarity":10000,"minimumWeightMultiplier":6,"amount":10,"label":"10 Mythic+ ≥6× final weight (included in totals)"},{"type":"lifetime-rolls","rolls":325000}],"reward":{"id":"spacetime-walkers","name":"Spacetime Walkers","category":"boots","tier":14,"bonus":{"weightLuck":8.75}}}$recipe$::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('reality-breakers', $recipe${"id":"reality-breakers","name":"Reality Breakers","category":"boots","moneyCost":350000000,"includedSpecimens":true,"description":"Heavy specimens are included in the material totals. Each gem fills at most one specimen slot. Deposit specimens first; remaining space is reserved for them.","requirements":[{"type":"equipment","equipmentId":"spacetime-walkers"},{"id":"reality-breakers-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":2500},{"id":"reality-breakers-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":1000},{"id":"reality-breakers-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":75},{"id":"reality-breakers-exalted","type":"gem-count","label":"Exalted","minimumRarity":1000000,"maximumRarity":9999999,"amount":2},{"id":"reality-breakers-cosmic","type":"gem-count","label":"Cosmic","minimumRarity":10000000,"maximumRarity":99999999,"amount":1},{"id":"reality-breakers-specimen-0","type":"specimen-condition","includedInBulk":true,"minimumRarity":1000,"minimumWeightMultiplier":6,"amount":40,"label":"40 Legendary+ ≥6× final weight (included in totals)"},{"id":"reality-breakers-specimen-1","type":"specimen-condition","includedInBulk":true,"minimumRarity":10000,"minimumWeightMultiplier":6,"amount":20,"label":"20 Mythic+ ≥6× final weight (included in totals)"},{"type":"lifetime-rolls","rolls":425000}],"reward":{"id":"reality-breakers","name":"Reality Breakers","category":"boots","tier":15,"bonus":{"weightLuck":9.5}}}$recipe$::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('empyrean-pickaxe', $recipe${"id":"empyrean-pickaxe","name":"Empyrean Pickaxe","category":"pickaxe","moneyCost":350000000,"includedSpecimens":true,"description":"Heavy specimens are included in the material totals. Each gem fills at most one specimen slot. Deposit specimens first; remaining space is reserved for them.","requirements":[{"type":"equipment","equipmentId":"celestial-pickaxe"},{"id":"empyrean-pickaxe-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":3000},{"id":"empyrean-pickaxe-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":1200},{"id":"empyrean-pickaxe-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":75},{"id":"empyrean-pickaxe-exalted","type":"gem-count","label":"Exalted","minimumRarity":1000000,"maximumRarity":9999999,"amount":2},{"id":"empyrean-pickaxe-cosmic","type":"gem-count","label":"Cosmic","minimumRarity":10000000,"maximumRarity":99999999,"amount":1},{"id":"empyrean-pickaxe-specimen-0","type":"specimen-condition","includedInBulk":true,"minimumRarity":1000,"minimumWeightMultiplier":5,"amount":30,"label":"30 Legendary+ ≥5× final weight (included in totals)"},{"id":"empyrean-pickaxe-specimen-1","type":"specimen-condition","includedInBulk":true,"minimumRarity":10000,"minimumWeightMultiplier":5,"amount":15,"label":"15 Mythic+ ≥5× final weight (included in totals)"},{"type":"lifetime-rolls","rolls":350000}],"reward":{"id":"empyrean-pickaxe","name":"Empyrean Pickaxe","category":"pickaxe","tier":16,"bonus":{"luck":26,"rollSpeed":1.9}}}$recipe$::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('eternity-pickaxe', $recipe${"id":"eternity-pickaxe","name":"Eternity Pickaxe","category":"pickaxe","moneyCost":500000000,"includedSpecimens":true,"description":"Heavy specimens are included in the material totals. Each gem fills at most one specimen slot. Deposit specimens first; remaining space is reserved for them.","requirements":[{"type":"equipment","equipmentId":"empyrean-pickaxe"},{"id":"eternity-pickaxe-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":6000},{"id":"eternity-pickaxe-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":2500},{"id":"eternity-pickaxe-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":200},{"id":"eternity-pickaxe-exalted","type":"gem-count","label":"Exalted","minimumRarity":1000000,"maximumRarity":9999999,"amount":3},{"id":"eternity-pickaxe-cosmic","type":"gem-count","label":"Cosmic","minimumRarity":10000000,"maximumRarity":99999999,"amount":2},{"id":"eternity-pickaxe-specimen-0","type":"specimen-condition","includedInBulk":true,"minimumRarity":1000,"minimumWeightMultiplier":6,"amount":50,"label":"50 Legendary+ ≥6× final weight (included in totals)"},{"id":"eternity-pickaxe-specimen-1","type":"specimen-condition","includedInBulk":true,"minimumRarity":10000,"minimumWeightMultiplier":6,"amount":25,"label":"25 Mythic+ ≥6× final weight (included in totals)"},{"type":"lifetime-rolls","rolls":425000}],"reward":{"id":"eternity-pickaxe","name":"Eternity Pickaxe","category":"pickaxe","tier":17,"bonus":{"luck":27,"rollSpeed":2}}}$recipe$::jsonb) on conflict(id) do update set recipe=excluded.recipe;

-- Credit old named-gem deposits using the live catalog's base rarity bands.
-- Keep ten Legendary spaces for the new heavy specimens: old count-only
-- progress has no individual weights and cannot prove specimen eligibility.
-- Retain all original keys for audit; never reinterpret a roll-history gate as a specimen.
update public.crafting_progress set progress=progress || jsonb_build_object(
  'bottomless-singularity-legendary',least(590,
    coalesce((progress->>'Sapphire')::numeric,0)+coalesce((progress->>'Diamond')::numeric,0)+
    coalesce((progress->>'Alexandrite')::numeric,0)+coalesce((progress->>'Black Opal')::numeric,0)+
    coalesce((progress->>'Grandidierite')::numeric,0)+coalesce((progress->>'Taaffeite')::numeric,0)+coalesce((progress->>'Musgravite')::numeric,0)),
  'bottomless-singularity-mythic',least(200,coalesce((progress->>'Painite')::numeric,0)),
  'bottomless-singularity-exotic',least(10,coalesce((progress->>'Ringwoodite')::numeric,0)),
  'bottomless-singularity-exalted',least(1,coalesce((progress->>'Pallasite Crystal')::numeric,0)+coalesce((progress->>'Antimatter Crystal')::numeric,0)),
  'late-game-expansion-migrated',true
),updated_at=now()
where recipe_id='bottomless-singularity' and not progress ? 'late-game-expansion-migrated'
  and not progress ? 'bottomless-singularity-legendary';

-- Update existing T13 owners without touching enchants or Masterwork.
update public.player_equipment set name='Bottomless Singularity Bag', weight_multiplier_bonus=1.2 where equipment_id='bottomless-singularity';

-- Pure planner. Rarity counts are exact bands; specimen slots allow higher bands.
-- Slots are nested, so allocating the strictest eligible slot first is optimal.
create or replace function public.plan_equipment_material(p_recipe jsonb, p_progress jsonb, p_gem jsonb, p_index integer default null)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  v_progress jsonb:=coalesce(p_progress,'{}'); v_req jsonb; v_slot jsonb; v_other jsonb;
  v_i integer; v_bulk_i integer; v_slot_i integer; v_key text; v_bulk_key text;
  v_rarity numeric:=(p_gem->>'rarity')::numeric;
  v_weight numeric:=case when (p_gem->>'base_weight')::numeric>0 then (p_gem->>'final_weight')::numeric/(p_gem->>'base_weight')::numeric else null end;
  v_needed numeric; v_space numeric; v_special boolean:=false;
begin
  if v_rarity is null then return null; end if;
  if coalesce((p_recipe->>'includedSpecimens')::boolean,false) and not coalesce((p_gem->>'base_weight')::numeric>0,false) then return null; end if;
  if p_index is not null then
    v_req:=p_recipe->'requirements'->p_index;
    if v_req is null or v_req->>'type' not in ('gem-count','specimen-condition') then return null; end if;
    if v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
       or (v_req ? 'gem' and v_req->>'gem'<>p_gem->>'gem_name')
       or (v_req ? 'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric)) then return null; end if;
  end if;
  for v_req,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality loop
    if v_req->>'type'<>'gem-count' then continue; end if;
    if not coalesce((p_recipe->>'includedSpecimens')::boolean,false) and p_index is distinct from v_i then continue; end if;
    v_key:=coalesce(v_req->>'id',v_req->>'gem');
    if v_key is null or coalesce((v_progress->>v_key)::numeric,0)>=coalesce((v_req->>'amount')::numeric,1) then continue; end if;
    if (v_req ? 'gem' and v_req->>'gem'<>p_gem->>'gem_name')
      or v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
      or (v_req ? 'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric))
      or (v_req ? 'maximumWeightMultiplier' and (v_weight is null or v_weight>(v_req->>'maximumWeightMultiplier')::numeric)) then continue; end if;
    v_bulk_i:=v_i; v_bulk_key:=v_key;
    v_special:=v_req ?| array['minimumWeightMultiplier','maximumWeightMultiplier','mutation','mutationId','serial','serialNumber'];
    exit;
  end loop;
  if v_bulk_i is null then return null; end if;
  v_progress:=jsonb_set(v_progress,array[v_bulk_key],to_jsonb(coalesce((v_progress->>v_bulk_key)::numeric,0)+1));
  if coalesce((p_recipe->>'includedSpecimens')::boolean,false) then
    for v_slot,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality
      where value->>'includedInBulk'='true'
      order by (value->>'minimumRarity')::numeric desc,(value->>'minimumWeightMultiplier')::numeric desc loop
      v_key:=v_slot->>'id';
      if coalesce((v_progress->>v_key)::numeric,0)<(v_slot->>'amount')::numeric
         and v_rarity>=(v_slot->>'minimumRarity')::numeric and v_weight>=(v_slot->>'minimumWeightMultiplier')::numeric then
        v_slot_i:=v_i;
        v_progress:=jsonb_set(v_progress,array[v_key],to_jsonb(coalesce((v_progress->>v_key)::numeric,0)+1));
        exit;
      end if;
    end loop;
    -- Clicking a specimen slot must actually advance that slot.
    if p_index is not null and p_recipe->'requirements'->p_index->>'includedInBulk'='true' and p_index is distinct from v_slot_i then return null; end if;
    -- Reserve enough unfilled bulk slots for every remaining specimen threshold.
    for v_slot in select value from jsonb_array_elements(p_recipe->'requirements') where value->>'includedInBulk'='true' loop
      select coalesce(sum(greatest(0,(value->>'amount')::numeric-coalesce((v_progress->>(value->>'id'))::numeric,0))),0) into v_needed
        from jsonb_array_elements(p_recipe->'requirements') where value->>'includedInBulk'='true' and (value->>'minimumRarity')::numeric>=(v_slot->>'minimumRarity')::numeric;
      select coalesce(sum(greatest(0,(value->>'amount')::numeric-coalesce((v_progress->>(value->>'id'))::numeric,0))),0) into v_space
        from jsonb_array_elements(p_recipe->'requirements') where value->>'type'='gem-count' and (value->>'minimumRarity')::numeric>=(v_slot->>'minimumRarity')::numeric;
      if v_needed>v_space then return null; end if;
    end loop;
  end if;
  return jsonb_build_object('progress',v_progress,'requirementIndex',coalesce(v_slot_i,v_bulk_i),'conservationEligible',v_slot_i is null and not v_special);
end;
$$;
revoke all on function public.plan_equipment_material(jsonb,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.plan_equipment_material(jsonb,jsonb,jsonb,integer) to service_role;

-- Service-only: generated rolls are trusted only from the authenticated Edge Function.
-- Manual deposits select and lock real inventory rows on the server, with no page cap.
create or replace function public.deposit_equipment_material(p_player_id uuid,p_recipe_id text,p_specimen jsonb default null,p_requirement_index integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_recipe jsonb; v_progress jsonb; v_plan jsonb; v_gem public.inventory_gems%rowtype;
  v_preserved boolean:=false; v_chance numeric:=0; v_manual boolean:=p_specimen is null;
begin
  perform 1 from public.players where id=p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  select recipe into v_recipe from public.game_recipes where id=p_recipe_id;
  if v_recipe is null then raise exception 'recipe_not_found'; end if;
  insert into public.crafting_progress(player_id,recipe_id,progress) values(p_player_id,p_recipe_id,'{}') on conflict do nothing;
  select progress into v_progress from public.crafting_progress where player_id=p_player_id and recipe_id=p_recipe_id for update;
  if v_manual then
    if p_requirement_index is null then raise exception 'requirement_required'; end if;
    for v_gem in select * from public.inventory_gems where player_id=p_player_id and not coalesce(locked,false)
      and (not coalesce((v_recipe->>'includedSpecimens')::boolean,false) or base_weight>0)
      and rarity>=coalesce((v_recipe->'requirements'->p_requirement_index->>'minimumRarity')::numeric,0)
      and rarity<=coalesce((v_recipe->'requirements'->p_requirement_index->>'maximumRarity')::numeric,1e100)
      and (not (v_recipe->'requirements'->p_requirement_index ? 'gem') or gem_name=v_recipe->'requirements'->p_requirement_index->>'gem')
      and (not (v_recipe->'requirements'->p_requirement_index ? 'minimumWeightMultiplier') or final_weight/nullif(base_weight,0) >= (v_recipe->'requirements'->p_requirement_index->>'minimumWeightMultiplier')::numeric)
      order by final_weight,id for update loop
      v_plan:=public.plan_equipment_material(v_recipe,v_progress,to_jsonb(v_gem),p_requirement_index);
      if v_plan is not null then exit; end if;
    end loop;
  else
    v_plan:=public.plan_equipment_material(v_recipe,v_progress,p_specimen,p_requirement_index);
  end if;
  if v_plan is null then return jsonb_build_object('deposited',false,'progress',v_progress); end if;
  if (v_plan->>'conservationEligible')::boolean then
    select coalesce(max(case equipment_id when 'plastic-shopping-bag' then 0.125 when 'omnidimensional-vault' then 0.10 else 0 end),0)
      into v_chance from public.player_equipment where player_id=p_player_id and equipped and category='bag';
    v_preserved:=random()<v_chance;
  end if;
  update public.crafting_progress set progress=v_plan->'progress',updated_at=now() where player_id=p_player_id and recipe_id=p_recipe_id;
  if v_manual and not v_preserved then delete from public.inventory_gems where id=v_gem.id and player_id=p_player_id; end if;
  return v_plan || jsonb_build_object('deposited',true,'preserved',v_preserved,'consumedSpecimen',case when v_manual and not v_preserved then jsonb_build_object('id',v_gem.id,'gemName',v_gem.gem_name,'weight',v_gem.final_weight,'value',v_gem.value) else null end);
end;
$$;
revoke all on function public.deposit_equipment_material(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.deposit_equipment_material(uuid,text,jsonb,integer) to service_role;

-- Worthless Daily Shop material. A rotation has enough stock for the joke recipe.
insert into public.daily_shop_catalog(id,category,name,description,price,stock_min,stock_max,weight,contents)
values('plastic-bag','specialist','Plastic Bag','Costs 10¢. Does absolutely nothing. Collect 67 for the Plastic Shopping Bag.',0.10,67,67,1,'[{"type":"consumable","id":"plastic-bag","quantity":1}]')
on conflict(id) do update set price=excluded.price,contents=excluded.contents,stock_min=excluded.stock_min,stock_max=excluded.stock_max;
alter table public.players add column if not exists equipment_genuine_rolls bigint not null default 0 check(equipment_genuine_rolls>=0);
CREATE OR REPLACE FUNCTION public.claim_server_roll(p_player_id uuid, p_cooldown_ms numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_player public.players%rowtype;
  v_lease_id uuid := gen_random_uuid();
  v_cooldown_ms numeric;
  v_next_roll_at timestamptz;
begin
  if p_player_id is null or p_cooldown_ms is null or p_cooldown_ms <= 0 then
    raise exception 'invalid_roll_claim' using errcode = '22023';
  end if;

  v_cooldown_ms := least(300000::numeric, greatest(10::numeric, p_cooldown_ms));

  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_player.roll_lease_expires_at is not null
     and v_player.roll_lease_expires_at > v_now then
    return jsonb_build_object(
      'status', 'in_flight',
      'retryAt', v_player.roll_lease_expires_at
    );
  end if;

  if v_player.next_roll_at is not null and v_player.next_roll_at > v_now then
    return jsonb_build_object(
      'status', 'cooldown',
      'retryAt', v_player.next_roll_at
    );
  end if;

  v_next_roll_at := v_now + make_interval(secs => (v_cooldown_ms / 1000)::double precision);

  update public.players
  set next_roll_at = v_next_roll_at,
      roll_lease_id = v_lease_id,
      roll_lease_expires_at = v_now + make_interval(
        secs => greatest(30::numeric, v_cooldown_ms / 1000 + 10)::double precision
      )
  where id = p_player_id;

  return jsonb_build_object(
    'status', 'claimed',
    'leaseId', v_lease_id,
    'nextRollAt', v_next_roll_at,
    'genuineRoll', v_player.equipment_genuine_rolls + 1
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.record_server_roll(p_player_id uuid, p_gem_name text, p_gem_rarity integer, p_final_weight double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total_rolls bigint;
  v_rarest_name text;
  v_rarest_rarity integer;
begin
  update public.players
  set
    total_rolls = coalesce(total_rolls, 0) + 1,
    equipment_genuine_rolls = equipment_genuine_rolls + 1,
    rarest_gem_name = case
      when rarest_gem_rarity is null or p_gem_rarity > rarest_gem_rarity
        then p_gem_name
      else rarest_gem_name
    end,
    rarest_gem_rarity = case
      when rarest_gem_rarity is null or p_gem_rarity > rarest_gem_rarity
        then p_gem_rarity
      else rarest_gem_rarity
    end
  where id = p_player_id
  returning total_rolls, rarest_gem_name, rarest_gem_rarity
  into v_total_rolls, v_rarest_name, v_rarest_rarity;

  if not found then
    raise exception 'player_not_found';
  end if;

  return jsonb_build_object(
    'total_rolls', v_total_rolls,
    'rarest_gem_name', v_rarest_name,
    'rarest_gem_rarity', v_rarest_rarity,
    'gem_name', p_gem_name,
    'final_weight', p_final_weight
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.craft_equipment_recipe(p_recipe_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_recipe jsonb; v_reward jsonb; v_bonus jsonb;
  v_money_cost double precision; v_progress jsonb; v_req jsonb; v_idx integer;
  v_key text; v_target numeric; v_have numeric; v_required_equipment text;
  v_new_money double precision; v_total_rolls bigint;
  v_best_100k double precision; v_best_1m double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select recipe into v_recipe from public.game_recipes where id=p_recipe_id;
  if v_recipe is null then raise exception 'recipe_not_found'; end if;
  v_reward:=v_recipe->'reward';
  if v_reward is null or v_reward->>'type'='consumable' then raise exception 'recipe_not_found'; end if;
  v_bonus:=coalesce(v_reward->'bonus','{}'::jsonb);
  v_money_cost:=coalesce((v_recipe->>'moneyCost')::double precision,0);

  select money,total_rolls,best_rare_natural_weight_100k,best_rare_natural_weight_1m
  into v_new_money,v_total_rolls,v_best_100k,v_best_1m
  from public.players where id=v_uid for update;
  if not found then raise exception 'player_not_found'; end if;

  select progress into v_progress from public.crafting_progress
  where player_id=v_uid and recipe_id=p_recipe_id;
  v_progress:=coalesce(v_progress,'{}'::jsonb);

  for v_req,v_idx in
    select value,(ordinality-1)::integer
    from jsonb_array_elements(coalesce(v_recipe->'requirements','[]'::jsonb)) with ordinality
  loop
    if v_req->>'type'='equipment' then
      if not exists(select 1 from public.player_equipment where player_id=v_uid and equipment_id=v_req->>'equipmentId')
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='consumable' then
      update public.player_consumables set quantity=quantity-(v_req->>'amount')::integer,updated_at=now()
      where player_id=v_uid and consumable_id=v_req->>'consumableId' and quantity>=(v_req->>'amount')::integer;
      if not found then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='lifetime-rolls' then
      if coalesce(v_total_rolls,0)<coalesce((v_req->>'rolls')::bigint,0)
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='roll-history-condition' then
      v_have:=case when coalesce((v_req->>'minimumRarity')::numeric,0)>=1000000
        then coalesce(v_best_1m,0) else coalesce(v_best_100k,0) end;
      if v_have<coalesce((v_req->>'minimumWeightMultiplier')::numeric,0)
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='rarity-points' then
      v_key:=coalesce(v_req->>'id','rarity-points-'||v_idx::text);
      if coalesce((v_progress->v_key->>'points')::numeric,0)<coalesce((v_req->>'points')::numeric,0)
        or jsonb_array_length(coalesce(v_progress->v_key->'gemTypes','[]'::jsonb))<coalesce((v_req->>'minimumUniqueGemTypes')::integer,0)
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='gem-range' then
      v_key:=coalesce(v_req->>'id','gem-range-'||v_idx::text);
      if exists(select 1 from jsonb_array_elements_text(coalesce(v_req->'gems','[]'::jsonb)) gem
        where coalesce((v_progress->v_key->>gem.value)::numeric,0)<coalesce((v_req->>'amountEach')::numeric,1))
      then raise exception 'requirements_not_met'; end if;
    else
      v_key:=coalesce(v_req->>'id',case
        when v_req->>'type'='gem-count' then v_req->>'gem'
        when v_req->>'type'='consumable' then coalesce(v_req->>'consumableId','consumable-'||v_idx::text)
        else (v_req->>'type')||'-'||v_idx::text end);
      v_target:=case v_req->>'type'
        when 'gem-total-weight' then coalesce((v_req->>'totalWeight')::numeric,0)
        when 'specimen-total-weight' then coalesce((v_req->>'totalWeight')::numeric,0)
        when 'specimen-value-total' then coalesce((v_req->>'totalValue')::numeric,0)
        else coalesce((v_req->>'amount')::numeric,1) end;
      v_have:=coalesce((v_progress->>v_key)::numeric,0);
      if v_have<v_target then raise exception 'requirements_not_met'; end if;
    end if;
  end loop;

  if v_new_money<v_money_cost then raise exception 'not_enough_money'; end if;
  select r->>'equipmentId' into v_required_equipment
  from jsonb_array_elements(coalesce(v_recipe->'requirements','[]'::jsonb)) r
  where r->>'type'='equipment' limit 1;
  if coalesce((v_recipe->>'includedSpecimens')::boolean,false) then
    -- Match the live craft Edge Function: keep unlocked prerequisites stored,
    -- including their enchant/Masterwork state, and equip only the new reward.
    update public.player_equipment set equipped=false where player_id=v_uid and category=v_reward->>'category';
  elsif v_required_equipment is not null then
    delete from public.player_equipment where player_id=v_uid and equipment_id=v_required_equipment;
  end if;

  insert into public.player_equipment(
    player_id,equipment_id,category,tier,name,luck_bonus,roll_speed_bonus,
    weight_luck_bonus,weight_multiplier_bonus,equipped
  ) values(
    v_uid,v_reward->>'id',v_reward->>'category',coalesce((v_reward->>'tier')::integer,1),
    v_reward->>'name',coalesce((v_bonus->>'luck')::double precision,0),
    coalesce((v_bonus->>'rollSpeed')::double precision,0),
    coalesce((v_bonus->>'weightLuck')::double precision,0),
    coalesce((v_bonus->>'weightMultiplier')::double precision,0),true
  ) on conflict(player_id,equipment_id) do update set
    category=excluded.category,tier=excluded.tier,name=excluded.name,
    luck_bonus=excluded.luck_bonus,roll_speed_bonus=excluded.roll_speed_bonus,
    weight_luck_bonus=excluded.weight_luck_bonus,
    weight_multiplier_bonus=excluded.weight_multiplier_bonus,equipped=true;

  update public.players set money=money-v_money_cost where id=v_uid returning money into v_new_money;
  delete from public.crafting_progress where player_id=v_uid and recipe_id=p_recipe_id;
  update public.player_crafting set
    active_auto_craft=case when active_auto_craft=p_recipe_id then null else active_auto_craft end,
    updated_at=now() where player_id=v_uid;
  return jsonb_build_object('money',v_new_money,'equipmentId',v_reward->>'id');
end;
$function$
;
-- New crafts no longer earn the original impossible-recipe legacy marker.
create or replace function public.preserve_original_bottomless_singularity_legacy()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then new.original_t13_legacy:=old.original_t13_legacy;
  else new.original_t13_legacy:=false; end if;
  return new;
end;
$$;
revoke all on function public.claim_server_roll(uuid,numeric) from public,anon,authenticated;
grant execute on function public.claim_server_roll(uuid,numeric) to service_role;
revoke all on function public.record_server_roll(uuid,text,integer,double precision) from public,anon,authenticated;
grant execute on function public.record_server_roll(uuid,text,integer,double precision) to service_role;
revoke all on function public.craft_equipment_recipe(text) from public,anon;
grant execute on function public.craft_equipment_recipe(text) to authenticated,service_role;
revoke all on function public.masterwork_equipment_beta(bigint,text,text) from public,anon;
grant execute on function public.masterwork_equipment_beta(bigint,text,text) to authenticated,service_role;
commit;

