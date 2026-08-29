-- Enforce the same cumulative caps for Lesser and Curse variants.
-- Existing aggregate state is clamped once so earlier Lesser selections cannot
-- leave a run permanently above the documented limits.

update public.abandoned_mine_runs
set hell_state=jsonb_set(
  jsonb_set(hell_state,'{revealTax}',to_jsonb(least(2,coalesce((hell_state->>'revealTax')::numeric,0))),true),
  '{recoveryPenalty}',to_jsonb(least(.15,coalesce((hell_state->>'recoveryPenalty')::numeric,0))),true)
where mode='hell' and status<>'settled';

create or replace function public.select_abandoned_mine_hell_card(p_run_id bigint,p_slot integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.abandoned_mine_runs;s jsonb;card jsonb;tier integer:=0;delta integer:=0;incident_chance numeric;severity text:=null;crit numeric;artifacts jsonb:='[]';cache jsonb:=null;week date;claims integer:=0;mythic boolean:=false;doom_delta integer:=0;loss_n bigint;cargo_lost integer:=0;
begin
  select * into r from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;
  if not found or r.status<>'active' or r.hell_state->>'phase'<>'cards' then raise exception 'hell_cards_unavailable';end if;s:=r.hell_state;
  select value into card from jsonb_array_elements(s->'cards') where (value->>'slot')::integer=p_slot;if card is null then raise exception 'hell_card_invalid';end if;tier:=coalesce((card->>'tier')::integer,0);
  if card->>'kind'='curse' then
    delta:=case card->>'key' when 'danger_surge' then 5+tier*5 when 'danger_floor' then 3+tier*3 else tier*2 end;
    if card->>'key'='danger_floor' then s:=s||jsonb_build_object('dangerFloor',least(25,coalesce((s->>'dangerFloor')::integer,0)+3+tier*2));end if;
    if card->>'key'='incident_pressure' then s:=s||jsonb_build_object('nextIncidentBonus',coalesce((s->>'nextIncidentBonus')::integer,0)+tier*5);end if;
    if card->>'key'='reveal_tax' then s:=s||jsonb_build_object('revealTax',least(2,coalesce((s->>'revealTax')::numeric,0)+tier*.25));end if;
    if card->>'key'='recovery_damage' then s:=s||jsonb_build_object('recoveryPenalty',least(.15,coalesce((s->>'recoveryPenalty')::numeric,0)+tier*.03));end if;
    doom_delta:=case tier when 1 then 2 when 2 then 5 else 10 end;
  else
    if card->>'key'='mercy' and r.overdepth>0 and not coalesce(s->'doomBreaks','[]') @> '["hope_extinguished"]' then doom_delta:=-(1+floor(random()*5)::integer);
    elsif card->>'key'='next_incident' then s:=s||jsonb_build_object('nextIncidentBonus',coalesce((s->>'nextIncidentBonus')::integer,0)+5);
    elsif card->>'key'='next_reveal_tax' then s:=s||jsonb_build_object('revealTax',least(2,coalesce((s->>'revealTax')::numeric,0)+.15));
    elsif card->>'key'='recovery_wear' then s:=s||jsonb_build_object('recoveryPenalty',least(.15,coalesce((s->>'recoveryPenalty')::numeric,0)+.03));
    else delta:=2+floor(random()*4)::integer;end if;
  end if;
  r.danger:=greatest(coalesce((s->>'dangerFloor')::integer,0),least(100,r.danger+delta));incident_chance:=greatest(.10,least(.90,r.danger::numeric/100+.10+coalesce((s->>'nextIncidentBonus')::numeric,0)/100));
  if random()<incident_chance then
    if r.overdepth>0 then crit:=least(.38,.34+greatest(0,r.overdepth-1)*.003);else crit:=.20+(r.depth-1)*(.13/9);end if;
    if random()<crit then severity:='critical';elsif random()<.50 then severity:='major';else severity:='minor';end if;
    if severity='minor' then r.danger:=least(100,r.danger+2+floor(random()*4)::integer);doom_delta:=doom_delta+case when r.overdepth>0 then 2 else 0 end;
    elsif severity='major' then
      r.danger:=least(100,r.danger+8+floor(random()*8)::integer);doom_delta:=doom_delta+case when r.overdepth>0 then 6 else 0 end;
      if random()<.5 then
        select n into loss_n from jsonb_array_elements(r.unsecured_cargo) with ordinality x(value,n) where value->>'kind' is distinct from 'artifact' order by random() limit 1;
        if loss_n is not null then select coalesce(jsonb_agg(value order by n),'[]') into r.unsecured_cargo from jsonb_array_elements(r.unsecured_cargo) with ordinality x(value,n) where n<>loss_n;cargo_lost:=1;end if;
      end if;
    end if;
  end if;
  s:=s-'nextIncidentBonus';if r.overdepth>0 then s:=public.abandoned_mine_hell_add_doom(s,doom_delta,r.overdepth);end if;
  s:=s||jsonb_build_object('selectedCard',card||'{"revealed":true}'::jsonb,'lastIncident',jsonb_build_object('severity',severity,'chance',incident_chance),'phase',case when severity='critical' then 'forced_extraction' else 'cleared' end);
  if severity='critical' then
    update public.abandoned_mine_runs set danger=r.danger,hell_state=s,status='forced_extraction',extraction_reason='critical_incident',extracted_at=now(),updated_at=now() where id=r.id returning * into r;
    perform public.abandoned_mine_hell_log(r,'forced_extraction',jsonb_build_object('incidentChance',incident_chance,'severity','critical','artifactsLost',(select count(*) from jsonb_array_elements(r.unsecured_cargo)x where x->>'kind'='artifact')));
  else
    -- Reuse the Mine cargo/Museum representation. Hell discoveries remain
    -- unsecured until voluntary extraction; Critical recovery excludes them.
    r.unsecured_cargo:=r.unsecured_cargo||jsonb_build_array(jsonb_build_object('kind','cargo','name','Hell ore cache','value',round((1500+random()*4500)*r.depth*(1+r.overdepth*.2)),'depth',r.depth,'overdepth',r.overdepth));
    if r.overdepth=0 and random()<least(.08,.01+r.depth*.004) then
      r.unsecured_cargo:=r.unsecured_cargo||jsonb_build_array(public.abandoned_mine_artifact(r.depth,0));
    end if;
    if r.depth=10 and r.overdepth=0 and not coalesce((s->>'d10Rewarded')::boolean,false) then
      cache:=public.abandoned_mine_hell_cache(r.player_id);week:=date_trunc('week',now() at time zone 'UTC')::date;
      insert into public.abandoned_mine_hell_weekly_claims(player_id,week_start,mythic_claims)values(r.player_id,week,0)on conflict do nothing;
      update public.abandoned_mine_hell_weekly_claims set mythic_claims=mythic_claims+1 where player_id=r.player_id and week_start=week and mythic_claims<5 returning mythic_claims into claims;
      if found then perform public.expedition_grant_consumable(r.player_id,'mythic-potion',1);mythic:=true;end if;
      s:=s||jsonb_build_object('d10Rewarded',true,'hellCleared',true,'hellCache',cache,'weeklyMythicAwarded',mythic,'weeklyMythicClaims',claims,'phase','cleared');
    elsif r.overdepth>0 then artifacts:=public.abandoned_mine_hell_artifact_roll(r,s);s:=s||jsonb_build_object('artifactRoll',artifacts);r.unsecured_cargo:=r.unsecured_cargo||(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(artifacts)value where not coalesce((value->>'duplicate')::boolean,false));end if;
    update public.abandoned_mine_runs set danger=r.danger,hell_state=s,status='ready_to_extract',unsecured_cargo=r.unsecured_cargo,
      incident_log=incident_log||jsonb_build_array(jsonb_build_object('severity',severity,'depth',depth,'overdepth',overdepth,'at',now())),updated_at=now() where id=r.id returning * into r;
    perform public.abandoned_mine_hell_log(r,'depth_clear',jsonb_build_object('cardKind',card->>'kind','curseTier',tier,'tripleCurse',(select count(*)=3 from jsonb_array_elements(s->'cards')x where x->>'kind'='curse'),'incident',severity,'cargoLost',cargo_lost,'artifactRoll',artifacts,'d10Clear',r.depth=10 and r.overdepth=0));
  end if;return to_jsonb(r);
end $$;

revoke all on function public.select_abandoned_mine_hell_card(bigint,integer) from public,anon;
grant execute on function public.select_abandoned_mine_hell_card(bigint,integer) to authenticated;
