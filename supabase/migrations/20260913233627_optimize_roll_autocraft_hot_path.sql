begin;

-- Include the cheap Auto Craft selector in the existing pre-roll snapshot so
-- players without Auto Craft no longer need a separate Data API request.
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
        weight_multiplier_bonus, luck_multiplier, roll_speed_multiplier,
        weight_luck_multiplier, weight_multiplier_multiplier,
        mutation_luck_bonus, mutation_luck_multiplier, ends_at
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

revoke all on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint)
  to service_role;

-- Resolve the authoritative active recipe and mutate its progress in one
-- transaction. Equipment-overhaul and gem-count deposits continue to use the
-- existing material planner, including its conservation/preservation roll.
create or replace function public.roll_autocraft_deposit(
  p_player_id uuid,
  p_specimen jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_recipe_id text;
  v_recipe jsonb;
  v_progress jsonb;
  v_requirement jsonb;
  v_requirement_index integer;
  v_requirement_type text;
  v_key text;
  v_current jsonb;
  v_result jsonb;
  v_base_weight numeric;
  v_final_weight numeric;
  v_weight_multiplier numeric;
  v_rarity numeric;
  v_value numeric;
  v_number numeric;
  v_gem_types jsonb;
  v_matches boolean;
  v_complete boolean;
begin
  if p_player_id is null or p_specimen is null then
    raise exception 'invalid_autocraft_deposit' using errcode = '22023';
  end if;

  -- This is the same lock used by manual equipment-material deposits and
  -- final crafting, so progress cannot race those operations.
  perform 1 from public.players where id = p_player_id for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  select pc.active_auto_craft into v_recipe_id
  from public.player_crafting pc
  where pc.player_id = p_player_id;

  if v_recipe_id is null then
    return jsonb_build_object(
      'deposited', false, 'preserved', false,
      'recipeId', null, 'requirementIndex', null
    );
  end if;

  select gr.recipe into v_recipe
  from public.game_recipes gr
  where gr.id = v_recipe_id;

  if v_recipe is null then
    return jsonb_build_object(
      'deposited', false, 'preserved', false,
      'recipeId', null, 'requirementIndex', null
    );
  end if;

  insert into public.crafting_progress(player_id, recipe_id, progress)
  values (p_player_id, v_recipe_id, '{}'::jsonb)
  on conflict (player_id, recipe_id) do nothing;

  select cp.progress into v_progress
  from public.crafting_progress cp
  where cp.player_id = p_player_id and cp.recipe_id = v_recipe_id
  for update;

  v_recipe := coalesce(v_progress->'_equipment_recipe', v_recipe);

  if coalesce((v_recipe->>'includedSpecimens')::boolean, false)
    or coalesce((v_recipe->>'equipmentOverhaul')::boolean, false)
  then
    v_result := public.deposit_equipment_material(
      p_player_id, v_recipe_id, p_specimen, null
    );
    return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
      'deposited', coalesce((v_result->>'deposited')::boolean, false),
      'preserved', coalesce((v_result->>'preserved')::boolean, false),
      'recipeId', case when coalesce((v_result->>'deposited')::boolean, false) then v_recipe_id else null end,
      'requirementIndex', case when coalesce((v_result->>'deposited')::boolean, false)
        then (v_result->>'requirementIndex')::integer else null end
    );
  end if;

  v_base_weight := nullif((p_specimen->>'base_weight')::numeric, 0);
  v_final_weight := (p_specimen->>'final_weight')::numeric;
  v_weight_multiplier := case when v_base_weight is not null
    then v_final_weight / v_base_weight
    else (p_specimen->>'rolled_weight_multiplier')::numeric end;
  v_rarity := (p_specimen->>'rarity')::numeric;
  v_value := (p_specimen->>'value')::numeric;

  for v_requirement, v_requirement_index in
    select item.value, (item.ordinality - 1)::integer
    from jsonb_array_elements(coalesce(v_recipe->'requirements', '[]'::jsonb))
      with ordinality as item(value, ordinality)
  loop
    v_requirement_type := v_requirement->>'type';
    if v_requirement_type = 'equipment' then
      continue;
    end if;

    v_key := coalesce(
      v_requirement->>'id',
      case when v_requirement_type = 'gem-count' then v_requirement->>'gem' end,
      v_requirement_type || '-' || v_requirement_index::text
    );
    v_current := v_progress->v_key;

    v_complete := case v_requirement_type
      when 'gem-count' then coalesce((v_current #>> '{}')::numeric, 0) >= (v_requirement->>'amount')::numeric
      when 'gem-total-weight' then coalesce((v_current #>> '{}')::numeric, 0) >= (v_requirement->>'totalWeight')::numeric
      when 'specimen-value-total' then coalesce((v_current #>> '{}')::numeric, 0) >= (v_requirement->>'totalValue')::numeric
      when 'gem-min-weight-multiplier' then coalesce((v_current #>> '{}')::numeric, 0) >= coalesce((v_requirement->>'amount')::numeric, 1)
      when 'gem-max-weight-multiplier' then coalesce((v_current #>> '{}')::numeric, 0) >= coalesce((v_requirement->>'amount')::numeric, 1)
      when 'specimen-condition' then coalesce((v_current #>> '{}')::numeric, 0) >= coalesce((v_requirement->>'amount')::numeric, 1)
      when 'rarity-points' then
        coalesce((v_current->>'points')::numeric, 0) >= (v_requirement->>'points')::numeric
        and jsonb_array_length(coalesce(v_current->'gemTypes', '[]'::jsonb)) >= coalesce((v_requirement->>'minimumUniqueGemTypes')::integer, 0)
      when 'gem-range' then not exists (
        select 1 from jsonb_array_elements_text(coalesce(v_requirement->'gems', '[]'::jsonb)) gem(name)
        where coalesce((v_current->>gem.name)::numeric, 0) < coalesce((v_requirement->>'amountEach')::numeric, 1)
      )
      else false
    end;
    if v_complete then
      continue;
    end if;

    v_matches := true;
    if v_requirement_type = 'gem-range' then
      v_matches := coalesce(v_requirement->'gems', '[]'::jsonb) ? (p_specimen->>'gem_name');
    elsif v_requirement_type not in ('specimen-value-total', 'rarity-points') then
      v_matches := (not (v_requirement ? 'gem') or v_requirement->>'gem' = p_specimen->>'gem_name')
        and (not (v_requirement ? 'minimumWeightMultiplier') or v_weight_multiplier >= (v_requirement->>'minimumWeightMultiplier')::numeric)
        and (not (v_requirement ? 'maximumWeightMultiplier') or v_weight_multiplier <= (v_requirement->>'maximumWeightMultiplier')::numeric)
        and (not (v_requirement ? 'minimumRarity') or v_rarity >= (v_requirement->>'minimumRarity')::numeric)
        and (not (v_requirement ? 'maximumRarity') or v_rarity <= (v_requirement->>'maximumRarity')::numeric);
    end if;
    if not v_matches then
      continue;
    end if;

    if v_requirement_type = 'gem-count' then
      v_result := public.deposit_equipment_material(
        p_player_id, v_recipe_id, p_specimen, v_requirement_index
      );
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
        'deposited', coalesce((v_result->>'deposited')::boolean, false),
        'preserved', coalesce((v_result->>'preserved')::boolean, false),
        'recipeId', case when coalesce((v_result->>'deposited')::boolean, false) then v_recipe_id else null end,
        'requirementIndex', case when coalesce((v_result->>'deposited')::boolean, false) then v_requirement_index else null end
      );
    elsif v_requirement_type = 'gem-total-weight' then
      v_number := coalesce((v_current #>> '{}')::numeric, 0) + v_final_weight;
      v_progress := jsonb_set(v_progress, array[v_key], to_jsonb(v_number), true);
    elsif v_requirement_type = 'specimen-value-total' then
      v_number := coalesce((v_current #>> '{}')::numeric, 0) + v_value;
      v_progress := jsonb_set(v_progress, array[v_key], to_jsonb(v_number), true);
    elsif v_requirement_type in ('gem-min-weight-multiplier', 'gem-max-weight-multiplier', 'specimen-condition') then
      v_number := coalesce((v_current #>> '{}')::numeric, 0) + 1;
      v_progress := jsonb_set(v_progress, array[v_key], to_jsonb(v_number), true);
    elsif v_requirement_type = 'rarity-points' then
      v_number := coalesce((v_current->>'points')::numeric, 0) + case
        when v_rarity >= 500 then 100
        when v_rarity >= 250 then 50
        when v_rarity >= 100 then 20
        when v_rarity >= 50 then 8
        when v_rarity >= 10 then 3
        else 1 end;
      v_gem_types := coalesce(v_current->'gemTypes', '[]'::jsonb);
      if not v_gem_types ? (p_specimen->>'gem_name') then
        v_gem_types := v_gem_types || jsonb_build_array(p_specimen->>'gem_name');
      end if;
      v_progress := jsonb_set(v_progress, array[v_key], jsonb_build_object(
        'points', v_number, 'gemTypes', v_gem_types
      ), true);
    elsif v_requirement_type = 'gem-range' then
      v_number := coalesce((v_current->>(p_specimen->>'gem_name'))::numeric, 0) + 1;
      v_progress := jsonb_set(
        v_progress,
        array[v_key],
        jsonb_set(coalesce(v_current, '{}'::jsonb), array[p_specimen->>'gem_name'], to_jsonb(v_number), true),
        true
      );
    else
      continue;
    end if;

    update public.crafting_progress
    set progress = v_progress, updated_at = now()
    where player_id = p_player_id and recipe_id = v_recipe_id;

    return jsonb_build_object(
      'deposited', true, 'preserved', false,
      'recipeId', v_recipe_id, 'requirementIndex', v_requirement_index,
      'progress', v_progress
    );
  end loop;

  return jsonb_build_object(
    'deposited', false, 'preserved', false,
    'recipeId', null, 'requirementIndex', null,
    'progress', v_progress
  );
end;
$$;

revoke all on function public.roll_autocraft_deposit(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.roll_autocraft_deposit(uuid, jsonb)
  to service_role;

commit;
