begin;

-- Keep a permanent grant ledger so a retry, concurrent archive request, or a
-- post-event deployment cannot issue a placement package twice.
create table if not exists public.deepcore_leaderboard_reward_grants (
  board text not null check (board in ('actual','effective')),
  rank integer not null check (rank between 1 and 5),
  player_id uuid not null references public.players(id),
  granted_at timestamptz not null default now(),
  primary key (board,rank),
  unique (board,player_id)
);

alter table public.deepcore_leaderboard_reward_grants enable row level security;
revoke all on public.deepcore_leaderboard_reward_grants from public,anon,authenticated;
grant all on public.deepcore_leaderboard_reward_grants to service_role;

create or replace function deepcore_private.grant_leaderboard_consumables(
  p_player uuid,
  p_board text,
  p_rank integer
) returns void
language plpgsql security definer set search_path='' as $$
declare catalysts integer; pressurized integer; seismic integer; unstable integer;
begin
  if p_board not in ('actual','effective') or p_rank not between 1 and 5 then
    raise exception 'invalid_leaderboard_reward';
  end if;

  insert into public.deepcore_leaderboard_reward_grants(board,rank,player_id)
  values(p_board,p_rank,p_player)
  on conflict do nothing;
  if not found then return; end if;

  select x.catalysts,x.pressurized,x.seismic,x.unstable
    into catalysts,pressurized,seismic,unstable
  from (values
    (1,10,6,3,1),
    (2,8,5,2,1),
    (3,6,4,2,0),
    (4,5,3,1,0),
    (5,4,2,1,0)
  ) as x(rank,catalysts,pressurized,seismic,unstable)
  where x.rank=p_rank;

  perform deepcore_private.grant_consumable(p_player,'deepcore-catalyst',catalysts);
  perform deepcore_private.grant_consumable(p_player,'pressurized-catalyst',pressurized);
  perform deepcore_private.grant_consumable(p_player,'seismic-potion',seismic);
  if unstable>0 then
    perform deepcore_private.grant_consumable(p_player,'unstable-core',unstable);
  end if;
end $$;

-- Roll-count consumables survive Deepcore, so their charges must continue to
-- deplete after archival. Only event progression counters remain time-gated.
create or replace function deepcore_private.track_rolls() returns trigger
language plpgsql security definer set search_path='' as $$
declare d bigint; day date; phase_three boolean;
begin
 d:=greatest(0,new.total_rolls-old.total_rolls); if d=0 then return new; end if;
 update public.deepcore_player_effects set rolls_remaining=greatest(0,rolls_remaining-d),updated_at=now()
 where player_id=new.id and effect_id in ('deepcore-catalyst','unstable-core') and rolls_remaining>0;
 delete from public.deepcore_player_effects where player_id=new.id and rolls_remaining is not null and rolls_remaining<=0;
 if deepcore_private.status()<>'active' then return new; end if;
 select phase=3 into phase_three from public.deepcore_event_state where event_key='deepcore-2026';
 if phase_three then perform 1 from public.deepcore_event_state where event_key='deepcore-2026' for update; end if;
 day:=(clock_timestamp() at time zone 'Asia/Singapore')::date;
 insert into public.deepcore_players(player_id,event_rolls) values(new.id,d)
 on conflict(player_id) do update set event_rolls=public.deepcore_players.event_rolls+d,updated_at=now();
 insert into public.deepcore_daily_progress(player_id,shop_day,rolls) values(new.id,day,d)
 on conflict(player_id,shop_day) do update set rolls=public.deepcore_daily_progress.rolls+d;
 perform deepcore_private.mark_eligible(new.id);
 if phase_three then perform deepcore_private.advance_state(); end if;
 return new;
end $$;

create or replace function deepcore_private.finalize() returns void
language plpgsql security definer set search_path='' as $$
declare e public.deepcore_event_state%rowtype; r record;
begin
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 if clock_timestamp()<e.ends_at or e.archived_at is not null then return; end if;
 insert into public.deepcore_final_leaderboard(board,rank,player_id,username,amount)
 select 'actual',row_number() over(order by d.actual_funding desc,d.player_id),d.player_id,coalesce(p.username,'Unknown'),d.actual_funding from public.deepcore_players d join public.players p on p.id=d.player_id where d.actual_funding>0 order by d.actual_funding desc limit 100;
 insert into public.deepcore_final_leaderboard(board,rank,player_id,username,amount)
 select 'effective',row_number() over(order by d.effective_funding desc,d.player_id),d.player_id,coalesce(p.username,'Unknown'),d.effective_funding from public.deepcore_players d join public.players p on p.id=d.player_id where d.effective_funding>0 order by d.effective_funding desc limit 100;
 for r in select * from public.deepcore_final_leaderboard where rank<=5 loop
  perform deepcore_private.grant_leaderboard_consumables(r.player_id,r.board,r.rank);
  perform deepcore_private.grant_cosmetic(r.player_id,case when r.board='actual' then 'deepcore-benefactor' else 'deepcore-architect' end,'leaderboard-'||r.board||'-'||r.rank);
  if r.rank=1 then perform deepcore_private.grant_cosmetic(r.player_id,case when r.board='actual' then 'deepcore-benefactor-first' else 'deepcore-architect-first' end,'leaderboard-'||r.board||'-1'); end if;
 end loop;
 for r in select a.player_id from public.deepcore_final_leaderboard a join public.deepcore_final_leaderboard b using(player_id) where a.board='actual' and b.board='effective' and a.rank<=5 and b.rank<=5 loop
  perform deepcore_private.grant_cosmetic(r.player_id,'deepcore-magnate','leaderboard-double-top-five'); end loop;
 update public.deepcore_event_state set archived_at=clock_timestamp(),community_rolls=(select coalesce(sum(event_rolls),0) from public.deepcore_players),final_report=jsonb_build_object('effectiveFunding',effective_funding,'actualFunding',actual_funding,'supplySpending',supply_spending,'phase',phase,'participants',(select count(*) from public.deepcore_players),'eligibleParticipants',(select count(*) from public.deepcore_players where eligible_at is not null),'communityRolls',(select coalesce(sum(event_rolls),0) from public.deepcore_players),'routeWinner',route_winner,'heartMultiplier',least(1.75,1+greatest(0,floor((effective_funding-10000000000)/1000000000))*.05)),updated_at=now() where event_key=e.event_key;
 insert into public.deepcore_project_log(entry_key,title,body) select 'final-report','DEEPCORE PROJECT — FINAL REPORT',final_report from public.deepcore_event_state where event_key=e.event_key on conflict do nothing;
end $$;

-- If this migration is ever installed after archival, grant the missing
-- consumable packages once from the already-frozen final standings.
do $$
declare r record;
begin
  if exists(select 1 from public.deepcore_event_state where event_key='deepcore-2026' and archived_at is not null) then
    for r in select * from public.deepcore_final_leaderboard where rank<=5 loop
      perform deepcore_private.grant_leaderboard_consumables(r.player_id,r.board,r.rank);
    end loop;
  end if;
end $$;

commit;
