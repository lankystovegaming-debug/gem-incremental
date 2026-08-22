-- =========================================================
-- Rare-roll chat recovery
--
-- Chat rules:
--   * normal/unmutated gems: 1 in 100,000 or rarer
--   * mutated gems: 1 in 1,000,000 or rarer by effective rarity
--
-- Older deployments could save a successful roll to best_roll_history but
-- miss the corresponding global_chat_announcements row. Backfill those
-- durable records so a reload can never make a qualifying roll disappear.
-- =========================================================

alter table public.global_chat_announcements
  add column if not exists effective_rarity numeric;

update public.global_chat_announcements a
set effective_rarity = greatest(
  1,
  coalesce(a.rarity, 0) * public.get_mutation_chance_product(coalesce(a.mutation_ids, '{}'::text[]))
)
where a.effective_rarity is null;

insert into public.global_chat_announcements (
  player_id,
  gem_name,
  rarity,
  effective_rarity,
  mutation_ids,
  luck_at_roll,
  created_at
)
select
  h.player_id,
  h.gem_name,
  h.rarity,
  greatest(
    1,
    h.rarity * public.get_mutation_chance_product(coalesce(h.mutation_ids, '{}'::text[]))
  ),
  coalesce(h.mutation_ids, '{}'::text[]),
  h.base_luck,
  h.created_at
from public.best_roll_history h
where h.rarity >= 100000
   or (
     coalesce(cardinality(h.mutation_ids), 0) > 0
     and h.rarity * public.get_mutation_chance_product(coalesce(h.mutation_ids, '{}'::text[])) >= 1000000
   )
and not exists (
  select 1
  from public.global_chat_announcements a
  where a.player_id = h.player_id
    and a.gem_name = h.gem_name
    and abs(extract(epoch from (a.created_at - h.created_at))) <= 5
);

create index if not exists global_chat_announcements_rare_recovery_idx
  on public.global_chat_announcements(player_id, gem_name, created_at desc);
