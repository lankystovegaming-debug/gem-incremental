-- Durable recovery for mutation-only rare rolls.
--
-- Some older roll-function deployments rendered mutation-only announcements
-- in the browser but never inserted global_chat_announcements. Inventory
-- specimens are the committed source of truth, so expose only the qualifying
-- fields through a SECURITY DEFINER projection for chat recovery.
begin;

create or replace function public.get_rare_roll_chat_history(p_limit integer default 100)
returns table(
  id bigint,
  player_id uuid,
  username text,
  gem_name text,
  rarity numeric,
  effective_rarity numeric,
  mutation_ids text[],
  base_luck numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with history_rows as (
    select
      h.id,
      h.player_id,
      h.username,
      h.gem_name,
      h.rarity::numeric as rarity,
      greatest(
        1,
        h.rarity * public.get_mutation_chance_product(coalesce(h.mutation_ids, '{}'::text[]))
      ) as effective_rarity,
      coalesce(h.mutation_ids, '{}'::text[]) as mutation_ids,
      h.base_luck::numeric as base_luck,
      h.created_at
    from public.best_roll_history h
    where h.rarity >= 100000
       or (
         cardinality(coalesce(h.mutation_ids, '{}'::text[])) > 0
         and h.rarity * public.get_mutation_chance_product(coalesce(h.mutation_ids, '{}'::text[])) >= 1000000
       )
  ),
  inventory_rows as (
    select
      -g.id as id,
      g.player_id,
      p.username,
      g.gem_name,
      g.rarity::numeric as rarity,
      greatest(
        1,
        g.rarity * public.get_mutation_chance_product(coalesce(g.mutation_ids, '{}'::text[]))
      ) as effective_rarity,
      coalesce(g.mutation_ids, '{}'::text[]) as mutation_ids,
      g.luck_at_roll::numeric as base_luck,
      g.created_at
    from public.inventory_gems g
    join public.players p on p.id = g.player_id
    where g.rarity >= 100000
       or (
         cardinality(coalesce(g.mutation_ids, '{}'::text[])) > 0
         and g.rarity * public.get_mutation_chance_product(coalesce(g.mutation_ids, '{}'::text[])) >= 1000000
       )
  )
  select *
  from (
    select * from history_rows
    union all
    select * from inventory_rows
  ) combined
  order by created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

revoke all on function public.get_rare_roll_chat_history(integer) from public;
grant execute on function public.get_rare_roll_chat_history(integer) to anon, authenticated;

commit;
