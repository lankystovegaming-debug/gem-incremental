-- Permanent passives from successfully extracted Hell Museum artifacts.
-- Ownership is derived from the registration table, so duplicates never stack.

create or replace function public.expedition_artifact_effects(p_player_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'bonusProgressMultiplier',case when bool_or(artifact_key='charred-miners-tag') then 1.03 else 1 end,
    'doomGainMultiplier',case when bool_or(artifact_key='melted-chain-link') then .97 else 1 end,
    'mutationChanceMultiplier',case when bool_or(artifact_key='crimson-geode') then 1.03 else 1 end,
    'artifactChanceMultiplier',case when bool_or(artifact_key='extinguished-hell-lantern') then 1.03 else 1 end,
    'gemValueMultiplier',case when bool_or(artifact_key='doomstone') then 1.03 else 1 end,
    'luckBonus',case when bool_or(artifact_key='eye-bottomless-mine') then .05 else 0 end)
  from public.museum_artifact_registrations
  where player_id=p_player_id and artifact_key in(
    'charred-miners-tag','melted-chain-link','crimson-geode',
    'extinguished-hell-lantern','doomstone','eye-bottomless-mine');
$$;

create or replace function public.abandoned_mine_hell_add_doom(p_state jsonb,p_amount integer,p_od integer,p_player_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  s jsonb:=p_state; effects jsonb:=public.expedition_artifact_effects(p_player_id);
  adjusted integer:=case when p_amount>0 then ceil(p_amount*coalesce((effects->>'doomGainMultiplier')::numeric,1))::integer else p_amount end;
  doom integer:=greatest(0,coalesce((s->>'doom')::integer,0)+adjusted);
  breaks jsonb:=coalesce(s->'doomBreaks','[]');
  pool text[]:=array['shattered_instruments','broken_safeguards','severed_funding','faulty_warning','torn_records','failed_recovery','hope_extinguished'];pick text;
begin
  while doom>=coalesce((public.abandoned_mine_hell_config()->>'doomThreshold')::integer,90) and jsonb_array_length(breaks)<array_length(pool,1) loop
    select x into pick from unnest(pool)x where not breaks @> jsonb_build_array(x) order by random() limit 1;
    breaks:=breaks||jsonb_build_array(pick);doom:=0;
    s:=s||jsonb_build_object('lastDoomBreak',pick,'firstDoomBreakDepth',coalesce(s->'firstDoomBreakDepth',to_jsonb(p_od)));
  end loop;
  return s||jsonb_build_object('doom',doom,'doomBreaks',breaks);
end $$;

-- Keep existing three-argument callers compatible while routing them through
-- the owning run wherever possible in the updated Hell resolution function.
create or replace function public.abandoned_mine_hell_add_doom(p_state jsonb,p_amount integer,p_od integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  adjusted integer:=case when p_amount>0 then ceil(p_amount*coalesce((p_state->>'doomGainMultiplier')::numeric,1))::integer else p_amount end;
  s jsonb:=p_state;doom integer:=greatest(0,coalesce((s->>'doom')::integer,0)+adjusted);
  breaks jsonb:=coalesce(s->'doomBreaks','[]');
  pool text[]:=array['shattered_instruments','broken_safeguards','severed_funding','faulty_warning','torn_records','failed_recovery','hope_extinguished'];pick text;
begin
  while doom>=coalesce((public.abandoned_mine_hell_config()->>'doomThreshold')::integer,90) and jsonb_array_length(breaks)<array_length(pool,1) loop
    select x into pick from unnest(pool)x where not breaks @> jsonb_build_array(x) order by random() limit 1;
    breaks:=breaks||jsonb_build_array(pick);doom:=0;
    s:=s||jsonb_build_object('lastDoomBreak',pick,'firstDoomBreakDepth',coalesce(s->'firstDoomBreakDepth',to_jsonb(p_od)));
  end loop;
  return s||jsonb_build_object('doom',doom,'doomBreaks',breaks);
end
$$;

create or replace function public.abandoned_mine_hell_prepare_depth(p_run public.abandoned_mine_runs,p_depth integer,p_od integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  s jsonb:=coalesce(p_run.hell_state,'{}'); obj jsonb; ev jsonb:=null;
  seen jsonb:=coalesce(s->'seenEvents','[]'); should_event boolean;
  effects jsonb:=public.expedition_artifact_effects(p_run.player_id);
begin
  obj:=public.abandoned_mine_hell_objective(p_depth,p_od,s->'objective'->>'family');
  should_event:=p_od=0 and (random()<coalesce((public.abandoned_mine_hell_config()->>'eventChance')::numeric,.4)
    or (p_depth=10 and not coalesce((s->>'lateEventSeen')::boolean,false)));
  if should_event then ev:=public.abandoned_mine_hell_event(p_depth,seen);seen:=seen||jsonb_build_array(ev->>'name');end if;
  return s||jsonb_build_object('phase','objective','objective',obj,'event',ev,
    'cards',public.abandoned_mine_hell_cards_v2(p_depth,p_od,coalesce(s->'cards','[]'::jsonb)),
    'selectedCard',null,'lastIncident',null,'revealsThisDepth',0,'seenEvents',seen,
    'doomGainMultiplier',coalesce((effects->>'doomGainMultiplier')::numeric,1),
    'bonusProgressMultiplier',coalesce((effects->>'bonusProgressMultiplier')::numeric,1),
    'lateEventSeen',coalesce((s->>'lateEventSeen')::boolean,false) or (ev is not null and p_depth>=9),
    'tripleCurseChance',public.abandoned_mine_hell_triple_chance(p_od),'depthEnteredAt',now());
end $$;

create or replace function public.abandoned_mine_hell_artifact_roll(p_run public.abandoned_mine_runs,p_state jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  defs jsonb:='[{"key":"charred-miners-tag","name":"Charred Miner''s Tag","min":1,"reward":"fragment","qty":1},{"key":"melted-chain-link","name":"Melted Chain Link","min":3,"reward":"fragment","qty":2},{"key":"crimson-geode","name":"Crimson Geode","min":6,"reward":"legendary-potion","qty":1},{"key":"extinguished-hell-lantern","name":"Extinguished Hell-Lantern","min":10,"reward":"fragment","qty":5},{"key":"doomstone","name":"Doomstone","min":15,"reward":"legendary-potion","qty":2},{"key":"eye-bottomless-mine","name":"Eye of the Bottomless Mine","min":20,"reward":"mythic-potion","qty":1}]';
  d jsonb;odds jsonb:=public.abandoned_mine_hell_config()->'artifactOdds';found jsonb:='[]';registered boolean;qty integer;
  discovery numeric:=coalesce((public.expedition_artifact_effects(p_run.player_id)->>'artifactChanceMultiplier')::numeric,1);
begin
  for d in select value from jsonb_array_elements(defs) loop
    if p_run.overdepth>=(d->>'min')::integer and random()<least(1,coalesce((odds->>(d->>'key'))::numeric,0)*discovery) then
      select exists(select 1 from public.museum_artifact_registrations where player_id=p_run.player_id and artifact_key=d->>'key') into registered;
      qty:=(d->>'qty')::integer;
      if registered then
        if d->>'reward'='fragment' then insert into public.player_hell_resources(player_id,curse_fragments)values(p_run.player_id,qty)on conflict(player_id)do update set curse_fragments=public.player_hell_resources.curse_fragments+excluded.curse_fragments,updated_at=now();
        else perform public.expedition_grant_consumable(p_run.player_id,d->>'reward',qty);end if;
        found:=found||jsonb_build_array(d||jsonb_build_object('duplicate',true));
      else found:=found||jsonb_build_array(d||jsonb_build_object('kind','artifact','collection','hell','depth',10,'overdepth',p_run.overdepth,'duplicate',false));end if;
    end if;
  end loop;return found;
end $$;

create or replace function public.player_expedition_artifact_effects(p_player_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.expedition_artifact_effects(p_player_id)
$$;

revoke all on function public.expedition_artifact_effects(uuid),public.player_expedition_artifact_effects(uuid) from public,anon,authenticated;
grant execute on function public.expedition_artifact_effects(uuid),public.player_expedition_artifact_effects(uuid) to service_role;
