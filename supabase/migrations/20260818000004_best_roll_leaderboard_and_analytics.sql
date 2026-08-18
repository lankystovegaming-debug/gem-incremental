-- =========================================================
-- Best Roll leaderboard + reliable admin analytics
-- =========================================================

-- Persist the exact mutation chance multiplier used for the roll.
alter table public.inventory_gems
  add column if not exists mutation_chance_multiplier numeric not null default 1;

-- Backfill old rows from luck-independent legacy data when possible.
update public.inventory_gems
set mutation_chance_multiplier = 1
where mutation_chance_multiplier is null;

-- Best Roll = highest specimen value.  The exact mutation chance multiplier
-- used for that specimen is returned alongside the roll so the leaderboard
-- can show "10x mutation chance" without recomputing history.
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
  with ranked as (
    select
      g.*,
      p.username,
      row_number() over (
        order by
          coalesce(g.value, 0) desc,
          coalesce(g.rarity, 0) desc,
          coalesce(g.final_weight, 0) desc,
          g.id desc
      ) as rn
    from public.inventory_gems g
    join public.players p on p.id = g.player_id
    where p.username is not null
  )
  select
    rn as rank,
    username,
    gem_name,
    rarity,
    value,
    final_weight,
    mutation_id,
    coalesce(mutation_ids, '{}'::text[]) as mutation_ids,
    coalesce(mutation_multiplier, 1) as mutation_multiplier,
    coalesce(mutation_chance_multiplier, 1) as mutation_chance_multiplier,
    created_at
  from ranked
  where rn <= greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.get_best_roll_leaderboard(integer) from public;
grant execute on function public.get_best_roll_leaderboard(integer) to anon, authenticated;

-- A single stable analytics RPC avoids a frontend making a collection of
-- partially-readable queries.  It is intentionally SECURITY DEFINER and
-- exposes aggregate values only.
create or replace function public.get_admin_analytics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_players bigint;
  v_rolls numeric;
  v_inventory bigint;
  v_mutated bigint;
  v_money numeric;
  v_inventory_value numeric;
  v_announcements bigint;
  v_announcements_mutated bigint;
  v_pending_boosts bigint;
  v_result jsonb;
begin
  select exists (
    select 1
    from public.admins au
    where au.user_id = auth.uid()
  ) into v_is_admin;

  -- Some installations use the code_improvement allow-list instead of
  -- admin_users. Accept either, while never exposing raw player data.
  if not coalesce(v_is_admin, false) then
    select exists (
      select 1 from public.code_improvement ci where ci.user_id = auth.uid()
    ) into v_is_admin;
  end if;

  if not coalesce(v_is_admin, false) then
    raise exception 'not_authorized';
  end if;

  select count(*), coalesce(sum(total_rolls),0), coalesce(sum(money),0)
    into v_players, v_rolls, v_money
  from public.players;

  select count(*),
         coalesce(sum(value),0),
         count(*) filter (
           where coalesce(cardinality(mutation_ids),0) > 0
         )
    into v_inventory, v_inventory_value, v_mutated
  from public.inventory_gems;

  select count(*),
         count(*) filter (
           where coalesce(cardinality(mutation_ids),0) > 0
         )
    into v_announcements, v_announcements_mutated
  from public.global_chat_announcements;

  select count(*) into v_pending_boosts
  from public.player_one_roll_boosts;

  v_result := jsonb_build_object(
    'players', v_players,
    'totalRolls', v_rolls,
    'totalInventoryGems', v_inventory,
    'mutatedGems', v_mutated,
    'mutationRate', case when v_inventory > 0 then v_mutated::numeric / v_inventory else 0 end,
    'totalMoney', v_money,
    'totalInventoryValue', v_inventory_value,
    'rareAnnouncements', v_announcements,
    'announcementsWithMutations', v_announcements_mutated,
    'emptyAnnouncementMutations', greatest(0, v_announcements - v_announcements_mutated),
    'announcementMutationCoverage', case when v_announcements > 0 then v_announcements_mutated::numeric / v_announcements else 1 end,
    'pendingOneRollBoosts', v_pending_boosts,
    'generatedAt', now()
  );

  return v_result;
end;
$$;

revoke all on function public.get_admin_analytics() from public;
grant execute on function public.get_admin_analytics() to authenticated;
