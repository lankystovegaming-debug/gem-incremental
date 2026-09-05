-- No inventory or normal-roll tables are modified.
create table public.minigame_wallets (
 player_id uuid primary key references public.players(id) on delete cascade,
 tickets integer not null default 5 check(tickets between 0 and 5),
 regen_at timestamptz not null default now(),
 mt bigint not null default 0 check(mt>=0), lifetime_mt bigint not null default 0 check(lifetime_mt>=0)
);
create table public.minigame_runs (
 id uuid primary key default gen_random_uuid(), player_id uuid not null references public.players(id) on delete cascade,
 game text not null check(game in ('gem-catcher','ore-slicer','gem-2048','mine-sweeper','gem-stack','prospector','explosive-mining','gem-tower','crystal-bags','price-is-right','perfect-strike')),
 mode text not null check(mode in ('practice','rewarded')), state jsonb not null,
 version integer not null default 0, status text not null default 'active' check(status in ('active','complete')),
 created_at timestamptz not null default now(), completed_at timestamptz,
 check(mode='practice' or game in ('mine-sweeper','gem-tower','crystal-bags'))
);
create unique index minigames_one_rewarded on public.minigame_runs(player_id) where mode='rewarded' and status='active';
create unique index minigames_one_practice_per_game on public.minigame_runs(player_id,game) where mode='practice' and status='active';
create table public.minigame_actions (
 run_id uuid not null references public.minigame_runs(id) on delete cascade, version integer not null,
 action jsonb not null, received_at timestamptz not null default now(), primary key(run_id,version)
);
create table public.minigame_scores (
 run_id uuid primary key references public.minigame_runs(id) on delete cascade,
 player_id uuid not null references public.players(id) on delete cascade, game text not null,
 score double precision not null, tie1 double precision not null default 0, tie2 double precision not null default 0,
 achieved_at timestamptz not null default now()
);
create index minigame_scores_board on public.minigame_scores(game,score desc,tie1 desc,tie2 desc,achieved_at);
alter table public.minigame_wallets enable row level security;
alter table public.minigame_runs enable row level security;
alter table public.minigame_actions enable row level security;
alter table public.minigame_scores enable row level security;
revoke all on public.minigame_wallets,public.minigame_runs,public.minigame_actions,public.minigame_scores from public,anon,authenticated;
-- Run rows contain hidden outcomes. They are NEVER directly readable by clients.
grant select on public.minigame_wallets to authenticated;
create policy minigame_wallet_own on public.minigame_wallets for select to authenticated using(player_id=(select auth.uid()));
grant all on public.minigame_wallets,public.minigame_runs,public.minigame_actions,public.minigame_scores to service_role;

create function public.minigame_wallet(p_player uuid) returns public.minigame_wallets language plpgsql security invoker set search_path='' as $$
declare w public.minigame_wallets; n integer;
begin
 insert into public.minigame_wallets(player_id) values(p_player) on conflict do nothing;
 select * into w from public.minigame_wallets where player_id=p_player for update;
 n:=greatest(0,floor(extract(epoch from(now()-w.regen_at))/3600)::integer);
 if w.tickets=5 then w.regen_at:=now();
 elsif n>0 then w.tickets:=least(5,w.tickets+n);w.regen_at:=case when w.tickets=5 then now() else w.regen_at+n*interval '1 hour' end;end if;
 update public.minigame_wallets set tickets=w.tickets,regen_at=w.regen_at where player_id=p_player;
 return w;
end $$;
create function public.minigame_start(p_player uuid,p_game text,p_mode text,p_state jsonb) returns public.minigame_runs language plpgsql security invoker set search_path='' as $$
declare w public.minigame_wallets;r public.minigame_runs;
begin
 w:=public.minigame_wallet(p_player);
 select * into r from public.minigame_runs where player_id=p_player and status='active' and ((p_mode='rewarded' and mode='rewarded') or (p_mode='practice' and mode='practice' and game=p_game));
 if found then return r;end if;
 if p_mode='rewarded' then
  if p_game not in ('mine-sweeper','gem-tower','crystal-bags') or (p_game='mine-sweeper' and p_state->>'difficulty'='easy') then raise exception 'Not rewarded';end if;
  if w.tickets<1 then raise exception 'No tickets';end if;
  update public.minigame_wallets set tickets=tickets-1 where player_id=p_player;
 end if;
 insert into public.minigame_runs(player_id,game,mode,state) values(p_player,p_game,p_mode,p_state) returning * into r;
 return r;
