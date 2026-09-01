begin;

-- The redesigned secret achievements reuse the original hidden-definition IDs.
-- Progress rows created by the retired placeholders can therefore still say
-- completed even though none of the new server-authoritative conditions ran.
-- Claimed rows remain permanent; only unclaimed state can be safely rechecked.
create temporary table secret_completion_repair_players
on commit drop
as
select distinct progress.player_id
from public.private_feature_progress progress
join public.private_feature_definitions definition on definition.id = progress.feature_id
where definition.feature_kind = 'achievement'
  and definition.metadata->>'conditionVersion' = 'secret-achievements-v1'
  and progress.completed
  and not progress.reward_granted;

update public.private_feature_progress progress
set current_value = 0,
    completed = false,
    completed_at = null,
    achievement_points_awarded = 0,
    metadata = coalesce(progress.metadata, '{}'::jsonb) || jsonb_build_object(
      'completionResetReason', 'secret-achievements-v1-reverification',
      'completionResetAt', now()
    ),
    updated_at = now()
from public.private_feature_definitions definition
where definition.id = progress.feature_id
  and definition.feature_kind = 'achievement'
  and definition.metadata->>'conditionVersion' = 'secret-achievements-v1'
  and progress.completed
  and not progress.reward_granted;

-- AP is awarded when an achievement first flips to completed. Rebuild the
-- affected profiles from the per-achievement ledger so removed placeholder AP
-- disappears and any condition re-earned later is awarded exactly once.
insert into public.player_achievement_profiles(player_id, achievement_points, updated_at)
select affected.player_id,
  coalesce(sum(progress.achievement_points_awarded), 0)::integer,
  now()
from secret_completion_repair_players affected
left join public.private_feature_progress progress on progress.player_id = affected.player_id
group by affected.player_id
on conflict(player_id) do update set
  achievement_points = excluded.achievement_points,
  updated_at = excluded.updated_at;

commit;
