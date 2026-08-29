-- Settled Normal Abandoned Mine V1 balance. Hell functions and data are untouched.

update public.abandoned_mine_loot_catalog set duplicate_value=case key
  when 'miners-lamp' then 100000 when 'surveyors-compass' then 150000
  when 'silver-pick' then 250000 when 'foreman-seal' then 400000
  when 'canary-charm' then 600000 when 'vein-prism' then 500000
  when 'descent-chain' then 750000 when 'deepcore-map' then 1000000
  when 'clockwork-drill' then 1250000 when 'royal-claim' then 2000000
  when 'black-geode' then 4000000 when 'bedrock-crown' then 7500000
  else duplicate_value end;

create or replace function public.player_has_mine_artifact(p_player_id uuid,p_artifact_key text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.museum_artifact_registrations
    where player_id=p_player_id and artifact_key=p_artifact_key)
$$;

create or replace function public.abandoned_mine_economic_range(p_depth integer,p_overdepth integer default 0)
returns numeric[] language plpgsql immutable set search_path='' as $$
declare v_min numeric; v_max numeric; v_level integer;
begin
  if p_overdepth<=0 then
    if p_depth not between 1 and 10 then raise exception 'invalid_depth'; end if;
    return array[
      (array[25000,40000,60000,100000,150000,250000,400000,650000,900000,2000000]::numeric[])[p_depth],
      (array[50000,75000,100000,175000,250000,400000,650000,1000000,1400000,3000000]::numeric[])[p_depth]];
  end if;
  if p_overdepth<=6 then
    return array[
      (array[4000000,6000000,9000000,13000000,19000000,27000000]::numeric[])[p_overdepth],
      (array[6000000,9000000,13000000,19000000,27000000,38000000]::numeric[])[p_overdepth]];
  end if;
  v_min:=27000000; v_max:=38000000;
  for v_level in 7..p_overdepth loop
    v_min:=round(v_min*1.35/1000000)*1000000;
    v_max:=round(v_max*1.35/1000000)*1000000;
  end loop;
  return array[v_min,v_max];
end $$;

create or replace function public.abandoned_mine_artifact_opportunity_chance(
  p_opportunity text,p_depth integer,p_overdepth integer default 0)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_chance numeric;
begin
  v_chance:=case p_opportunity
    when 'general_depth' then (array[.15,.15,.15,.20,.20,.20,.25,.25,.25,.40]::numeric[])[greatest(1,least(10,p_depth))]
    when 'rich_vein' then .12 when 'unstable_descent' then .12 when 'd10' then .15
    when 'overdepth' then least(.55,.25+greatest(1,p_overdepth)*.05)
    else 0 end;
  if auth.uid() is not null and public.player_has_mine_artifact(auth.uid(),'deepcore-map') then
    v_chance:=least(1,v_chance*1.05);
  end if;
  return v_chance;
end $$;

create or replace function public.record_normal_abandoned_mine_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs; v_progress integer:=1;
  v_rarity numeric:=greatest(0,coalesce((p_payload->>'rarity')::numeric,0));
  v_weight numeric:=greatest(0,coalesce((p_payload->>'weightMultiplier')::numeric,0));
  v_mutations jsonb:=coalesce(p_payload->'mutationIds','[]'::jsonb);
  v_new_progress integer; v_multiplier numeric:=1; v_value numeric; v_range numeric[]; v_cargo jsonb; v_artifact jsonb;
  v_artifact_factor numeric:=case when public.player_has_mine_artifact(p_player_id,'deepcore-map') then 1.05 else 1 end;
