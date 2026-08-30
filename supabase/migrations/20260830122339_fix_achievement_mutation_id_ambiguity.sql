begin;

-- A missing source row must mean zero progress, never a NULL completion flag.
-- Centralizing that normalization also protects the legacy catalog snapshot.
create or replace function public.achievement_set_progress_v013(
  p_uid uuid,
  p_name text,
  p_value numeric,
  p_target numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_value numeric := greatest(0, coalesce(p_value, 0));
  v_target numeric := greatest(1, coalesce(p_target, 1));
begin
  select definition.id into v_id
  from public.private_feature_definitions definition
  where definition.feature_kind = 'achievement'
    and definition.enabled
    and definition.name = p_name
    and definition.metadata->>'catalogVersion' = 'v0.13.0-beta';

  if v_id is null then return; end if;

  update public.private_feature_definitions definition
  set metadata = jsonb_set(definition.metadata, '{target}', to_jsonb(v_target), true),
      description = case
        when definition.description like 'Complete this % milestone%' then
          'Reach ' || trim(to_char(v_target, 'FM999G999G999G999G999')) ||
          ' progress for ' || p_name || ' through genuine server-authoritative gameplay.'
        else definition.description
      end,
      updated_at = now()
  where definition.id = v_id
    and (
      definition.metadata->'target' is distinct from to_jsonb(v_target)
      or definition.description like 'Complete this % milestone%'
    );

  insert into public.private_feature_progress(
    player_id, feature_id, current_value, completed, completed_at, metadata
  ) values (
    p_uid,
    v_id,
    v_value,
    v_value >= v_target,
    case when v_value >= v_target then now() end,
    jsonb_build_object('authoritativeSnapshot', true, 'target', v_target)
  )
  on conflict(player_id, feature_id) do update set
    current_value = greatest(
      public.private_feature_progress.current_value,
      excluded.current_value
    ),
    completed = public.private_feature_progress.completed or excluded.completed,
    completed_at = coalesce(
      public.private_feature_progress.completed_at,
      excluded.completed_at
    ),
    metadata = public.private_feature_progress.metadata || excluded.metadata,
    updated_at = now()
  where public.private_feature_progress.current_value < excluded.current_value
     or (not public.private_feature_progress.completed and excluded.completed)
     or public.private_feature_progress.metadata is distinct from
        public.private_feature_progress.metadata || excluded.metadata;
end;
$function$;

revoke all on function public.achievement_set_progress_v013(
  uuid, text, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.achievement_set_progress_v013(
  uuid, text, numeric, numeric
) to service_role;

-- The achievement catalog refresh expands best_roll_history.mutation_ids.
-- Qualify that expanded value so it cannot collide with the table's legacy
-- scalar mutation_id column.
create or replace function public.refresh_player_achievements_v013(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v numeric := 0;
  v2 numeric := 0;
  v3 numeric := 0;
  v4 numeric := 0;
  v5 numeric := 0;
  v_total numeric := 0;
  v_catalog_total numeric := 0;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then
    raise exception 'forbidden';
  end if;

  perform public.refresh_player_achievements_v013_pre_catalog_audit(p_uid);

  -- Discovery: the final Index target follows the authoritative backend
  -- catalog, so adding or removing gems cannot make it stale again.
  select count(distinct gem_name) into v
  from public.best_roll_history where player_id = p_uid;
  select count(*) into v_catalog_total
  from public.private_feature_gems where enabled;
  perform public.achievement_set_progress_v013(p_uid, 'Index Apprentice', v, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Index Explorer', v, 25);
  perform public.achievement_set_progress_v013(p_uid, 'Index Scholar', v, 50);
  perform public.achievement_set_progress_v013(p_uid, 'Index Expert', v, 100);
  perform public.achievement_set_progress_v013(p_uid, 'The Complete Index', v, v_catalog_total);

  -- Private feature gems extend beyond one billion rarity, so the original
  -- billion-tier discovery remains valid when this backend catalog is used.
  select coalesce(max(rarity), 0) into v
  from public.best_roll_history where player_id = p_uid;
  perform public.achievement_set_progress_v013(p_uid, 'One in a Billion', v, 1000000000);

  -- Mutation catalog completion, measured by distinct mutations actually
  -- rolled rather than the total number of mutated specimens.
  select count(distinct mutations.expanded_mutation_id) into v
  from public.best_roll_history h
  cross join lateral unnest(coalesce(h.mutation_ids, '{}'::text[]))
    as mutations(expanded_mutation_id)
  where h.player_id = p_uid;
  select count(*) into v_catalog_total
  from public.game_mutations where enabled;
  perform public.achievement_set_progress_v013(p_uid, 'Five Mutation Types', v, 5);
  perform public.achievement_set_progress_v013(p_uid, 'Ten Mutation Types', v, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Mutation Mastery', v, v_catalog_total);

  -- Daily Shop purchase history is durable and includes quantities.
  select coalesce(sum(quantity), 0) into v
  from public.daily_shop_purchases where player_id = p_uid;
  perform public.achievement_set_progress_v013(p_uid, 'First Major Purchase', v, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Committed Customer', v, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Serious Patron', v, 50);
  perform public.achievement_set_progress_v013(p_uid, 'Patron', v, 100);

  -- Category-specific equipment and complete-loadout milestones.
  select
    coalesce(max(tier) filter (where category = 'pickaxe'), 0),
    coalesce(max(tier) filter (where category = 'boots'), 0),
    coalesce(max(tier) filter (where category = 'bag'), 0),
    coalesce(sum(masterwork_level), 0),
    coalesce(sum(case when enchant_id is not null then 1 else 0 end), 0)
  into v, v2, v3, v4, v5
  from public.player_equipment
  where player_id = p_uid;
  perform public.achievement_set_progress_v013(p_uid, 'Tier V Pickaxe', v, 5);
  perform public.achievement_set_progress_v013(p_uid, 'Tier X Pickaxe', v, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Master Miner', v, 13);
  perform public.achievement_set_progress_v013(p_uid, 'Tier V Boots', v2, 5);
  perform public.achievement_set_progress_v013(p_uid, 'Tier X Boots', v2, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Tier V Bag', v3, 5);
  perform public.achievement_set_progress_v013(p_uid, 'Tier VIII Bag', v3, 8);
  v_total := least(v, v2, v3);
  perform public.achievement_set_progress_v013(p_uid, 'Capable Loadout', v_total, 5);
  perform public.achievement_set_progress_v013(p_uid, 'Advanced Loadout', v_total, 10);
  v_total := case when v >= 15 then 1 else 0 end
    + case when v2 >= 12 then 1 else 0 end
    + case when v3 >= 12 then 1 else 0 end;
  perform public.achievement_set_progress_v013(p_uid, 'Fully Equipped', v_total, 3);
  perform public.achievement_set_progress_v013(p_uid, 'Masterwork Artisan', v4, 15);
  perform public.achievement_set_progress_v013(p_uid, 'Arcane Mastery', v5, 3);

  -- Guild participation and finalized competition results.
  select count(*) into v
  from public.guild_competition_members
  where player_id = p_uid and score > 0;
  perform public.achievement_set_progress_v013(p_uid, 'Competition Contributor', v, 1);

  select
    count(*) filter (where result.rank <= 3),
    count(*) filter (where result.rank = 1)
  into v, v2
  from public.guild_competition_members member
  join public.guild_competition_results result
    on result.competition_id = member.competition_id
   and result.guild_id = member.guild_id
  where member.player_id = p_uid
    and result.finalized_at is not null;
  perform public.achievement_set_progress_v013(p_uid, 'Guild Podium', v, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Guild Champion', v2, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Three-Time Champion', v2, 3);

  -- Count completed auction/order trades from both sides without trusting the
  -- browser. Each qualifying row represents one market transaction.
  select
    (select count(*) from public.auctions a
      where a.status = 'sold'
        and (a.seller_id = p_uid or a.current_bidder_id = p_uid))
    +
    (select count(*) from public.gem_orders o
      where o.status = 'filled'
        and (o.buyer_id = p_uid or o.filled_by_id = p_uid))
  into v;
  perform public.achievement_set_progress_v013(p_uid, 'First Market Trade', v, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Market Regular', v, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Market Veteran', v, 50);
  perform public.achievement_set_progress_v013(p_uid, 'Market Expert', v, 100);
  perform public.achievement_set_progress_v013(p_uid, 'Trusted Trader', v, 250);

  -- Expedition difficulty and cache reward history.
  select
    count(*) filter (where difficulty = 'deep'),
    count(*) filter (where difficulty = 'void')
  into v, v2
  from public.player_expeditions
  where player_id = p_uid and completed_at is not null;
  perform public.achievement_set_progress_v013(p_uid, 'Depth Explorer', v, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Voidwalker', v2, 1);

  select count(*) into v
  from public.player_expeditions
  where player_id = p_uid and completed_at is not null;
  perform public.achievement_set_progress_v013(p_uid, 'Expedition Veteran', v, 15);
  perform public.achievement_set_progress_v013(p_uid, 'Expedition Master', v, 25);

  select count(*) into v
  from public.mining_cache_opens
  where player_id = p_uid and claimed_at is not null;
  perform public.achievement_set_progress_v013(p_uid, 'Cache Connoisseur', v, 25);

  -- A mission tier awarded means that mission produced at least one reward.
  select count(*) into v
  from public.player_season_missions
  where player_id = p_uid and awarded_tiers > 0;
  perform public.achievement_set_progress_v013(p_uid, 'First Season Mission', v, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Season Veteran', v, 50);

  -- Museum targets follow the current ten-slot, eight-collection backend and
  -- its observed prestige curve (current leaders are around 7,000 prestige).
  select coalesce((
    select profile.prestige
    from public.museum_profiles profile
    where profile.player_id = p_uid
  ), 0) into v;
  perform public.achievement_set_progress_v013(p_uid, 'Museum Prestige 5000', v, 5000);
  perform public.achievement_set_progress_v013(p_uid, 'Prestige Gallery 7500', v, 7500);
  perform public.achievement_set_progress_v013(p_uid, 'Living Museum', v, 10000);

  -- Serial achievements use retained inventory plus permanently registered
  -- museum snapshots, so museum donations continue to count.
  select
    coalesce(min(serial_number), 9223372036854775807),
    count(*) filter (where serial_number between 1 and 100)
  into v, v2
  from (
    select serial_number from public.inventory_gems
      where player_id = p_uid and serial_number is not null
    union all
    select (registration.specimen_snapshot->>'serial_number')::bigint
      from public.museum_registrations registration
      where registration.player_id = p_uid
        and registration.specimen_snapshot->>'serial_number' ~ '^[0-9]{1,18}$'
  ) serials;
  perform public.achievement_set_progress_v013(p_uid, 'Early Serial',
    case when v <= 100 then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Single-Digit Serial',
    case when v <= 9 then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Original',
    case when v = 1 then 1 else 0 end, 1);

  -- Meta achievements are refreshed last so achievements completed above are
  -- included immediately. Exclude the four meta rows themselves.
  select count(*) into v
  from public.private_feature_progress progress
  join public.private_feature_definitions definition
    on definition.id = progress.feature_id
  where progress.player_id = p_uid
    and progress.completed
    and definition.enabled
    and definition.feature_kind = 'achievement'
    and definition.name not in (
      'Twenty-Five Achievements', 'Fifty Achievements',
      'One Hundred Achievements', 'Gem Incremental'
    );
  perform public.achievement_set_progress_v013(p_uid, 'Twenty-Five Achievements', v, 25);
  perform public.achievement_set_progress_v013(p_uid, 'Fifty Achievements', v, 50);
  perform public.achievement_set_progress_v013(p_uid, 'One Hundred Achievements', v, 100);
  perform public.achievement_set_progress_v013(p_uid, 'Gem Incremental', v, 120);
end;
$function$;

revoke all on function public.refresh_player_achievements_v013(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_player_achievements_v013(uuid)
  to service_role;

commit;
