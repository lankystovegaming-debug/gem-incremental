-- Give Hell cards distinct identities while preserving the V1 effect families.
-- A newly generated depth avoids the previous hand where possible. Persisted
-- hands are intentionally left alone so reconnecting cannot reroll cards.

create or replace function public.abandoned_mine_hell_cards_v2(
  p_depth integer,
  p_od integer,
  p_excluded_effects jsonb default '[]'::jsonb
)
returns jsonb language plpgsql volatile set search_path='' as $$
declare
  v_catalog jsonb := '[
    {"cardId":"danger_surge","key":"danger_surge","kind":"curse","name":"Danger Surge"},
    {"cardId":"falling_rock","key":"danger_surge","kind":"curse","name":"Falling Rock"},
    {"cardId":"incident_pressure","key":"incident_pressure","kind":"curse","name":"Incident Pressure"},
    {"cardId":"unstable_timber","key":"incident_pressure","kind":"curse","name":"Unstable Timber"},
    {"cardId":"reveal_tax","key":"reveal_tax","kind":"curse","name":"Reveal Tax"},
    {"cardId":"falsified_ledger","key":"reveal_tax","kind":"curse","name":"Falsified Ledger"},
    {"cardId":"recovery_damage","key":"recovery_damage","kind":"curse","name":"Recovery Damage"},
    {"cardId":"frayed_lifeline","key":"recovery_damage","kind":"curse","name":"Frayed Lifeline"},
    {"cardId":"danger_floor","key":"danger_floor","kind":"curse","name":"Danger Floor"},
    {"cardId":"sealed_air","key":"danger_floor","kind":"curse","name":"Sealed Air"},
    {"cardId":"conditional_risk","key":"conditional_risk","kind":"curse","name":"Hell Pressure"},
    {"cardId":"echoing_steps","key":"conditional_risk","kind":"curse","name":"Echoing Steps"},
    {"cardId":"minor_danger","key":"minor_danger","kind":"lesser","name":"Minor Danger"},
    {"cardId":"dust_cloud","key":"minor_danger","kind":"lesser","name":"Dust Cloud"},
    {"cardId":"next_incident","key":"next_incident","kind":"lesser","name":"Next Incident"},
    {"cardId":"false_alarm","key":"next_incident","kind":"lesser","name":"False Alarm"},
    {"cardId":"next_reveal_tax","key":"next_reveal_tax","kind":"lesser","name":"Next Reveal Tax"},
    {"cardId":"price_gouging","key":"next_reveal_tax","kind":"lesser","name":"Price Gouging"},
    {"cardId":"recovery_wear","key":"recovery_wear","kind":"lesser","name":"Recovery Wear"},
    {"cardId":"damaged_harness","key":"recovery_wear","kind":"lesser","name":"Damaged Harness"},
    {"cardId":"lost_opportunity","key":"lost_opportunity","kind":"lesser","name":"Lost Opportunity"},
    {"cardId":"abandoned_cache","key":"lost_opportunity","kind":"lesser","name":"Abandoned Cache"},
    {"cardId":"mercy","key":"mercy","kind":"lesser","name":"Mercy"},
    {"cardId":"cool_breeze","key":"mercy","kind":"lesser","name":"Cool Breeze"}
  ]'::jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_card jsonb;
  v_picked_effects text[] := '{}'::text[];
  v_kind text;
  v_tier integer := public.abandoned_mine_hell_curse_tier(p_depth,p_od);
  v_triple boolean := p_od>=3 and random()<public.abandoned_mine_hell_triple_chance(p_od);
  i integer;
begin
  for i in 1..3 loop
    v_kind := case when i=3 and not v_triple then 'lesser' else 'curse' end;

    select c.value into v_card
      from jsonb_array_elements(v_catalog) c(value)
      where c.value->>'kind'=v_kind
        and (p_od>0 or c.value->>'key'<>'mercy')
        and not (coalesce(p_excluded_effects,'[]'::jsonb) ? (c.value->>'key'))
        and not ((c.value->>'key')=any(v_picked_effects))
      order by random() limit 1;

    -- The catalogue is large enough for normal play, but this fallback keeps
    -- generation total if a future ruleset supplies an unusually large exclusion.
    if v_card is null then
      select c.value into v_card
        from jsonb_array_elements(v_catalog) c(value)
        where c.value->>'kind'=v_kind
          and (p_od>0 or c.value->>'key'<>'mercy')
          and not ((c.value->>'key')=any(v_picked_effects))
        order by random() limit 1;
    end if;

    v_picked_effects:=array_append(v_picked_effects,v_card->>'key');
    v_cards:=v_cards||jsonb_build_array(
      v_card||jsonb_build_object('slot',i,'revealed',false)||
      case when v_kind='curse' then jsonb_build_object('tier',v_tier) else '{}'::jsonb end
    );
  end loop;

  return (select jsonb_agg(value order by random()) from jsonb_array_elements(v_cards));
end $$;

create or replace function public.abandoned_mine_hell_prepare_depth(
  p_run public.abandoned_mine_runs,
  p_depth integer,
  p_od integer
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  s jsonb:=coalesce(p_run.hell_state,'{}');
  obj jsonb;
  ev jsonb:=null;
  seen jsonb:=coalesce(s->'seenEvents','[]');
  previous_cards jsonb:='[]'::jsonb;
  should_event boolean;
begin
  if jsonb_typeof(s->'cards')='array' then
    select coalesce(jsonb_agg(value->>'key'),'[]'::jsonb)
      into previous_cards from jsonb_array_elements(s->'cards');
  end if;
  obj:=public.abandoned_mine_hell_objective(p_depth,p_od,s->'objective'->>'family');
  should_event:=p_od=0 and (random()<coalesce((public.abandoned_mine_hell_config()->>'eventChance')::numeric,.4)
    or (p_depth=10 and not coalesce((s->>'lateEventSeen')::boolean,false)));
  if should_event then
    ev:=public.abandoned_mine_hell_event(p_depth,seen);
    seen:=seen||jsonb_build_array(ev->>'name');
  end if;
  return s||jsonb_build_object(
    'phase','objective','objective',obj,'event',ev,
    'cards',public.abandoned_mine_hell_cards_v2(p_depth,p_od,previous_cards),
    'selectedCard',null,'lastIncident',null,'revealsThisDepth',0,'seenEvents',seen,
    'lateEventSeen',coalesce((s->>'lateEventSeen')::boolean,false) or (ev is not null and p_depth>=9),
    'tripleCurseChance',public.abandoned_mine_hell_triple_chance(p_od),'depthEnteredAt',now());
end $$;

revoke all on function public.abandoned_mine_hell_cards_v2(integer,integer,jsonb) from public,anon,authenticated;
revoke all on function public.abandoned_mine_hell_prepare_depth(public.abandoned_mine_runs,integer,integer) from public,anon,authenticated;
