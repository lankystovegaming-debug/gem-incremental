-- =========================================================
-- ADMIN ALERTS — BOUNDED, SINGLE-SNAPSHOT ANALYTICS
--
-- The first analytics implementation performed several independent ledger
-- scans. On a busy game this could exceed the API statement timeout. This
-- version reads one recent, index-backed snapshot and derives every signal
-- from it. If the requested period contains more events than the safe limit,
-- the response says so instead of timing out or presenting a silent partial
-- period as complete.
-- =========================================================

create or replace function public.admin_get_activity_alerts(
  p_hours integer default 24,
  p_min_amount numeric default 100000000
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
  v_hours integer;
  v_since timestamptz;
  v_min numeric;
  v_limit integer := 100000;
  v_payload jsonb;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid())
  );
  if not v_is_admin then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  v_hours := greatest(1, least(coalesce(p_hours, 24), 168));
  v_since := now() - make_interval(hours => v_hours);
  v_min := greatest(1, coalesce(p_min_amount, 100000000));

  with snapshot_plus_one as materialized (
    select
      l.player_id, l.account, l.amount, l.category, l.subcategory, l.created_at,
      coalesce(nullif(p.username, ''), left(coalesce(l.player_id::text, 'unknown'), 8)) as username,
      pr.last_ip, pr.last_ip_at, pr.first_seen_at
    from public.economy_cash_ledger l
    left join public.players p on p.id = l.player_id
    left join public.player_presence pr on pr.player_id = l.player_id
    where l.created_at >= v_since
    order by l.created_at desc
    limit v_limit + 1
  ), snapshot as materialized (
    select * from snapshot_plus_one limit v_limit
  ), positive as materialized (
    select * from snapshot where amount > 0
  ), individual as materialized (
    select
      jsonb_build_object(
        'type', case when category = 'admin_system_rewards' then 'admin_grant' when account = 'bank' then 'bank_deposit' else 'cash_spike' end,
        'severity', case when amount >= v_min * 50 then 'critical' when amount >= v_min * 10 then 'high' else 'medium' end,
        'playerId', player_id, 'username', username, 'ip', last_ip, 'ipAt', last_ip_at,
        'amount', amount, 'account', account, 'category', category, 'subcategory', subcategory, 'at', created_at
      ) as item,
      case when amount >= v_min * 50 then 1 when amount >= v_min * 10 then 2 else 3 end as severity_rank,
      amount as amount_rank, player_id, last_ip,
      case when category = 'admin_system_rewards' then 'admin_grant' when account = 'bank' then 'bank_deposit' else 'cash_spike' end as alert_type
    from positive
    where amount >= case when category = 'admin_system_rewards' then greatest(1, v_min / 10) else v_min end
    order by amount desc
    limit 100
  ), gains as materialized (
    select
      jsonb_build_object(
        'type', 'gain_spike',
        'severity', case when sum(amount) >= v_min * 100 then 'critical' when sum(amount) >= v_min * 50 then 'high' else 'medium' end,
        'playerId', player_id, 'username', max(username), 'ip', max(last_ip), 'ipAt', max(last_ip_at),
        'amount', sum(amount), 'events', count(*), 'at', max(created_at)
      ) as item,
      case when sum(amount) >= v_min * 100 then 1 when sum(amount) >= v_min * 50 then 2 else 3 end as severity_rank,
      sum(amount) as amount_rank, player_id, max(last_ip) as last_ip, 'gain_spike' as alert_type
    from positive
    where account = 'wallet' and player_id is not null
    group by player_id
    having sum(amount) >= v_min * 5
    order by sum(amount) desc
    limit 50
  ), bursts as materialized (
    select
      jsonb_build_object(
        'type', 'activity_burst', 'severity', case when count(*) >= greatest(100, v_hours * 40) then 'high' else 'medium' end,
        'playerId', player_id, 'username', max(username), 'ip', max(last_ip), 'ipAt', max(last_ip_at),
        'amount', sum(amount), 'events', count(*), 'at', max(created_at)
      ) as item,
      case when count(*) >= greatest(100, v_hours * 40) then 2 else 3 end as severity_rank,
      sum(amount) as amount_rank, player_id, max(last_ip) as last_ip, 'activity_burst' as alert_type
    from positive
    where player_id is not null
    group by player_id
    having count(*) >= greatest(30, ceil(v_hours * 12.0)::integer) and sum(amount) >= v_min * 2
    order by count(*) desc
    limit 50
  ), velocity as materialized (
    select
      jsonb_build_object(
        'type', 'income_velocity', 'severity', case when sum(amount) >= v_min * 25 or count(*) >= 50 then 'high' else 'medium' end,
        'playerId', player_id, 'username', max(username), 'ip', max(last_ip), 'ipAt', max(last_ip_at),
        'amount', sum(amount), 'events', count(*), 'window', date_trunc('hour', created_at), 'at', max(created_at)
      ) as item,
      case when sum(amount) >= v_min * 25 or count(*) >= 50 then 2 else 3 end as severity_rank,
      sum(amount) as amount_rank, player_id, max(last_ip) as last_ip, 'income_velocity' as alert_type
    from positive
    where player_id is not null
    group by player_id, date_trunc('hour', created_at)
    having sum(amount) >= v_min * 2 and count(*) >= 8
    order by sum(amount) desc
    limit 50
  ), shared_ips as materialized (
    select
      jsonb_build_object(
        'type', 'shared_ip_inflow', 'severity', case when count(distinct player_id) >= 4 or sum(amount) >= v_min * 30 then 'high' else 'medium' end,
        'username', format('%s accounts', count(distinct player_id)), 'ip', last_ip,
        'amount', sum(amount), 'events', count(*), 'accounts', count(distinct player_id), 'at', max(created_at)
      ) as item,
      case when count(distinct player_id) >= 4 or sum(amount) >= v_min * 30 then 2 else 3 end as severity_rank,
      sum(amount) as amount_rank, null::uuid as player_id, last_ip, 'shared_ip_inflow' as alert_type
    from positive
    where player_id is not null and last_ip is not null and btrim(last_ip) <> ''
    group by last_ip
    having count(distinct player_id) >= 2 and sum(amount) >= v_min * 3
    order by sum(amount) desc
    limit 50
  ), newcomers as materialized (
    select
      jsonb_build_object(
        'type', 'new_account_windfall', 'severity', case when sum(amount) >= v_min * 30 then 'high' else 'medium' end,
        'playerId', player_id, 'username', max(username), 'ip', max(last_ip), 'ipAt', max(last_ip_at),
        'amount', sum(amount), 'events', count(*), 'firstSeenAt', min(first_seen_at), 'at', max(created_at)
      ) as item,
      case when sum(amount) >= v_min * 30 then 2 else 3 end as severity_rank,
      sum(amount) as amount_rank, player_id, max(last_ip) as last_ip, 'new_account_windfall' as alert_type
    from positive
    where player_id is not null and first_seen_at >= now() - interval '7 days'
    group by player_id
    having sum(amount) >= v_min * 3
    order by sum(amount) desc
    limit 50
  ), alert_rows as materialized (
    select * from individual union all select * from gains union all select * from bursts
    union all select * from velocity union all select * from shared_ips union all select * from newcomers
  ), alert_summary as materialized (
    select
      coalesce(jsonb_agg(item order by severity_rank, amount_rank desc), '[]'::jsonb) as alerts,
      count(*)::integer as total_alerts,
      count(*) filter (where severity_rank = 1)::integer as critical,
      count(*) filter (where severity_rank = 2)::integer as high,
      count(*) filter (where severity_rank = 3)::integer as medium,
      count(distinct player_id)::integer as unique_players,
      count(distinct nullif(last_ip, ''))::integer as unique_ips
    from alert_rows
  ), type_counts as materialized (
    select coalesce(jsonb_object_agg(alert_type, total), '{}'::jsonb) as by_type
    from (select alert_type, count(*)::integer as total from alert_rows group by alert_type) counts
  ), totals as materialized (
    select coalesce(sum(greatest(amount, 0)), 0) as inflow, coalesce(sum(greatest(-amount, 0)), 0) as outflow
    from snapshot
  ), timeline as materialized (
    select coalesce(jsonb_agg(jsonb_build_object('at', bucket, 'inflow', inflow, 'outflow', outflow, 'events', events, 'players', players) order by bucket), '[]'::jsonb) as points
    from (
      select date_trunc('hour', created_at) as bucket, sum(greatest(amount, 0)) as inflow, sum(greatest(-amount, 0)) as outflow,
        count(*) as events, count(distinct player_id) as players
      from snapshot group by date_trunc('hour', created_at)
    ) buckets
  ), top_players as materialized (
    select coalesce(jsonb_agg(jsonb_build_object('playerId', player_id, 'username', username, 'ip', last_ip, 'inflow', inflow, 'outflow', outflow, 'net', inflow - outflow, 'events', events, 'at', at) order by inflow desc), '[]'::jsonb) as players
    from (
      select player_id, max(username) as username, max(last_ip) as last_ip, sum(greatest(amount, 0)) as inflow,
        sum(greatest(-amount, 0)) as outflow, count(*) as events, max(created_at) as at
      from snapshot where player_id is not null group by player_id order by sum(greatest(amount, 0)) desc limit 8
    ) ranked
  )
  select jsonb_build_object(
    'generatedAt', now(), 'sinceHours', v_hours, 'minAmount', v_min,
    'sampleLimit', v_limit, 'sampled', (select count(*) > v_limit from snapshot_plus_one),
    'totalInflow', totals.inflow, 'totalOutflow', totals.outflow, 'alerts', alert_summary.alerts,
    'summary', jsonb_build_object('totalAlerts', alert_summary.total_alerts, 'critical', alert_summary.critical, 'high', alert_summary.high, 'medium', alert_summary.medium, 'uniquePlayers', alert_summary.unique_players, 'uniqueIps', alert_summary.unique_ips, 'byType', type_counts.by_type),
    'timeline', timeline.points, 'topPlayers', top_players.players
  ) into v_payload
  from alert_summary cross join type_counts cross join totals cross join timeline cross join top_players;

  return v_payload;
end;
$$;

revoke all on function public.admin_get_activity_alerts(integer, numeric) from public, anon;
grant execute on function public.admin_get_activity_alerts(integer, numeric) to authenticated;
notify pgrst, 'reload schema';
