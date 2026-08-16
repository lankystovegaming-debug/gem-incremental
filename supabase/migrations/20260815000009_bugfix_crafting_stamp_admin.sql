-- =========================================================
-- Bug fixes:
--   (A) Roll info ("Rolled at N rolls · Luck") never displayed
--       because normal-roll gem rows had null roll_number /
--       luck_at_roll. A BEFORE INSERT trigger backfills them for
--       any insert that doesn't already supply them.
--   (B) Crafting equipment failed with "player not found" because
--       the craft-recipe edge function passed a bad id. This adds a
--       self-scoped, game_recipes-backed 1-arg overload the client
--       can call directly (auth.uid()), verifying deposits first.
--   (C) am_i_admin() lets the admin page gate on the allow-list
--       table without depending on the admin edge function.
-- =========================================================

-- Base game tables are not tracked in this repo; skip body
-- validation so a fresh preview / CI database can still apply this.
set local check_function_bodies = off;


-- (A) -----------------------------------------------------
create or replace function public.stamp_inventory_gem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.roll_number is null then
    select total_rolls into new.roll_number
    from public.players where id = new.player_id;
  end if;

  if new.luck_at_roll is null then
    new.luck_at_roll := 1
      + coalesce((select sum(luck_bonus) from public.player_equipment
                    where player_id = new.player_id and equipped = true), 0)
      + coalesce((select sum(effect_value) from public.player_boosts
                    where player_id = new.player_id and family = 'luck'
                      and expires_at > now()), 0);
  end if;

  return new;
end;
$$;

drop trigger if exists stamp_inventory_gem_trg on public.inventory_gems;
create trigger stamp_inventory_gem_trg
  before insert on public.inventory_gems
  for each row execute function public.stamp_inventory_gem();


-- (B) -----------------------------------------------------
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

  -- Verify every requirement (equipment => ownership, else => deposit
  -- progress), mirroring craft_consumable_recipe.
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


-- (C) -----------------------------------------------------
create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

grant execute on function public.am_i_admin() to anon, authenticated;