end $$;
create function public.minigame_commit(p_player uuid,p_run uuid,p_version integer,p_action jsonb,p_state jsonb,p_rank jsonb) returns public.minigame_runs language plpgsql security invoker set search_path='' as $$
declare r public.minigame_runs; reward bigint;
begin
 -- Same lock order as start. Serialize wallet credits and concurrent starts.
 perform 1 from public.minigame_wallets where player_id=p_player for update;
 select * into r from public.minigame_runs where id=p_run and player_id=p_player for update;
 if not found then raise exception 'Run not found';end if;
 if r.version<>p_version or r.status<>'active' then return r;end if;
 insert into public.minigame_actions(run_id,version,action) values(p_run,p_version,p_action);
 update public.minigame_runs set state=p_state,version=version+1,status=case when (p_state->>'done')::boolean then 'complete' else 'active' end,
 completed_at=case when (p_state->>'done')::boolean then now() end where id=p_run returning * into r;
 if r.status='complete' then
  reward:=case when r.mode='rewarded' then coalesce((p_state->>'pending')::bigint,0) else 0 end;
  if reward<0 then raise exception 'Invalid reward';end if;
  update public.minigame_wallets set mt=mt+reward,lifetime_mt=lifetime_mt+reward where player_id=p_player;
  if p_rank is not null and jsonb_typeof(p_rank)='array' then
   insert into public.minigame_scores(run_id,player_id,game,score,tie1,tie2) values(p_run,p_player,r.game,(p_rank->>0)::double precision,(p_rank->>1)::double precision,(p_rank->>2)::double precision);
  end if;
 end if;
 return r;
end $$;
create function public.minigame_board(p_game text,p_player uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with best as (
 select distinct on(s.player_id) s.*,p.username from public.minigame_scores s join public.players p on p.id=s.player_id
 where s.game=p_game and not coalesce(p.leaderboard_hidden,false)
 order by s.player_id,s.score desc,s.tie1 desc,s.tie2 desc,s.achieved_at,s.run_id
 ), ranked as (select *,row_number() over(order by score desc,tie1 desc,tie2 desc,achieved_at,run_id) as rank from best)
 select jsonb_build_object('entries',coalesce((select jsonb_agg(jsonb_build_object('rank',rank,'username',username,'score',score,'tie1',tie1,'tie2',tie2,'is_you',player_id=p_player) order by rank) from ranked where rank<=50),'[]'::jsonb),
 'own_rank',(select rank from ranked where player_id=p_player),'participants',(select count(*) from ranked));
$$;
revoke all on function public.minigame_wallet(uuid),public.minigame_start(uuid,text,text,jsonb),public.minigame_commit(uuid,uuid,integer,jsonb,jsonb,jsonb),public.minigame_board(text,uuid) from public,anon,authenticated;
grant execute on function public.minigame_wallet(uuid),public.minigame_start(uuid,text,text,jsonb),public.minigame_commit(uuid,uuid,integer,jsonb,jsonb,jsonb),public.minigame_board(text,uuid) to service_role;
create function public.minigame_bag_stats(p_player uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('games',count(*),'largest',coalesce(max((state->>'largest')::bigint),0),
 'lifetime_mt',coalesce(sum(case when mode='rewarded' then (state->>'pending')::bigint else 0 end),0))
 from public.minigame_runs where player_id=p_player and game='crystal-bags' and status='complete' and not coalesce((state->>'abandoned')::boolean,false);
$$;
revoke all on function public.minigame_bag_stats(uuid) from public,anon,authenticated;
grant execute on function public.minigame_bag_stats(uuid) to service_role;
