-- Admin analytics: add a per-day online-users series alongside the hourly one.
--
-- The presence-events table already retains 45 days of heartbeats (see
-- 20260820000009), so a 14-day daily series is fully covered. This redefines
-- get_admin_analytics() to add a `dailyOnlineSeries` array of
-- {day, users} buckets so the Admin Panel can chart daily online users the
-- same way it charts hourly ones. Everything else in the payload is unchanged.
create or replace function public.get_admin_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_players bigint := 0;
  v_rolls numeric := 0;
  v_inventory bigint := 0;
  v_mutated bigint := 0;
  v_money numeric := 0;
  v_inventory_value numeric := 0;
  v_online bigint := 0;
  v_daily bigint := 0;
  v_weekly bigint := 0;
  v_retained_1d numeric := 0;
  v_retained_7d numeric := 0;
  v_announcements bigint := 0;
  v_announcements_mutated bigint := 0;
  v_pending_boosts bigint := 0;
  v_hourly jsonb := '[]'::jsonb;
  v_daily_series jsonb := '[]'::jsonb;
begin
  select exists(select 1 from public.admins where user_id=v_uid)
      or v_uid='38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    into v_is_admin;
  if not v_is_admin then raise exception 'not_authorized'; end if;

  select count(*), coalesce(sum(total_rolls),0)
    into v_players, v_rolls from public.players;

  -- "Money in economy" excludes the lychee dev account: its balance comes from
  -- admin grants, not real play, and otherwise dwarfs the true economy total.
  select coalesce(sum(money),0) into v_money
    from public.players
    where username is distinct from '1248lychee1632';

  select count(*),
         count(*) filter(where coalesce(cardinality(mutation_ids),0)>0)
    into v_inventory, v_mutated from public.inventory_gems;

  -- Inventory value likewise excludes the lychee dev account's gems.
  select coalesce(sum(g.value),0) into v_inventory_value
    from public.inventory_gems g
    where not exists (
      select 1 from public.players ply
      where ply.id = g.player_id and ply.username = '1248lychee1632'
    );

  select count(*) into v_online
    from public.player_presence
    where last_seen_at >= now()-interval '90 seconds';

  select count(distinct player_id) into v_daily
    from public.player_presence_events
    where seen_at >= now()-interval '24 hours';

  select count(distinct player_id) into v_weekly
    from public.player_presence_events
    where seen_at >= now()-interval '7 days';

  -- D1/D7 retention: among players old enough to be eligible, count those
  -- who were seen again during the corresponding retention window.
  select case when count(*)=0 then 0 else 100.0 * count(*) filter(where exists(
      select 1 from public.player_presence_events e
      where e.player_id=p.player_id
        and e.seen_at between p.first_seen_at + interval '1 day'
                           and p.first_seen_at + interval '2 days'
    ))::numeric / count(*) end
    into v_retained_1d
  from public.player_presence p
  where p.first_seen_at <= now()-interval '2 days';

  select case when count(*)=0 then 0 else 100.0 * count(*) filter(where exists(
      select 1 from public.player_presence_events e
      where e.player_id=p.player_id
        and e.seen_at between p.first_seen_at + interval '7 days'
                           and p.first_seen_at + interval '8 days'
    ))::numeric / count(*) end
    into v_retained_7d
  from public.player_presence p
  where p.first_seen_at <= now()-interval '8 days';

  begin
    select count(*),count(*) filter(where coalesce(cardinality(mutation_ids),0)>0)
      into v_announcements,v_announcements_mutated
    from public.global_chat_announcements;
  exception when undefined_table then null; end;

  begin
    select count(*) into v_pending_boosts from public.player_one_roll_boosts;
  exception when undefined_table then null; end;

  select coalesce(jsonb_agg(jsonb_build_object('hour',bucket,'users',users) order by bucket),'[]'::jsonb)
    into v_hourly
  from (
    select date_trunc('hour', now()-((g.i)::text||' hours')::interval) as bucket,
           count(distinct e.player_id) as users
    from generate_series(0,23) g(i)
    left join public.player_presence_events e
      on e.seen_at >= date_trunc('hour',now()-((g.i)::text||' hours')::interval)
     and e.seen_at <  date_trunc('hour',now()-((g.i-1)::text||' hours')::interval)
    group by bucket
  ) h;

  -- Distinct users seen in each of the last 14 days (oldest bucket first).
  select coalesce(jsonb_agg(jsonb_build_object('day',bucket,'users',users) order by bucket),'[]'::jsonb)
    into v_daily_series
  from (
    select date_trunc('day', now()-((g.i)::text||' days')::interval) as bucket,
           count(distinct e.player_id) as users
    from generate_series(0,13) g(i)
    left join public.player_presence_events e
      on e.seen_at >= date_trunc('day',now()-((g.i)::text||' days')::interval)
     and e.seen_at <  date_trunc('day',now()-((g.i-1)::text||' days')::interval)
    group by bucket
  ) d;

  return jsonb_build_object(
    'players',v_players,'totalRolls',v_rolls,'totalInventoryGems',v_inventory,
    'mutatedGems',v_mutated,'mutationRate',case when v_inventory>0 then v_mutated::numeric/v_inventory else 0 end,
    'totalMoney',v_money,'totalInventoryValue',v_inventory_value,
    'currentOnline',v_online,'dailyOnline',v_daily,'weeklyOnline',v_weekly,
    'retention1d',v_retained_1d,'retention7d',v_retained_7d,
    'hourlyOnline',v_hourly,'dailyOnlineSeries',v_daily_series,
    'rareAnnouncements',v_announcements,
    'announcementsWithMutations',v_announcements_mutated,
    'emptyAnnouncementMutations',greatest(0,v_announcements-v_announcements_mutated),
    'announcementMutationCoverage',case when v_announcements>0 then v_announcements_mutated::numeric/v_announcements else 1 end,
    'pendingOneRollBoosts',v_pending_boosts,'generatedAt',now()
  );
end;
$$;
