begin;

-- Restore the original secret-achievement identities and AP values, replacing
-- their never-emitted placeholder events with durable server-owned goals.
with redesigned(name, description, hint) as (
  values
    ('Déjà Vu', 'Roll the same 1-in-10,000+ base gem twice in a row.', 'Sometimes the mine repeats itself.'),
    ('Perfect Copy', 'Roll the same 1-in-10,000+ gem, mutation set, and weight multiplier twice.', 'Two specimens can be almost indistinguishable.'),
    ('Against All Odds', 'Roll a 1-in-1-billion+ effective rarity specimen with no more than 50x effective Luck.', 'Let the odds, rather than overwhelming Luck, do the work.'),
    ('Pure Fortune', 'Roll a 1-in-10-million+ base gem without a Legendary or Mythic one-roll Luck boost.', 'Some discoveries need no enormous one-roll boost.'),
    ('Mutation Overflow', 'Accumulate 5,000 mutation occurrences across genuine rolls.', 'A mutation archive can eventually overflow.'),
    ('Heavyweight Champion', 'Roll a specimen weighing at least 10x its catalog base weight.', 'The weight tail stretches farther than it first appears.'),
    ('Pocket Mineral', 'Roll a 1-in-1-million+ gem at no more than 0.55x its catalog base weight.', 'The rarest finds are not always large.'),
    ('Wrong Side Jackpot', 'Roll a base gem no rarer than 1 in 100 with mutations worth 1-in-1-million+ odds.', 'A common stone can win an uncommon lottery.'),
    ('Perfect Timing', 'Roll a 1-in-10,000+ base gem on an exact multiple of 1,000 lifetime rolls.', 'Certain roll counters deserve close attention.'),
    ('Museum Piece', 'Permanently register a specimen with base rarity of 1 in 10 million or rarer.', 'Some discoveries belong behind glass.'),
    ('Difficult Choice', 'Settle both an Abandoned Mine and Crystal Caverns run at Overdepth 5 or higher.', 'Mastery means choosing to press onward in both destinations.'),
    ('Two Birds', 'Roll a 1-in-1-million+ mutated gem weighing at least 5x its catalog base weight.', 'Combine two exceptional properties in one roll.'),
    ('Milestone Cascade', 'Claim ten achievement rewards within the same ten-minute window.', 'Save several completed milestones, then let the rewards cascade.'),
    ('From Nothing', 'Reach $1 billion lifetime earnings, then spend down to $100,000 or less.', 'Build a fortune, then leave almost none of it liquid.'),
    ('Full Circle', 'Own at least one Stage 4 research node in every research branch at the same time.', 'Explore every direction of the Research Tree.'),
    ('Chosen One', 'Own or register a 1-in-100,000+ specimen with a serial ending in 777.', 'Some recurring serial digits feel chosen.'),
    ('Exactly as Planned', 'Own a Tier 15 Pickaxe, Tier 12 Boots, and Tier 12 Bag, all at Masterwork V.', 'Perfect the complete endgame loadout.'),
    ('Secret Within Secret', 'Complete 12 other secret achievements.', 'Secrets have a progression path of their own.')
)
update public.private_feature_definitions definition
set enabled = true,
    description = redesigned.description,
    requirements = jsonb_build_object(
      'type', 'authoritative',
      'source', 'secret-achievements-v1'
    ),
    metadata = definition.metadata
      || jsonb_build_object(
        'hidden', true,
        'category', 'hidden',
        'target', 1,
        'hint', redesigned.hint,
        'conditionVersion', 'secret-achievements-v1'
      ),
    updated_at = now()
from redesigned
where definition.feature_kind = 'achievement'
  and definition.metadata->>'catalogVersion' = 'v0.13.0-beta'
  and definition.name = redesigned.name;

alter function public.refresh_player_achievements_v013(uuid)
  rename to refresh_player_achievements_v013_pre_secret_rework;

