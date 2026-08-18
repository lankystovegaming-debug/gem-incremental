-- =========================================================
-- Fix missing raw/base luck RPCs + define Base Luck from player state
-- =========================================================
-- Raw Rare Roll is a historical roll leaderboard.
-- Most Base Luck is NOT a roll leaderboard: it is calculated live from
-- players + currently equipped player_equipment only.
-- =========================================================

-- Drop first: a prior version of this function (if any) may have a
-- different OUT-param shape, which CREATE OR REPLACE cannot change.
drop function if exists public.get_raw_rare_roll_leaderboard(integer);

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
grant execute on function public.get_raw_rare_roll_leaderboard(integer)
  to anon, authenticated;

-- Most Base Luck is a current player-stat leaderboard.
-- It deliberately does not read best_roll_history.
-- Base Luck = 1 + Luck bonuses from currently equipped equipment.

-- Drop first: this is the function named in the 42P13 error — an existing
-- version has a different return signature than the one defined below.
drop function if exists public.get_base_luck_leaderboard(integer);

create or replace function public.get_base_luck_leaderboard(
  p_limit integer default 100
)
returns table (
  rank bigint,
  username text,
  base_luck numeric,
  equipped_items bigint
)
language sql
security definer
set search_path = ''
as $$
  with player_luck as (
    select
      p.id,
      p.username,
      (
        1::numeric +
        coalesce(sum(
          case
            when e.equipped = true then coalesce(e.luck_bonus, 0)::numeric
            else 0::numeric
          end
        ), 0::numeric)
      ) as base_luck,
      count(*) filter (where e.equipped = true) as equipped_items
    from public.players p
    left join public.player_equipment e
      on e.player_id = p.id
    where p.username is not null
    group by p.id, p.username
  )
  select
    row_number() over (
      order by base_luck desc, username asc
    ) as rank,
    username,
    base_luck,
    equipped_items
  from player_luck
  order by base_luck desc, username asc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

revoke all on function public.get_base_luck_leaderboard(integer) from public;
grant execute on function public.get_base_luck_leaderboard(integer)
  to anon, authenticated;

-- Chat profile lookup used by the client to enrich global and rare-roll
-- announcements. Keep this intentionally narrow.

-- Drop first: guards against a pre-existing version with a different
-- return type (e.g. a table instead of jsonb, or different keys).
drop function if exists public.get_chat_profiles(uuid[]);

create or replace function public.get_chat_profiles(
  p_user_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      p.id::text,
      jsonb_build_object(
        'username', p.username,
        'avatar_url', coalesce(
          u.raw_user_meta_data->>'avatar_url',
          u.raw_user_meta_data->>'picture'
        )
      )
    ),
    '{}'::jsonb
  )
  from public.players p
  left join auth.users u on u.id = p.id
  where p.id = any(p_user_ids);
$$;

revoke all on function public.get_chat_profiles(uuid[]) from public;
grant execute on function public.get_chat_profiles(uuid[])
  to anon, authenticated;