begin
  select * into v_run from public.abandoned_mine_runs where player_id=p_player_id and mode='normal' and status='active' for update;
  if not found then return; end if;
  if v_rarity>=50 then v_progress:=v_progress+1; end if;
  if v_rarity>=1000 then v_progress:=v_progress+3; end if;
  if v_rarity>=10000 then v_progress:=v_progress+7; end if;
  if jsonb_array_length(v_mutations)>0 then v_progress:=v_progress+3; end if;
  if v_weight>=2 then v_progress:=v_progress+3; end if;
  v_new_progress:=least(v_run.target,v_run.progress+v_progress);
  if v_run.progress<v_run.target and v_new_progress>=v_run.target then
    -- Route multipliers apply only to the depth whose route produced them.
    if v_run.overdepth=0 and v_run.depth=4 and v_run.route_d4='rich_vein' then v_multiplier:=1.25; end if;
    if v_run.overdepth=0 and v_run.depth=7 and v_run.route_d7='unstable_descent' then v_multiplier:=1.40; end if;
    v_range:=public.abandoned_mine_economic_range(v_run.depth,v_run.overdepth);
    v_value:=round((v_range[1]+random()*(v_range[2]-v_range[1]))*v_multiplier);
    v_cargo:=jsonb_build_object('kind','cargo','key','economic-cargo','name',coalesce(p_payload->>'gemName','Recovered mineral cargo'),
      'value',v_value,'originalValue',v_value,'remainingValue',v_value,'valueLost',0,
      'depth',v_run.depth,'overdepth',v_run.overdepth,'protected',false);
    v_run.unsecured_cargo:=v_run.unsecured_cargo||jsonb_build_array(v_cargo);
    if v_run.overdepth>0 then
      if random()<least(1,public.abandoned_mine_artifact_opportunity_chance('overdepth',10,v_run.overdepth)*v_artifact_factor) then
        v_artifact:=public.abandoned_mine_artifact('overdepth',10,v_run.overdepth); end if;
    else
      if random()<least(1,public.abandoned_mine_artifact_opportunity_chance('general_depth',v_run.depth,0)*v_artifact_factor) then
        v_artifact:=public.abandoned_mine_artifact('general_depth',v_run.depth,0); end if;
      if v_artifact is not null then v_run.protected_discoveries:=v_run.protected_discoveries||jsonb_build_array(v_artifact); v_artifact:=null; end if;
      if v_run.depth=10 and random()<least(1,public.abandoned_mine_artifact_opportunity_chance('d10',10,0)*v_artifact_factor) then
        v_artifact:=public.abandoned_mine_artifact('d10',10,0); end if;
    end if;
    if v_artifact is not null then v_run.protected_discoveries:=v_run.protected_discoveries||jsonb_build_array(v_artifact); end if;
  end if;
  update public.abandoned_mine_runs set progress=v_new_progress,unsecured_cargo=v_run.unsecured_cargo,
    protected_discoveries=v_run.protected_discoveries,
    status=case when v_new_progress>=target and depth in (3,6,9) and not (v_run.camps @> to_jsonb(array[v_run.depth])) then 'checkpoint_decision'
      when v_new_progress>=target and depth in (4,7) then 'awaiting_route' when v_new_progress>=target and depth=10 then 'ready_to_extract'
      when v_new_progress>=target then 'awaiting_funding' else status end,updated_at=now() where id=v_run.id;
end $$;

-- Normal gem vendor sales only; player-market proceeds are deliberately excluded.
create or replace function public.sell_inventory_gem(p_player_id uuid,p_specimen_id bigint)
returns double precision language plpgsql security definer set search_path='public' as $$
declare v_value double precision; v_locked boolean; v_new_money double precision; v_gem_name text; v_name text;
begin
  select value,locked,gem_name into v_value,v_locked,v_gem_name from public.inventory_gems
    where id=p_specimen_id and player_id=p_player_id for update;
  if not found then raise exception 'gem_not_found'; end if;
  if v_locked then raise exception 'gem_locked'; end if;
  if public.player_has_mine_artifact(p_player_id,'foreman-seal') then v_value:=v_value*1.03; end if;
  update public.players set money=money+v_value,lifetime_earnings=lifetime_earnings+v_value
    where id=p_player_id returning money into v_new_money;
  delete from public.inventory_gems where id=p_specimen_id and player_id=p_player_id;
  begin select username into v_name from public.players where id=p_player_id;
    insert into public.global_cash_events(player_name,gem_name,amount) values(v_name,v_gem_name,v_value);
  exception when others then null; end;
  return v_new_money;
end $$;

create or replace function public.player_market_fee_rate(p_player_id uuid,p_rate numeric)
returns numeric language sql stable security definer set search_path='' as $$
  select greatest(0,coalesce(p_rate,0))*case when public.player_has_mine_artifact(p_player_id,'royal-claim') then .95 else 1 end
