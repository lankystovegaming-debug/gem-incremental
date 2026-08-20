-- Rebalance Daily Shop bundles and high-tier Masterwork money costs.
-- Relic requirements, reroll bases, and attunement bases remain unchanged.

update public.daily_shop_catalog
set price = case id
  when 'mixed-forge-pack' then 2100000
  when 'rare-all-tier3' then 625000
  when 'rare-mythic' then 15000000
  when 'rare-mythic-2' then 28000000
  when 'perfect-forge-cache' then 14000000
  else price
end
where id in (
  'mixed-forge-pack',
  'rare-all-tier3',
  'rare-mythic',
  'rare-mythic-2',
  'perfect-forge-cache'
);

create or replace function public.masterwork_equipment_beta(
  p_equipment_row_id bigint,
  p_action text,
  p_choice text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      when v_item.tier >= 13 then 1.65
      when v_item.tier = 12 then 1.4
      when v_item.tier = 11 then 1.2
      else 1
    end;
    v_relic_mult := case when v_item.tier >= 13 then 1.5 when v_item.tier = 12 then 1.3 when v_item.tier = 11 then 1.15 else 1 end;
    v_ancient_mult := case when v_item.tier >= 13 then 1.4 when v_item.tier = 12 then 1.2 else 1 end;

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
      v_money := v_base_reroll * v_money_mult * case when p_action = 'imprint' then 5 else 1 end;
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
$$;

revoke all on function public.masterwork_equipment_beta(bigint,text,text) from public;
grant execute on function public.masterwork_equipment_beta(bigint,text,text) to authenticated;
