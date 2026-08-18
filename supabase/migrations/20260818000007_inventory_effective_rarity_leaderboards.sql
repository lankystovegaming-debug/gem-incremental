-- =========================================================
-- Inventory-only effective-rarity leaderboards
-- =========================================================
--
-- Best Roll and Rarest Gem are both based on the rarest specimen that is
-- CURRENTLY IN INVENTORY, never a sold/deleted specimen and never price.
--
-- Effective chance:
--   1 / (gem rarity × product(mutation denominators))
--
-- Example:
--   Aether Quartz = 1 / 140,000
--   Polished       = 1 / 100
--   Effective      = 1 / 14,000,000
--
-- The calculation is numeric so large denominators cannot overflow an
-- integer/bigint column.
-- =========================================================


-- ---------------------------------------------------------
-- Gems Found score
-- ---------------------------------------------------------

alter table public.players
  add column if not exists gems_found_score numeric not null default 0;


-- Drop first: return type / OUT params may differ from an existing version.
drop function if exists public.record_gems_found_score(uuid, numeric);

create or replace function public.record_gems_found_score(
  p_player_id uuid,
  p_rarity numeric
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_score numeric;
begin
  if p_player_id is null then
    return null;
  end if;

  v_score :=
    greatest(
      0,
      coalesce(p_rarity, 0)
    );

  update public.players
  set gems_found_score =
    coalesce(gems_found_score, 0) + v_score
  where id = p_player_id
  returning gems_found_score into v_score;

  return v_score;
end;
$$;


revoke all on function public.record_gems_found_score(uuid, numeric) from public;
grant execute on function public.record_gems_found_score(uuid, numeric) to service_role;


-- ---------------------------------------------------------
-- Shared effective-rarity source
-- ---------------------------------------------------------

-- Drop first: adds new output columns (base_rarity, mutation_multiplier,
-- mutation_chance_multiplier, mutation_chance_product, mutation_ids, ...)
-- that an existing version of this function does not have. Postgres
-- refuses to CREATE OR REPLACE across a return-type/OUT-param change.
drop function if exists public.get_best_roll_leaderboard(integer);

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
  with inventory_with_effective_rarity as (
    select
      g.id,
      g.player_id,
      p.username,
      g.gem_name,
      coalesce(g.rarity, 0)::numeric as base_rarity,
      coalesce(g.value, 0)::numeric as value,
      coalesce(g.final_weight, 0)::numeric as final_weight,
      g.mutation_id,
      coalesce(
        case
          when cardinality(g.mutation_ids) > 0
            then g.mutation_ids
          when g.mutation_id is not null
            then array[g.mutation_id]
          else '{}'::text[]
        end,
        '{}'::text[]
      ) as effective_mutation_ids,
      coalesce(g.mutation_multiplier, 1)::numeric
        as mutation_multiplier,
      coalesce(g.mutation_chance_multiplier, 1)::numeric
        as mutation_chance_multiplier,
      g.created_at
    from public.inventory_gems g
    join public.players p
      on p.id = g.player_id
    where p.username is not null
  ),
  scored as (
    select
      i.*,

      (
        i.base_rarity *

        -- Every mutation is an independent 1/N chance, so the
        -- denominators multiply together.
        case when 'polished' = any(i.effective_mutation_ids)
          then 100::numeric else 1::numeric end *

        case when 'gilded' = any(i.effective_mutation_ids)
          then 500::numeric else 1::numeric end *

        case when 'prismatic' = any(i.effective_mutation_ids)
          then 2500::numeric else 1::numeric end *

        case when 'celestial' = any(i.effective_mutation_ids)
          then 10000::numeric else 1::numeric end *

        case when 'corrupted' = any(i.effective_mutation_ids)
          then 50000::numeric else 1::numeric end
      )::numeric as effective_rarity,

      (
        case when 'polished' = any(i.effective_mutation_ids)
          then 100::numeric else 1::numeric end *

        case when 'gilded' = any(i.effective_mutation_ids)
          then 500::numeric else 1::numeric end *

        case when 'prismatic' = any(i.effective_mutation_ids)
          then 2500::numeric else 1::numeric end *

        case when 'celestial' = any(i.effective_mutation_ids)
          then 10000::numeric else 1::numeric end *

        case when 'corrupted' = any(i.effective_mutation_ids)
          then 50000::numeric else 1::numeric end
      )::numeric as mutation_chance_product
    from inventory_with_effective_rarity i
  ),
  ranked as (
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
        r.effective_rarity desc,
        r.base_rarity desc,
        r.created_at desc,
        r.id desc
    ) as rank,

    r.username,
    r.gem_name,

    -- `rarity` is deliberately the EFFECTIVE denominator displayed and
    -- ranked by the frontend.
    r.effective_rarity as rarity,

    r.base_rarity,
    r.value,
    r.final_weight,
    r.mutation_id,
    r.effective_mutation_ids as mutation_ids,
    r.mutation_multiplier,
    r.mutation_chance_multiplier,
    r.mutation_chance_product,
    r.created_at
  from ranked r
  where r.player_rank = 1
  order by
    r.effective_rarity desc,
    r.base_rarity desc,
    r.created_at desc,
    r.id desc
  limit greatest(
    1,
    least(
      coalesce(p_limit, 25),
      100
    )
  );
$$;


revoke all on function public.get_best_roll_leaderboard(integer) from public;
grant execute on function public.get_best_roll_leaderboard(integer) to anon, authenticated;


-- Rarest Gem intentionally uses the exact same source and ranking semantics
-- as Best Roll. Keeping it as a separate RPC preserves the frontend API
-- while guaranteeing that the two boards cannot drift apart.

-- Drop first: same reason as get_best_roll_leaderboard above — the output
-- column set changed, and CREATE OR REPLACE can't alter OUT params.
drop function if exists public.get_rarest_gem_leaderboard(integer);

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
  select *
  from public.get_best_roll_leaderboard(p_limit);
$$;


revoke all on function public.get_rarest_gem_leaderboard(integer) from public;
grant execute on function public.get_rarest_gem_leaderboard(integer) to anon, authenticated;


-- ---------------------------------------------------------
-- Gems Found leaderboard
-- ---------------------------------------------------------
--
-- This remains a lifetime "found" score based on each roll's BASE rarity.
-- It is independent from Best Roll / Rarest Gem, which use effective
-- mutation-adjusted rarity of specimens currently in inventory.

-- Drop first: guards against any pre-existing version with a different
-- output shape (e.g. no `rank` column, different column order).
drop function if exists public.get_gems_found_leaderboard();

create or replace function public.get_gems_found_leaderboard()
returns table (
  rank bigint,
  username text,
  gems_found numeric
)
language sql
security definer
set search_path = ''
as $$
  with ranked as (
    select
      p.username,
      coalesce(p.gems_found_score, 0)::numeric as gems_found,
      row_number() over (
        order by
          coalesce(p.gems_found_score, 0) desc,
          p.total_rolls desc,
          p.id
      ) as rn
    from public.players p
    where p.username is not null
  )
  select
    rn as rank,
    username,
    gems_found
  from ranked
  where rn <= 100
  order by rn;
$$;


revoke all on function public.get_gems_found_leaderboard() from public;
grant execute on function public.get_gems_found_leaderboard() to anon, authenticated;


-- ---------------------------------------------------------
-- Historical Gems Found backfill
-- ---------------------------------------------------------
--
-- Rebuild the score from the inventory + lifetime roll statistics where
-- possible. Existing players with no inventory are left at zero. This is
-- intentionally only a one-time baseline; new rolls use the RPC above.

update public.players p
set gems_found_score = coalesce(
  (
    select sum(coalesce(g.rarity, 0)::numeric)
    from public.inventory_gems g
    where g.player_id = p.id
  ),
  0
);

-- Keep the new score protected from client-side edits. The service-role
-- roll function is still allowed to increment it.
set local check_function_bodies = off;

create or replace function public.players_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.money := 0;
    new.lifetime_earnings := 0;
    new.total_rolls := 0;
    new.inventory_capacity := 15;
    new.next_roll_at := null;
    new.rarest_gem_name := null;
    new.rarest_gem_rarity := null;
    new.crafting_migrated := false;
    new.stats_migrated := false;
    new.legacy_save_migrated := false;
    new.mutation_luck := 1;
    new.gems_found_score := 0;
    return new;
  end if;

  if new.id                    is distinct from old.id
     or new.money              is distinct from old.money
     or new.lifetime_earnings  is distinct from old.lifetime_earnings
     or new.total_rolls        is distinct from old.total_rolls
     or new.inventory_capacity is distinct from old.inventory_capacity
     or new.next_roll_at       is distinct from old.next_roll_at
     or new.rarest_gem_name    is distinct from old.rarest_gem_name
     or new.rarest_gem_rarity  is distinct from old.rarest_gem_rarity
     or new.crafting_migrated  is distinct from old.crafting_migrated
     or new.stats_migrated     is distinct from old.stats_migrated
     or new.legacy_save_migrated is distinct from old.legacy_save_migrated
     or new.mutation_luck      is distinct from old.mutation_luck
     or new.gems_found_score   is distinct from old.gems_found_score
     or new.created_at         is distinct from old.created_at
  then
    raise exception 'forbidden_column_update';
  end if;

  return new;
end;
$$;

drop trigger if exists players_guard_trg on public.players;
create trigger players_guard_trg
  before insert or update on public.players
  for each row execute function public.players_guard();