$$;

-- Preserve fractional Descent Chain reductions without changing the integer
-- danger columns consumed by Hell mode. Normal incident rolls use this exact value.
alter table public.abandoned_mine_runs add column if not exists normal_danger_exact numeric;
update public.abandoned_mine_runs set normal_danger_exact=danger where mode='normal' and normal_danger_exact is null;

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
  v_cost:=public.abandoned_mine_depth_cost(p_depth);
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
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'incident',v_incident);
end $$;

create or replace function public.continue_mine_overdepth(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_run public.abandoned_mine_runs; v_cost numeric; v_money numeric; v_next integer;
  v_incident text:=null; v_severity_roll numeric; v_loss_percentage numeric; v_loss jsonb; v_unsecured jsonb;
  v_modifier integer; v_exact numeric; v_target_danger integer; v_critical_cutoff numeric:=.92;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=v_uid for update;
  if not found or v_run.mode<>'normal' or v_run.status<>'ready_to_extract' or v_run.depth<>10 then raise exception 'mine_overdepth_unavailable'; end if;
  v_next:=v_run.overdepth+1; v_cost:=public.abandoned_mine_overdepth_cost(v_next);
  update public.players set money=money-v_cost where id=v_uid and money>=v_cost returning money into v_money;
  if not found then raise exception 'insufficient_funds'; end if;
  insert into public.abandoned_mine_funding(run_id,depth,overdepth,amount) values(v_run.id,null,v_next,v_cost);
  update public.abandoned_mine_runs set total_funding=total_funding+v_cost where id=v_run.id returning * into v_run;
  v_unsecured:=v_run.unsecured_cargo; v_modifier:=v_run.danger_modifier;
  v_exact:=case when v_run.normal_danger_exact is null or round(v_run.normal_danger_exact)<>v_run.danger then v_run.danger else v_run.normal_danger_exact end;
  if public.player_has_mine_artifact(v_uid,'canary-charm') then v_critical_cutoff:=.928; end if;
  if random()<v_exact/100 then
    v_severity_roll:=random(); v_incident:=case when v_severity_roll<.65 then 'minor' when v_severity_roll<v_critical_cutoff then 'major' else 'critical' end;
    v_loss_percentage:=case v_incident when 'minor' then round((8+random()*4)::numeric,2)
      when 'major' then round((20+random()*10)::numeric,2) else round((35+random()*15)::numeric,2) end;
    v_loss:=public.abandoned_mine_apply_cargo_loss(v_unsecured,v_loss_percentage); v_unsecured:=v_loss->'cargo';
    if v_incident='major' then v_modifier:=v_modifier+5; end if;
  end if;
  if v_incident is distinct from 'critical' then
    v_modifier:=v_modifier+15; v_target_danger:=public.abandoned_mine_effective_danger(10,v_modifier);
    if public.player_has_mine_artifact(v_uid,'descent-chain') and v_target_danger>v_exact then v_exact:=v_exact+(v_target_danger-v_exact)*.95;
    else v_exact:=v_target_danger; end if;
  end if;
  update public.abandoned_mine_runs set overdepth=case when v_incident='critical' then overdepth else v_next end,
    progress=case when v_incident='critical' then progress else 0 end,
    target=case when v_incident='critical' then target else public.abandoned_mine_depth_target(10,v_next) end,
    danger_modifier=v_modifier,unsecured_cargo=v_unsecured,normal_danger_exact=v_exact,
    danger=case when v_incident='critical' then danger else round(v_exact)::integer end,
    incident_log=case when v_incident is null then incident_log else incident_log||jsonb_build_array(jsonb_build_object(
      'severity',v_incident,'depth',10,'overdepth',v_next,'lossPercentage',v_loss->'lossPercentage','valueBefore',v_loss->'valueBefore',
      'valueLost',v_loss->'valueLost','valueRetained',v_loss->'valueRetained','at',now())) end,
    status=case when v_incident='critical' then 'forced_extraction' else 'active' end,
    extraction_reason=case when v_incident='critical' then 'critical_incident' else extraction_reason end,
    extracted_at=case when v_incident='critical' then now() else extracted_at end,updated_at=now()
    where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'cost',v_cost,'incident',v_incident);
