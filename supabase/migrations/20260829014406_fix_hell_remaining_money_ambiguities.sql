-- Remove the same PL/pgSQL `money` variable / players.money collision from
-- every remaining Hell action that reads or writes the wallet.

create or replace function public.resolve_abandoned_mine_hell_event(p_run_id bigint,p_option text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs;v_state jsonb;v_event jsonb;v_option jsonb;
  v_cost numeric;v_money numeric:=null;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;
  if not found or v_run.status<>'active' or v_run.hell_state->>'phase'<>'event' then raise exception 'hell_event_unavailable';end if;
  v_state:=v_run.hell_state;v_event:=v_state->'event';
  select value into v_option from jsonb_array_elements(v_event->'options') where value->>'id'=p_option;
  if v_option is null then raise exception 'invalid_hell_event_option';end if;
  v_cost:=coalesce((v_option->>'cost')::numeric,0);
  if v_cost>0 and coalesce(v_state->'doomBreaks','[]') @> '["severed_funding"]' then raise exception 'hell_paid_support_disabled';end if;
  if coalesce((v_option->>'secureCargo')::boolean,false) and coalesce(v_state->'doomBreaks','[]') @> '["broken_safeguards"]' then raise exception 'hell_safeguards_disabled';end if;
  if v_cost>0 then
    update public.players p set money=p.money-v_cost
      where p.id=v_run.player_id and p.money>=v_cost returning p.money into v_money;
    if not found then raise exception 'insufficient_funds';end if;
  end if;
  if coalesce((v_option->>'secureCargo')::boolean,false) then
    v_run.secured_cargo:=v_run.secured_cargo||v_run.unsecured_cargo;v_run.unsecured_cargo:='[]';
  end if;
  v_event:=v_event||jsonb_build_object('resolved',true,'selected',p_option);
  v_state:=v_state||jsonb_build_object('event',v_event,'phase','cards','eventSpend',coalesce((v_state->>'eventSpend')::numeric,0)+v_cost);
  update public.abandoned_mine_runs m set
    danger=greatest(coalesce((v_state->>'dangerFloor')::integer,0),least(100,m.danger+coalesce((v_option->>'dangerDelta')::integer,0))),
    secured_cargo=v_run.secured_cargo,unsecured_cargo=v_run.unsecured_cargo,hell_state=v_state,updated_at=now()
    where m.id=v_run.id returning * into v_run;
  perform public.abandoned_mine_hell_log(v_run,'event_choice',jsonb_build_object('event',v_event->>'name','option',p_option),v_cost);
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money);
end $$;

create or replace function public.reveal_abandoned_mine_hell_card(p_run_id bigint,p_slot integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs;v_state jsonb;v_cards jsonb;v_card jsonb;
  v_cost numeric;v_money numeric;v_disabled boolean;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;
  if not found or v_run.status<>'active' or v_run.hell_state->>'phase'<>'cards' then raise exception 'hell_cards_unavailable';end if;
  v_state:=v_run.hell_state;v_disabled:=coalesce(v_state->'doomBreaks','[]') @> '["shattered_instruments"]';
  if v_disabled then raise exception 'hell_reveals_disabled';end if;
  select value into v_card from jsonb_array_elements(v_state->'cards') where (value->>'slot')::integer=p_slot;
  if v_card is null or (v_card->>'revealed')::boolean then raise exception 'hell_card_invalid';end if;
  v_cost:=(select (value#>>'{}')::numeric from jsonb_array_elements(public.abandoned_mine_hell_config()->'revealCosts') with ordinality a(value,n) where n=v_run.depth);
  v_cost:=v_cost*(1+coalesce((v_state->>'revealTax')::numeric,0));
  update public.players p set money=p.money-v_cost
    where p.id=v_run.player_id and p.money>=v_cost returning p.money into v_money;
  if not found then raise exception 'insufficient_funds';end if;
  select jsonb_agg(case when (value->>'slot')::integer=p_slot then value||'{"revealed":true}'::jsonb else value end order by ordinality)
    into v_cards from jsonb_array_elements(v_state->'cards') with ordinality;
  v_state:=v_state||jsonb_build_object('cards',v_cards,
    'revealsThisDepth',coalesce((v_state->>'revealsThisDepth')::integer,0)+1,
    'cardRevealSpend',coalesce((v_state->>'cardRevealSpend')::numeric,0)+v_cost);
  update public.abandoned_mine_runs set hell_state=v_state,updated_at=now()
    where id=v_run.id returning * into v_run;
  perform public.abandoned_mine_hell_log(v_run,'card_reveal',jsonb_build_object(
    'slot',p_slot,'kind',v_card->>'kind','tier',v_card->>'tier'),v_cost);
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money);
end $$;

create or replace function public.settle_abandoned_mine_hell(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs;v_item jsonb;v_cargo numeric:=0;
  v_registered jsonb:='[]';v_money numeric;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;
  if not found or v_run.status<>'extracted' then raise exception 'hell_not_extracted';end if;
  for v_item in select value from jsonb_array_elements(v_run.secured_cargo) loop
    if v_item->>'kind'='artifact' then
      insert into public.museum_artifact_registrations(player_id,artifact_key,artifact_name,depth_found,discovery_snapshot)
        values(v_run.player_id,v_item->>'key',v_item->>'name',10,v_item) on conflict(player_id,artifact_key)do nothing;
      if found then v_registered:=v_registered||jsonb_build_array(v_item);end if;
    else v_cargo:=v_cargo+coalesce((v_item->>'value')::numeric,0);end if;
  end loop;
  update public.players p set money=p.money+v_cargo,lifetime_earnings=p.lifetime_earnings+v_cargo
    where p.id=v_run.player_id returning p.money into v_money;
  update public.abandoned_mine_runs set status='settled',settled_at=now(),updated_at=now(),
    settlement=jsonb_build_object('cargoValue',v_cargo,'registeredArtifacts',v_registered,'money',v_money,'mode','hell')
    where id=v_run.id returning * into v_run;
  perform public.abandoned_mine_hell_log(v_run,'run_settled',jsonb_build_object(
    'registeredArtifacts',jsonb_array_length(v_registered),'cargoValue',v_cargo));
  return jsonb_build_object('run',to_jsonb(v_run),'settlement',v_run.settlement,'money',v_money);
end $$;

revoke all on function public.resolve_abandoned_mine_hell_event(bigint,text),
  public.reveal_abandoned_mine_hell_card(bigint,integer),
  public.settle_abandoned_mine_hell(bigint) from public,anon;
grant execute on function public.resolve_abandoned_mine_hell_event(bigint,text),
  public.reveal_abandoned_mine_hell_card(bigint,integer),
  public.settle_abandoned_mine_hell(bigint) to authenticated;
