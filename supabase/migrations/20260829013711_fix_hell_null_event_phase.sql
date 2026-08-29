-- jsonb_build_object stores a missing event as JSON null. `IS NOT NULL`
-- treats that JSON value as present, leaving completed depths in an Event
-- phase with no choices. Require an actual event object and repair open runs.

update public.abandoned_mine_runs
set hell_state=jsonb_set(hell_state,'{phase}','"cards"'::jsonb),updated_at=now()
where mode='hell'
  and status='active'
  and hell_state->>'phase'='event'
  and jsonb_typeof(hell_state->'event') is distinct from 'object';

create or replace function public.record_abandoned_mine_hell_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs;
  v_state jsonb;
  v_objective jsonb;
  v_family text;
  v_rolls integer;
  v_progress numeric;
  v_target numeric;
  v_complete boolean:=false;
  v_rarity numeric:=greatest(0,coalesce((p_payload->>'rarity')::numeric,0));
  v_weight_multiplier numeric:=greatest(0,coalesce((p_payload->>'weightMultiplier')::numeric,0));
  v_value numeric:=greatest(0,coalesce((p_payload->>'displayedValue')::numeric,0));
  v_weight numeric:=greatest(0,coalesce((p_payload->>'finalWeight')::numeric,0));
  v_mutated boolean:=jsonb_array_length(coalesce(p_payload->'mutationIds','[]'))>0;
  v_elapsed integer;
begin
  select * into v_run from public.abandoned_mine_runs
    where player_id=p_player_id and mode='hell' and status='active' for update;
  if not found then return;end if;
  v_state:=v_run.hell_state;
  if v_state->>'phase'<>'objective' then return;end if;
  v_objective:=v_state->'objective';
  v_family:=v_objective->>'family';
  v_rolls:=coalesce((v_objective->>'rolls')::integer,0)+1;
  v_progress:=coalesce((v_objective->>'progress')::numeric,0);
  v_target:=(v_objective->>'target')::numeric;
  v_progress:=case v_family
    when 'roll_count' then v_rolls
    when 'rarity_hunt' then greatest(v_progress,v_rarity)
    when 'weight_hunt' then greatest(v_progress,v_weight_multiplier)
    when 'mutation_hunt' then v_progress+case when v_mutated then 1 else 0 end
    when 'value_generated' then v_progress+v_value
    when 'total_weight' then v_progress+v_weight
    when 'rare_or_grind' then greatest(v_progress,v_rarity)
    when 'weight_or_grind' then greatest(v_progress,v_weight_multiplier)
    when 'combined' then greatest(v_progress,case
      when v_rarity>=v_target and v_weight_multiplier>=coalesce((v_objective->>'weightTarget')::numeric,0)
      then v_target else 0 end)
    else v_rolls end;
  v_complete:=v_progress>=v_target or
    (v_objective->>'fallback' is not null and v_rolls>=(v_objective->>'fallback')::integer);
  v_objective:=v_objective||jsonb_build_object('rolls',v_rolls,'progress',v_progress);
  if v_complete then
    v_elapsed:=greatest(0,extract(epoch from now()-(v_objective->>'startedAt')::timestamptz)::integer);
    v_state:=v_state||jsonb_build_object(
      'objective',v_objective||jsonb_build_object('completedAt',now()),
      'phase',case when jsonb_typeof(v_state->'event')='object' then 'event' else 'cards' end);
    update public.abandoned_mine_runs set
      hell_state=v_state,progress=v_rolls,target=v_rolls,status='active',updated_at=now()
      where id=v_run.id returning * into v_run;
    perform public.abandoned_mine_hell_log(v_run,'objective_complete',jsonb_build_object(
      'family',v_family,'target',v_target,'rolls',v_rolls,'seconds',v_elapsed));
  else
    update public.abandoned_mine_runs set
      hell_state=v_state||jsonb_build_object('objective',v_objective),
      progress=v_rolls,updated_at=now() where id=v_run.id;
  end if;
end $$;

revoke all on function public.record_abandoned_mine_hell_roll(uuid,jsonb)
  from public,anon,authenticated;
