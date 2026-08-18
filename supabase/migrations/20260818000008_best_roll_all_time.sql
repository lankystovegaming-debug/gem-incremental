-- =========================================================
-- Best Roll: all-time historical leaderboard
-- =========================================================
--
-- Best Roll is a record of successful rolls, not a view of current
-- inventory. A roll remains eligible after the specimen is sold, deleted,
-- or auto-deposited into crafting.
--
-- Ranking is by exact roll probability:
--   1 / (gem rarity × product(mutation denominators))
--
-- Example:
--   Aether Quartz = 1 / 140,000
--   Polished       = 1 / 100
--   Effective      = 1 / 14,000,000
--
-- Price/value is never used to rank Best Roll.
-- =========================================================

create table if not exists public.best_roll_history (
  id bigint generated always as identity primary key,
  player_id uuid not null,
  username text,
  gem_name text not null,
  rarity numeric not null,
  final_weight numeric not null default 0,
  value numeric not null default 0,
  mutation_id text,
  mutation_ids text[] not null default '{}',
  mutation_multiplier numeric not null default 1,
  roll_number bigint,
  created_at timestamptz not null default now()
);

alter table public.best_roll_history
  add column if not exists username text;

alter table public.best_roll_history
  add column if not exists mutation_ids text[] not null default '{}';

alter table public.best_roll_history
  add column if not exists mutation_multiplier numeric not null default 1;

alter table public.best_roll_history
  add column if not exists mutation_id text;

alter table public.best_roll_history
  add column if not exists final_weight numeric not null default 0;

alter table public.best_roll_history
  add column if not exists value numeric not null default 0;

alter table public.best_roll_history
  add column if not exists roll_number bigint;

alter table public.best_roll_history
  add column if not exists created_at timestamptz not null default now();

create index if not exists best_roll_history_ranking_idx
  on public.best_roll_history (created_at desc, id desc);

create index if not exists best_roll_history_player_idx
  on public.best_roll_history (player_id, created_at desc, id desc);

-- Keep the table private. The Roll edge function writes through service_role;
-- clients only read the public leaderboard RPC below.
alter table public.best_roll_history enable row level security;

-- Backfill all currently retained inventory specimens so the new leaderboard
-- starts with real history immediately. Future rolls are appended by Roll.
insert into public.best_roll_history (
  player_id,
  username,
  gem_name,
  rarity,
  final_weight,
  value,
  mutation_id,
  mutation_ids,
  mutation_multiplier,
  roll_number,
  created_at
)
select
  g.player_id,
  coalesce(p.username, p.id::text),
  g.gem_name,
  coalesce(g.rarity, 0)::numeric,
  coalesce(g.final_weight, 0)::numeric,
  coalesce(g.value, 0)::numeric,
  g.mutation_id,
  case
    when cardinality(coalesce(g.mutation_ids, '{}'::text[])) > 0
      then g.mutation_ids
    when g.mutation_id is not null
      then array[g.mutation_id]
    else '{}'::text[]
  end,
  coalesce(g.mutation_multiplier, 1)::numeric,
  g.roll_number,
  coalesce(g.created_at, now())
from public.inventory_gems g
join public.players p on p.id = g.player_id
where not exists (
  select 1
  from public.best_roll_history h
  where h.player_id = g.player_id
    and h.gem_name = g.gem_name
    and h.created_at = coalesce(g.created_at, now())
    and h.final_weight = coalesce(g.final_weight, 0)::numeric
    and h.value = coalesce(g.value, 0)::numeric
);

