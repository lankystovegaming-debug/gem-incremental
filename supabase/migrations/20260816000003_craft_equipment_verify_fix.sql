-- =========================================================
-- Fix: craft_equipment_recipe(text) crashed on recipes whose
-- deposit progress is a JSON object rather than a number
-- (rarity-points e.g. gemkeeper-bag, gem-range e.g. bottomless-bag).
-- The verification loop cast every progress value to numeric, which
-- errored on those objects — surfacing to the player as the generic
-- "Could not craft that recipe." Now those two types are verified
-- the same way the client's isRequirementComplete does.
-- =========================================================

set local check_function_bodies = off;

create or replace function public.craft_equipment_recipe(p_recipe_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_recipe jsonb;
  v_reward jsonb;
  v_bonus jsonb;
  v_money_cost double precision;
  v_progress jsonb;
  v_req jsonb;
  v_idx integer;
  v_key text;
  v_target numeric;
  v_have numeric;
  v_required_equipment text;
  v_new_money double precision;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select recipe into v_recipe from public.game_recipes where id = p_recipe_id;
  if v_recipe is null then
    raise exception 'recipe_not_found';
  end if;

  v_reward := v_recipe -> 'reward';
  if v_reward is null or (v_reward ->> 'type') = 'consumable' then
    raise exception 'recipe_not_found';
  end if;

  v_bonus := coalesce(v_reward -> 'bonus', '{}'::jsonb);
  v_money_cost := coalesce((v_recipe ->> 'moneyCost')::double precision, 0);

  select progress into v_progress
  from public.crafting_progress
  where player_id = v_uid and recipe_id = p_recipe_id;
  v_progress := coalesce(v_progress, '{}'::jsonb);

  for v_req, v_idx in
    select value, (ordinality - 1)::integer
    from jsonb_array_elements(coalesce(v_recipe -> 'requirements', '[]'::jsonb))
    with ordinality
  loop
    if (v_req ->> 'type') = 'equipment' then
      if not exists (
        select 1 from public.player_equipment
        where player_id = v_uid and equipment_id = v_req ->> 'equipmentId'
      ) then
        raise exception 'requirements_not_met';
      end if;

    elsif (v_req ->> 'type') = 'rarity-points' then
      v_key := coalesce(v_req ->> 'id', 'rarity-points-' || v_idx::text);
      if coalesce((v_progress -> v_key ->> 'points')::numeric, 0)
           < coalesce((v_req ->> 'points')::numeric, 0)
         or jsonb_array_length(coalesce(v_progress -> v_key -> 'gemTypes', '[]'::jsonb))
           < coalesce((v_req ->> 'minimumUniqueGemTypes')::int, 0)
      then
        raise exception 'requirements_not_met';
      end if;

    elsif (v_req ->> 'type') = 'gem-range' then
      v_key := coalesce(v_req ->> 'id', 'gem-range-' || v_idx::text);
      if exists (
        select 1
        from jsonb_array_elements_text(coalesce(v_req -> 'gems', '[]'::jsonb)) g
        where coalesce((v_progress -> v_key ->> g.value)::numeric, 0)
              < coalesce((v_req ->> 'amountEach')::numeric, 1)
      ) then
        raise exception 'requirements_not_met';
      end if;

    else
      v_key := coalesce(
        v_req ->> 'id',
        case
          when v_req ->> 'type' = 'gem-count' then v_req ->> 'gem'
          when v_req ->> 'type' = 'consumable'
            then coalesce(v_req ->> 'consumableId', 'consumable-' || v_idx::text)
          else (v_req ->> 'type') || '-' || v_idx::text
        end
      );
      v_target := case v_req ->> 'type'
        when 'gem-total-weight' then coalesce((v_req ->> 'totalWeight')::numeric, 0)
        when 'specimen-total-weight' then coalesce((v_req ->> 'totalWeight')::numeric, 0)
        when 'specimen-value-total' then coalesce((v_req ->> 'totalValue')::numeric, 0)
        else coalesce((v_req ->> 'amount')::numeric, 1)
      end;
      v_have := coalesce((v_progress ->> v_key)::numeric, 0);
      if v_have < v_target then
        raise exception 'requirements_not_met';
      end if;
    end if;
  end loop;

  select money into v_new_money from public.players where id = v_uid for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  if v_new_money < v_money_cost then
    raise exception 'not_enough_money';
  end if;

  select (r ->> 'equipmentId') into v_required_equipment
  from jsonb_array_elements(coalesce(v_recipe -> 'requirements', '[]'::jsonb)) r
  where r ->> 'type' = 'equipment'
  limit 1;

  if v_required_equipment is not null then
    delete from public.player_equipment
    where player_id = v_uid and equipment_id = v_required_equipment;
  end if;

  insert into public.player_equipment (
    player_id, equipment_id, category, tier, name,
    luck_bonus, roll_speed_bonus, weight_luck_bonus, weight_multiplier_bonus, equipped
  )
  values (
    v_uid,
    v_reward ->> 'id',
    v_reward ->> 'category',
    coalesce((v_reward ->> 'tier')::integer, 1),
    v_reward ->> 'name',
    coalesce((v_bonus ->> 'luck')::double precision, 0),
    coalesce((v_bonus ->> 'rollSpeed')::double precision, 0),
    coalesce((v_bonus ->> 'weightLuck')::double precision, 0),
    coalesce((v_bonus ->> 'weightMultiplier')::double precision, 0),
    true
  )
  on conflict (player_id, equipment_id) do update set
    category = excluded.category,
    tier = excluded.tier,
    name = excluded.name,
    luck_bonus = excluded.luck_bonus,
    roll_speed_bonus = excluded.roll_speed_bonus,
    weight_luck_bonus = excluded.weight_luck_bonus,
    weight_multiplier_bonus = excluded.weight_multiplier_bonus,
    equipped = true;

  update public.players set money = money - v_money_cost
  where id = v_uid returning money into v_new_money;

  delete from public.crafting_progress
  where player_id = v_uid and recipe_id = p_recipe_id;

  update public.player_crafting
  set active_auto_craft = case when active_auto_craft = p_recipe_id then null else active_auto_craft end,
      updated_at = now()
  where player_id = v_uid;

  return jsonb_build_object('money', v_new_money, 'equipmentId', v_reward ->> 'id');
end;
$$;

grant execute on function public.craft_equipment_recipe(text) to authenticated;
