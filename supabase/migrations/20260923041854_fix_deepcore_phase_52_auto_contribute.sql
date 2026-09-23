begin;
set local lock_timeout = '10s';

alter table public.deepcore_players
  add column if not exists auto_route text
  check (auto_route in ('crystalline','anomalous'));

create or replace function public.deepcore_set_auto_contribute(
  p_enabled boolean,
  p_min_rarity numeric,
  p_max_rarity numeric,
  p_max_value numeric,
  p_route text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid();
  e public.deepcore_event_state%rowtype;
begin
  if uid is null then raise exception 'auth_required' using errcode='42501'; end if;
  select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
  if p_enabled and (deepcore_private.status()<>'active' or e.phase not in (2,3,4,52)) then
    raise exception 'auto_contribute_unavailable';
  end if;
  if p_enabled and e.phase=52 and (e.route_winner is not null or p_route is null or p_route not in ('crystalline','anomalous')) then
    raise exception 'choose_route';
  end if;
  insert into public.deepcore_players(player_id,auto_contribute,auto_min_rarity,auto_max_rarity,auto_max_value,auto_route)
  values(uid,p_enabled,greatest(1,coalesce(p_min_rarity,1)),p_max_rarity,p_max_value,
    case when e.phase=52 then p_route else null end)
  on conflict(player_id) do update set
    auto_contribute=excluded.auto_contribute,
    auto_min_rarity=excluded.auto_min_rarity,
    auto_max_rarity=excluded.auto_max_rarity,
    auto_max_value=excluded.auto_max_value,
    auto_route=excluded.auto_route,
    updated_at=now();
  return public.get_deepcore_snapshot();
end $$;

create or replace function public.deepcore_auto_contribute_roll(p_player_id uuid,p_specimen jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  e public.deepcore_event_state%rowtype;
  dp public.deepcore_players%rowtype;
  objective text;
  rarity numeric:=coalesce((p_specimen->>'rarity')::numeric,0);
  val numeric:=coalesce((p_specimen->>'value')::numeric,0);
  wm numeric:=coalesce((p_specimen->>'rolled_weight_multiplier')::numeric,0);
  is_dc boolean;
  mutated integer;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
  select * into dp from public.deepcore_players where player_id=p_player_id for update;
  if deepcore_private.status()<>'active' or not coalesce(dp.auto_contribute,false) or e.phase not in (2,3,4,52) then
    return jsonb_build_object('contributed',false);
  end if;
  if rarity<dp.auto_min_rarity
    or (dp.auto_max_rarity is not null and rarity>dp.auto_max_rarity)
    or (dp.auto_max_value is not null and val>dp.auto_max_value) then
    return jsonb_build_object('contributed',false);
  end if;
  if e.phase=2 and rarity between 1000 and 9999 then objective:='legendary';
  elsif e.phase=3 then objective:='value';
  elsif e.phase=4 and rarity between 10000 and 99999 then objective:='mythic';
  elsif e.phase=52 and e.route_winner is null and dp.auto_route='crystalline' and rarity>=100000 then objective:='crystalline';
  elsif e.phase=52 and e.route_winner is null and dp.auto_route='anomalous' and rarity>=1000000
    and exists(select 1 from public.private_feature_gems f where f.name=p_specimen->>'gem_name' and f.special_gem) then objective:='anomalous';
  else return jsonb_build_object('contributed',false);
  end if;
  is_dc:=(p_specimen->>'gem_name') in ('Core Sample','Drillstone','Compression Quartz','Seismic Crystal','Borealite','Mantleheart','Deepcore Geode','Blacksite Crystal','Crystalline Singularity','Ontological Shard','Heart of the Deep');
  mutated:=case when jsonb_array_length(coalesce(p_specimen->'mutation_ids','[]'::jsonb))>0 then 1 else 0 end;
  insert into public.deepcore_sacrifices(player_id,objective,gem_name,rarity,value,final_weight,weight_multiplier,automatic)
  values(p_player_id,objective,p_specimen->>'gem_name',rarity,val,coalesce((p_specimen->>'final_weight')::numeric,0),wm,true);
  update public.deepcore_players set
    sacrificed_value=sacrificed_value+val,
    specimens_sacrificed=specimens_sacrificed+1,
    route_participated=route_participated or objective in ('crystalline','anomalous'),
    deepcore_gems_found=deepcore_gems_found+case when is_dc then 1 else 0 end,
    best_weight_multiplier=greatest(best_weight_multiplier,wm),
    mutated_gems=mutated_gems+mutated,
    updated_at=now()
  where player_id=p_player_id;
  insert into public.deepcore_daily_progress(player_id,shop_day,mutated_gems,deepcore_gems,max_weight,sacrificed_value)
  values(p_player_id,(clock_timestamp() at time zone 'Asia/Singapore')::date,mutated,case when is_dc then 1 else 0 end,wm,val)
  on conflict(player_id,shop_day) do update set
    mutated_gems=public.deepcore_daily_progress.mutated_gems+excluded.mutated_gems,
    deepcore_gems=public.deepcore_daily_progress.deepcore_gems+excluded.deepcore_gems,
    max_weight=greatest(public.deepcore_daily_progress.max_weight,excluded.max_weight),
    sacrificed_value=public.deepcore_daily_progress.sacrificed_value+excluded.sacrificed_value;
  update public.deepcore_event_state set
    legendary_sacrificed=legendary_sacrificed+case when objective='legendary' then 1 else 0 end,
    mythic_sacrificed=mythic_sacrificed+case when objective='mythic' then 1 else 0 end,
    sacrificed_value=sacrificed_value+case when objective='value' then val else 0 end,
    heavy_specimen_met=heavy_specimen_met or (e.phase=4 and wm>=10),
    crystalline_specimens=crystalline_specimens+case when objective='crystalline' then 1 else 0 end,
    anomalous_specimens=anomalous_specimens+case when objective='anomalous' then 1 else 0 end,
    updated_at=now()
  where event_key=e.event_key;
  perform deepcore_private.resolve_route();
  perform deepcore_private.advance_state();
  return jsonb_build_object('contributed',true,'objective',objective);
end $$;

create or replace function deepcore_private.advance_state() returns void
language plpgsql security definer set search_path='' as $$
declare e public.deepcore_event_state%rowtype; idx integer; cycle integer;
begin
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 select coalesce(sum(event_rolls),0) into e.community_rolls from public.deepcore_players;
 if deepcore_private.status() <> 'active' then return; end if;
 loop
  if e.phase=1 and e.effective_funding>=500000000 then
   perform deepcore_private.unlock_reward('phase-1','Survey Complete','[{"id":"deepcore-catalyst","quantity":2}]',1);
   update public.deepcore_event_state set phase=2,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-1','SURVEY COMPLETE',jsonb_build_object('effectiveFunding',e.effective_funding)) on conflict do nothing; e.phase:=2;
  elsif e.phase=2 and e.effective_funding>=1500000000 and e.legendary_sacrificed>=50000 then
   perform deepcore_private.unlock_reward('phase-2','Construction Complete','[{"id":"pressurized-catalyst","quantity":2},{"id":"deepcore-catalyst","quantity":3}]',2);
   update public.deepcore_event_state set phase=3,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-2','CONSTRUCTION COMPLETE',jsonb_build_object('legendarySacrificed',e.legendary_sacrificed)) on conflict do nothing; e.phase:=3;
  elsif e.phase=3 and e.effective_funding>=3000000000 and e.community_rolls>=250000 and e.sacrificed_value>=1000000000 then
   perform deepcore_private.unlock_reward('phase-3','Descent Complete','[{"id":"mythic-potion","quantity":1},{"id":"seismic-potion","quantity":1},{"id":"pressurized-catalyst","quantity":3}]',3);
   update public.deepcore_event_state set phase=4,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-3','DESCENT COMPLETE',jsonb_build_object('communityRolls',e.community_rolls,'sacrificedValue',e.sacrificed_value)) on conflict do nothing; e.phase:=4;
  elsif e.phase=4 and e.effective_funding>=5000000000 and e.mythic_sacrificed>=5000 and e.heavy_specimen_met then
   perform deepcore_private.unlock_reward('phase-4','Bedrock Complete','[{"id":"deepcore-crate","quantity":1}]',4);
   update public.deepcore_event_state set phase=51,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-4','BEDROCK REACHED','{}') on conflict do nothing; e.phase:=51;
  elsif e.phase=51 and e.effective_funding>=6000000000 then
   perform deepcore_private.unlock_reward('phase-5-1','Structure Complete','[{"id":"mythic-potion","quantity":1},{"id":"lucky-potion-4","quantity":1},{"id":"speed-potion-4","quantity":1},{"id":"fortune-potion-4","quantity":1},{"id":"mass-potion-4","quantity":1},{"id":"deepcore-crate","quantity":2}]',5.1);
   update public.deepcore_event_state set phase=52,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-5-1','STRUCTURE ENCOUNTERED','{}') on conflict do nothing; e.phase:=52;
  elsif e.phase=52 and e.route_winner is not null then
   update public.deepcore_event_state set phase=6,updated_at=now() where event_key=e.event_key; e.phase:=6;
  elsif e.phase=6 and e.effective_funding>=10000000000 and e.keyholder_player_id is not null then
   perform deepcore_private.unlock_reward('phase-6','Deepcore Breached','[{"id":"unstable-core","quantity":1},{"id":"seismic-potion","quantity":2},{"id":"deepcore-crate","quantity":2},{"cosmetic":"deepcore-breached"}]',6);
   update public.deepcore_event_state set phase=7,breached_at=coalesce(breached_at,now()),updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-6','THE DEEPCORE KEY',coalesce(e.key_specimen,'{}')) on conflict do nothing; e.phase:=7;
  else exit;
  end if;
  select * into e from public.deepcore_event_state where event_key='deepcore-2026';
 end loop;
 if e.phase=7 then
  for idx in 1..greatest(0,floor((e.effective_funding-10000000000)/500000000)::integer) loop
   cycle:=mod(idx-1,4)+1;
   perform deepcore_private.unlock_reward('stretch-'||idx,'Stretch supply drop',case cycle
    when 1 then '[{"id":"deepcore-catalyst","quantity":1}]'::jsonb
    when 2 then '[{"id":"pressurized-catalyst","quantity":1}]'::jsonb
    when 3 then '[{"id":"deepcore-catalyst","quantity":1},{"id":"pressurized-catalyst","quantity":1}]'::jsonb
    else '[{"id":"deepcore-crate","quantity":1}]'::jsonb end,100+idx,10000000000::numeric+idx::numeric*500000000::numeric);
  end loop;
  if e.effective_funding>=15000000000 then insert into public.deepcore_project_log(entry_key,title,body) values('major-15b','SEISMIC RESEARCH COMPLETED',jsonb_build_object('effectiveFunding',e.effective_funding)) on conflict do nothing; end if;
  if e.effective_funding>=20000000000 then perform deepcore_private.unlock_reward('major-20b','Beyond Bedrock','[{"cosmetic":"deepcore-beyond-bedrock"}]',200,20000000000); end if;
  if e.effective_funding>=25000000000 then perform deepcore_private.unlock_reward('major-25b','Maximum Research Depth','[{"cosmetic":"deepcore-deepest"}]',250,25000000000); end if;
  if e.effective_funding>=20000000000 then insert into public.deepcore_project_log(entry_key,title,body) values('major-20b','BEYOND BEDROCK',jsonb_build_object('effectiveFunding',e.effective_funding)) on conflict do nothing; end if;
  if e.effective_funding>=25000000000 then insert into public.deepcore_project_log(entry_key,title,body) values('major-25b','MAXIMUM RESEARCH DEPTH',jsonb_build_object('effectiveFunding',e.effective_funding)) on conflict do nothing; end if;
 end if;
 update public.deepcore_players set auto_contribute=false where auto_contribute and e.phase not in (2,3,4,52);
end $$;

revoke all on function public.deepcore_set_auto_contribute(boolean,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.deepcore_set_auto_contribute(boolean,numeric,numeric,numeric,text) to authenticated;

commit;