-- The previous Best Roll RPC returned one row per player because it was
-- designed around current inventory. Replace it with a true all-time board:
-- multiple rows from the same player are allowed, and multiple users can all
-- appear in the top results.
create or replace function public.get_best_roll_leaderboard(
  p_limit integer default 25
)
returns table (
  rank bigint,
  username text,
  gem_name text,
  rarity numeric,
  base_rarity numeric,
  value numeric,
  final_weight numeric,
  mutation_id text,
  mutation_ids text[],
  mutation_multiplier numeric,
  mutation_chance_multiplier numeric,
  mutation_chance_product numeric,
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
      h.rarity as base_rarity,
      h.value,
      h.final_weight,
      h.mutation_id,
      coalesce(h.mutation_ids, '{}'::text[]) as mutation_ids,
      coalesce(h.mutation_multiplier, 1)::numeric as mutation_multiplier,
      h.created_at,
      (
        coalesce(h.rarity, 0)::numeric
        * case when 'polished' = any(coalesce(h.mutation_ids, '{}'::text[])) then 100::numeric else 1::numeric end
        * case when 'gilded' = any(coalesce(h.mutation_ids, '{}'::text[])) then 500::numeric else 1::numeric end
        * case when 'prismatic' = any(coalesce(h.mutation_ids, '{}'::text[])) then 2500::numeric else 1::numeric end
        * case when 'celestial' = any(coalesce(h.mutation_ids, '{}'::text[])) then 10000::numeric else 1::numeric end
        * case when 'corrupted' = any(coalesce(h.mutation_ids, '{}'::text[])) then 50000::numeric else 1::numeric end
      )::numeric as effective_rarity,
      (
        case when 'polished' = any(coalesce(h.mutation_ids, '{}'::text[])) then 100::numeric else 1::numeric end
        * case when 'gilded' = any(coalesce(h.mutation_ids, '{}'::text[])) then 500::numeric else 1::numeric end
        * case when 'prismatic' = any(coalesce(h.mutation_ids, '{}'::text[])) then 2500::numeric else 1::numeric end
        * case when 'celestial' = any(coalesce(h.mutation_ids, '{}'::text[])) then 10000::numeric else 1::numeric end
        * case when 'corrupted' = any(coalesce(h.mutation_ids, '{}'::text[])) then 50000::numeric else 1::numeric end
      )::numeric as mutation_chance_product
    from public.best_roll_history h
    where h.username is not null
  )
  select
    row_number() over (
      order by
        effective_rarity desc,
        base_rarity desc,
        created_at desc,
        id desc
    ) as rank,
    username,
    gem_name,
    effective_rarity as rarity,
    base_rarity,
    value,
    final_weight,
    mutation_id,
    mutation_ids,
    mutation_multiplier,
    1::numeric as mutation_chance_multiplier,
    mutation_chance_product,
    created_at
  from scored
  order by
    effective_rarity desc,
    base_rarity desc,
    created_at desc,
    id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.get_best_roll_leaderboard(integer) from public;
grant execute on function public.get_best_roll_leaderboard(integer) to anon, authenticated;

-- Rarest Gem remains a CURRENT-INVENTORY board. It shares the exact same
-- effective-rarity formula as Best Roll, but only considers specimens that
-- still exist in inventory and keeps the best specimen per player.
create or replace function public.get_rarest_gem_leaderboard(
  p_limit integer default 25
)
returns table (
  rank bigint,
  username text,
  gem_name text,
  rarity numeric,
  base_rarity numeric,
  value numeric,
  final_weight numeric,
  mutation_id text,
  mutation_ids text[],
  mutation_multiplier numeric,
  mutation_chance_multiplier numeric,
  mutation_chance_product numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with inventory as (
    select
      g.id,
      g.player_id,
      p.username,
      g.gem_name,
      coalesce(g.rarity, 0)::numeric as base_rarity,
      coalesce(g.value, 0)::numeric as value,
      coalesce(g.final_weight, 0)::numeric as final_weight,
      g.mutation_id,
      coalesce(g.mutation_ids, '{}') as mutation_ids,
      coalesce(g.mutation_multiplier, 1)::numeric as mutation_multiplier,
      g.created_at
    from public.inventory_gems g
    join public.players p on p.id = g.player_id
    where p.username is not null
  ),
  scored as (
    select
      i.*,
      (
        i.base_rarity
        * case when 'polished' = any(i.mutation_ids) then 100::numeric else 1::numeric end
        * case when 'gilded' = any(i.mutation_ids) then 500::numeric else 1::numeric end
        * case when 'prismatic' = any(i.mutation_ids) then 2500::numeric else 1::numeric end
        * case when 'celestial' = any(i.mutation_ids) then 10000::numeric else 1::numeric end
        * case when 'corrupted' = any(i.mutation_ids) then 50000::numeric else 1::numeric end
      )::numeric as effective_rarity,
      (
        case when 'polished' = any(i.mutation_ids) then 100::numeric else 1::numeric end
        * case when 'gilded' = any(i.mutation_ids) then 500::numeric else 1::numeric end
        * case when 'prismatic' = any(i.mutation_ids) then 2500::numeric else 1::numeric end
        * case when 'celestial' = any(i.mutation_ids) then 10000::numeric else 1::numeric end
        * case when 'corrupted' = any(i.mutation_ids) then 50000::numeric else 1::numeric end
      )::numeric as mutation_chance_product
    from inventory i
  ),
  per_player as (
    select
      s.*,
      row_number() over (
        partition by s.player_id
        order by
          s.effective_rarity desc,
          s.base_rarity desc,
          s.created_at desc,
          s.id desc
      ) as player_rank
    from scored s
  )
  select
    row_number() over (
      order by
        p.effective_rarity desc,
        p.base_rarity desc,
        p.created_at desc,
        p.id desc
    ) as rank,
    p.username,
    p.gem_name,
    p.effective_rarity as rarity,
    p.base_rarity,
    p.value,
    p.final_weight,
    p.mutation_id,
    p.mutation_ids,
    p.mutation_multiplier,
    1::numeric as mutation_chance_multiplier,
    p.mutation_chance_product,
    p.created_at
  from per_player p
  where p.player_rank = 1
  order by
    p.effective_rarity desc,
    p.base_rarity desc,
    p.created_at desc,
    p.id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

evoke all on function public.get_rarest_gem_leaderboard(integer) from public;
grant execute on function public.get_rarest_gem_leaderboard(integer) to anon, authenticated;