end $$;

create or replace function public.buy_auction(p_auction_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_a public.auctions%rowtype; v_money double precision; v_username text;
  v_price double precision; v_duration_hours integer; v_fee_rate numeric; v_fee numeric; v_seller_proceeds double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if; perform public.settle_due_auctions();
  select * into v_a from public.auctions where id=p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_a.status<>'active' or v_a.ends_at<=now() then raise exception 'auction_closed'; end if;
  if v_a.seller_id=v_uid then raise exception 'cannot_buy_own'; end if;
  v_price:=v_a.start_price; v_duration_hours:=greatest(1,round(extract(epoch from(v_a.ends_at-v_a.created_at))/3600)::integer);
  v_fee_rate:=public.player_market_fee_rate(v_a.seller_id,public._market_sale_fee_rate(v_price,v_duration_hours));
  v_fee:=round(v_price::numeric*v_fee_rate,2); v_seller_proceeds:=v_price-v_fee::double precision;
  select money into v_money from public.players where id=v_uid for update; if v_money<v_price then raise exception 'not_enough_money'; end if;
  if v_a.current_bidder_id is not null and v_a.current_bidder_id<>v_uid and v_a.current_bid is not null then
    update public.players set money=money+v_a.current_bid where id=v_a.current_bidder_id; end if;
  update public.players set money=money-v_price where id=v_uid;
  update public.players set money=money+v_seller_proceeds where id=v_a.seller_id;
  if not found then raise exception 'auction_seller_player_missing:%',p_auction_id; end if;
  if v_a.lot is not null then perform public._auction_restore_lot(v_uid,v_a.lot); else perform public._auction_restore_gem(v_uid,v_a.gem); end if;
  select username into v_username from public.players where id=v_uid;
  update public.auctions set status='sold',settled_at=now(),current_bidder_id=v_uid,current_bidder_name=v_username,
    current_bid=v_price,fee_rate=v_fee_rate,fee_amount=v_fee where id=p_auction_id;
  insert into public.market_fee_transactions(market_type,reference_id,player_id,amount,rate)
    values('listing',p_auction_id,v_a.seller_id,v_fee,v_fee_rate);
  return jsonb_build_object('auctionId',p_auction_id,'price',v_price,'fee',v_fee,'sellerProceeds',v_seller_proceeds,'money',v_money-v_price);
end $$;

create or replace function public.create_gem_order(p_gem_name text,p_price double precision)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_money double precision; v_username text; v_open integer; v_order_id bigint;
  v_name text:=btrim(coalesce(p_gem_name,'')); v_fee_rate numeric; v_fee numeric; v_total double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_name='' then raise exception 'invalid_gem'; end if;
  if p_price is null or p_price<1 or p_price>1e15 then raise exception 'invalid_price'; end if;
  select count(*) into v_open from public.gem_orders where buyer_id=v_uid and status='open';
  if v_open>=10 then raise exception 'too_many_orders'; end if;
  v_fee_rate:=public.player_market_fee_rate(v_uid,public._market_order_fee_rate(p_price));
  v_fee:=round(p_price::numeric*v_fee_rate,2); v_total:=p_price+v_fee::double precision;
  select money into v_money from public.players where id=v_uid for update; if v_money<v_total then raise exception 'not_enough_money'; end if;
  update public.players set money=money-v_total where id=v_uid; select username into v_username from public.players where id=v_uid;
  insert into public.gem_orders(buyer_id,buyer_name,gem_name,price,fee_rate,fee_amount)
    values(v_uid,v_username,v_name,p_price,v_fee_rate,v_fee) returning id into v_order_id;
  insert into public.market_fee_transactions(market_type,reference_id,player_id,amount,rate) values('order',v_order_id,v_uid,v_fee,v_fee_rate);
  return v_order_id;
end $$;

grant execute on function public.buy_auction(bigint),public.create_gem_order(text,double precision) to authenticated;

revoke all on function public.player_has_mine_artifact(uuid,text),public.abandoned_mine_economic_range(integer,integer),
  public.player_market_fee_rate(uuid,numeric),public.record_normal_abandoned_mine_roll(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_normal_abandoned_mine_roll(uuid,jsonb) to service_role;
