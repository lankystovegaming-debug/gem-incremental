-- Roll hot-path v2
--
-- 1. Collapses authoritative pre-roll reads into one service-only RPC.
-- 2. Uses trigger-driven catalog versions so warm Edge isolates only reload
--    gameplay catalogs after an actual catalog change.
-- 3. Collapses response-critical and background post-roll bookkeeping into
--    two calls to one RPC without moving RNG or response-visible formulas.
-- 4. Retains the 100 heaviest rolls per player. This is sufficient to produce
--    the exact public top 100 even when any number of players are hidden.

begin;

create table if not exists public.roll_catalog_versions (
  singleton boolean primary key default true check (singleton),
  gem_version bigint not null default 1,
  mutation_version bigint not null default 1,
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.roll_catalog_versions(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.roll_catalog_versions enable row level security;
revoke all on table public.roll_catalog_versions from public, anon, authenticated;
grant select on table public.roll_catalog_versions to service_role;

create or replace function public.bump_roll_catalog_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'private_feature_gems' then
    update public.roll_catalog_versions
    set gem_version = gem_version + 1, updated_at = clock_timestamp()
    where singleton;
  elsif tg_table_name = 'game_mutations' then
    update public.roll_catalog_versions
    set mutation_version = mutation_version + 1, updated_at = clock_timestamp()
    where singleton;
  end if;
  return null;
end;
$$;

revoke all on function public.bump_roll_catalog_version() from public, anon, authenticated;

drop trigger if exists bump_roll_gem_catalog_version on public.private_feature_gems;
create trigger bump_roll_gem_catalog_version
after insert or update or delete or truncate on public.private_feature_gems
for each statement execute function public.bump_roll_catalog_version();

drop trigger if exists bump_roll_mutation_catalog_version on public.game_mutations;
create trigger bump_roll_mutation_catalog_version
after insert or update or delete or truncate on public.game_mutations
for each statement execute function public.bump_roll_catalog_version();

create or replace function public.roll_prepare_context(
  p_player_id uuid,
  p_now timestamptz,
  p_gem_catalog_version bigint default null,
  p_mutation_catalog_version bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_versions public.roll_catalog_versions%rowtype;
  v_player jsonb;
  v_guild jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select * into v_versions
  from public.roll_catalog_versions
  where singleton;

  select to_jsonb(p) || jsonb_build_object(
    'player_research_effects',
    coalesce((select jsonb_agg(to_jsonb(r)) from public.player_research_effects r where r.player_id = p.id), '[]'::jsonb)
  )
  into v_player
  from (
    select id, username, next_roll_at, inventory_capacity, total_rolls,
      mutation_luck, rarity_resonance, equipment_state,
      gravitational_surge_progress, gravitational_surge_ready,
      bag_compression_progress, best_rare_natural_weight_100k,
      best_rare_natural_weight_1m, misty_mutation_boost_rolls,
      misty_mutation_boost_stacks, ancient_relic_boost_rolls,
      enchanted_relic_boost_rolls
    from public.players
    where id = p_player_id
  ) p;

  select jsonb_build_object(
    'membership', jsonb_build_object(
      'guild_id', gm.guild_id,
      'eligible_at', gm.eligible_at,
      'guilds', jsonb_build_object(
        'luck_tier', g.luck_tier,
        'speed_tier', g.speed_tier,
        'weight_luck_tier', g.weight_luck_tier
      )
    ),
    'shopBuffIds', coalesce((
      select jsonb_agg(b.potion_id order by b.potion_id)
      from public.guild_shop_buffs b
      where b.guild_id = gm.guild_id and b.expires_at > p_now
    ), '[]'::jsonb)
  ) into v_guild
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  where gm.player_id = p_player_id;

  return jsonb_build_object(
    'player', v_player,
    'ban', (select to_jsonb(b) from (
      select active_until, note from public.user_roll_luck_rarity_mult
      where player_id = p_player_id
    ) b),
    'inventoryCount', (select count(*) from public.inventory_gems i
      where i.player_id = p_player_id
        and i.gem_name <> 'Enchant Relic' and i.gem_name <> 'Ancient Relic'),
    'equipment', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from (
      select id, equipment_id, category, luck_bonus, roll_speed_bonus,
        weight_luck_bonus, weight_multiplier_bonus, mutation_chance_bonus,
        enchant_id, enchant_grade, enchant_state, masterwork_level,
        masterwork_passive, masterwork_passive_rank, masterwork_attunement
      from public.player_equipment
      where player_id = p_player_id and equipped = true
    ) e), '[]'::jsonb),
    'mineArtifacts', coalesce((select jsonb_agg(m.artifact_key order by m.artifact_key)
      from public.museum_artifact_registrations m where m.player_id = p_player_id), '[]'::jsonb),
    'qol', public.qol_roll_context(p_player_id),
    'activeBoosts', coalesce((select jsonb_agg(to_jsonb(b) order by b.family) from (
      select family, tier, effect_value from public.player_boosts
      where player_id = p_player_id and expires_at > p_now
    ) b), '[]'::jsonb),
    'oneRollBoost', (select to_jsonb(o) from (
      select effect_value, consumable_id, charges from public.player_one_roll_boosts
      where player_id = p_player_id
    ) o),
    'activeAdminEvent', (select to_jsonb(a) from (
      select id, name, luck_bonus, roll_speed_bonus, weight_luck_bonus,
        weight_multiplier_bonus, mutation_chance_bonus, luck_multiplier,
        roll_speed_multiplier, weight_luck_multiplier,
        weight_multiplier_multiplier, mutation_luck_bonus,
        mutation_luck_multiplier, ends_at
      from public.admin_events
      where active = true and starts_at <= p_now and ends_at > p_now
      order by starts_at desc limit 1
    ) a),
    'globalEvent', public.get_active_global_event(),
    'crystalEffects', public.crystal_player_effects(p_player_id),
    'expeditionArtifactEffects', public.player_expedition_artifact_effects(p_player_id),
    'guild', coalesce(v_guild, jsonb_build_object('membership', null, 'shopBuffIds', '[]'::jsonb)),
    'catalogVersions', jsonb_build_object(
      'gems', v_versions.gem_version,
      'mutations', v_versions.mutation_version
    ),
    'gemCatalog', case when p_gem_catalog_version is distinct from v_versions.gem_version then
      coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_order, g.rarity desc) from (
        select name, rarity, base_weight, value_per_gram, affected_by_luck,
          availability_mode, starts_at, ends_at, daily_start_time, daily_end_time,
          availability_timezone, required_event_key, metadata, special_gem, sort_order
        from public.private_feature_gems where enabled = true
      ) g), '[]'::jsonb)
    else null end,
    'mutationCatalog', case when p_mutation_catalog_version is distinct from v_versions.mutation_version then
      coalesce((select jsonb_agg(to_jsonb(m) order by m.multiplier, m.name) from (
        select id, name, chance, multiplier, description, icon, color
        from public.game_mutations where enabled = true
      ) m), '[]'::jsonb)
    else null end
  );