create or replace function public.refresh_player_achievements_v013(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  consecutive_rare boolean := false;
  copied_mutation_roll boolean := false;
  against_odds boolean := false;
  pure_fortune boolean := false;
  mutation_overflow boolean := false;
  heavyweight boolean := false;
  pocket_mineral boolean := false;
  wrong_side_jackpot boolean := false;
  perfect_timing boolean := false;
  museum_piece boolean := false;
  difficult_choice boolean := false;
  two_birds boolean := false;
  milestone_cascade boolean := false;
  from_nothing boolean := false;
  full_circle boolean := false;
  chosen_one boolean := false;
  exactly_planned boolean := false;
  other_secrets numeric := 0;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then
    raise exception 'forbidden';
  end if;

  perform public.refresh_player_achievements_v013_pre_secret_rework(p_uid);

  -- One indexed history scan covers the single-roll conditions. Weight goals
  -- compare final displayed weight with the live catalog base weight.
  select
    coalesce(bool_or(h.effective_rarity >= 1000000000 and greatest(h.raw_luck, 1) <= 50), false),
    coalesce(bool_or(h.rarity >= 10000000 and greatest(h.raw_luck, 1) <= greatest(h.base_luck, 1) * 1.5), false),
    coalesce(sum(cardinality(coalesce(h.mutation_ids, '{}'::text[]))), 0) >= 5000,
    coalesce(bool_or(catalog.base_weight > 0 and h.final_weight / catalog.base_weight >= 10), false),
    coalesce(bool_or(h.rarity >= 1000000 and catalog.base_weight > 0 and h.final_weight / catalog.base_weight <= 0.55), false),
    coalesce(bool_or(h.rarity <= 100 and h.effective_rarity / greatest(h.rarity, 1) >= 1000000), false),
    coalesce(bool_or(h.rarity >= 10000 and h.roll_number > 0 and mod(h.roll_number, 1000) = 0), false),
    coalesce(bool_or(h.rarity >= 1000000
      and cardinality(coalesce(h.mutation_ids, '{}'::text[])) > 0
      and catalog.base_weight > 0 and h.final_weight / catalog.base_weight >= 5), false)
  into against_odds, pure_fortune, mutation_overflow, heavyweight,
    pocket_mineral, wrong_side_jackpot, perfect_timing, two_birds
  from public.best_roll_history h
  left join public.private_feature_gems catalog on catalog.name = h.gem_name
  where h.player_id = p_uid;

  select exists (
    select 1
    from (
      select h.gem_name, h.rarity,
        lag(h.gem_name) over (order by h.roll_number nulls last, h.id) as previous_name,
        lag(h.rarity) over (order by h.roll_number nulls last, h.id) as previous_rarity
      from public.best_roll_history h
      where h.player_id = p_uid
    ) sequence
    where sequence.gem_name = sequence.previous_name
      and sequence.rarity >= 10000
      and sequence.previous_rarity >= 10000
  ) into consecutive_rare;

  select exists (
    select 1
    from public.best_roll_history h
    join public.private_feature_gems catalog on catalog.name = h.gem_name
    where h.player_id = p_uid
      and h.rarity >= 10000
      and cardinality(coalesce(h.mutation_ids, '{}'::text[])) > 0
      and catalog.base_weight > 0
    group by h.gem_name, h.mutation_ids,
      round(h.final_weight / catalog.base_weight, 2)
    having count(*) >= 2
  ) into copied_mutation_roll;

  select exists (
    select 1 from public.museum_registrations registration
    where registration.player_id = p_uid
      and coalesce(nullif(registration.specimen_snapshot->>'rarity', '')::numeric, 0) >= 10000000
  ) into museum_piece;

  select
    exists(select 1 from public.abandoned_mine_runs run
      where run.player_id = p_uid and run.status = 'settled' and run.overdepth >= 5)
    and exists(select 1 from public.crystal_cavern_runs run
      where run.player_id = p_uid and run.status = 'settled' and run.overdepth >= 5)
  into difficult_choice;

  select exists (
    select 1
    from public.private_feature_progress first_claim
    where first_claim.player_id = p_uid
      and first_claim.reward_granted_at is not null
      and (
        select count(*)
        from public.private_feature_progress nearby
        where nearby.player_id = p_uid
          and nearby.reward_granted_at between first_claim.reward_granted_at
            and first_claim.reward_granted_at + interval '10 minutes'
      ) >= 10
  ) into milestone_cascade;

  select coalesce(player.lifetime_earnings, 0) >= 1000000000
      and coalesce(player.money, 0) <= 100000
  into from_nothing
  from public.players player where player.id = p_uid;

  select count(distinct node.branch) = 4
  into full_circle
  from public.player_research_purchases purchase
  join public.research_nodes node on node.id = purchase.node_id
  where purchase.player_id = p_uid
    and node.enabled and node.stage = 4
    and node.branch in ('mining', 'specimen', 'engineering', 'exploration');

  select
    exists (
      select 1 from public.inventory_gems gem
      where gem.player_id = p_uid and gem.serial_number > 0
        and mod(gem.serial_number, 1000) = 777 and gem.rarity >= 100000
    ) or exists (
      select 1 from public.museum_registrations registration
      where registration.player_id = p_uid
        and nullif(registration.specimen_snapshot->>'serial_number', '')::bigint > 0
        and mod(nullif(registration.specimen_snapshot->>'serial_number', '')::bigint, 1000) = 777
        and coalesce(nullif(registration.specimen_snapshot->>'rarity', '')::numeric, 0) >= 100000
    )
  into chosen_one;

  select
    coalesce(max(equipment.tier) filter (where equipment.category = 'pickaxe' and equipment.masterwork_level >= 5), 0) >= 15
    and coalesce(max(equipment.tier) filter (where equipment.category = 'boots' and equipment.masterwork_level >= 5), 0) >= 12
    and coalesce(max(equipment.tier) filter (where equipment.category = 'bag' and equipment.masterwork_level >= 5), 0) >= 12
  into exactly_planned
  from public.player_equipment equipment
  where equipment.player_id = p_uid;

  perform public.achievement_set_progress_v013(p_uid, 'Déjà Vu', case when consecutive_rare then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Perfect Copy', case when copied_mutation_roll then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Against All Odds', case when against_odds then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Pure Fortune', case when pure_fortune then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Mutation Overflow', case when mutation_overflow then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Heavyweight Champion', case when heavyweight then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Pocket Mineral', case when pocket_mineral then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Wrong Side Jackpot', case when wrong_side_jackpot then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Perfect Timing', case when perfect_timing then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Museum Piece', case when museum_piece then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Difficult Choice', case when difficult_choice then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Two Birds', case when two_birds then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Milestone Cascade', case when milestone_cascade then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'From Nothing', case when from_nothing then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Full Circle', case when full_circle then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Chosen One', case when chosen_one then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Exactly as Planned', case when exactly_planned then 1 else 0 end, 1);

  select count(*) into other_secrets
  from public.private_feature_progress progress
  join public.private_feature_definitions definition on definition.id = progress.feature_id
  where progress.player_id = p_uid and progress.completed
    and definition.enabled and definition.feature_kind = 'achievement'
    and coalesce((definition.metadata->>'hidden')::boolean, false)
    and definition.name <> 'Secret Within Secret';
  perform public.achievement_set_progress_v013(p_uid, 'Secret Within Secret', other_secrets, 12);
end;
$function$;

-- Existing players are backfilled lazily when they open Achievements. This
-- avoids a deployment-time scan of every historical roll while preserving all
-- retained history and previous completion state.

revoke all on function public.refresh_player_achievements_v013(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_player_achievements_v013(uuid)
  to service_role;

commit;
