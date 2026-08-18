-- =========================================================
-- Raw Rare Roll + Base Luck leaderboards
-- =========================================================
-- Best Roll remains mutation-aware and all-time.
-- Raw Rare Roll ignores mutations and ranks the rarest BASE gem chance
-- after dividing the gem denominator by the effective Luck on that roll.
-- Base Luck is permanent/equipment Luck only; temporary boosts, one-roll
-- potions and admin-event modifiers are excluded.
-- =========================================================

alter table public.best_roll_history
  add column if not exists raw_luck numeric not null default 1;

alter table public.best_roll_history
  add column if not exists base_luck numeric not null default 1;

create index if not exists best_roll_history_raw_luck_idx
  on public.best_roll_history (raw_luck desc, created_at desc, id desc);

create index if not exists best_roll_history_base_luck_idx
  on public.best_roll_history (base_luck desc, created_at desc, id desc);

-- Raw Rare Roll: all-time successful Roll history. Loot boxes never insert
-- into best_roll_history, so they are automatically excluded.
create or replace function public.get_raw_rare_roll_leaderboard(
  p_limit integer default 100
)
returns table (
  rank bigint,
  username text,
  gem_name text,
  raw_rarity numeric,
  base_rarity numeric,
  raw_luck numeric,
  mutation_ids text[],
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with scored as (
    select
      h.id,
      h.username,
      h.gem_name,
      greatest(
        1::numeric,
        coalesce(h.rarity, 0)::numeric /
          greatest(1::numeric, coalesce(h.raw_luck, 1)::numeric)
      ) as raw_rarity,
      coalesce(h.rarity, 0)::numeric as base_rarity,
      greatest(1::numeric, coalesce(h.raw_luck, 1)::numeric) as raw_luck,
      coalesce(h.mutation_ids, '{}'::text[]) as mutation_ids,
      h.created_at
    from public.best_roll_history h
    where h.username is not null
  )
  select
    row_number() over (
      order by raw_rarity desc, base_rarity desc, created_at desc, id desc
    ) as rank,
    username,
    gem_name,
    raw_rarity,
    base_rarity,
    raw_luck,
    mutation_ids,
    created_at
  from scored
  order by raw_rarity desc, base_rarity desc, created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

revoke all on function public.get_raw_rare_roll_leaderboard(integer) from public;
grant execute on function public.get_raw_rare_roll_leaderboard(integer) to anon, authenticated;

-- Most Base Luck: one row per real roll, ranked by permanent/equipment Luck.
create or replace function public.get_base_luck_leaderboard(
  p_limit integer default 100
)
returns table (
  rank bigint,
  username text,
  gem_name text,
  base_luck numeric,
  raw_luck numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    row_number() over (
      order by
        coalesce(h.base_luck, 1) desc,
        coalesce(h.raw_luck, 1) desc,
        h.created_at desc,
        h.id desc
    ) as rank,
    h.username,
    h.gem_name,
    coalesce(h.base_luck, 1)::numeric as base_luck,
    coalesce(h.raw_luck, 1)::numeric as raw_luck,
    h.created_at
  from public.best_roll_history h
  where h.username is not null
  order by
    coalesce(h.base_luck, 1) desc,
    coalesce(h.raw_luck, 1) desc,
    h.created_at desc,
    h.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

revoke all on function public.get_base_luck_leaderboard(integer) from public;
grant execute on function public.get_base_luck_leaderboard(integer) to anon, authenticated;

-- Explicitly reset Best Roll again so the board starts clean with the new
-- definition. The new raw/base boards are separate and are not reset.
delete from public.best_roll_history;
