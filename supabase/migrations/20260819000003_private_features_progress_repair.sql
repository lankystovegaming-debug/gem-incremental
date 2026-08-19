-- =========================================================
-- Private Features: progress initialization / repair
-- Corrected repair migration. Safe to run after progression + seed.
-- Does not fabricate historical roll events.
-- =========================================================

insert into public.private_feature_progress (
  player_id, feature_id, current_value, completed, reward_granted, metadata
)
select
  p.id,
  d.id,
  0,
  false,
  false,
  jsonb_build_object('initializedBy', '20260819000003')
from public.players p
cross join public.private_feature_definitions d
where d.enabled = true
on conflict (player_id, feature_id) do nothing;

create or replace function public.ensure_private_feature_progress(p_player_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.private_feature_progress (
    player_id, feature_id, current_value, completed, reward_granted, metadata
  )
  select
    p_player_id,
    d.id,
    0,
    false,
    false,
    jsonb_build_object('initializedBy', 'ensure_private_feature_progress')
  from public.private_feature_definitions d
  where d.enabled = true
  on conflict (player_id, feature_id) do nothing;

  select count(*) into v_count
  from public.private_feature_progress
  where player_id = p_player_id;

  return v_count;
end;
$$;

revoke all on function public.ensure_private_feature_progress(uuid) from public;
grant execute on function public.ensure_private_feature_progress(uuid) to service_role;
