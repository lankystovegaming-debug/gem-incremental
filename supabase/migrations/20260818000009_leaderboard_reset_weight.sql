-- =========================================================
-- Leaderboard reset + all-time Most Weight leaderboard
-- =========================================================
-- Best Roll was reset intentionally. It now starts from the moment this
-- migration is applied and only Roll edge-function successes are inserted.
-- Loot-box rewards never write to best_roll_history.
--
-- Most Weight is a separate all-time roll history so resetting Best Roll does
-- not reset the weight board. It also only receives actual Roll edge-function
-- results, not loot-box rewards.
-- =========================================================

create table if not exists public.roll_weight_history (
  id bigint generated always as identity primary key,
  player_id uuid not null,
  username text,
  gem_name text not null,
  final_weight numeric not null default 0,
  base_rarity numeric not null default 0,
  mutation_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.roll_weight_history enable row level security;

create index if not exists roll_weight_history_weight_idx
  on public.roll_weight_history (final_weight desc, created_at desc, id desc);

create index if not exists roll_weight_history_player_idx
  on public.roll_weight_history (player_id, final_weight desc, created_at desc, id desc);

-- Reset the Best Roll board completely. Do NOT backfill it from inventory:
-- the reset is a clean all-time starting point, and only successful Roll
-- function calls may add future entries.
delete from public.best_roll_history;

-- Most Weight: all-time top 100 roll specimens, allowing multiple rows from
-- the same player. Ranking is weight only; rarity/value are informational.
create or replace function public.get_most_weight_leaderboard(
  p_limit integer default 100
)
returns table (
  rank bigint,
  username text,
  gem_name text,
  final_weight numeric,
  base_rarity numeric,
  mutation_ids text[],
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    row_number() over (
      order by
        h.final_weight desc,
        h.created_at desc,
        h.id desc
    ) as rank,
    h.username,
    h.gem_name,
    h.final_weight,
    h.base_rarity,
    coalesce(h.mutation_ids, '{}'::text[]) as mutation_ids,
    h.created_at
  from public.roll_weight_history h
  where h.username is not null
  order by
    h.final_weight desc,
    h.created_at desc,
    h.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

revoke all on function public.get_most_weight_leaderboard(integer) from public;
grant execute on function public.get_most_weight_leaderboard(integer) to anon, authenticated;

-- Keep the Best Roll RPC capped at the requested public maximum of 100.
-- The existing all-time scoring logic remains authoritative: rarity × every
-- mutation denominator, never price/value.
