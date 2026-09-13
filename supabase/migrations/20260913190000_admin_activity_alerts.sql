-- =========================================================
-- ADMIN — ACTIVITY ALERTS
--
-- Admin-gated, SECURITY DEFINER. Surfaces unusual money movement from
-- the forward-only economy_cash_ledger over a recent window, each alert
-- carrying who (player + username), when (created_at), and their last IP
-- (player_presence). Detects:
--   cash_spike     — a large single wallet inflow
--   bank_deposit   — a large single bank-balance inflow (deposit/interest)
--   admin_grant    — admin/system money creation (lower threshold)
--   gain_spike     — a player's total wallet inflow over the window
--   activity_burst — an unusually high number of cash events for a player
-- Reads the players table and IPs (not client-readable) through the
-- admin gate, like the ban / IP-audit RPCs — no Edge Function redeploy.
-- =========================================================

create or replace function public.admin_get_activity_alerts(
  p_hours integer default 24,
  p_min_amount numeric default 100000000
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
  v_since timestamptz;
  v_min numeric;
  v_events jsonb;
  v_gains jsonb;
  v_bursts jsonb;
  v_total_inflow numeric;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));

  if not v_is_admin then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  v_since := now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 168)));
  v_min := greatest(1, coalesce(p_min_amount, 100000000));

  -- Large single inflows: wallet spikes, bank deposits, admin/system grants.
  with candidates as (
    select
      l.id, l.player_id, l.account, l.amount, l.category, l.subcategory, l.created_at,
      case
        when l.category = 'admin_system_rewards' then 'admin_grant'
        when l.account = 'bank' then 'bank_deposit'
        else 'cash_spike'
      end as alert_type,
      case when l.category = 'admin_system_rewards' then greatest(1, v_min / 10) else v_min end as gate
    from public.economy_cash_ledger l
    where l.created_at >= v_since and l.amount > 0
  ),
  flagged as (
    select * from candidates where amount >= gate order by amount desc limit 100
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', f.alert_type,
    'severity', case when f.amount >= v_min * 10 then 'high' else 'medium' end,
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

  -- Aggregate wallet gain per player over the window (money in, net of nothing).
  with gains as (
    select player_id, sum(amount) as total, count(*) as events, max(created_at) as at
    from public.economy_cash_ledger
    where created_at >= v_since and account = 'wallet' and amount > 0
      and player_id is not null
    group by player_id
    having sum(amount) >= v_min * 5
    order by total desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', 'gain_spike',
    'severity', case when g.total >= v_min * 50 then 'high' else 'medium' end,
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

  -- Unusually high number of cash events for a single player over the window.
  with bursts as (
    select player_id, count(*) as events, max(created_at) as at
    from public.economy_cash_ledger
    where created_at >= v_since and player_id is not null
    group by player_id
    having count(*) >= 300
    order by count(*) desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', 'activity_burst',
    'severity', case when b.events >= 1000 then 'high' else 'medium' end,
    'playerId', b.player_id,
    'username', coalesce(nullif(p.username, ''), left(b.player_id::text, 8)),
    'ip', pr.last_ip,
    'ipAt', pr.last_ip_at,
    'events', b.events,
    'at', b.at
  ) order by b.events desc), '[]'::jsonb)
  into v_bursts
  from bursts b
  left join public.players p on p.id = b.player_id
  left join public.player_presence pr on pr.player_id = b.player_id;

  select coalesce(sum(amount), 0)
    into v_total_inflow
    from public.economy_cash_ledger
    where created_at >= v_since and amount > 0;

  return jsonb_build_object(
    'generatedAt', now(),
    'sinceHours', greatest(1, least(coalesce(p_hours, 24), 168)),
    'minAmount', v_min,
    'totalInflow', v_total_inflow,
    'alerts', (v_events || v_gains || v_bursts)
  );
end;
$$;

revoke all on function public.admin_get_activity_alerts(integer, numeric) from public, anon;
grant execute on function public.admin_get_activity_alerts(integer, numeric) to authenticated;
