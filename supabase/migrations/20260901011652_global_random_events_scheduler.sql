-- Idempotent database-owned scheduler. The runtime row starts disabled in the
-- schema migration; enabling it is an explicit post-deploy action.

create or replace function public.advance_global_random_event()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime public.global_event_runtime;
  v_definition public.global_event_definitions;
  v_occurrence public.global_event_occurrences;
  v_now timestamptz := clock_timestamp();
  v_tier_roll double precision;
  v_tier text;
  v_config jsonb;
  v_downtime_roll double precision;
  v_downtime_seconds integer;
  v_band jsonb;
  v_target_names text[];
  v_phases jsonb := '[]'::jsonb;
  v_windows jsonb := '[]'::jsonb;
  v_mass_rate numeric;
  v_mass_target bigint;
  i integer;
begin
  select * into v_runtime from public.global_event_runtime where singleton=true for update;
  if not found or not v_runtime.enabled then return jsonb_build_object('status','disabled'); end if;

  if v_runtime.active_occurrence_id is not null then
    select * into v_occurrence from public.global_event_occurrences where id=v_runtime.active_occurrence_id for update;
    if found and v_occurrence.status='active' and v_occurrence.ends_at>v_now then
      return jsonb_build_object('status','active','occurrenceId',v_occurrence.id);
    end if;
    update public.global_event_occurrences set status='completed',updated_at=v_now
      where id=v_runtime.active_occurrence_id and status='active';
    update public.global_event_runtime set active_occurrence_id=null,updated_at=v_now where singleton=true;
  end if;

  if v_runtime.next_start_at is not null and v_runtime.next_start_at>v_now then
    return jsonb_build_object('status','waiting');
  end if;

  v_tier_roll := random()*100;
  v_tier := case when v_tier_roll<60 then 'common' when v_tier_roll<90 then 'uncommon'
    when v_tier_roll<99 then 'rare' else 'legendary' end;

  select * into v_definition
  from public.global_event_definitions d
  where d.enabled and d.tier=v_tier and not (d.event_key=any(v_runtime.recent_event_keys))
  order by -ln(greatest(random(),0.000000001))/d.selection_weight limit 1;
  if not found then
    select * into v_definition from public.global_event_definitions d
    where d.enabled and d.tier=v_tier
    order by -ln(greatest(random(),0.000000001))/d.selection_weight limit 1;
  end if;
  if not found then raise exception 'no_enabled_global_event_for_tier:%',v_tier; end if;

  v_config := v_definition.config;
  if v_definition.event_key='prospectors_eye' then
    select array_agg(name) into v_target_names from (
      select name from public.private_feature_gems
      where enabled and required_event_key is null and affected_by_luck
        and rarity between 100 and 25000 order by random() limit 1
    ) q;
    v_config := v_config || jsonb_build_object('targetGem',v_target_names[1]);
  elsif v_definition.event_key='narrowed_veins' then
    select value into v_band from jsonb_array_elements(v_config->'bands') order by random() limit 1;
    v_config := v_config || jsonb_build_object('selectedBand',v_band);
  elsif v_definition.event_key='heavy_favorites' then
    select array_agg(name) into v_target_names from (
      select name from public.private_feature_gems
      where enabled and required_event_key is null and rarity>=100 order by random() limit 5
    ) q;
    v_config := v_config || jsonb_build_object('targetGems',to_jsonb(coalesce(v_target_names,'{}'::text[])));
  elsif v_definition.event_key='unstable_luck' then
    for i in 1..ceil(v_definition.duration_seconds/30.0)::integer loop
      with weighted as (
        select value, sum((value->>'weight')::numeric) over(order by ordinality) ceiling
        from jsonb_array_elements(v_config->'phases') with ordinality
      ), draw as (select random()*100 r)
      select value into v_band from weighted,draw where ceiling>=r order by ceiling limit 1;
      v_phases := v_phases || jsonb_build_array((v_band->>'value')::numeric);
    end loop;
    v_config := v_config || jsonb_build_object('phaseValues',v_phases) - 'phases';
  elsif v_definition.event_key='falling_stars' then
    -- Eight evenly partitioned slots with a random position inside each slot.
    for i in 0..7 loop
      v_windows := v_windows || jsonb_build_array(jsonb_build_object(
        'offsetSeconds', i*45 + floor(random()*30)::integer,
        'durationSeconds',15));
    end loop;
    v_config := v_config || jsonb_build_object('windows',v_windows);
  elsif v_definition.event_key='singularity' then
    select coalesce(sum(roll_count),0)/greatest(1,extract(epoch from interval '30 minutes')/60)
      into v_mass_rate from public.global_roll_activity_minute where bucket>=v_now-interval '30 minutes';
    v_mass_target := greatest((v_config->>'minimumMassTarget')::bigint,
      least((v_config->>'maximumMassTarget')::bigint,
        ceil(v_mass_rate*7*(v_config->>'participationFactor')::numeric)::bigint));
  end if;

  insert into public.global_event_occurrences
    (event_key,definition_version,tier,starts_at,ends_at,config,mass_target)
  values (v_definition.event_key,v_definition.definition_version,v_definition.tier,v_now,
    v_now+make_interval(secs=>v_definition.duration_seconds),v_config,v_mass_target)
  returning * into v_occurrence;

  v_downtime_roll := random()*100;
  if v_downtime_roll<5 then v_downtime_seconds:=600+floor(random()*601);
  elsif v_downtime_roll<20 then v_downtime_seconds:=1200+floor(random()*601);
  elsif v_downtime_roll<50 then v_downtime_seconds:=1800+floor(random()*901);
  elsif v_downtime_roll<75 then v_downtime_seconds:=2700+floor(random()*901);
  elsif v_downtime_roll<95 then v_downtime_seconds:=3600+floor(random()*1801);
  else v_downtime_seconds:=5400+floor(random()*1801); end if;

  update public.global_event_runtime set
    active_occurrence_id=v_occurrence.id,
    next_start_at=v_occurrence.ends_at+make_interval(secs=>v_downtime_seconds),
    recent_event_keys=(array[v_definition.event_key] || recent_event_keys)[1:5],
    schedule_version=schedule_version+1,updated_at=v_now
  where singleton=true;

  delete from public.global_roll_activity_minute where bucket<v_now-interval '48 hours';
  return jsonb_build_object('status','started','occurrenceId',v_occurrence.id,'eventKey',v_definition.event_key);
end;
$$;

revoke all on function public.advance_global_random_event() from public, anon, authenticated;
grant execute on function public.advance_global_random_event() to service_role, postgres;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('advance-global-random-events','* * * * *',
      'select public.advance_global_random_event();');
  else
    raise notice 'pg_cron is not installed; create the advance-global-random-events job manually.';
  end if;
end $$;

comment on table public.global_event_runtime is
  'Set enabled=true and next_start_at=clock_timestamp() after the migrations and roll function are deployed.';
