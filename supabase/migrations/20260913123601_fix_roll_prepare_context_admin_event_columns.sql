begin;

-- The first hot-path migration selected admin_events.mutation_chance_bonus.
-- That column only exists on player_equipment; admin mutation events use the
-- mutation_luck_bonus and mutation_luck_multiplier columns below. Because the
-- missing column was inside the consolidated query, every context load failed.
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

commit;
