-- Rebalance Abandoned Mine artifacts around independent, catalogued opportunities.
-- This is intentionally forward-only: existing registrations and run discoveries
-- remain valid, while all future rolls use the pools declared on the loot catalog.

alter table public.abandoned_mine_loot_catalog
  add column opportunity text,
  add column opportunity_chance numeric;

update public.abandoned_mine_loot_catalog set
  opportunity=case category
    when 'economic' then 'economic'
    when 'normal' then 'general_depth'
    when 'lost_workings' then case required_route when 'rich_vein' then 'rich_vein' else 'unstable_descent' end
    when 'd10' then 'd10'
    when 'overdepth' then 'overdepth'
  end,
  opportunity_chance=case category
    when 'economic' then 1
    when 'lost_workings' then .12
    when 'd10' then .15
    else null
  end;

alter table public.abandoned_mine_loot_catalog
  alter column opportunity set not null,
  add constraint abandoned_mine_loot_opportunity_check check (
    opportunity in ('economic','general_depth','rich_vein','unstable_descent','d10','overdepth')),
  add constraint abandoned_mine_loot_opportunity_chance_check check (
    opportunity_chance is null or opportunity_chance between 0 and 1);

-- Duplicate proceeds are deliberately token compensation, not an expedition
-- income strategy. Cargo remains the economic reward.
update public.abandoned_mine_loot_catalog set duplicate_value=case key
  when 'miners-lamp' then 1000 when 'surveyors-compass' then 1500
  when 'silver-pick' then 2000 when 'foreman-seal' then 2500
  when 'canary-charm' then 3000 when 'vein-prism' then 3500
  when 'descent-chain' then 4000 when 'deepcore-map' then 5000
  when 'clockwork-drill' then 6000 when 'royal-claim' then 7500
  when 'black-geode' then 10000 when 'bedrock-crown' then 15000
  else duplicate_value end;

update public.abandoned_mine_loot_catalog set eligibility_condition=case opportunity
  when 'general_depth' then 'General depth opportunity; eligible after reaching this depth'
  when 'rich_vein' then 'Dedicated 12% opportunity when Rich Vein is completed at D4'
  when 'unstable_descent' then 'Dedicated 12% opportunity when Unstable Descent is completed at D7'
  when 'd10' then 'Dedicated 15% D10 opportunity; selects only D10 artifacts'
  when 'overdepth' then 'Separate Overdepth opportunity; eligible from the listed Overdepth'
  else eligibility_condition end;

create or replace function public.abandoned_mine_artifact(
  p_opportunity text,
  p_depth integer,
  p_overdepth integer default 0)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_item public.abandoned_mine_loot_catalog;
begin
  select c.* into v_item
  from public.abandoned_mine_loot_catalog c
  where c.kind='artifact' and c.opportunity=p_opportunity
    and p_depth>=c.earliest_depth and p_overdepth>=c.earliest_overdepth
  order by -ln(greatest(random(),0.0000000001))/c.weight
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object('kind','artifact','key',v_item.key,'name',v_item.name,
    'depth',p_depth,'overdepth',greatest(0,p_overdepth),'duplicateValue',v_item.duplicate_value,
    'protected',v_item.protected,'collection',v_item.collection,'opportunity',v_item.opportunity);
end $$;

create or replace function public.abandoned_mine_artifact_opportunity_chance(
  p_opportunity text,p_depth integer,p_overdepth integer default 0)
returns numeric language sql stable security definer set search_path='' as $$
  select case p_opportunity
    when 'general_depth' then case when p_depth between 1 and 3 then .15
      when p_depth between 4 and 6 then .20 when p_depth between 7 and 9 then .25
      when p_depth=10 then .40 else 0 end
    when 'overdepth' then case when p_overdepth>0 then least(.55,.25+p_overdepth*.05) else 0 end
    else coalesce((select max(c.opportunity_chance)
      from public.abandoned_mine_loot_catalog c where c.opportunity=p_opportunity),0)
  end
$$;

