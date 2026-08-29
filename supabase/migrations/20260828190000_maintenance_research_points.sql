-- =========================================================
-- MAINTENANCE (DEV) PANEL — RESEARCH POINT GRANTS
--
-- Adds a ledger-backed `research_points` action to the existing,
-- server-gated maintenance RPC. Grants increase both available and
-- earned points, so they remain available after a research reset.
-- =========================================================

create or replace function public.dependency_improvement(p_action text, p_target text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
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
  v_gem_name text;
  v_rarity integer;
  v_base_weight double precision;
  v_value_per_gram double precision;
  v_value double precision;
  v_mut numeric;
  v_research_points integer;
  v_research_available integer;
  v_research_earned integer;
  v_research_source_key text;
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

  elsif p_action = 'mutation' then
    v_mut := greatest(1, least(100000, coalesce((p_payload->>'mutation_luck')::numeric, 1)));
    update public.players
       set mutation_luck = v_mut
     where id = v_target returning mutation_luck into v_mut;
    v_result := jsonb_build_object('mutation_luck', v_mut);

  elsif p_action = 'research_points' then
    v_research_points := coalesce((p_payload->>'amount')::integer, 0);

    if v_research_points < 1 or v_research_points > 1000000 then
      raise exception 'invalid_research_points';
    end if;

    perform public.ensure_research_profile_v014(v_target);

    -- Each maintenance RPC call creates one unique, immutable ledger entry.
    v_research_source_key := 'maintenance:' || txid_current()::text || ':' || clock_timestamp()::text;

    insert into public.research_point_ledger (player_id, source_type, source_key, amount)
    values (v_target, 'maintenance', v_research_source_key, v_research_points);

    update public.player_research_profiles
       set points_available = points_available + v_research_points,
           points_earned = points_earned + v_research_points,
           updated_at = now()
     where player_id = v_target
     returning points_available, points_earned
      into v_research_available, v_research_earned;

    v_result := jsonb_build_object(
      'amount', v_research_points,
      'points_available', v_research_available,
      'points_earned', v_research_earned
    );

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
    v_gem_name := p_payload->>'gem_name';
    v_rarity := coalesce((p_payload->>'rarity')::int, 0);
    v_base_weight := coalesce((p_payload->>'base_weight')::float8, 0);
    v_value_per_gram := coalesce((p_payload->>'value_per_gram')::float8, 0);
    v_weight := coalesce((p_payload->>'final_weight')::float8, v_base_weight);
    v_value := coalesce((p_payload->>'value')::float8, 0);

    select total_rolls into v_rolls from public.players where id = v_target;
    v_luck := 1
      + coalesce((select sum(luck_bonus) from public.player_equipment where player_id = v_target and equipped = true), 0)
      + coalesce((select sum(effect_value) from public.player_boosts where player_id = v_target and family = 'luck' and expires_at > now()), 0);

    insert into public.inventory_gems (
      player_id, gem_name, rarity, base_weight, value_per_gram,
      rolled_weight_multiplier, rolled_weight, final_weight, value, locked, roll_number, luck_at_roll,
      mutation_ids, mutation_multipliers
    ) values (
      v_target, v_gem_name, v_rarity, v_base_weight, v_value_per_gram,
      coalesce((p_payload->>'weight_multiplier')::float8, 1), v_weight, v_weight,
      v_value, false, v_rolls, v_luck, '{}', '{}'::jsonb
    );

    insert into public.player_gem_mutation_combinations (
      player_id, gem_name, combination_key, mutation_ids, mutation_multipliers,
      total_found, highest_value, first_discovered_at, last_discovered_at
    ) values (
      v_target, v_gem_name, 'none', '{}', '{}'::jsonb,
      1, v_value, now(), now()
    )
    on conflict (player_id, gem_name, combination_key) do update
      set total_found = public.player_gem_mutation_combinations.total_found + 1,
          highest_value = greatest(public.player_gem_mutation_combinations.highest_value, excluded.highest_value),
          last_discovered_at = now();

    v_result := jsonb_build_object('gem', v_gem_name, 'roll_number', v_rolls, 'luck_at_roll', v_luck);

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
