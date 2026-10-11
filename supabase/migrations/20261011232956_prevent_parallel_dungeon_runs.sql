-- A player may only have one dungeon run that can still be played or claimed.
-- This database constraint closes the race between simultaneous start requests.
create unique index if not exists dungeon_runs_one_open_per_player_idx
on public.dungeon_runs(player_id)
where status in ('active', 'won');

-- Inferred boss add tails can reach six adds plus up to five bosses.
update public.dungeon_definitions
set max_enemies=11, updated_at=now()
where name='The 1,500-Room Dungeon' and max_enemies < 11;
