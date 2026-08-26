-- Player Wars: one player challenges another to out-gain them on a chosen
-- metric over a chosen window. Friendly (game pays a prize) or wagered (both
-- ante money into an escrow pot; winner takes it minus a 5% rake sink).
--
-- Metrics are measured as the improvement in an existing server-authoritative
-- stat between accept-time and end-time, so no roll-engine changes are needed:
--   rolls  -> players.total_rolls           (Δ)
--   money  -> players.lifetime_earnings      (Δ)
--   rare   -> players.gems_found_score        (Δ, rewards finding rare gems)
--   rarest -> players.rarest_gem_rarity        (Δ, who pushed their rarest PB)
--   heavy  -> max inventory_gems.final_weight   (Δ, who found the heaviest)

create table if not exists public.player_wars (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid not null references auth.users(id) on delete cascade,
  metric text not null check (metric in ('rolls','money','rare','rarest','heavy')),
  duration_hours integer not null check (duration_hours in (1, 6, 24)),
  stake numeric not null default 0 check (stake >= 0),
  status text not null default 'pending'
    check (status in ('pending','active','finished','declined','expired','cancelled')),
  challenger_start numeric, opponent_start numeric,
  challenger_score numeric, opponent_score numeric,
  winner_id uuid,
  pot numeric not null default 0,
  created_at timestamptz not null default now(),
  accepted_at timestamptz, ends_at timestamptz, resolved_at timestamptz,
  check (challenger_id <> opponent_id)
);
create index if not exists player_wars_players_idx on public.player_wars (challenger_id, opponent_id);
create index if not exists player_wars_active_idx on public.player_wars (status, ends_at);

alter table public.player_wars enable row level security;
-- Readable only by the two combatants; all writes go through the RPCs below.
drop policy if exists "read own wars" on public.player_wars;
create policy "read own wars" on public.player_wars for select to authenticated
  using (auth.uid() = challenger_id or auth.uid() = opponent_id);
revoke insert, update, delete on public.player_wars from anon, authenticated;
grant select on public.player_wars to authenticated;

create or replace function public.war_metric_value(p_uid uuid, p_metric text)
returns numeric language sql stable security definer set search_path = public as $$
  select case p_metric
    when 'rolls'  then (select coalesce(total_rolls,0) from public.players where id = p_uid)
    when 'money'  then (select coalesce(lifetime_earnings,0) from public.players where id = p_uid)
    when 'rare'   then (select coalesce(gems_found_score,0) from public.players where id = p_uid)
    when 'rarest' then (select coalesce(rarest_gem_rarity,0) from public.players where id = p_uid)
    when 'heavy'  then (select coalesce(max(final_weight),0) from public.inventory_gems where player_id = p_uid)
    else 0 end
$$;
revoke all on function public.war_metric_value(uuid, text) from public;  -- internal helper only

-- Challenge another player by username.
create or replace function public.war_challenge(p_opponent text, p_metric text, p_duration integer, p_stake numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_opp uuid; v_stake numeric := greatest(0, coalesce(p_stake,0)); v_id uuid; v_money numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_metric not in ('rolls','money','rare','rarest','heavy') then raise exception 'invalid_metric'; end if;
  if p_duration not in (1,6,24) then raise exception 'invalid_duration'; end if;

  select id into v_opp from public.players where lower(username) = lower(trim(p_opponent)) limit 1;
  if v_opp is null then raise exception 'opponent_not_found'; end if;
  if v_opp = v_uid then raise exception 'cannot_challenge_self'; end if;

  -- One live (pending/active) war per pair at a time.
  if exists (select 1 from public.player_wars where status in ('pending','active')
             and ((challenger_id=v_uid and opponent_id=v_opp) or (challenger_id=v_opp and opponent_id=v_uid))) then
    raise exception 'war_already_active';
  end if;

  if v_stake > 0 then
    select coalesce(money,0) into v_money from public.players where id = v_uid for update;
    if v_money < v_stake then raise exception 'insufficient_funds'; end if;
    update public.players set money = money - v_stake where id = v_uid; -- escrow challenger ante
  end if;

  insert into public.player_wars(challenger_id, opponent_id, metric, duration_hours, stake, pot, status)
  values (v_uid, v_opp, p_metric, p_duration, v_stake, v_stake, 'pending')
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'pending');
end $$;
revoke all on function public.war_challenge(text, text, integer, numeric) from public;
grant execute on function public.war_challenge(text, text, integer, numeric) to authenticated;

