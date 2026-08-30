-- Consolidate the seven known Gmail-alias accounts into the original account.
--
-- This deliberately does not add duplicate signup balances, code rewards, or
-- starter consumables. Earned inventory, history, crafting deposits, discovery
-- progress, achievements, and season progress are preserved.

do $$
declare
  v_main constant uuid := '1c144dce-7fbc-4570-ae9e-80ef05f26e4d';
  v_duplicates constant uuid[] := array[
    'd91802fb-077a-41f3-ad41-60277c4ad70e'::uuid,
    '58876427-74d5-4254-86b7-856c509ae876'::uuid,
    '80d95f74-3d44-4768-b30c-eb50084a818f'::uuid,
    '516fdd44-7f4a-4bd9-bdcf-76efa9efb460'::uuid,
    '8156f2ae-921a-449f-91b8-93781f6f6e02'::uuid,
    '1a56892d-f550-442a-9492-1f63bd321556'::uuid,
    '6f79d41c-609c-40b9-8832-95cc66a6dfcd'::uuid
  ];
  v_all uuid[];
  v_canonical text;
  v_unexpected text;
begin
  v_all := array_prepend(v_main, v_duplicates);
  perform pg_advisory_xact_lock(hashtextextended('merge-gmail-alias-accounts:1c144dce', 0));

  if (select count(*) from auth.users where id = any(v_all)) <> 8
     or (select count(*) from public.players where id = any(v_all)) <> 8 then
    raise exception 'account merge aborted: one or more expected accounts are missing';
  end if;

  select private_auth.canonical_account_email(email::text)
    into v_canonical
  from auth.users
  where id = v_main
  for update;

  perform 1 from auth.users where id = any(v_duplicates) for update;
  perform 1 from public.players where id = any(v_all) for update;

  if exists (
    select 1 from auth.users
    where id = any(v_all)
      and private_auth.canonical_account_email(email::text) is distinct from v_canonical
  ) then
    raise exception 'account merge aborted: accounts do not share one canonical email';
  end if;

  if not exists (
    select 1 from private_auth.account_email_claims
    where canonical_email = v_canonical and user_id = v_main
  ) then
    raise exception 'account merge aborted: main account does not own the email claim';
  end if;

  -- Refuse to cascade-delete newly introduced account data that this reviewed
  -- merge does not know how to preserve.
  create temporary table merge_known_columns(table_name text, column_name text) on commit drop;
  insert into merge_known_columns values
    ('auctions','current_bidder_id'), ('best_roll_history','player_id'),
    ('code_redemptions','player_id'), ('crafting_progress','player_id'),
    ('inventory_gems','player_id'), ('login_streaks','player_id'),
    ('player_achievement_profiles','player_id'), ('player_consumables','player_id'),
    ('player_crafting','player_id'), ('player_gem_mutation_combinations','player_id'),
    ('player_presence','player_id'), ('player_presence_events','player_id'),
    ('player_season_missions','player_id'), ('player_seasons','player_id'),
    ('players','id'), ('private_feature_progress','player_id'),
    ('private_feature_progress_events','player_id'), ('roll_weight_history','player_id');

  create temporary table merge_unexpected_refs(ref text) on commit drop;
  for v_unexpected in
    select format('%I.%I', c.table_name, c.column_name)
    from information_schema.columns c
    where c.table_schema = 'public' and c.data_type = 'uuid'
      and not exists (
        select 1 from merge_known_columns k
        where k.table_name = c.table_name and k.column_name = c.column_name
      )
  loop
    execute format(
      'insert into merge_unexpected_refs select %L where exists (select 1 from public.%s where %s = any($1))',
      v_unexpected, split_part(v_unexpected,'.',1), split_part(v_unexpected,'.',2)
    ) using v_duplicates;
  end loop;

  select string_agg(ref, ', ' order by ref) into v_unexpected from merge_unexpected_refs;
  if v_unexpected is not null then
    raise exception 'account merge aborted: unexpected duplicate references in %', v_unexpected;
  end if;

  create table if not exists private_auth.account_merge_audit (
    merge_id uuid primary key,
    main_user_id uuid not null,
    duplicate_user_ids uuid[] not null,
    canonical_email text not null,
    player_snapshot jsonb not null,
    merged_at timestamptz not null default now()
  );
  revoke all on private_auth.account_merge_audit from public, anon, authenticated;

  insert into private_auth.account_merge_audit(
    merge_id, main_user_id, duplicate_user_ids, canonical_email, player_snapshot
  )
  select
    'edb792a4-ddab-482b-bc08-b6735529ab1c'::uuid,
    v_main,
    v_duplicates,
    v_canonical,
    jsonb_agg(to_jsonb(p) order by p.created_at)
  from public.players p
  where p.id = any(v_all)
  on conflict (merge_id) do nothing;

  -- Preserve owned gems and immutable activity/history.
  update public.inventory_gems set player_id = v_main where player_id = any(v_duplicates);
  update public.best_roll_history set player_id = v_main, username = (select username from public.players where id=v_main)
    where player_id = any(v_duplicates);
  update public.roll_weight_history set player_id = v_main, username = (select username from public.players where id=v_main)
    where player_id = any(v_duplicates);
  update public.private_feature_progress_events set player_id = v_main where player_id = any(v_duplicates);
  update public.player_presence_events set player_id = v_main where player_id = any(v_duplicates);
  update public.auctions set current_bidder_id = v_main,
    current_bidder_name = (select username from public.players where id=v_main)
    where current_bidder_id = any(v_duplicates);

  -- Merge deposited crafting materials by taking the largest recorded amount
  -- for each ingredient, preventing the same starter requirement being counted
  -- once per alias.
  with entries as (
    select cp.recipe_id, e.key, e.value,
      row_number() over (
        partition by cp.recipe_id,e.key
        order by
          case when jsonb_typeof(e.value)='number' then (e.value #>> '{}')::numeric end desc nulls last,
          (cp.player_id=v_main) desc,
          cp.updated_at desc
      ) choice
    from public.crafting_progress cp
    cross join lateral jsonb_each(cp.progress) e
    where cp.player_id = any(v_all)
  ), merged as (
    select recipe_id, jsonb_object_agg(key, value) progress
    from entries where choice=1 group by recipe_id
  )
  insert into public.crafting_progress(player_id, recipe_id, progress, updated_at)
  select v_main, recipe_id, progress, now() from merged
  on conflict (player_id, recipe_id) do update
    set progress=excluded.progress, updated_at=excluded.updated_at;
  delete from public.crafting_progress where player_id = any(v_duplicates);

  -- Preserve non-starter consumables. The 15 mythic potions granted to every
  -- fresh alias are capped at the largest single-account quantity.
  with totals as (
    select consumable_id,
      case when consumable_id='mythic-potion' then max(quantity) else sum(quantity) end quantity
    from public.player_consumables where player_id=any(v_all)
    group by consumable_id
  )
  insert into public.player_consumables(player_id,consumable_id,quantity,updated_at)
  select v_main,consumable_id,quantity,now() from totals
  on conflict (player_id,consumable_id) do update
    set quantity=excluded.quantity, updated_at=excluded.updated_at;
  delete from public.player_consumables where player_id=any(v_duplicates);

  -- Combine discoveries without losing unique combinations.
  with combined as (
    select gem_name, combination_key,
      (array_agg(id order by first_discovered_at))[1] representative_id,
      sum(total_found) total_found, max(highest_value) highest_value,
      min(first_discovered_at) first_discovered_at, max(last_discovered_at) last_discovered_at
    from public.player_gem_mutation_combinations where player_id=any(v_all)
    group by gem_name, combination_key
  )
  insert into public.player_gem_mutation_combinations(
    player_id,gem_name,combination_key,mutation_ids,mutation_multipliers,total_found,
    highest_value,first_discovered_at,last_discovered_at
  )
  select v_main,c.gem_name,c.combination_key,r.mutation_ids,r.mutation_multipliers,c.total_found,
    c.highest_value,c.first_discovered_at,c.last_discovered_at
  from combined c
  join public.player_gem_mutation_combinations r on r.id=c.representative_id
  on conflict (player_id,gem_name,combination_key) do update set
    total_found=excluded.total_found, highest_value=excluded.highest_value,
    first_discovered_at=excluded.first_discovered_at,
    last_discovered_at=excluded.last_discovered_at;
  delete from public.player_gem_mutation_combinations where player_id=any(v_duplicates);

  -- Merge achievement state once per achievement, retaining any completed or
  -- claimed state while preventing duplicate AP for the same achievement.
  with combined as (
    select feature_id, max(current_value) current_value, bool_or(completed) completed,
      bool_or(reward_granted) reward_granted, min(completed_at) completed_at,
      min(reward_granted_at) reward_granted_at,
      (array_agg(metadata order by current_value desc))[1] metadata,
      max(achievement_points_awarded) achievement_points_awarded
    from public.private_feature_progress where player_id=any(v_all)
    group by feature_id
  )
  insert into public.private_feature_progress(
    player_id,feature_id,current_value,completed,reward_granted,completed_at,
    reward_granted_at,metadata,updated_at,achievement_points_awarded
  )
  select v_main,feature_id,current_value,completed,reward_granted,completed_at,
    reward_granted_at,metadata,now(),achievement_points_awarded from combined
  on conflict (player_id,feature_id) do update set
    current_value=excluded.current_value, completed=excluded.completed,
    reward_granted=excluded.reward_granted, completed_at=excluded.completed_at,
    reward_granted_at=excluded.reward_granted_at, metadata=excluded.metadata,
    updated_at=excluded.updated_at,
    achievement_points_awarded=excluded.achievement_points_awarded;
  delete from public.private_feature_progress where player_id=any(v_duplicates);

  insert into public.player_achievement_profiles(player_id,achievement_points,updated_at)
  select v_main, coalesce(sum(achievement_points_awarded),0), now()
  from public.private_feature_progress where player_id=v_main
  on conflict (player_id) do update set
    achievement_points=excluded.achievement_points, updated_at=excluded.updated_at;
  delete from public.player_achievement_profiles where player_id=any(v_duplicates);

  -- Merge state rows conservatively: strongest progress, not summed rewards.
  update public.login_streaks m set
    current_streak=s.current_streak, longest_streak=s.longest_streak,
    last_claim_date=s.last_claim_date, total_claims=s.total_claims, updated_at=now()
  from (
    select max(current_streak) current_streak,max(longest_streak) longest_streak,
      max(last_claim_date) last_claim_date,max(total_claims) total_claims
    from public.login_streaks where player_id=any(v_all)
  ) s where m.player_id=v_main;
  delete from public.login_streaks where player_id=any(v_duplicates);

  update public.player_presence m set
    first_seen_at=s.first_seen_at,last_seen_at=s.last_seen_at,total_sessions=s.total_sessions,
    last_ip=s.last_ip,last_ip_at=s.last_ip_at
  from (
    select min(first_seen_at) first_seen_at,max(last_seen_at) last_seen_at,
      sum(total_sessions) total_sessions,
      (array_agg(last_ip order by last_ip_at desc nulls last))[1] last_ip,
      max(last_ip_at) last_ip_at
    from public.player_presence where player_id=any(v_all)
  ) s where m.player_id=v_main;
  delete from public.player_presence where player_id=any(v_duplicates);

  with combined as (
    select season_id,max(xp) xp,bool_or(premium) premium,max(updated_at) updated_at,
      max(roll_xp_date) roll_xp_date,max(roll_xp_today) roll_xp_today
    from public.player_seasons where player_id=any(v_all) group by season_id
  )
  update public.player_seasons m set xp=c.xp,premium=c.premium,updated_at=c.updated_at,
    roll_xp_date=c.roll_xp_date,roll_xp_today=c.roll_xp_today
  from combined c where m.player_id=v_main and m.season_id=c.season_id;
  delete from public.player_seasons where player_id=any(v_duplicates);

  with ranked as (
    select *,row_number() over (
      partition by season_id,cadence,period_start,slot
      order by progress desc,awarded_tiers desc,player_id=v_main desc
    ) rn
    from public.player_season_missions where player_id=any(v_all)
  )
  update public.player_season_missions m set
    progress=r.progress,awarded_tiers=r.awarded_tiers,item_reward=r.item_reward
  from ranked r where r.rn=1 and m.player_id=v_main and m.season_id=r.season_id
    and m.cadence=r.cadence and m.period_start=r.period_start and m.slot=r.slot;
  delete from public.player_season_missions where player_id=any(v_duplicates);

  -- Alias copies of one-per-account state and redeemed codes are discarded.
  delete from public.player_crafting where player_id=any(v_duplicates);
  delete from public.code_redemptions where player_id=any(v_duplicates);

  -- Count real rolls/discoveries, but retain the main account's balances and
  -- one-time signup rewards.
  update public.players m set
    total_rolls=s.total_rolls,
    gems_found_score=s.gems_found_score,
    inventory_capacity=greatest(m.inventory_capacity,s.inventory_capacity),
    last_seen=greatest(m.last_seen,s.last_seen)
  from (
    select sum(total_rolls) total_rolls,sum(gems_found_score) gems_found_score,
      max(inventory_capacity) inventory_capacity,max(last_seen) last_seen
    from public.players where id=any(v_all)
  ) s where m.id=v_main;

  -- Deleting Auth users invalidates their sessions and cascades any empty or
  -- intentionally discarded player rows. The canonical claim remains on main.
  delete from auth.users where id=any(v_duplicates);

  if exists (select 1 from public.players where id=any(v_duplicates))
     or exists (select 1 from auth.users where id=any(v_duplicates)) then
    raise exception 'account merge aborted: duplicate deletion did not cascade cleanly';
  end if;
end $$;
