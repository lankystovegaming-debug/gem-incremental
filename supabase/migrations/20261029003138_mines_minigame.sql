-- Extend the live game allowlist only. Mines is score-only: the rewarded-game
-- constraint and service-role-only start/commit grants remain in force.
begin;
alter table public.minigame_runs drop constraint minigame_runs_game_check;
alter table public.minigame_runs add constraint minigame_runs_game_check
check (game in ('gem-catcher','ore-slicer','gem-2048','mine-sweeper','gem-stack',
 'prospector','explosive-mining','gem-tower','crystal-bags','price-is-right',
 'perfect-strike','gem-reels','mines'));
commit;