-- Accept or decline a pending challenge (opponent only).
create or replace function public.war_respond(p_war uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_w public.player_wars%rowtype; v_money numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_w from public.player_wars where id = p_war for update;
  if not found then raise exception 'war_not_found'; end if;
  if v_w.opponent_id <> v_uid then raise exception 'not_your_challenge'; end if;
  if v_w.status <> 'pending' then raise exception 'not_pending'; end if;

  if not p_accept then
    if v_w.stake > 0 then update public.players set money = money + v_w.stake where id = v_w.challenger_id; end if;
    update public.player_wars set status='declined', resolved_at=now(), pot=0 where id = p_war;
    return jsonb_build_object('status','declined');
  end if;

  if v_w.stake > 0 then
    select coalesce(money,0) into v_money from public.players where id = v_uid for update;
    if v_money < v_w.stake then raise exception 'insufficient_funds'; end if;
    update public.players set money = money - v_w.stake where id = v_uid; -- escrow opponent ante
  end if;

  update public.player_wars
    set status='active', accepted_at=now(), ends_at = now() + make_interval(hours => v_w.duration_hours),
        pot = v_w.stake * 2,
        challenger_start = public.war_metric_value(v_w.challenger_id, v_w.metric),
        opponent_start   = public.war_metric_value(v_w.opponent_id,   v_w.metric)
    where id = p_war;

  return jsonb_build_object('status','active');
end $$;
revoke all on function public.war_respond(uuid, boolean) from public;
grant execute on function public.war_respond(uuid, boolean) to authenticated;

-- Cancel a still-pending challenge you sent (refunds your ante).
create or replace function public.war_cancel(p_war uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_w public.player_wars%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_w from public.player_wars where id = p_war for update;
  if not found or v_w.challenger_id <> v_uid then raise exception 'war_not_found'; end if;
  if v_w.status <> 'pending' then raise exception 'not_pending'; end if;
  if v_w.stake > 0 then update public.players set money = money + v_w.stake where id = v_w.challenger_id; end if;
  update public.player_wars set status='cancelled', resolved_at=now(), pot=0 where id = p_war;
  return jsonb_build_object('status','cancelled');
end $$;
revoke all on function public.war_cancel(uuid) from public;
grant execute on function public.war_cancel(uuid) to authenticated;

-- Resolve every war whose clock has run out, and expire stale pending
-- challenges (>48h). Idempotent; safe to call from a client or from cron.
create or replace function public.war_resolve_due()
returns integer language plpgsql security definer set search_path = public as $$
declare v_w public.player_wars%rowtype; v_cs numeric; v_os numeric; v_winner uuid; v_net numeric; v_rake numeric; v_n integer := 0;
begin
  -- Expire never-answered challenges and refund the challenger's ante.
  for v_w in select * from public.player_wars where status='pending' and created_at < now() - interval '48 hours' for update loop
    if v_w.stake > 0 then update public.players set money = money + v_w.stake where id = v_w.challenger_id; end if;
    update public.player_wars set status='expired', resolved_at=now(), pot=0 where id = v_w.id;
  end loop;

  for v_w in select * from public.player_wars where status='active' and ends_at <= now() for update loop
    v_cs := greatest(0, public.war_metric_value(v_w.challenger_id, v_w.metric) - coalesce(v_w.challenger_start,0));
    v_os := greatest(0, public.war_metric_value(v_w.opponent_id,   v_w.metric) - coalesce(v_w.opponent_start,0));
    if v_cs > v_os then v_winner := v_w.challenger_id;
    elsif v_os > v_cs then v_winner := v_w.opponent_id;
    else v_winner := null; end if;  -- tie

    if v_winner is null then
      -- Tie: refund each ante.
      if v_w.stake > 0 then
        update public.players set money = money + v_w.stake where id = v_w.challenger_id;
        update public.players set money = money + v_w.stake where id = v_w.opponent_id;
      end if;
    elsif v_w.pot > 0 then
      -- Wagered: winner takes pot minus 5% rake (burned = economy sink).
      v_rake := round(v_w.pot * 0.05);
      v_net := v_w.pot - v_rake;
      update public.players set money = money + v_net where id = v_winner;
      update public.players set lifetime_money_burned = coalesce(lifetime_money_burned,0) + v_rake where id = v_winner;
    else
      -- Friendly: the game hands the winner a modest prize.
      perform public.apply_reward_object(v_winner, '{"type":"money","amount":200000}'::jsonb);
      perform public.apply_reward_object(v_winner, '{"type":"potion","consumableId":"lucky-potion-1","amount":1}'::jsonb);
    end if;

    update public.player_wars set status='finished', winner_id=v_winner,
      challenger_score=v_cs, opponent_score=v_os, resolved_at=now() where id = v_w.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.war_resolve_due() from public;
grant execute on function public.war_resolve_due() to authenticated;

-- All of my wars, newest first, with usernames, metric labels and live scores
-- for active wars. Resolves any that are due first.
create or replace function public.get_my_wars()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public.war_resolve_due();

  select coalesce(jsonb_agg(row order by sort_at desc), '[]'::jsonb) into v_result from (
    select jsonb_build_object(
      'id', w.id, 'metric', w.metric, 'durationHours', w.duration_hours, 'stake', w.stake, 'pot', w.pot,
      'status', w.status, 'endsAt', w.ends_at, 'createdAt', w.created_at,
      'iAmChallenger', w.challenger_id = v_uid,
      'challenger', cp.username, 'opponent', op.username,
      'winnerIsMe', w.winner_id = v_uid,
      'winner', case when w.winner_id = w.challenger_id then cp.username when w.winner_id = w.opponent_id then op.username else null end,
      'myScore', case when w.status='active'
                      then greatest(0, public.war_metric_value(v_uid, w.metric) - (case when w.challenger_id=v_uid then w.challenger_start else w.opponent_start end))
                      else (case when w.challenger_id=v_uid then w.challenger_score else w.opponent_score end) end,
      'theirScore', case when w.status='active'
                      then greatest(0, public.war_metric_value(case when w.challenger_id=v_uid then w.opponent_id else w.challenger_id end, w.metric) - (case when w.challenger_id=v_uid then w.opponent_start else w.challenger_start end))
                      else (case when w.challenger_id=v_uid then w.opponent_score else w.challenger_score end) end
    ) as row, w.created_at as sort_at
    from public.player_wars w
    join public.players cp on cp.id = w.challenger_id
    join public.players op on op.id = w.opponent_id
    where w.challenger_id = v_uid or w.opponent_id = v_uid
    order by w.created_at desc limit 60
  ) t;
  return v_result;
end $$;
revoke all on function public.get_my_wars() from public;
grant execute on function public.get_my_wars() to authenticated;

-- Register the Wars nav section and a cron sweep to resolve due wars.
insert into public.game_section_settings (id, label, short_label, description, enabled, sort_order, icon)
values ('wars', 'Player Wars', 'Wars', 'Challenge another player to out-roll them on a metric you pick.', true, 96, '⚔')
on conflict (id) do update set enabled = true, updated_at = now();

do $$ begin perform cron.unschedule('resolve_player_wars'); exception when others then null; end $$;
select cron.schedule('resolve_player_wars', '*/2 * * * *', $$select public.war_resolve_due();$$);