create or replace function public.choose_abandoned_mine_route(p_run_id bigint,p_route text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.abandoned_mine_runs; v_delta integer; v_artifact jsonb;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() for update;
  if not found or v_run.status<>'awaiting_route' then raise exception 'mine_route_unavailable'; end if;
  if v_run.depth=4 and p_route in ('reinforced_tunnel','rich_vein') then
    v_delta:=case when p_route='rich_vein' then 12 else -10 end;
    if p_route='rich_vein' and random()<public.abandoned_mine_artifact_opportunity_chance('rich_vein',4,0) then
      v_artifact:=public.abandoned_mine_artifact('rich_vein',4,0);
    end if;
    update public.abandoned_mine_runs set route_d4=p_route,status='awaiting_funding',
      danger_modifier=danger_modifier+v_delta,danger=public.abandoned_mine_effective_danger(depth,danger_modifier+v_delta),
      protected_discoveries=protected_discoveries||case when v_artifact is null then '[]'::jsonb else jsonb_build_array(v_artifact) end,updated_at=now()
      where id=p_run_id returning * into v_run;
  elsif v_run.depth=7 and p_route in ('supply_line','unstable_descent') then
    v_delta:=case when p_route='unstable_descent' then 16 else -12 end;
    if p_route='unstable_descent' and random()<public.abandoned_mine_artifact_opportunity_chance('unstable_descent',7,0) then
      v_artifact:=public.abandoned_mine_artifact('unstable_descent',7,0);
    end if;
    update public.abandoned_mine_runs set route_d7=p_route,status='awaiting_funding',
      danger_modifier=danger_modifier+v_delta,danger=public.abandoned_mine_effective_danger(depth,danger_modifier+v_delta),
      protected_discoveries=protected_discoveries||case when v_artifact is null then '[]'::jsonb else jsonb_build_array(v_artifact) end,updated_at=now()
      where id=p_run_id returning * into v_run;
  else raise exception 'invalid_mine_route'; end if;
  return to_jsonb(v_run);
end $$;

create or replace function public.record_abandoned_mine_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs; v_progress integer:=1;
  v_rarity numeric:=greatest(0,coalesce((p_payload->>'rarity')::numeric,0));
  v_weight numeric:=greatest(0,coalesce((p_payload->>'weightMultiplier')::numeric,0));
  v_mutations jsonb:=coalesce(p_payload->'mutationIds','[]'::jsonb);
  v_new_progress integer; v_multiplier numeric; v_value numeric; v_cargo jsonb; v_artifact jsonb;
begin
  select * into v_run from public.abandoned_mine_runs where player_id=p_player_id and status='active' for update;
  if not found then return; end if;
  if v_rarity>=50 then v_progress:=v_progress+1; end if;
  if v_rarity>=1000 then v_progress:=v_progress+3; end if;
  if v_rarity>=10000 then v_progress:=v_progress+7; end if;
  if jsonb_array_length(v_mutations)>0 then v_progress:=v_progress+3; end if;
  if v_weight>=2 then v_progress:=v_progress+3; end if;
  v_new_progress:=least(v_run.target,v_run.progress+v_progress);
  if v_run.progress<v_run.target and v_new_progress>=v_run.target then
    v_multiplier:=case when v_run.route_d4='rich_vein' then 1.25 else 1 end
      * case when v_run.route_d7='unstable_descent' then 1.4 else 1 end * (1+v_run.overdepth*.2);
    v_value:=round((1000+random()*3500)*v_run.depth*v_multiplier);
    v_cargo:=jsonb_build_object('kind','cargo','key','economic-cargo','name',coalesce(p_payload->>'gemName','Recovered mineral cargo'),'value',v_value,'depth',v_run.depth,'overdepth',v_run.overdepth,'protected',false);
    v_run.unsecured_cargo:=v_run.unsecured_cargo||jsonb_build_array(v_cargo);

    if v_run.overdepth>0 then
      if random()<public.abandoned_mine_artifact_opportunity_chance('overdepth',10,v_run.overdepth) then
        v_artifact:=public.abandoned_mine_artifact('overdepth',10,v_run.overdepth);
        if v_artifact is not null then v_run.protected_discoveries:=v_run.protected_discoveries||jsonb_build_array(v_artifact); end if;
      end if;
    else
      if random()<public.abandoned_mine_artifact_opportunity_chance('general_depth',v_run.depth,0) then
        v_artifact:=public.abandoned_mine_artifact('general_depth',v_run.depth,0);
        if v_artifact is not null then v_run.protected_discoveries:=v_run.protected_discoveries||jsonb_build_array(v_artifact); end if;
      end if;
      if v_run.depth=10 and random()<public.abandoned_mine_artifact_opportunity_chance('d10',10,0) then
        v_artifact:=public.abandoned_mine_artifact('d10',10,0);
        if v_artifact is not null then v_run.protected_discoveries:=v_run.protected_discoveries||jsonb_build_array(v_artifact); end if;
      end if;
    end if;
  end if;
  update public.abandoned_mine_runs set progress=v_new_progress,unsecured_cargo=v_run.unsecured_cargo,protected_discoveries=v_run.protected_discoveries,
    status=case when v_new_progress>=target and depth in (3,6,9) and not (v_run.camps @> to_jsonb(array[v_run.depth])) then 'checkpoint_decision'
      when v_new_progress>=target and depth in (4,7) then 'awaiting_route' when v_new_progress>=target and depth=10 then 'ready_to_extract'
      when v_new_progress>=target then 'awaiting_funding' else status end,updated_at=now() where id=v_run.id;
end $$;

create or replace function public.get_abandoned_mine_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_run jsonb; v_run_row public.abandoned_mine_runs;
  v_history jsonb; v_artifacts jsonb; v_catalog jsonb; v_collections jsonb; v_money numeric;
  v_next_overdepth integer; v_next_cost numeric; v_projected_danger integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_run_row from public.abandoned_mine_runs r where r.player_id=v_uid and r.status<>'settled' order by r.id desc limit 1;
  if found then v_run:=to_jsonb(v_run_row); v_next_overdepth:=v_run_row.overdepth+1;
    v_next_cost:=public.abandoned_mine_overdepth_cost(v_next_overdepth);
    v_projected_danger:=public.abandoned_mine_effective_danger(10,v_run_row.danger_modifier+15); end if;
  select p.money into v_money from public.players p where p.id=v_uid;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.started_at desc),'[]'::jsonb) into v_history
    from (select id,status,depth,overdepth,total_funding,extraction_reason,settlement,started_at,settled_at from public.abandoned_mine_runs where player_id=v_uid and status='settled' order by started_at desc limit 12) h;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.registered_at desc),'[]'::jsonb) into v_artifacts from public.museum_artifact_registrations a where a.player_id=v_uid;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) into v_catalog from
    (select c.*,exists(select 1 from public.museum_artifact_registrations r where r.player_id=v_uid and r.artifact_key=c.key) registered from public.abandoned_mine_loot_catalog c) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.collection),'[]'::jsonb) into v_collections from
    (select c.collection,count(*)::integer total,count(r.artifact_key)::integer registered
      from public.abandoned_mine_loot_catalog c left join public.museum_artifact_registrations r
        on r.player_id=v_uid and r.artifact_key=c.key where c.kind='artifact' group by c.collection) x;
  return jsonb_build_object(
    'destination',jsonb_build_object('id','abandoned-mine','name','Abandoned Mine','available',true),
    'wipDestinations',jsonb_build_array('Crystal Caverns','Volcanic Depths','Ancient Ruins','Lost Jungle'),
    'run',v_run,'history',v_history,'artifacts',v_artifacts,'lootCatalog',v_catalog,'artifactCollections',v_collections,
    'artifactOpportunities',jsonb_build_array(
      jsonb_build_object('key','general_depth','name','General depth','description','One roll after each completed normal depth; selects only normal artifacts eligible at that depth.','curve',jsonb_build_array(.15,.15,.15,.20,.20,.20,.25,.25,.25,.40)),
      jsonb_build_object('key','rich_vein','name','Rich Vein','description','Dedicated 12% roll after completing D4 on Rich Vein.','chance',.12),
      jsonb_build_object('key','unstable_descent','name','Unstable Descent','description','Dedicated 12% roll after completing D7 on Unstable Descent.','chance',.12),
      jsonb_build_object('key','d10','name','D10 cache','description','Dedicated 15% roll after D10; selects only D10 artifacts.','chance',.15),
      jsonb_build_object('key','overdepth','name','Overdepth','description','Separate roll after each Overdepth: 30% at OD1, +5 points per level, capped at 55%; selects only eligible Overdepth artifacts.','baseChance',.25,'increment',.05,'maximumChance',.55)),
    'economicOpportunity',jsonb_build_object('description','Economic cargo awarded on every completed depth','chance',1),
    'nextOverdepth',v_next_overdepth,'nextOverdepthCost',v_next_cost,'money',v_money,'projectedDanger',v_projected_danger,
    'fundingCosts',to_jsonb(array[100000,150000,250000,400000,650000,1000000,1600000,2500000,4000000,6500000]::numeric[]),
    'progressTargets',to_jsonb(array[100,150,200,275,350,450,575,725,900,1100]::integer[]),
    'baseDanger',to_jsonb(array[0,5,10,18,27,38,50,63,75,85]::integer[]),
    'checkpointServices',jsonb_build_object(
      '3',jsonb_build_object('secureCost',public.abandoned_mine_checkpoint_secure_cost(3),'resupplyCost',public.abandoned_mine_checkpoint_resupply_cost(3),'dangerRelief',public.abandoned_mine_checkpoint_danger_relief(3)),
      '6',jsonb_build_object('secureCost',public.abandoned_mine_checkpoint_secure_cost(6),'resupplyCost',public.abandoned_mine_checkpoint_resupply_cost(6),'dangerRelief',public.abandoned_mine_checkpoint_danger_relief(6)),
      '9',jsonb_build_object('secureCost',public.abandoned_mine_checkpoint_secure_cost(9),'resupplyCost',public.abandoned_mine_checkpoint_resupply_cost(9),'dangerRelief',public.abandoned_mine_checkpoint_danger_relief(9))),
    'campDepths',jsonb_build_array(3,6,9),'routeDepths',jsonb_build_array(4,7));
end $$;

revoke all on function public.abandoned_mine_artifact(text,integer,integer),
  public.abandoned_mine_artifact_opportunity_chance(text,integer,integer),
  public.record_abandoned_mine_roll(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_abandoned_mine_roll(uuid,jsonb) to service_role;
revoke all on function public.get_abandoned_mine_dashboard(),public.choose_abandoned_mine_route(bigint,text) from public,anon;
grant execute on function public.get_abandoned_mine_dashboard(),public.choose_abandoned_mine_route(bigint,text) to authenticated;