end;
$$;

revoke all on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint) from public, anon, authenticated;
grant execute on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint) to service_role;

create or replace function public.roll_finish_bookkeeping(
  p_player_id uuid,
  p_phase text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lifetime jsonb := null;
  v_combo jsonb := null;
  v_guild jsonb := null;
  v_event jsonb := null;
  v_errors jsonb := '[]'::jsonb;
  v_mutation_ids text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'mutationIds', '[]'::jsonb))), array[]::text[]);
  v_relic boolean := coalesce((p_payload->>'relic')::boolean, false);
  v_rarity numeric := coalesce((p_payload->>'rarity')::numeric, 0);
  v_effective_rarity numeric := coalesce((p_payload->>'effectiveRarity')::numeric, 0);
  v_final_weight numeric := coalesce((p_payload->>'finalWeight')::numeric, 0);
  v_value numeric := coalesce((p_payload->>'value')::numeric, 0);
  v_weight_cutoff numeric := null;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_phase not in ('critical', 'background', 'loss') then
    raise exception 'invalid_bookkeeping_phase';
  end if;

  if p_phase = 'loss' then
    begin
      perform public.process_private_feature_progress_event_incremental(
        p_player_id, 'roll', (p_payload->>'rollNumber')::bigint,
        coalesce(p_payload->'progressPayload', '{}'::jsonb));
    exception when others then v_errors := v_errors || jsonb_build_array('progress:' || sqlstate); end;
    begin
      perform public.record_season_roll(p_player_id, 0, 0, 0, false);
    exception when others then v_errors := v_errors || jsonb_build_array('season:' || sqlstate); end;
    begin
      perform public.claim_guild_mythic_surge(p_player_id);
    exception when others then v_errors := v_errors || jsonb_build_array('guild_surge:' || sqlstate); end;
    begin
      perform public.record_guild_roll_activity(p_player_id, 0, '', 0, 0, 0, 0, false, false);
    exception when others then v_errors := v_errors || jsonb_build_array('guild:' || sqlstate); end;
    begin
      perform public.record_global_event_roll(nullif(p_payload->>'eventOccurrenceId', '')::uuid);
    exception when others then v_errors := v_errors || jsonb_build_array('global_event:' || sqlstate); end;
    begin
      perform public.record_abandoned_mine_roll(p_player_id, jsonb_build_object(
        'rarity', 0, 'finalWeight', 0, 'displayedValue', 0, 'mutationIds', '[]'::jsonb));
    exception when others then v_errors := v_errors || jsonb_build_array('expedition:' || sqlstate); end;
    begin
      update public.players set
        misty_mutation_boost_rolls = greatest(0, coalesce(misty_mutation_boost_rolls, 0) - 1),
        misty_mutation_boost_stacks = case when coalesce(misty_mutation_boost_rolls, 0) > 1 then coalesce(misty_mutation_boost_stacks, 0) else 0 end,
        ancient_relic_boost_rolls = greatest(0, coalesce(ancient_relic_boost_rolls, 0) - 1),
        enchanted_relic_boost_rolls = greatest(0, coalesce(enchanted_relic_boost_rolls, 0) - 1)
      where id = p_player_id;
    exception when others then v_errors := v_errors || jsonb_build_array('temporary_boosts:' || sqlstate); end;
    if coalesce((p_payload->>'consumeOneRollCharge')::boolean, false) then
      begin perform public.spend_one_roll_charge(p_player_id);
      exception when others then v_errors := v_errors || jsonb_build_array('one_roll_charge:' || sqlstate); end;
    end if;
    if nullif(p_payload->>'enchantedEquipmentId', '') is not null and coalesce((p_payload->>'enchantStateChanged')::boolean, false) then
      begin
        update public.player_equipment set enchant_state = coalesce(p_payload->'enchantState', '{}'::jsonb)
        where id = (p_payload->>'enchantedEquipmentId')::bigint and player_id = p_player_id;
      exception when others then v_errors := v_errors || jsonb_build_array('enchant:' || sqlstate); end;
    end if;
    return jsonb_build_object('errors', v_errors);
  end if;

  if p_phase = 'critical' then
    begin
      v_lifetime := public.record_server_roll(p_player_id, p_payload->>'gemName',
        (case when v_relic then 0 else v_rarity end)::integer, v_final_weight::double precision);
    exception when others then v_errors := v_errors || jsonb_build_array('lifetime:' || sqlstate); end;

    if not v_relic then
      begin
        v_combo := to_jsonb(public.record_gem_mutation_combination(
          p_player_id, p_payload->>'gemName', p_payload->>'combinationKey', v_mutation_ids,
          coalesce(p_payload->'mutationMultipliers', '{}'::jsonb), v_value));
      exception when others then v_errors := v_errors || jsonb_build_array('combination:' || sqlstate); end;

      if jsonb_typeof(p_payload->'bonusCombination') = 'object' then
        begin
          perform public.record_gem_mutation_combination(
            p_player_id, p_payload#>>'{bonusCombination,gemName}',
            p_payload#>>'{bonusCombination,combinationKey}',
            coalesce(array(select jsonb_array_elements_text(coalesce(p_payload#>'{bonusCombination,mutationIds}', '[]'::jsonb))), array[]::text[]),
            coalesce(p_payload#>'{bonusCombination,mutationMultipliers}', '{}'::jsonb),
            coalesce((p_payload#>>'{bonusCombination,value}')::numeric, 0));
        exception when others then v_errors := v_errors || jsonb_build_array('bonus_combination:' || sqlstate); end;
      end if;
    end if;

    begin
      v_guild := public.record_guild_roll_activity(
        p_player_id, case when v_relic then 0 else v_rarity end, '',
        case when v_relic then 0 else v_effective_rarity end,
        case when v_relic then 0 else coalesce((p_payload->>'rolledWeightMultiplier')::numeric, 0) end,
        case when v_relic then 0 else v_final_weight end,
        case when v_relic then 0 else v_value end,
        not v_relic and cardinality(v_mutation_ids) > 0, v_relic);
    exception when others then v_errors := v_errors || jsonb_build_array('guild:' || sqlstate); end;

    begin
      v_event := public.record_global_event_roll(nullif(p_payload->>'eventOccurrenceId', '')::uuid);
    exception when others then v_errors := v_errors || jsonb_build_array('global_event:' || sqlstate); end;

    return jsonb_build_object(
      'lifetimeStats', v_lifetime,
      'mutationCombination', v_combo,
      'guildPoints', v_guild,
      'globalEventProgress', v_event,
      'errors', v_errors
    );
  end if;

  if nullif(p_payload->>'enchantedEquipmentId', '') is not null and coalesce((p_payload->>'enchantStateChanged')::boolean, false) then
    begin
      update public.player_equipment set enchant_state = coalesce(p_payload->'enchantState', '{}'::jsonb)
      where id = (p_payload->>'enchantedEquipmentId')::bigint and player_id = p_player_id;
    exception when others then v_errors := v_errors || jsonb_build_array('enchant:' || sqlstate); end;
  end if;

  begin
    perform public.record_roll_leaderboard_entry(
      p_player_id, coalesce(p_payload->>'username', p_player_id::text), p_payload->>'gemName',
      case when v_relic then 0 else v_rarity end, v_final_weight, v_value,
      nullif(p_payload->>'mutationId', ''), v_mutation_ids,
      coalesce((p_payload->>'mutationMultiplier')::numeric, 1),
      coalesce((p_payload->>'rawLuck')::numeric, 1), coalesce((p_payload->>'baseLuck')::numeric, 1),
      (p_payload->>'rollNumber')::bigint);
  exception when others then v_errors := v_errors || jsonb_build_array('leaderboard:' || sqlstate); end;

  begin
    select h.final_weight into v_weight_cutoff
    from public.roll_weight_history h
    where h.player_id = p_player_id
    order by h.final_weight desc, h.created_at desc, h.id desc
    offset 99 limit 1;

    -- Once a player has 100 rows, low rolls stop producing an insert/delete
    -- pair and its associated WAL. Equal-weight new rows qualify because the
    -- leaderboard's newer created_at/id tie-break places them first.
    if v_weight_cutoff is null or v_final_weight >= v_weight_cutoff then
      insert into public.roll_weight_history(player_id, username, gem_name, final_weight, base_rarity, mutation_ids)
      values (p_player_id, coalesce(p_payload->>'username', p_player_id::text), p_payload->>'gemName', v_final_weight, v_rarity, v_mutation_ids);
    end if;
    delete from public.roll_weight_history h
    where h.player_id = p_player_id and h.id in (
      select old.id from public.roll_weight_history old
      where old.player_id = p_player_id
      order by old.final_weight desc, old.created_at desc, old.id desc
      offset 100
      limit 1000
    );
  exception when others then v_errors := v_errors || jsonb_build_array('weight_history:' || sqlstate); end;

  begin
    perform public.process_private_feature_progress_event_incremental(
      p_player_id, 'roll', (p_payload->>'rollNumber')::bigint,
      coalesce(p_payload->'progressPayload', '{}'::jsonb));
  exception when others then v_errors := v_errors || jsonb_build_array('progress:' || sqlstate); end;

  if coalesce((p_payload->>'consumeOneRollCharge')::boolean, false) then
    begin perform public.spend_one_roll_charge(p_player_id);
    exception when others then v_errors := v_errors || jsonb_build_array('one_roll_charge:' || sqlstate); end;
  end if;

  begin
    perform public.record_abandoned_mine_roll(p_player_id, coalesce(p_payload->'expeditionPayload', '{}'::jsonb));
  exception when others then v_errors := v_errors || jsonb_build_array('expedition:' || sqlstate); end;

  begin
    perform public.record_season_roll(p_player_id,
      case when v_relic then 0 else v_rarity end,
      case when v_relic then 0 else v_effective_rarity end,
      case when v_relic then 0 else cardinality(v_mutation_ids) end, v_relic);
  exception when others then v_errors := v_errors || jsonb_build_array('season:' || sqlstate); end;

  if not v_relic and v_rarity < 1000000 and v_effective_rarity >= 50000000 then
    begin
      insert into public.global_chat_announcements(player_id, gem_name, rarity, effective_rarity, mutation_ids, luck_at_roll)
      values (p_player_id, p_payload->>'gemName', v_rarity, v_effective_rarity, v_mutation_ids,
        coalesce((p_payload->>'announcedLuck')::numeric, 1));
    exception when others then v_errors := v_errors || jsonb_build_array('mutation_announcement:' || sqlstate); end;
  end if;

  begin
    perform public.attach_roll_announcement_mutations(
      p_player_id, p_payload->>'gemName', v_rarity, v_mutation_ids,
      coalesce((p_payload->>'announcedLuck')::numeric, 1), v_effective_rarity);
  exception when others then v_errors := v_errors || jsonb_build_array('announcement_mutations:' || sqlstate); end;

  return jsonb_build_object('errors', v_errors);
end;
$$;

revoke all on function public.roll_finish_bookkeeping(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.roll_finish_bookkeeping(uuid, text, jsonb) to service_role;

commit;
