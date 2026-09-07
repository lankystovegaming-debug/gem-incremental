-- Extend the existing service-role-only minigame system. No roll changes.
begin;
alter table public.minigame_runs drop constraint minigame_runs_game_check;
alter table public.minigame_runs add constraint minigame_runs_game_check check(game in ('gem-catcher','ore-slicer','gem-2048','mine-sweeper','gem-stack','prospector','explosive-mining','gem-tower','crystal-bags','price-is-right','perfect-strike','gem-reels'));
alter table public.minigame_runs drop constraint minigame_runs_check;
alter table public.minigame_runs add constraint minigame_runs_check check(mode='practice' or game in ('mine-sweeper','gem-tower','crystal-bags','gem-reels'));
create or replace function public.minigame_start(p_player uuid,p_game text,p_mode text,p_state jsonb) returns public.minigame_runs language plpgsql security invoker set search_path='' as $$
declare w public.minigame_wallets;r public.minigame_runs;
begin
 w:=public.minigame_wallet(p_player);
 select * into r from public.minigame_runs where player_id=p_player and status='active' and ((p_mode='rewarded' and mode='rewarded') or (p_mode='practice' and mode='practice' and game=p_game));
 if found then return r;end if;
 if p_mode='rewarded' then
  if p_game not in ('mine-sweeper','gem-tower','crystal-bags','gem-reels') or (p_game='mine-sweeper' and p_state->>'difficulty'='easy') then raise exception 'Not rewarded';end if;
  if w.tickets<1 then raise exception 'No tickets';end if;
  update public.minigame_wallets set tickets=tickets-1 where player_id=p_player;
 end if;
 insert into public.minigame_runs(player_id,game,mode,state) values(p_player,p_game,p_mode,p_state) returning * into r;
 return r;
end $$;
revoke all on function public.minigame_start(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.minigame_start(uuid,text,text,jsonb) to service_role;
commit;
