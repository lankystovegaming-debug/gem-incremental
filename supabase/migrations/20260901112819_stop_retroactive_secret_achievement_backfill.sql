begin;

-- Secret roll achievements describe feats performed after the feature became
-- active. Backfilling a player's entire saved-roll history made mature accounts
-- unlock most secrets immediately, which defeated both their difficulty and
-- their hidden-event semantics. Keep the insert trigger for future rolls, but
-- discard the historical cache and permanently disable its legacy backfill.
update public.secret_roll_backfill_config set cutoff_id = 0 where singleton;
delete from public.secret_roll_backfill_state;
delete from public.player_secret_roll_signatures;
delete from public.player_secret_roll_progress;

create temporary table secret_roll_completion_repair_players
on commit drop
as
select distinct progress.player_id
from public.private_feature_progress progress
join public.private_feature_definitions definition on definition.id = progress.feature_id
where definition.feature_kind = 'achievement'
  and definition.metadata->>'conditionVersion' = 'secret-achievements-v1'
  and definition.name = any(array[
    'Déjà Vu', 'Perfect Copy', 'Against All Odds', 'Pure Fortune',
    'Mutation Overflow', 'Heavyweight Champion', 'Pocket Mineral',
    'Wrong Side Jackpot', 'Perfect Timing', 'Two Birds',
    'Secret Within Secret'
  ]::text[])
  and progress.completed
  and not progress.reward_granted;

update public.private_feature_progress progress
set current_value = 0,
    completed = false,
    completed_at = null,
    achievement_points_awarded = 0,
    metadata = coalesce(progress.metadata, '{}'::jsonb) || jsonb_build_object(
      'completionResetReason', 'secret-roll-tracking-started-at-release',
      'completionResetAt', now()
    ),
    updated_at = now()
from public.private_feature_definitions definition
where definition.id = progress.feature_id
  and definition.feature_kind = 'achievement'
  and definition.metadata->>'conditionVersion' = 'secret-achievements-v1'
  and definition.name = any(array[
    'Déjà Vu', 'Perfect Copy', 'Against All Odds', 'Pure Fortune',
    'Mutation Overflow', 'Heavyweight Champion', 'Pocket Mineral',
    'Wrong Side Jackpot', 'Perfect Timing', 'Two Birds',
    'Secret Within Secret'
  ]::text[])
  and progress.completed
  and not progress.reward_granted;

insert into public.player_achievement_profiles(player_id, achievement_points, updated_at)
select affected.player_id,
  coalesce(sum(progress.achievement_points_awarded), 0)::integer,
  now()
from secret_roll_completion_repair_players affected
left join public.private_feature_progress progress on progress.player_id = affected.player_id
group by affected.player_id
on conflict(player_id) do update set
  achievement_points = excluded.achievement_points,
  updated_at = excluded.updated_at;

commit;
