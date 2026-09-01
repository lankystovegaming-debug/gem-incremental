begin;

-- Replace promises tied to the retired daily/weekly expedition system with
-- permanent logistics upgrades used by every current destination.
update public.research_nodes set
  name = case id
    when 'prepared-reroll' then 'Hazard Planning'
    when 'flexible-planning' then 'Supply Contracts'
    when 'expedition-permit' then 'Deep Logistics'
    when 'prepared-selection' then 'Overdepth Preparation'
    else name end,
  description = case id
    when 'expedition-records' then 'Detailed records for Abandoned Mine and Crystal Caverns runs, plus 2% lower depth funding.'
    when 'expedition-intel' then 'Current-destination intelligence and 2% lower depth funding.'
    when 'prepared-reroll' then 'Plan around current expedition hazards and reduce depth funding by 3%.'
    when 'flexible-planning' then 'Negotiate supply contracts for 3% lower depth funding.'
    when 'expedition-supplies' then 'Specialized expedition supplies reduce depth funding by 3%.'
    when 'expedition-permit' then 'Deep logistics reduce depth funding by a further 2%.'
    when 'prepared-selection' then 'Prepare for Overdepth routes and reduce depth funding by a further 2%.'
    else description end,
  effects = case id
    when 'expedition-records' then '{"expeditionDiscount":0.02,"flag":"expeditionRecords"}'::jsonb
    when 'expedition-intel' then '{"expeditionDiscount":0.02,"flag":"expeditionIntel"}'::jsonb
    when 'prepared-reroll' then '{"expeditionDiscount":0.03,"flag":"hazardPlanning"}'::jsonb
    when 'flexible-planning' then '{"expeditionDiscount":0.03,"flag":"supplyContracts"}'::jsonb
    when 'expedition-supplies' then '{"expeditionDiscount":0.03}'::jsonb
    when 'expedition-permit' then '{"expeditionDiscount":0.02,"flag":"deepLogistics"}'::jsonb
    when 'prepared-selection' then '{"expeditionDiscount":0.02,"flag":"overdepthPreparation"}'::jsonb
    else effects end
where id in (
  'expedition-records','expedition-intel','prepared-reroll',
  'flexible-planning','expedition-supplies','expedition-permit','prepared-selection'
);

-- Existing purchases immediately receive the reworked effects.
do $backfill_research$
declare profile record;
begin
  for profile in select player_id from public.player_research_profiles loop
    perform public.compile_research_effects_v014(profile.player_id);
  end loop;
end
$backfill_research$;

