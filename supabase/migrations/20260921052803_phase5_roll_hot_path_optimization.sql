-- Phase 5: reduce Edge -> PostgREST round trips without moving RNG or the
-- complete roll pipeline into SQL. Prepared against project
-- igrddscmrdrrwtvyspbf and intentionally not deployed by this migration PR.
begin;

-- A batch's first genuine roll is accepted by this already-serialized lease
-- transition. Claim its guild-wide surge in the same transaction. Later
-- subrolls use roll_begin_batch_subroll below, so a surge is never advanced
-- for a subroll that has not reached its authoritative begin transition.
create or replace function public.claim_equipment_roll_batch(
  p_player_id uuid,
  p_cooldown_ms numeric,
  p_equipment_state jsonb,
  p_equipment_ids bigint[],
  p_batch_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_ids bigint[];
  v_access jsonb;
  v_claim jsonb;
  v_surge jsonb;
begin
  select equipment_state
  into v_state
  from public.players
  where id = p_player_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_access := public.roll_batch_unlock_status(p_player_id, p_batch_size);
  if v_access->>'status' <> 'unlocked' then
    return v_access;
  end if;

  select coalesce(array_agg(id order by id), '{}'::bigint[])
  into v_ids
  from public.player_equipment
  where player_id = p_player_id
    and equipped;

  if v_state is distinct from p_equipment_state
     or v_ids is distinct from (
       select coalesce(array_agg(x order by x), '{}'::bigint[])
       from unnest(p_equipment_ids) x
     ) then
    return jsonb_build_object('status', 'state_changed');
  end if;

  v_claim := public.claim_server_roll(p_player_id, p_cooldown_ms);
  if v_claim->>'status' = 'claimed' then
    v_surge := public.claim_guild_mythic_surge(p_player_id);
    v_claim := v_claim || jsonb_build_object(
      'batchSize', p_batch_size,
      'mythicSurge', v_surge
    );
  end if;
  return v_claim;
end;
$$;

revoke all on function public.claim_equipment_roll_batch(uuid, numeric, jsonb, bigint[], integer)
  from public, anon, authenticated;
grant execute on function public.claim_equipment_roll_batch(uuid, numeric, jsonb, bigint[], integer)
  to service_role;

-- Only fields that can be changed by a preceding subroll are refreshed.
-- Catalogs, event modifiers, artifacts, guild membership/shop activation, and
-- the other batch-stable fields remain in the first roll_prepare_context
-- snapshot. Equipment is included because enchant_state is persisted during
-- background bookkeeping; QoL is included because discoveries advance.
create or replace function public.roll_refresh_context(
  p_player_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_player jsonb;
begin
  select to_jsonb(p) || jsonb_build_object(
    'player_research_effects',
    coalesce((select jsonb_agg(to_jsonb(r)) from public.player_research_effects r where r.player_id = p.id), '[]'::jsonb)
  )
  into v_player
  from (
    select id, username, money, next_roll_at, inventory_capacity, total_rolls,
      mutation_luck, rarity_resonance, equipment_state,
      gravitational_surge_progress, gravitational_surge_ready,
      bag_compression_progress, best_rare_natural_weight_100k,
      best_rare_natural_weight_1m, misty_mutation_boost_rolls,
      misty_mutation_boost_stacks, ancient_relic_boost_rolls,
      enchanted_relic_boost_rolls
    from public.players
    where id = p_player_id
  ) p;

  return jsonb_build_object(
    'player', v_player,
    'ban', (select to_jsonb(b) from (
      select active_until, note from public.user_roll_luck_rarity_mult
      where player_id = p_player_id
    ) b),
    'inventoryCount', (select count(*) from public.inventory_gems i
      where i.player_id = p_player_id
        and i.gem_name <> 'Enchant Relic' and i.gem_name <> 'Ancient Relic'),
    'activeAutoCraft', (select pc.active_auto_craft
      from public.player_crafting pc where pc.player_id = p_player_id),
    'equipment', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from (
      select id, equipment_id, category, luck_bonus, roll_speed_bonus,
        weight_luck_bonus, weight_multiplier_bonus, mutation_chance_bonus,
        enchant_id, enchant_grade, enchant_state, masterwork_level,
        masterwork_passive, masterwork_passive_rank, masterwork_attunement
      from public.player_equipment
      where player_id = p_player_id and equipped = true
    ) e), '[]'::jsonb),
    'qol', public.qol_roll_context(p_player_id),
    'activeBoosts', coalesce((select jsonb_agg(to_jsonb(b) order by b.family) from (
      select family, tier, effect_value from public.player_boosts
      where player_id = p_player_id and expires_at > p_now
    ) b), '[]'::jsonb),
    'oneRollBoost', (select to_jsonb(o) from (
      select effect_value, consumable_id, charges from public.player_one_roll_boosts
      where player_id = p_player_id
    ) o)
  );
