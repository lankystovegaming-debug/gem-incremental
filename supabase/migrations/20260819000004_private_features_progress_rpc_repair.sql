-- =========================================================
-- Private Features: final progress/RPC repair
-- Run this AFTER 20260819000001 and 20260819000002.
-- Safe to rerun.
-- =========================================================

create or replace function public.ensure_private_feature_progress(p_player_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_player_id is null then
    raise exception 'player_id_required';
  end if;

  insert into public.private_feature_progress (
    player_id,
    feature_id,
    current_value,
    completed,
    reward_granted,
    metadata
  )
  select
    p_player_id,
    d.id,
    0,
    false,
    false,
    jsonb_build_object(
      'initializedBy', '20260819000004',
      'initializedAt', now()
    )
  from public.private_feature_definitions d
  where d.enabled = true
  on conflict (player_id, feature_id) do nothing;

  select count(*)
    into v_count
  from public.private_feature_progress
  where player_id = p_player_id;

  return v_count;
end;
$$;

revoke all on function public.ensure_private_feature_progress(uuid) from public;
grant execute on function public.ensure_private_feature_progress(uuid) to service_role;

-- Repair all existing players without touching existing progress.
insert into public.private_feature_progress (
  player_id,
  feature_id,
  current_value,
  completed,
  reward_granted,
  metadata
)
select
  p.id,
  d.id,
  0,
  false,
  false,
  jsonb_build_object(
    'initializedBy', '20260819000004_repair',
    'initializedAt', now()
  )
from public.players p
cross join public.private_feature_definitions d
where d.enabled = true
on conflict (player_id, feature_id) do nothing;

-- Helpful indexes for the progression engine.
create index if not exists private_feature_progress_feature_idx
  on public.private_feature_progress(feature_id, player_id);

create index if not exists private_feature_definitions_enabled_sort_idx
  on public.private_feature_definitions(enabled, sort_order);
