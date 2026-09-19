-- =========================================================
-- ADMIN ALERTS — ANTI-CHEAT SIGNALS + ANALYTICS
--
-- Read-only and admin-gated. These are investigation signals, not automatic
-- enforcement: shared household networks, event rewards, and legitimate
-- high-volume players can all look unusual in isolation.
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
  v_events jsonb;
  v_gains jsonb;
  v_bursts jsonb;
  v_velocity jsonb;
  v_shared_ip jsonb;
  v_new_accounts jsonb;
  v_alerts jsonb;
  v_total_inflow numeric;
  v_total_outflow numeric;
  v_timeline jsonb;
  v_top_players jsonb;
  v_type_counts jsonb;
  v_severity_counts jsonb;
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

  -- Large individual cash movements, including privileged/system rewards.
  with candidates as (
    select
      l.player_id, l.account, l.amount, l.category, l.subcategory, l.created_at,
      case
        when l.category = 'admin_system_rewards' then 'admin_grant'
        when l.account = 'bank' then 'bank_deposit'
        else 'cash_spike'
      end as alert_type,
      case when l.category = 'admin_system_rewards' then greatest(1, v_min / 10) else v_min end as gate
    from public.economy_cash_ledger l
    where l.created_at >= v_since and l.amount > 0
  ), flagged as (
    select * from candidates where amount >= gate order by amount desc limit 100
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', f.alert_type,
    'severity', case when f.amount >= v_min * 50 then 'critical' when f.amount >= v_min * 10 then 'high' else 'medium' end,
    'playerId', f.player_id,
    'username', coalesce(nullif(p.username, ''), left(coalesce(f.player_id::text, 'unknown'), 8)),
    'ip', pr.last_ip,
    'ipAt', pr.last_ip_at,
    'amount', f.amount,
    'account', f.account,
    'category', f.category,
    'subcategory', f.subcategory,
    'at', f.created_at
  ) order by f.amount desc), '[]'::jsonb)
  into v_events
  from flagged f
  left join public.players p on p.id = f.player_id
  left join public.player_presence pr on pr.player_id = f.player_id;

  -- Large total wallet inflows over the selected window.
  with gains as (
    select player_id, sum(amount) as total, count(*) as events, max(created_at) as at
    from public.economy_cash_ledger
    where created_at >= v_since and account = 'wallet' and amount > 0 and player_id is not null
    group by player_id
    having sum(amount) >= v_min * 5
    order by total desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', 'gain_spike',
    'severity', case when g.total >= v_min * 100 then 'critical' when g.total >= v_min * 50 then 'high' else 'medium' end,
    'playerId', g.player_id,
    'username', coalesce(nullif(p.username, ''), left(g.player_id::text, 8)),
    'ip', pr.last_ip,
    'ipAt', pr.last_ip_at,
    'amount', g.total,
    'events', g.events,
    'at', g.at
  ) order by g.total desc), '[]'::jsonb)
  into v_gains
  from gains g
  left join public.players p on p.id = g.player_id
  left join public.player_presence pr on pr.player_id = g.player_id;

  -- High-frequency positive ledger activity, scaled to the selected window.
  with bursts as (
    select player_id, count(*) filter (where amount > 0) as events, sum(greatest(amount, 0)) as total, max(created_at) as at
    from public.economy_cash_ledger
    where created_at >= v_since and player_id is not null
    group by player_id
    having count(*) filter (where amount > 0) >= greatest(30, ceil(v_hours * 12.0)::integer)
       and sum(greatest(amount, 0)) >= v_min * 2
    order by events desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', 'activity_burst',
    'severity', case when b.events >= greatest(100, v_hours * 40) then 'high' else 'medium' end,
    'playerId', b.player_id,
    'username', coalesce(nullif(p.username, ''), left(b.player_id::text, 8)),
    'ip', pr.last_ip,
    'ipAt', pr.last_ip_at,
    'amount', b.total,
    'events', b.events,
    'at', b.at
  ) order by b.events desc), '[]'::jsonb)
  into v_bursts
  from bursts b
  left join public.players p on p.id = b.player_id
  left join public.player_presence pr on pr.player_id = b.player_id;

  -- Repeated credits concentrated within one hour are more suspicious than a
  -- single legitimate reward of the same size.
  with hourly as (
    select player_id, date_trunc('hour', created_at) as bucket, sum(amount) as total, count(*) as events, max(created_at) as at
    from public.economy_cash_ledger
    where created_at >= v_since and amount > 0 and player_id is not null
    group by player_id, date_trunc('hour', created_at)
    having sum(amount) >= v_min * 2 and count(*) >= 8
    order by total desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', 'income_velocity',
    'severity', case when h.total >= v_min * 25 or h.events >= 50 then 'high' else 'medium' end,
    'playerId', h.player_id,
    'username', coalesce(nullif(p.username, ''), left(h.player_id::text, 8)),
    'ip', pr.last_ip,
    'ipAt', pr.last_ip_at,
    'amount', h.total,
    'events', h.events,
    'window', h.bucket,
    'at', h.at
  ) order by h.total desc), '[]'::jsonb)
  into v_velocity
  from hourly h
  left join public.players p on p.id = h.player_id
  left join public.player_presence pr on pr.player_id = h.player_id;

  -- Shared-IP groups are only a lead: households and schools can share an IP.
  -- Requiring both multiple accounts and substantial combined inflow reduces noise.
  with grouped as (
    select pr.last_ip as ip, count(distinct l.player_id) as accounts, sum(l.amount) as total, count(*) as events, max(l.created_at) as at
    from public.economy_cash_ledger l
    join public.player_presence pr on pr.player_id = l.player_id
    where l.created_at >= v_since and l.amount > 0 and pr.last_ip is not null and btrim(pr.last_ip) <> ''
    group by pr.last_ip
    having count(distinct l.player_id) >= 2 and sum(l.amount) >= v_min * 3
    order by total desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', 'shared_ip_inflow',
    'severity', case when s.accounts >= 4 or s.total >= v_min * 30 then 'high' else 'medium' end,
    'username', format('%s accounts', s.accounts),
    'ip', s.ip,
    'amount', s.total,
    'events', s.events,
    'accounts', s.accounts,
    'at', s.at
  ) order by s.total desc), '[]'::jsonb)
  into v_shared_ip
  from grouped s;

  -- Large gains on a recently seen account deserve a quick review, especially
  -- when they occur before normal activity history has accumulated.
  with newcomers as (
    select l.player_id, sum(l.amount) as total, count(*) as events, max(l.created_at) as at, min(pr.first_seen_at) as first_seen_at
    from public.economy_cash_ledger l
    join public.player_presence pr on pr.player_id = l.player_id
    where l.created_at >= v_since and l.amount > 0 and pr.first_seen_at >= now() - interval '7 days'
    group by l.player_id
    having sum(l.amount) >= v_min * 3
    order by total desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', 'new_account_windfall',
    'severity', case when n.total >= v_min * 30 then 'high' else 'medium' end,
    'playerId', n.player_id,
    'username', coalesce(nullif(p.username, ''), left(n.player_id::text, 8)),
    'ip', pr.last_ip,
    'ipAt', pr.last_ip_at,
    'amount', n.total,
    'events', n.events,
    'firstSeenAt', n.first_seen_at,
    'at', n.at
  ) order by n.total desc), '[]'::jsonb)
  into v_new_accounts
  from newcomers n
  left join public.players p on p.id = n.player_id
  left join public.player_presence pr on pr.player_id = n.player_id;

  v_alerts := v_events || v_gains || v_bursts || v_velocity || v_shared_ip || v_new_accounts;

  select coalesce(sum(greatest(amount, 0)), 0), coalesce(sum(-amount) filter (where amount < 0), 0)
  into v_total_inflow, v_total_outflow
  from public.economy_cash_ledger
  where created_at >= v_since;

  select coalesce(jsonb_agg(jsonb_build_object(
    'at', t.bucket,
    'inflow', t.inflow,
    'outflow', t.outflow,
    'events', t.events,
    'players', t.players
  ) order by t.bucket), '[]'::jsonb)
  into v_timeline
  from (
    select date_trunc('hour', created_at) as bucket,
      sum(greatest(amount, 0)) as inflow,
      sum(greatest(-amount, 0)) as outflow,
      count(*) as events,
      count(distinct player_id) as players
    from public.economy_cash_ledger
    where created_at >= v_since
    group by date_trunc('hour', created_at)
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', t.player_id,
    'username', coalesce(nullif(p.username, ''), left(t.player_id::text, 8)),
    'ip', pr.last_ip,
    'inflow', t.inflow,
    'outflow', t.outflow,
    'net', t.inflow - t.outflow,
    'events', t.events,
    'at', t.at
  ) order by t.inflow desc), '[]'::jsonb)
  into v_top_players
  from (
    select player_id, sum(greatest(amount, 0)) as inflow, sum(greatest(-amount, 0)) as outflow, count(*) as events, max(created_at) as at
    from public.economy_cash_ledger
    where created_at >= v_since and player_id is not null
    group by player_id
    order by sum(greatest(amount, 0)) desc
    limit 8
  ) t
  left join public.players p on p.id = t.player_id
  left join public.player_presence pr on pr.player_id = t.player_id;

  select coalesce(jsonb_object_agg(kind, total), '{}'::jsonb)
  into v_type_counts
  from (
    select alert->>'type' as kind, count(*) as total
    from jsonb_array_elements(v_alerts) alert
    group by alert->>'type'
  ) counts;

  select coalesce(jsonb_object_agg(kind, total), '{}'::jsonb)
  into v_severity_counts
  from (
    select alert->>'severity' as kind, count(*) as total
    from jsonb_array_elements(v_alerts) alert
    group by alert->>'severity'
  ) counts;

  return jsonb_build_object(
    'generatedAt', now(),
    'sinceHours', v_hours,
    'minAmount', v_min,
    'totalInflow', v_total_inflow,
    'totalOutflow', v_total_outflow,
    'alerts', v_alerts,
    'summary', jsonb_build_object(
      'totalAlerts', jsonb_array_length(v_alerts),
      'critical', coalesce((v_severity_counts->>'critical')::integer, 0),
      'high', coalesce((v_severity_counts->>'high')::integer, 0),
      'medium', coalesce((v_severity_counts->>'medium')::integer, 0),
      'uniquePlayers', (select count(distinct nullif(alert->>'playerId', '')) from jsonb_array_elements(v_alerts) alert),
      'uniqueIps', (select count(distinct nullif(alert->>'ip', '')) from jsonb_array_elements(v_alerts) alert),
      'byType', v_type_counts
    ),
    'timeline', v_timeline,
    'topPlayers', v_top_players
  );
end;
$$;

revoke all on function public.admin_get_activity_alerts(integer, numeric) from public, anon;
grant execute on function public.admin_get_activity_alerts(integer, numeric) to authenticated;

notify pgrst, 'reload schema';