create or replace function public.apply_expedition_research_discount(
  p_player_id uuid,
  p_cost numeric
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(
    greatest(0, coalesce(p_cost, 0)) *
    (1 - least(.50, greatest(0, coalesce((
      select effects.expedition_discount
      from public.player_research_effects effects
      where effects.player_id = p_player_id
    ), 0))))
  )
$$;

-- Normal Abandoned Mine depth funding.
create or replace function public.fund_abandoned_mine(p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_run public.abandoned_mine_runs; v_cost numeric; v_money numeric;
  v_incident text:=null; v_severity_roll numeric; v_loss_percentage numeric; v_loss jsonb;
  v_unsecured jsonb; v_modifier integer; v_exact numeric; v_target_danger integer; v_critical_cutoff numeric:=.92;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs where player_id=v_uid and status<>'settled' for update;
  if not found then
    if p_depth<>1 then raise exception 'mine_depth_out_of_sequence'; end if;
    insert into public.abandoned_mine_runs(player_id,mode,normal_danger_exact) values(v_uid,'normal',0) returning * into v_run;
  end if;
  if v_run.mode<>'normal' or v_run.status not in ('awaiting_funding','checkpoint_decision')
     or p_depth<>v_run.depth+1 or p_depth not between 1 and 10 then raise exception 'mine_depth_out_of_sequence'; end if;
  if v_run.status='checkpoint_decision' and (v_run.depth not in (3,6,9) or v_run.progress<v_run.target) then raise exception 'mine_depth_out_of_sequence'; end if;
  v_cost:=public.apply_expedition_research_discount(v_uid,public.abandoned_mine_depth_cost(p_depth));
  update public.players set money=money-v_cost where id=v_uid and money>=v_cost returning money into v_money;
  if not found then raise exception 'insufficient_funds'; end if;
  insert into public.abandoned_mine_funding(run_id,depth,amount) values(v_run.id,p_depth,v_cost);
  v_unsecured:=v_run.unsecured_cargo; v_modifier:=v_run.danger_modifier;
  v_exact:=case when v_run.normal_danger_exact is null or round(v_run.normal_danger_exact)<>v_run.danger then v_run.danger else v_run.normal_danger_exact end;
  if public.player_has_mine_artifact(v_uid,'canary-charm') then v_critical_cutoff:=.928; end if;
  if random()<v_exact/100 then
    v_severity_roll:=random();
    v_incident:=case when v_severity_roll<.65 then 'minor' when v_severity_roll<v_critical_cutoff then 'major' else 'critical' end;
    v_loss_percentage:=case v_incident when 'minor' then round((8+random()*4)::numeric,2)
      when 'major' then round((20+random()*10)::numeric,2) else round((35+random()*15)::numeric,2) end;
    v_loss:=public.abandoned_mine_apply_cargo_loss(v_unsecured,v_loss_percentage); v_unsecured:=v_loss->'cargo';
    if v_incident='major' then v_modifier:=v_modifier+5; end if;
  end if;
  v_target_danger:=public.abandoned_mine_effective_danger(p_depth,v_modifier);
  if v_incident is distinct from 'critical' then
    if public.player_has_mine_artifact(v_uid,'descent-chain') and v_target_danger>v_exact then
      v_exact:=v_exact+(v_target_danger-v_exact)*.95;
    else v_exact:=v_target_danger; end if;
  end if;
  update public.abandoned_mine_runs set total_funding=total_funding+v_cost,
    camps=case when v_run.status='checkpoint_decision' and not (camps @> to_jsonb(array[v_run.depth])) then camps||jsonb_build_array(v_run.depth) else camps end,
    danger_modifier=v_modifier,unsecured_cargo=v_unsecured,normal_danger_exact=v_exact,
    incident_log=case when v_incident is null then incident_log else incident_log||jsonb_build_array(jsonb_build_object(
      'severity',v_incident,'depth',p_depth,'fromDepth',depth,'overdepth',overdepth,'lossPercentage',v_loss->'lossPercentage',
      'valueBefore',v_loss->'valueBefore','valueLost',v_loss->'valueLost','valueRetained',v_loss->'valueRetained','at',now())) end,
    depth=case when v_incident='critical' then depth else p_depth end,
    progress=case when v_incident='critical' then progress else 0 end,
    target=case when v_incident='critical' then target else public.abandoned_mine_depth_target(p_depth,0) end,
    danger=case when v_incident='critical' then danger else round(v_exact)::integer end,
    status=case when v_incident='critical' then 'forced_extraction' else 'active' end,
    extraction_reason=case when v_incident='critical' then 'critical_incident' else extraction_reason end,
    extracted_at=case when v_incident='critical' then now() else extracted_at end,updated_at=now()
    where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'incident',v_incident,'cost',v_cost);
end $$;

-- Hell depth funding, preserving the latest persistent-Danger behavior.
create or replace function public.fund_abandoned_mine_hell(p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_run public.abandoned_mine_runs;
  v_config jsonb:=public.abandoned_mine_hell_config(); v_cost numeric; v_money numeric; v_state jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated';end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs where player_id=v_uid and status<>'settled' for update;
  if not found then
    perform public.start_abandoned_mine_hell();
    select * into v_run from public.abandoned_mine_runs where player_id=v_uid and status<>'settled' for update;
  end if;
  if v_run.mode<>'hell' or p_depth<>v_run.depth+1 or p_depth not between 1 and 10 or
    not (v_run.depth=0 or (v_run.status='ready_to_extract' and v_run.overdepth=0 and v_run.depth<10)) then
    raise exception 'hell_depth_out_of_sequence';
  end if;
  v_cost:=(select (value#>>'{}')::numeric from jsonb_array_elements(v_config->'depthCosts') with ordinality a(value,n) where n=p_depth);
  v_cost:=public.apply_expedition_research_discount(v_uid,v_cost);
  update public.players p set money=p.money-v_cost where p.id=v_uid and p.money>=v_cost returning p.money into v_money;
  if not found then raise exception 'insufficient_funds';end if;
  v_state:=public.abandoned_mine_hell_prepare_depth(v_run,p_depth,0);
  insert into public.abandoned_mine_funding(run_id,depth,amount) values(v_run.id,p_depth,v_cost);
  update public.abandoned_mine_runs set depth=p_depth,progress=0,
    target=ceil(coalesce((v_state->'objective'->>'fallback')::numeric,(v_state->'objective'->>'target')::numeric))::integer,
    danger=greatest(v_run.danger,coalesce((v_state->>'dangerFloor')::integer,0)),status='active',hell_state=v_state,
    total_funding=total_funding+v_cost,updated_at=now() where id=v_run.id returning * into v_run;
  perform public.abandoned_mine_hell_log(v_run,'depth_enter',jsonb_build_object('objective',v_state->'objective','event',v_state->'event'),v_cost);
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'cost',v_cost);
end $$;

-- Crystal Caverns depth funding. Overdepth remains free in the current economy.
create or replace function public.fund_crystal_depth(p_run_id bigint,p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;c numeric;m numeric;
begin
  select * into r from public.crystal_cavern_runs where id=p_run_id and player_id=auth.uid() for update;
  if not found or r.overdepth<>0 or r.status<>'awaiting_funding' or p_depth<>r.depth+1 then raise exception 'crystal_depth_unavailable';end if;
  c:=public.apply_expedition_research_discount(r.player_id,public.crystal_funding(p_depth));
  update public.players p set money=p.money-c where id=r.player_id and p.money>=c returning p.money into m;
  if not found then raise exception 'insufficient_funds';end if;
  update public.crystal_cavern_runs set depth=p_depth,progress=0,target=100+p_depth*50,
    danger=public.crystal_base_danger(p_depth),status='active',total_funding=total_funding+c,
    event_log=public.crystal_log(event_log,'depth','Funded and entered D'||p_depth,
      jsonb_build_object('cost',c,'danger',public.crystal_base_danger(p_depth))),updated_at=now()
    where id=r.id returning * into r;
  return jsonb_build_object('run',to_jsonb(r),'money',m,'cost',c);
end $$;

-- Current expedition runs now award Research Points. The source keys are
-- destination-qualified so identity values cannot collide.
create or replace function public.research_points_from_current_expedition_v014()
returns trigger language plpgsql security definer set search_path='' as $$
declare amount integer;
begin
  if new.status='settled' and old.status is distinct from 'settled' then
    if tg_table_name='crystal_cavern_runs' then
      amount:=4+floor(new.depth/2.0)::integer+least(10,new.overdepth);
      perform public.award_research_points_v014(new.player_id,'expedition','crystal:'||new.id::text,amount);
    else
      amount:=case when new.mode='hell' then 6+floor(new.depth/2.0)::integer+least(10,new.overdepth*2)
        else 2+floor(new.depth/3.0)::integer+least(10,new.overdepth) end;
      perform public.award_research_points_v014(new.player_id,'expedition','mine:'||new.id::text,amount);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists research_points_current_mine_v014_trg on public.abandoned_mine_runs;
create trigger research_points_current_mine_v014_trg after update of status on public.abandoned_mine_runs
for each row execute function public.research_points_from_current_expedition_v014();
drop trigger if exists research_points_current_crystal_v014_trg on public.crystal_cavern_runs;
create trigger research_points_current_crystal_v014_trg after update of status on public.crystal_cavern_runs
for each row execute function public.research_points_from_current_expedition_v014();

-- Map the existing catalog names onto the current persistent expedition model.
update public.private_feature_definitions set
  description=case name
    when 'First Expedition' then 'Settle your first Abandoned Mine or Crystal Caverns expedition.'
    when 'Expedition Regular' then 'Settle 5 Abandoned Mine or Crystal Caverns expeditions.'
    when 'Expedition Veteran' then 'Settle 15 Abandoned Mine or Crystal Caverns expeditions.'
    when 'Expedition Master' then 'Settle 25 Abandoned Mine or Crystal Caverns expeditions.'
    when 'Depth Explorer' then 'Reach Depth 10 in the Abandoned Mine or Crystal Caverns.'
    when 'Voidwalker' then 'Reach Overdepth 1 in the Abandoned Mine or Crystal Caverns.'
    else description end,
  updated_at=now()
where feature_kind='achievement' and metadata->>'catalogVersion'='v0.13.0-beta'
  and name in('First Expedition','Expedition Regular','Expedition Veteran','Expedition Master','Depth Explorer','Voidwalker');

create or replace function public.sync_current_expedition_achievements_v013(p_uid uuid)
returns void language plpgsql security definer set search_path='' as $$
declare completed_runs numeric:=0; deepest numeric:=0; deepest_overdepth numeric:=0;
begin
  select
    (select count(*) from public.abandoned_mine_runs r where r.player_id=p_uid and r.status='settled')+
    (select count(*) from public.crystal_cavern_runs r where r.player_id=p_uid and r.status='settled'),
    greatest(
      coalesce((select max(r.depth) from public.abandoned_mine_runs r where r.player_id=p_uid),0),
      coalesce((select max(r.depth) from public.crystal_cavern_runs r where r.player_id=p_uid),0)),
    greatest(
      coalesce((select max(r.overdepth) from public.abandoned_mine_runs r where r.player_id=p_uid),0),
      coalesce((select max(r.overdepth) from public.crystal_cavern_runs r where r.player_id=p_uid),0))
  into completed_runs,deepest,deepest_overdepth;
  perform public.achievement_set_progress_v013(p_uid,'First Expedition',completed_runs,1);
  perform public.achievement_set_progress_v013(p_uid,'Expedition Regular',completed_runs,5);
  perform public.achievement_set_progress_v013(p_uid,'Expedition Veteran',completed_runs,15);
  perform public.achievement_set_progress_v013(p_uid,'Expedition Master',completed_runs,25);
  perform public.achievement_set_progress_v013(p_uid,'Depth Explorer',deepest,10);
  perform public.achievement_set_progress_v013(p_uid,'Voidwalker',deepest_overdepth,1);
end $$;

create or replace function public.sync_current_expedition_achievements_trigger_v013()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.sync_current_expedition_achievements_v013(new.player_id);return new;end $$;
drop trigger if exists current_mine_achievements_v013_trg on public.abandoned_mine_runs;
drop trigger if exists current_mine_achievements_insert_v013_trg on public.abandoned_mine_runs;
create trigger current_mine_achievements_insert_v013_trg after insert on public.abandoned_mine_runs
for each row execute function public.sync_current_expedition_achievements_trigger_v013();
create trigger current_mine_achievements_v013_trg after update of status,depth,overdepth on public.abandoned_mine_runs
for each row when (
  old.status is distinct from new.status or old.depth is distinct from new.depth or old.overdepth is distinct from new.overdepth
) execute function public.sync_current_expedition_achievements_trigger_v013();
drop trigger if exists current_crystal_achievements_v013_trg on public.crystal_cavern_runs;
drop trigger if exists current_crystal_achievements_insert_v013_trg on public.crystal_cavern_runs;
create trigger current_crystal_achievements_insert_v013_trg after insert on public.crystal_cavern_runs
for each row execute function public.sync_current_expedition_achievements_trigger_v013();
create trigger current_crystal_achievements_v013_trg after update of status,depth,overdepth on public.crystal_cavern_runs
for each row when (
  old.status is distinct from new.status or old.depth is distinct from new.depth or old.overdepth is distinct from new.overdepth
) execute function public.sync_current_expedition_achievements_trigger_v013();

-- Season Tier achievements now track the XP-unlocked tier, independently of
-- whether a reward was claimed from that tier.
create or replace function public.sync_season_tier_achievements_v013(p_uid uuid)
returns void language plpgsql security definer set search_path='' as $$
declare season_level numeric:=1;
begin
  select coalesce(max((tier.value->>'tier')::integer),1) into season_level
  from public.player_seasons progress
  join public.season_definitions season on season.id=progress.season_id
  cross join lateral jsonb_array_elements(coalesce(season.tiers,'[]'::jsonb)) tier(value)
  where progress.player_id=p_uid and progress.xp>=coalesce((tier.value->>'xp')::numeric,0);
  perform public.achievement_set_progress_v013(p_uid,'Season Tier 10',season_level,10);
  perform public.achievement_set_progress_v013(p_uid,'Season Tier 25',season_level,25);
  perform public.achievement_set_progress_v013(p_uid,'Season Tier 50',season_level,50);
end $$;

create or replace function public.sync_season_tier_achievements_trigger_v013()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.sync_season_tier_achievements_v013(new.player_id);return new;end $$;
drop trigger if exists season_tier_achievements_v013_trg on public.player_seasons;
create trigger season_tier_achievements_v013_trg after insert or update of xp on public.player_seasons
for each row execute function public.sync_season_tier_achievements_trigger_v013();

-- Backfill current runs, season XP, and RP for everyone without revoking any
-- legacy completion. The central ledgers and setters are idempotent.
do $backfill_progress$
declare player record; run record;
begin
  for player in
    select player_id from public.abandoned_mine_runs
    union select player_id from public.crystal_cavern_runs
    union select player_id from public.player_seasons
  loop
    perform public.sync_current_expedition_achievements_v013(player.player_id);
    perform public.sync_season_tier_achievements_v013(player.player_id);
  end loop;
  for run in select id,player_id,mode,depth,overdepth from public.abandoned_mine_runs where status='settled' loop
    perform public.award_research_points_v014(run.player_id,'expedition','mine:'||run.id::text,
      case when run.mode='hell' then 6+floor(run.depth/2.0)::integer+least(10,run.overdepth*2)
      else 2+floor(run.depth/3.0)::integer+least(10,run.overdepth) end);
  end loop;
  for run in select id,player_id,depth,overdepth from public.crystal_cavern_runs where status='settled' loop
    perform public.award_research_points_v014(run.player_id,'expedition','crystal:'||run.id::text,
      4+floor(run.depth/2.0)::integer+least(10,run.overdepth));
  end loop;
end
$backfill_progress$;

revoke all on function public.apply_expedition_research_discount(uuid,numeric),
  public.research_points_from_current_expedition_v014(),
  public.sync_current_expedition_achievements_v013(uuid),
  public.sync_current_expedition_achievements_trigger_v013(),
  public.sync_season_tier_achievements_v013(uuid),
  public.sync_season_tier_achievements_trigger_v013() from public,anon,authenticated;
grant execute on function public.apply_expedition_research_discount(uuid,numeric),
  public.research_points_from_current_expedition_v014(),
  public.sync_current_expedition_achievements_v013(uuid),
  public.sync_current_expedition_achievements_trigger_v013(),
  public.sync_season_tier_achievements_v013(uuid),
  public.sync_season_tier_achievements_trigger_v013() to service_role;

revoke all on function public.fund_abandoned_mine(integer),public.fund_abandoned_mine_hell(integer),
  public.fund_crystal_depth(bigint,integer) from public,anon;
grant execute on function public.fund_abandoned_mine(integer),public.fund_abandoned_mine_hell(integer),
  public.fund_crystal_depth(bigint,integer) to authenticated;

commit;
