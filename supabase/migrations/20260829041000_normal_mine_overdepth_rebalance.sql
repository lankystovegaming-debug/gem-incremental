-- Normal Abandoned Mine Overdepth funding/cargo rebalance.
-- D1-D10 funding and every non-OD mechanic remain unchanged.

create or replace function public.abandoned_mine_overdepth_cost(p_overdepth integer)
returns numeric language plpgsql immutable set search_path='' as $$
declare v_cost numeric; v_level integer;
begin
  if p_overdepth<1 then raise exception 'invalid_overdepth';end if;
  if p_overdepth<=10 then
    return (array[10000000,15000000,22000000,32000000,46000000,66000000,94000000,134000000,190000000,270000000]::numeric[])[p_overdepth];
  end if;
  v_cost:=270000000;
  for v_level in 11..p_overdepth loop
    v_cost:=floor((v_cost*1.4+500000)/1000000)*1000000;
  end loop;
  return v_cost;
end $$;

create or replace function public.abandoned_mine_overdepth_cargo_range(p_overdepth integer)
returns numeric[] language plpgsql immutable set search_path='' as $$
declare lo numeric;hi numeric;lvl integer;
begin
  if p_overdepth<1 then raise exception 'invalid_overdepth';end if;
  if p_overdepth<=10 then
    lo:=(array[2500000,3500000,5000000,7000000,10000000,14000000,19000000,26000000,35000000,47000000]::numeric[])[p_overdepth];
    hi:=(array[4000000,5500000,7500000,10000000,14000000,19000000,26000000,35000000,47000000,63000000]::numeric[])[p_overdepth];
  else
    lo:=47000000;hi:=63000000;
    for lvl in 11..p_overdepth loop
      lo:=floor((lo*1.32+500000)/1000000)*1000000;
      hi:=floor((hi*1.32+500000)/1000000)*1000000;
    end loop;
  end if;
  return array[lo,hi];
end $$;

create or replace function public.abandoned_mine_economic_cargo_value(p_depth integer,p_overdepth integer,p_route_d4 text,p_route_d7 text)
returns numeric language plpgsql volatile set search_path='' as $$
declare bounds numeric[];mult numeric;
begin
  if p_overdepth>0 then
    bounds:=public.abandoned_mine_overdepth_cargo_range(p_overdepth);
    return round(bounds[1]+random()*(bounds[2]-bounds[1]));
  end if;
  mult:=case when p_route_d4='rich_vein' then 1.25 else 1 end*case when p_route_d7='unstable_descent' then 1.4 else 1 end;
  return round((1000+random()*3500)*p_depth*mult);
end $$;

-- Hell Mode has wrapped the normal implementation under this name.
create or replace function public.record_normal_abandoned_mine_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs;v_progress integer:=1;
  v_rarity numeric:=greatest(0,coalesce((p_payload->>'rarity')::numeric,0));
  v_weight numeric:=greatest(0,coalesce((p_payload->>'weightMultiplier')::numeric,0));
  v_mutations jsonb:=coalesce(p_payload->'mutationIds','[]'::jsonb);
  v_new_progress integer;v_value numeric;v_cargo jsonb;v_artifact jsonb;
begin
  select * into v_run from public.abandoned_mine_runs where player_id=p_player_id and mode='normal' and status='active' for update;
  if not found then return;end if;
  if v_rarity>=50 then v_progress:=v_progress+1;end if;if v_rarity>=1000 then v_progress:=v_progress+3;end if;
  if v_rarity>=10000 then v_progress:=v_progress+7;end if;if jsonb_array_length(v_mutations)>0 then v_progress:=v_progress+3;end if;
  if v_weight>=2 then v_progress:=v_progress+3;end if;
  v_new_progress:=least(v_run.target,v_run.progress+v_progress);
  if v_run.progress<v_run.target and v_new_progress>=v_run.target then
    v_value:=public.abandoned_mine_economic_cargo_value(v_run.depth,v_run.overdepth,v_run.route_d4,v_run.route_d7);
    v_cargo:=jsonb_build_object('kind','cargo','key','economic-cargo','name',coalesce(p_payload->>'gemName','Recovered mineral cargo'),'value',v_value,'depth',v_run.depth,'overdepth',v_run.overdepth,'protected',false);
    v_run.unsecured_cargo:=v_run.unsecured_cargo||jsonb_build_array(v_cargo);
    if v_run.overdepth>0 then
      if random()<public.abandoned_mine_artifact_opportunity_chance('overdepth',10,v_run.overdepth) then v_artifact:=public.abandoned_mine_artifact('overdepth',10,v_run.overdepth);end if;
    else
      if random()<public.abandoned_mine_artifact_opportunity_chance('general_depth',v_run.depth,0) then v_artifact:=public.abandoned_mine_artifact('general_depth',v_run.depth,0);end if;
      if v_artifact is not null then v_run.protected_discoveries:=v_run.protected_discoveries||jsonb_build_array(v_artifact);v_artifact:=null;end if;
      if v_run.depth=10 and random()<public.abandoned_mine_artifact_opportunity_chance('d10',10,0) then v_artifact:=public.abandoned_mine_artifact('d10',10,0);end if;
    end if;
    if v_artifact is not null then v_run.protected_discoveries:=v_run.protected_discoveries||jsonb_build_array(v_artifact);end if;
  end if;
  update public.abandoned_mine_runs set progress=v_new_progress,unsecured_cargo=v_run.unsecured_cargo,protected_discoveries=v_run.protected_discoveries,
    status=case when v_new_progress>=target and depth in(3,6,9) and not(v_run.camps@>to_jsonb(array[v_run.depth])) then 'checkpoint_decision'
      when v_new_progress>=target and depth in(4,7) then 'awaiting_route' when v_new_progress>=target and depth=10 then 'ready_to_extract'
      when v_new_progress>=target then 'awaiting_funding' else status end,updated_at=now() where id=v_run.id;
end $$;

revoke all on function public.abandoned_mine_overdepth_cargo_range(integer),public.abandoned_mine_economic_cargo_value(integer,integer,text,text) from public,anon,authenticated;

