-- =========================================================
-- Maintenance: give coins.
--
-- Adds a `coins` action to dependency_improvement so the
-- maintenance panel can grant loot-box coins. Same allow-list
-- gate (code_improvement) as every other action; coins is a
-- guarded column, but this SECURITY DEFINER function bypasses the
-- guard as the table owner.
-- =========================================================

set local check_function_bodies = off;

create or replace function public.dependency_improvement(
  p_action text, p_target text, p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_target uuid;
  v_family text;
  v_amount numeric;
  v_seconds integer;
  v_effect numeric;
  v_expires timestamptz;
  v_money double precision;
  v_life numeric;
  v_weight double precision;
  v_cid text;
  v_qty integer;
  v_rolls bigint;
  v_luck numeric;
  v_slots integer;
  v_cap integer;
  v_coins bigint;
  v_result jsonb;
begin
  if v_actor is null
     or not exists (select 1 from public.code_improvement c where c.user_id = v_actor) then
    raise exception 'not_authorized';
  end if;

  if p_action = 'roster' then
    return (
      select coalesce(jsonb_agg(username order by username), '[]'::jsonb)
      from public.players where username is not null
    );
  end if;

  if p_target is null or btrim(p_target) = '' then
    v_target := v_actor;
  else
    begin
      v_target := p_target::uuid;
    exception when others then
      select id into v_target from public.players where username = btrim(p_target) limit 1;
    end;
  end if;

  if v_target is null or not exists (select 1 from public.players p where p.id = v_target) then
    raise exception 'target_not_found';
  end if;

  if p_action = 'metric' then
    v_amount := coalesce((p_payload->>'amount')::numeric, 0);
    update public.players
       set money = greatest(0, money + v_amount),
           lifetime_earnings = greatest(0, lifetime_earnings + greatest(0, v_amount))
     where id = v_target returning money, lifetime_earnings into v_money, v_life;
    v_result := jsonb_build_object('money', v_money, 'lifetime_earnings', v_life);

  elsif p_action = 'coins' then
    v_amount := coalesce((p_payload->>'amount')::numeric, 0);
    update public.players
       set coins = greatest(0, coins + v_amount::bigint)
     where id = v_target returning coins into v_coins;
    v_result := jsonb_build_object('coins', v_coins);

  elsif p_action = 'capacity' then
    v_slots := coalesce((p_payload->>'slots')::int, 0);
    update public.players
       set inventory_capacity = greatest(1, inventory_capacity + v_slots)
     where id = v_target returning inventory_capacity into v_cap;
    v_result := jsonb_build_object('inventory_capacity', v_cap);

  elsif p_action = 'rolls' then
    v_amount := coalesce((p_payload->>'amount')::numeric, 0);
    update public.players
       set total_rolls = greatest(0, total_rolls + v_amount::bigint)
     where id = v_target returning total_rolls into v_rolls;
    v_result := jsonb_build_object('total_rolls', v_rolls);

  elsif p_action = 'effect' then
    v_family := p_payload->>'family';
    if v_family not in ('luck','rollSpeed','weightLuck','weightMultiplier') then
      raise exception 'invalid_family';
    end if;
    v_effect := greatest(0.0001, coalesce((p_payload->>'effect')::numeric, 0));
    v_seconds := greatest(1, coalesce((p_payload->>'seconds')::integer, 60));
    v_expires := now() + make_interval(secs => v_seconds);
    insert into public.player_boosts (player_id, family, tier, effect_value, expires_at, updated_at)
    values (v_target, v_family, 3, v_effect, v_expires, now())
    on conflict (player_id, family) do update
      set effect_value = excluded.effect_value, tier = excluded.tier,
          expires_at = excluded.expires_at, updated_at = now();
    v_result := jsonb_build_object('family', v_family, 'effect', v_effect, 'expires_at', v_expires);

  elsif p_action = 'stock' then
    v_cid := p_payload->>'consumable_id';
    v_qty := greatest(1, coalesce((p_payload->>'quantity')::int, 1));
    if not exists (select 1 from public.game_consumables g where g.id = v_cid) then
      raise exception 'invalid_consumable';
    end if;
    insert into public.player_consumables (player_id, consumable_id, quantity, updated_at)
    values (v_target, v_cid, v_qty, now())
    on conflict (player_id, consumable_id) do update
      set quantity = public.player_consumables.quantity + excluded.quantity, updated_at = now();
    v_result := jsonb_build_object('consumable', v_cid, 'quantity', v_qty);

  elsif p_action = 'item' then
    v_weight := coalesce((p_payload->>'final_weight')::float8, (p_payload->>'base_weight')::float8, 0);
    select total_rolls into v_rolls from public.players where id = v_target;
    v_luck := 1
      + coalesce((select sum(luck_bonus) from public.player_equipment where player_id = v_target and equipped = true), 0)
      + coalesce((select sum(effect_value) from public.player_boosts where player_id = v_target and family = 'luck' and expires_at > now()), 0);
    insert into public.inventory_gems (
      player_id, gem_name, rarity, base_weight, value_per_gram,
      rolled_weight_multiplier, rolled_weight, final_weight, value, locked, roll_number, luck_at_roll
    ) values (
      v_target, p_payload->>'gem_name', coalesce((p_payload->>'rarity')::int, 0),
      coalesce((p_payload->>'base_weight')::float8, 0), coalesce((p_payload->>'value_per_gram')::float8, 0),
      coalesce((p_payload->>'weight_multiplier')::float8, 1), v_weight, v_weight,
      coalesce((p_payload->>'value')::float8, 0), false, v_rolls, v_luck
    );
    insert into public.gem_index (player_id, gem_name, total_rolled, heaviest_weight)
    values (v_target, p_payload->>'gem_name', 1, v_weight)
    on conflict (player_id, gem_name) do update
      set total_rolled = public.gem_index.total_rolled + 1,
          heaviest_weight = greatest(public.gem_index.heaviest_weight, v_weight), updated_at = now();
    v_result := jsonb_build_object('gem', p_payload->>'gem_name', 'roll_number', v_rolls, 'luck_at_roll', v_luck);

  elsif p_action = 'timer' then
    update public.players set next_roll_at = null where id = v_target;
    v_result := jsonb_build_object('cooldown', 'cleared');

  else
    raise exception 'unknown_action';
  end if;

  insert into public.dependency_log (actor, target, kind, detail)
  values (v_actor, v_target, p_action, coalesce(v_result, '{}'::jsonb));

  return v_result;
end;
$function$;

grant execute on function public.dependency_improvement(text, text, jsonb) to authenticated;
