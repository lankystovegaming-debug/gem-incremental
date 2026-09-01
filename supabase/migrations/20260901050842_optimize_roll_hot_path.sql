-- Optimize the remaining high-frequency roll database path.
--
-- This partial index exactly matches the capacity check used by the Roll Edge
-- Function. It keeps relics out of the smaller index and turns the per-roll
-- exact count from a table scan into a player-scoped index-only candidate.
create index if not exists inventory_gems_player_non_relic_idx
  on public.inventory_gems(player_id)
  where gem_name <> 'Enchant Relic'
    and gem_name <> 'Ancient Relic';

-- Incremental-v2 no longer reads historical roll events: it persists all
-- active counters/windows/sequences in private_feature_progress.metadata.
-- Stop duplicating ordinary rolls into the legacy event ledger, which is over
-- 1 GB and maintains four indexes. Non-roll diagnostics/events remain logged.

create or replace function public.process_private_feature_progress_event_incremental(
  p_player_id uuid,
  p_event_type text,
  p_roll_number bigint default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_definition public.private_feature_definitions%rowtype;
  v_progress public.private_feature_progress%rowtype;
  v_state jsonb;
  v_value numeric;
  v_is_complete boolean;
  v_completed jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  if p_player_id is null then
    raise exception 'player_id_required';
  end if;
  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'event_type_required';
  end if;

  perform 1 from public.players where id = p_player_id;
  if not found then
    raise exception 'player_not_found';
  end if;

  if p_event_type <> 'roll' then
    insert into public.private_feature_progress_events(
      player_id,
      event_type,
      roll_number,
      payload
    ) values (
      p_player_id,
      p_event_type,
      p_roll_number,
      coalesce(p_payload, '{}'::jsonb)
    );
  end if;

  -- Only initialize definitions that can react to this event. Definitions
  -- with no explicit eventType are the generic roll/count quest format.
  insert into public.private_feature_progress(
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
      'initializedBy', 'incremental-v3',
      'initializedAt', v_now
    )
  from public.private_feature_definitions d
  where d.enabled
    and (
      not jsonb_path_exists(d.requirements, '$.**.eventType')
      or jsonb_path_exists(
        d.requirements,
        '$.**.eventType ? (@ == $event)',
        jsonb_build_object('event', to_jsonb(p_event_type))
      )
    )
    and not (
      p_event_type = 'roll'
      and coalesce(d.requirements->>'type', '') = 'achievement_count'
    )
  on conflict (player_id, feature_id) do nothing;

  for v_definition in
    select d.*
    from public.private_feature_definitions d
    where d.enabled
      and (d.starts_at is null or d.starts_at <= v_now)
      and (d.ends_at is null or d.ends_at > v_now)
      and (
        not jsonb_path_exists(d.requirements, '$.**.eventType')
        or jsonb_path_exists(
          d.requirements,
          '$.**.eventType ? (@ == $event)',
          jsonb_build_object('event', to_jsonb(p_event_type))
        )
      )
      and not (
        p_event_type = 'roll'
        and coalesce(d.requirements->>'type', '') = 'achievement_count'
      )
      and not exists (
        select 1
        from unnest(d.prerequisites) prerequisite_id
        where not exists (
          select 1
          from public.private_feature_progress prerequisite_progress
          where prerequisite_progress.player_id = p_player_id
            and prerequisite_progress.feature_id = prerequisite_id
            and prerequisite_progress.completed
        )
      )
    order by d.sort_order, d.id
  loop
    select *
    into v_progress
    from public.private_feature_progress
    where player_id = p_player_id
      and feature_id = v_definition.id
    for update;

    if v_progress.completed then
      continue;
    end if;

    v_state := public.private_feature_increment_node(
      v_definition.requirements,
      coalesce(v_progress.metadata->'incrementalState', '{}'::jsonb),
      v_progress.current_value,
      p_event_type,
      p_roll_number,
      coalesce(p_payload, '{}'::jsonb)
    );
    v_value := coalesce((v_state->>'value')::numeric, 0);
    v_is_complete := coalesce((v_state->>'complete')::boolean, false);

    -- A non-matching single/count event commonly leaves state unchanged.
    -- Skipping that UPDATE avoids triggers, WAL, and row-version churn.
    if v_progress.current_value is distinct from v_value
       or v_progress.completed is distinct from v_is_complete
       or coalesce(v_progress.metadata->'incrementalState', '{}'::jsonb)
          is distinct from v_state
    then
      update public.private_feature_progress
      set current_value = v_value,
          completed = v_is_complete,
          completed_at = case
            when v_is_complete then coalesce(completed_at, v_now)
            else null
          end,
          updated_at = v_now,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'incrementalState', v_state,
            'lastEventType', p_event_type,
            'lastRollNumber', p_roll_number,
            'progressEngine', 'incremental-v3'
          )
      where id = v_progress.id;
    end if;

    if v_is_complete then
      v_completed := v_completed || jsonb_build_array(jsonb_build_object(
        'id', v_definition.id,
        'name', v_definition.name,
        'rewards', v_definition.rewards
      ));
    end if;
  end loop;

  return jsonb_build_object('completed', v_completed);
end;
$function$;

revoke all on function public.process_private_feature_progress_event_incremental(
  uuid,
  text,
  bigint,
  jsonb
) from public, anon, authenticated;

grant execute on function public.process_private_feature_progress_event_incremental(
  uuid,
  text,
  bigint,
  jsonb
) to service_role;