end;
$$;

revoke all on function public.roll_refresh_context(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.roll_refresh_context(uuid, timestamptz)
  to service_role;

-- Begin a later subroll only after the preceding genuine roll has committed.
-- The player row and the guild-shop row are locked in a consistent order, and
-- the refresh and surge claim share one PostgREST request.
create or replace function public.roll_begin_batch_subroll(
  p_player_id uuid,
  p_lease_id uuid,
  p_genuine_roll bigint,
  p_now timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_player public.players%rowtype;
  v_surge jsonb;
  v_context jsonb;
begin
  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found or v_player.roll_lease_id is distinct from p_lease_id then
    raise exception 'invalid_roll_lease';
  end if;
  if p_genuine_roll <> v_player.equipment_genuine_rolls + 1
     or p_genuine_roll <> v_player.equipment_state_roll + 1 then
    raise exception 'previous_subroll_not_committed';
  end if;

  v_surge := public.claim_guild_mythic_surge(p_player_id);
  v_context := public.roll_refresh_context(p_player_id, p_now);

  return jsonb_build_object('context', v_context, 'mythicSurge', v_surge);
end;
$$;

revoke all on function public.roll_begin_batch_subroll(uuid, uuid, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.roll_begin_batch_subroll(uuid, uuid, bigint, timestamptz)
  to service_role;

-- Replace the equipment commit with a Phase 5 signature. Critical bookkeeping
-- is now part of the already-serialized successful-roll commit. For displayed
-- batches, background bookkeeping is also included because the Edge function
-- already awaited it before beginning the next subroll. Singles still issue
-- background bookkeeping through waitUntil after this RPC returns.
drop function if exists public.commit_equipment_roll(uuid, uuid, bigint, jsonb, text, jsonb, integer);

create function public.commit_equipment_roll(
  p_player_id uuid,
  p_lease_id uuid,
  p_genuine_roll bigint,
  p_state jsonb,
  p_loot text,
  p_bonus jsonb,
  p_capacity integer,
  p_player_patch jsonb,
  p_bookkeeping jsonb,
  p_include_background boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.players%rowtype;
  b public.inventory_gems%rowtype;
  n integer;
  v_critical jsonb;
  v_background jsonb := null;
begin
  select * into p
  from public.players
  where id = p_player_id
  for update;

  if not found or p.roll_lease_id is distinct from p_lease_id then
    raise exception 'invalid_roll_lease';
  end if;
  if p.equipment_state_roll >= p_genuine_roll then
    return jsonb_build_object('duplicate', true);
  end if;
  if p_genuine_roll <> p.equipment_genuine_rolls + 1 then
    raise exception 'invalid_genuine_roll';
  end if;

  update public.players
  set equipment_state = p_state,
      equipment_state_roll = p_genuine_roll,
      rarity_resonance = case when p_player_patch ? 'rarity_resonance'
        then greatest(0, least(100, (p_player_patch->>'rarity_resonance')::integer)) else rarity_resonance end,
      best_rare_natural_weight_100k = case when p_player_patch ? 'best_rare_natural_weight_100k'
        then greatest(coalesce(best_rare_natural_weight_100k, 0), (p_player_patch->>'best_rare_natural_weight_100k')::numeric)
        else best_rare_natural_weight_100k end,
      best_rare_natural_weight_1m = case when p_player_patch ? 'best_rare_natural_weight_1m'
        then greatest(coalesce(best_rare_natural_weight_1m, 0), (p_player_patch->>'best_rare_natural_weight_1m')::numeric)
        else best_rare_natural_weight_1m end,
      misty_mutation_boost_rolls = case when p_player_patch ? 'misty_mutation_boost_rolls'
        then greatest(0, (p_player_patch->>'misty_mutation_boost_rolls')::integer) else misty_mutation_boost_rolls end,
      misty_mutation_boost_stacks = case when p_player_patch ? 'misty_mutation_boost_stacks'
        then greatest(0, (p_player_patch->>'misty_mutation_boost_stacks')::integer) else misty_mutation_boost_stacks end,
      ancient_relic_boost_rolls = case when p_player_patch ? 'ancient_relic_boost_rolls'
        then greatest(0, (p_player_patch->>'ancient_relic_boost_rolls')::integer) else ancient_relic_boost_rolls end,
      enchanted_relic_boost_rolls = case when p_player_patch ? 'enchanted_relic_boost_rolls'
        then greatest(0, (p_player_patch->>'enchanted_relic_boost_rolls')::integer) else enchanted_relic_boost_rolls end
  where id = p_player_id;

  if p_loot is not null then
    if p_loot not in (
      'lucky-potion-1', 'lucky-potion-2', 'lucky-potion-3', 'lucky-potion-4',
      'speed-potion-1', 'speed-potion-2', 'speed-potion-3', 'speed-potion-4',
      'fortune-potion-1', 'fortune-potion-2', 'fortune-potion-3', 'fortune-potion-4',
      'mass-potion-1', 'mass-potion-2', 'mass-potion-3', 'mass-potion-4',
      'legendary-potion', 'mythic-potion', 'relic-potion'
    ) then
      raise exception 'invalid_excavation_loot';
    end if;

    insert into public.player_consumables (player_id, consumable_id, quantity, updated_at)
    values (p_player_id, p_loot, 1, now())
    on conflict (player_id, consumable_id) do update
    set quantity = public.player_consumables.quantity + 1,
        updated_at = now();
  end if;

  if p_bonus is not null then
    select count(*) into n
    from public.inventory_gems
    where player_id = p_player_id;

    if n < p_capacity then
      insert into public.inventory_gems (
        player_id, gem_name, rarity, base_weight, value_per_gram,
        rolled_weight_multiplier, rolled_weight, final_weight, mutation_id,
        mutation_ids, mutation_multiplier, mutation_multipliers,
        mutation_chance_multiplier, value, luck_at_roll, locked, roll_number
      )
      values (
        p_player_id, p_bonus->>'gem_name', (p_bonus->>'rarity')::integer,
        (p_bonus->>'base_weight')::double precision, (p_bonus->>'value_per_gram')::double precision,
        (p_bonus->>'rolled_weight_multiplier')::double precision,
        (p_bonus->>'rolled_weight')::double precision, (p_bonus->>'final_weight')::double precision,
        p_bonus->>'mutation_id', array(select jsonb_array_elements_text(p_bonus->'mutation_ids')),
        (p_bonus->>'mutation_multiplier')::double precision, p_bonus->'mutation_multipliers',
        (p_bonus->>'mutation_chance_multiplier')::double precision,
        (p_bonus->>'value')::double precision, (p_bonus->>'luck_at_roll')::double precision,
        false, (p_bonus->>'roll_number')::bigint
      )
      returning * into b;
    end if;
  end if;

  v_critical := public.roll_finish_bookkeeping(p_player_id, 'critical', p_bookkeeping);
  if coalesce(p_include_background, false) then
    v_background := public.roll_finish_bookkeeping(p_player_id, 'background', p_bookkeeping);
  end if;

  return jsonb_build_object(
    'bonus', case when b.id is not null then to_jsonb(b) else null end,
    'loot', p_loot,
    'state', p_state,
    'bookkeeping', v_critical,
    'backgroundBookkeeping', v_background
  );
end;
$$;

revoke all on function public.commit_equipment_roll(uuid, uuid, bigint, jsonb, text, jsonb, integer, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.commit_equipment_roll(uuid, uuid, bigint, jsonb, text, jsonb, integer, jsonb, jsonb, boolean)
  to service_role;

commit;
