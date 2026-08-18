-- =========================================================
-- Fix Best Roll leaderboard: rank by exact roll probability.
--
-- Best Roll is NOT specimen value and NOT the mutation value multiplier.
-- It is the rarest exact gem/mutation combination:
--   1 / (gem rarity * product(mutation chance denominators))
--
-- Example:
--   Aether Quartz = 1/140,000
--   Polished      = 1/100
--   Effective     = 1/14,000,000
--
-- Cast everything to numeric so very rare combinations never overflow an
-- integer column/expression.
-- =========================================================

create or replace function public.get_best_roll_leaderboard(p_limit integer default 25)
returns table (
  rank bigint,
  username text,
  gem_name text,
  rarity numeric,
  value numeric,
  final_weight numeric,
  mutation_id text,
  mutation_ids text[],
  mutation_multiplier numeric,
  mutation_chance_multiplier numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with scored as (
    select
      g.*,
      p.username,
      (
        coalesce(g.rarity, 0)::numeric
        * case when 'polished' = any(coalesce(g.mutation_ids, '{}'::text[])) then 100::numeric else 1::numeric end
        * case when 'gilded' = any(coalesce(g.mutation_ids, '{}'::text[])) then 500::numeric else 1::numeric end
        * case when 'prismatic' = any(coalesce(g.mutation_ids, '{}'::text[])) then 2500::numeric else 1::numeric end
        * case when 'celestial' = any(coalesce(g.mutation_ids, '{}'::text[])) then 10000::numeric else 1::numeric end
        * case when 'corrupted' = any(coalesce(g.mutation_ids, '{}'::text[])) then 50000::numeric else 1::numeric end
      ) as effective_rarity
    from public.inventory_gems g
    join public.players p on p.id = g.player_id
    where p.username is not null
  ),
  ranked as (
    select
      scored.*,
      row_number() over (
        order by
          effective_rarity desc,
          coalesce(value, 0)::numeric desc,
          coalesce(final_weight, 0)::numeric desc,
          id desc
      ) as rn
    from scored
  )
  select
    rn as rank,
    username,
    gem_name,
    effective_rarity as rarity,
    value,
    final_weight,
    mutation_id,
    coalesce(mutation_ids, '{}'::text[]) as mutation_ids,
    coalesce(mutation_multiplier, 1)::numeric as mutation_multiplier,
    coalesce(mutation_chance_multiplier, 1)::numeric as mutation_chance_multiplier,
    created_at
  from ranked
  where rn <= greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.get_best_roll_leaderboard(integer) from public;
grant execute on function public.get_best_roll_leaderboard(integer) to anon, authenticated;
