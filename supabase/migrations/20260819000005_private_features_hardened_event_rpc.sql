-- =========================================================
-- Private Features: hardened progress/event RPC layer
-- Run after 20260819000001 and any previous repair migrations.
-- This migration does NOT fabricate normal roll history.
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
    player_id, feature_id, current_value, completed, reward_granted, metadata
  )
  select
    p_player_id,
    d.id,
    0,
    false,
    false,
    jsonb_build_object(
      'initializedBy', '20260819000005',
      'initializedAt', now()
    )
  from public.private_feature_definitions d
  where d.enabled = true
  on conflict (player_id, feature_id) do nothing;

  select count(*) into v_count
  from public.private_feature_progress
  where player_id = p_player_id;

  return v_count;
end;
$$;

create or replace function public.record_private_feature_progress_event(
  p_player_id uuid,
  p_event_type text,
  p_roll_number bigint default null,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_player_id is null then
    raise exception 'player_id_required';
  end if;

  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'event_type_required';
  end if;

  insert into public.private_feature_progress_events (
    player_id,
    event_type,
    roll_number,
    payload
  )
  values (
    p_player_id,
    p_event_type,
    p_roll_number,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.ensure_private_feature_progress(uuid) from public;
revoke all on function public.record_private_feature_progress_event(uuid,text,bigint,jsonb) from public;

grant execute on function public.ensure_private_feature_progress(uuid) to service_role;
grant execute on function public.record_private_feature_progress_event(uuid,text,bigint,jsonb) to service_role;

-- Give service_role explicit table privileges as well. RLS remains enabled.
grant select, insert, update, delete on public.private_feature_definitions to service_role;
grant select, insert, update, delete on public.private_feature_progress to service_role;
grant select, insert, update, delete on public.private_feature_progress_events to service_role;

-- Repair missing progress rows for existing players, but never create fake
-- progress events.
insert into public.private_feature_progress (
  player_id, feature_id, current_value, completed, reward_granted, metadata
)
select
  p.id,
  d.id,
  0,
  false,
  false,
  jsonb_build_object(
    'initializedBy', '20260819000005_repair',
    'initializedAt', now()
  )
from public.players p
cross join public.private_feature_definitions d
where d.enabled = true
on conflict (player_id, feature_id) do nothing;

create index if not exists private_feature_progress_events_player_event_idx
  on public.private_feature_progress_events(player_id, event_type, id desc);

-- Explicit sequence privileges are included for installations that use
-- direct service-role inserts elsewhere in the feature code.
grant usage, select on all sequences in schema public to service_role;
