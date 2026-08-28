-- Abandoned Mine: Hell Mode V1
--
-- Hell is an additional server-authoritative mode on the existing Mine run,
-- Museum, consumable, relic and roll infrastructure. Existing runs are normal
-- by default and the normal RPCs continue to own their state machine.

alter table public.abandoned_mine_runs
  add column if not exists mode text not null default 'normal',
  add column if not exists hell_state jsonb not null default '{}'::jsonb;
alter table public.abandoned_mine_runs
  add constraint abandoned_mine_runs_mode_check check (mode in ('normal','hell'));

create table public.abandoned_mine_hell_config (
  id text primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.abandoned_mine_hell_config(id,config) values ('v1', jsonb_build_object(
  'version',1,
  'depthCosts',to_jsonb(array[100000,125000,150000,200000,250000,300000,400000,500000,650000,825000]::numeric[]),
  'revealCosts',to_jsonb(array[100000,150000,250000,400000,650000,1000000,1500000,2250000,3250000,5000000]::numeric[]),
  'doomThreshold',90,'fortunateDescentChance',0.01,'forcedRecoveryMin',0.10,'forcedRecoveryMax',0.25,
  'failedRecoveryMin',0.03,'failedRecoveryMax',0.10,'weeklyMythicCap',5,'eventChance',0.40,
  'tripleCurseCap',0.45,'criticalCap',0.38,
  'artifactOdds',jsonb_build_object('charred-miners-tag',0.125,'melted-chain-link',1.0/12,
    'crimson-geode',0.0625,'extinguished-hell-lantern',0.05,'doomstone',0.0625,'eye-bottomless-mine',0.10)
)) on conflict(id) do update set config=excluded.config,updated_at=now();

create table public.player_hell_resources (
  player_id uuid primary key references public.players(id) on delete cascade,
  curse_fragments bigint not null default 0 check (curse_fragments >= 0),
  updated_at timestamptz not null default now()
);

create table public.abandoned_mine_hell_weekly_claims (
  player_id uuid not null references public.players(id) on delete cascade,
  week_start date not null,
  mythic_claims integer not null default 0 check (mythic_claims between 0 and 5),
  primary key(player_id,week_start)
);

create table public.abandoned_mine_hell_telemetry (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.abandoned_mine_runs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  event_name text not null,
  depth integer not null,
  overdepth integer not null default 0,
  danger integer,
  doom integer,
  spend numeric not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index abandoned_mine_hell_telemetry_run_idx on public.abandoned_mine_hell_telemetry(run_id,id);
create index abandoned_mine_hell_telemetry_balance_idx on public.abandoned_mine_hell_telemetry(event_name,created_at desc);

alter table public.abandoned_mine_hell_config enable row level security;
alter table public.player_hell_resources enable row level security;
alter table public.abandoned_mine_hell_weekly_claims enable row level security;
alter table public.abandoned_mine_hell_telemetry enable row level security;
revoke all on public.abandoned_mine_hell_config,public.player_hell_resources,
  public.abandoned_mine_hell_weekly_claims,public.abandoned_mine_hell_telemetry from public,anon,authenticated;
grant all on public.abandoned_mine_hell_config,public.player_hell_resources,
  public.abandoned_mine_hell_weekly_claims,public.abandoned_mine_hell_telemetry to service_role;

create or replace function public.abandoned_mine_hell_config()
returns jsonb language sql stable security definer set search_path='' as $$
  select config from public.abandoned_mine_hell_config where id='v1'
$$;

create or replace function public.abandoned_mine_hell_log(
  p_run public.abandoned_mine_runs,p_name text,p_data jsonb default '{}'::jsonb,p_spend numeric default 0
) returns void language sql volatile security definer set search_path='' as $$
  insert into public.abandoned_mine_hell_telemetry(run_id,player_id,event_name,depth,overdepth,danger,doom,spend,data)
  values(p_run.id,p_run.player_id,p_name,p_run.depth,p_run.overdepth,p_run.danger,
    coalesce((p_run.hell_state->>'doom')::integer,0),greatest(0,coalesce(p_spend,0)),coalesce(p_data,'{}'::jsonb))
$$;

create or replace function public.abandoned_mine_hell_triple_chance(p_od integer)
returns numeric language sql immutable set search_path='' as $$
  select case when p_od<=2 then 0 when p_od<=10 then .05+(p_od-3)*.025
    when p_od<=15 then .25+(p_od-11)*.025 when p_od<=20 then .37+(p_od-16)*.02 else .45 end
$$;

create or replace function public.abandoned_mine_hell_curse_tier(p_depth integer,p_od integer)
returns integer language plpgsql volatile set search_path='' as $$
declare r numeric:=random(); a numeric; b numeric;
begin
  if p_od=0 then
    if p_depth<=5 then a:=1;b:=0; elsif p_depth<=8 then a:=.95;b:=.05;
    elsif p_depth=9 then a:=.90;b:=.10; else a:=.85;b:=.15; end if;
  elsif p_od<=2 then a:=.75;b:=.25; elsif p_od<=5 then a:=.65;b:=.32;
  elsif p_od<=10 then a:=.55;b:=.38; elsif p_od<=15 then a:=.45;b:=.43;
  elsif p_od<=20 then a:=.38;b:=.45; else a:=.35;b:=.45; end if;
  return case when r<a then 1 when r<a+b then 2 else 3 end;
end $$;

create or replace function public.abandoned_mine_hell_objective(p_depth integer,p_od integer,p_previous text default null)
returns jsonb language plpgsql volatile set search_path='' as $$
declare families text[]; weights numeric[]; family text; r numeric:=random(); acc numeric:=0; i integer;
  rolls integer[]:=array[40,55,75,100,125,160,200,250,300,350];
  mutations integer[]:=array[1,2,2,3,4,5,7,8,10,12];
  values_ numeric[]:=array[50000,70000,90000,125000,160000,200000,250000,320000,400000,500000];
  weights_ numeric[]:=array[25000,35000,50000,70000,90000,115000,145000,180000,220000,260000];
  weight_hunt numeric[]:=array[2,2.5,3,3.5,4,5,6,7,8,9];
  rarity numeric[]:=array[500,1000,2500,5000,10000,15000,25000,50000,75000,100000];
  target numeric; fallback integer; objective jsonb;
begin
  if p_od>0 then
    families:=array['roll_count','value_generated','total_weight','mutation_hunt','rarity_hunt','weight_hunt'];
    if p_od<=5 then weights:=array[.25,.20,.20,.15,.10,.10];
    elsif p_od<=15 then weights:=array[.30,.20,.20,.15,.075,.075]; else weights:=array[.35,.20,.20,.15,.05,.05]; end if;
  elsif p_depth<=3 then families:=array['roll_count','rarity_hunt','weight_hunt','mutation_hunt','value_generated','total_weight'];weights:=array[.30,.20,.15,.15,.10,.10];
  elsif p_depth<=5 then families:=array['roll_count','rarity_hunt','weight_hunt','mutation_hunt','value_generated','total_weight','rare_or_grind','weight_or_grind'];weights:=array[.20,.20,.15,.15,.10,.10,.05,.05];
  elsif p_depth<=7 then families:=array['roll_count','rarity_hunt','weight_hunt','mutation_hunt','value_generated','total_weight','rare_or_grind','weight_or_grind','combined'];weights:=array[.15,.15,.15,.10,.10,.10,.10,.10,.05];
  else families:=array['roll_count','rarity_hunt','weight_hunt','mutation_hunt','value_generated','total_weight','rare_or_grind','weight_or_grind','combined'];weights:=array[.10,.15,.15,.10,.10,.10,.10,.10,.10]; end if;
  for i in 1..array_length(families,1) loop
    if families[i]=p_previous then weights[i]:=0; end if;
  end loop;
  r:=random()*(select sum(x) from unnest(weights)x);
  for i in 1..array_length(families,1) loop acc:=acc+weights[i];if r<=acc then family:=families[i];exit;end if;end loop;
  family:=coalesce(family,families[1]);
  if p_od>0 then
    fallback:=300+floor(random()*51)::integer;
    target:=case family when 'roll_count' then fallback when 'value_generated' then 400000+floor(random()*100001)
      when 'total_weight' then 220000+floor(random()*40001) when 'mutation_hunt' then 10+floor(random()*3)
      when 'rarity_hunt' then 75000+floor(random()*25001) else 8+floor(random()*2) end;
  else
    fallback:=rolls[p_depth];
    target:=case family when 'roll_count' then rolls[p_depth] when 'rarity_hunt' then rarity[p_depth]
      when 'weight_hunt' then weight_hunt[p_depth] when 'mutation_hunt' then mutations[p_depth]
      when 'value_generated' then values_[p_depth] when 'total_weight' then weights_[p_depth]
      when 'rare_or_grind' then rarity[p_depth] when 'weight_or_grind' then weight_hunt[p_depth]
      when 'combined' then (array[1000,2500,5000,10000,25000]::numeric[])[p_depth-5] end;
  end if;
  objective:=jsonb_build_object('family',family,'target',target,'fallback',case when family in ('rare_or_grind','weight_or_grind','combined') or (family='weight_hunt' and p_depth>=8 and p_od=0) then fallback else null end,
    'weightTarget',case when family='combined' then (array[3,3.5,4,4.5,5]::numeric[])[p_depth-5] else null end,
    'progress',0,'rolls',0,'startedAt',now());
  return objective;
end $$;

create or replace function public.abandoned_mine_hell_cards(p_depth integer,p_od integer)
returns jsonb language plpgsql volatile set search_path='' as $$
declare curse_pool text[]:=array['danger_surge','incident_pressure','reveal_tax','recovery_damage','danger_floor','conditional_risk'];
  lesser_pool text[]:=array['minor_danger','next_incident','next_reveal_tax','recovery_wear','lost_opportunity','mercy'];
  cards jsonb:='[]'; picked text[]:='{}'; key text; tier integer; i integer; triple boolean:=p_od>=3 and random()<public.abandoned_mine_hell_triple_chance(p_od);
begin
  for i in 1..3 loop
    if i=3 and not triple then
      key:=lesser_pool[1+floor(random()*(case when p_od>0 then 6 else 5 end))::integer];
      cards:=cards||jsonb_build_array(jsonb_build_object('slot',i,'kind','lesser','key',key,'name',initcap(replace(key,'_',' ')),'revealed',false));
    else
      loop key:=curse_pool[1+floor(random()*array_length(curse_pool,1))::integer];exit when not key=any(picked);end loop;
      picked:=array_append(picked,key);tier:=public.abandoned_mine_hell_curse_tier(p_depth,p_od);
      cards:=cards||jsonb_build_array(jsonb_build_object('slot',i,'kind','curse','key',key,'name',initcap(replace(key,'_',' ')),'tier',tier,'revealed',false));
    end if;
  end loop;
  return (select jsonb_agg(value order by random()) from jsonb_array_elements(cards));
end $$;

create or replace function public.abandoned_mine_hell_event(p_depth integer,p_seen jsonb)
returns jsonb language plpgsql volatile set search_path='' as $$
declare names text[]:=array['Forked Mineworks','Collapsed Junction','Flooded Galleries','Old Railway','Ventilation Network','Deep Shaft','Exposed Ore Vein','Broken Mine Railway','Functional Cargo Lift','Failing Supports','Abandoned Survey Station','Sealed Mining Chamber']; n text;
begin
  select x into n from unnest(names)x where not coalesce(p_seen,'[]') @> jsonb_build_array(x) order by random() limit 1;
  return jsonb_build_object('name',n,'kind',case when array_position(names,n)<=6 then 'route' else 'situation' end,
    'resolved',false,'options',jsonb_build_array(
      jsonb_build_object('id','safe','label','Take the surveyed route','cost',case when p_depth>=9 then 3000000 when p_depth>=6 then 1500000 else 500000 end,'dangerDelta',-least(15,5+p_depth),'info','Exact'),
      jsonb_build_object('id','free','label','Push through without support','cost',0,'dangerDelta',5+floor(p_depth/2),'info','Vague'),
      jsonb_build_object('id','secure','label','Hire a recovery crew','cost',case when p_depth>=9 then 5000000 else 2000000 end,'dangerDelta',-3,'secureCargo',true,'info','???')));
end $$;

create or replace function public.abandoned_mine_hell_prepare_depth(p_run public.abandoned_mine_runs,p_depth integer,p_od integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s jsonb:=coalesce(p_run.hell_state,'{}'); obj jsonb; ev jsonb:=null; seen jsonb:=coalesce(s->'seenEvents','[]'); should_event boolean;
begin
  obj:=public.abandoned_mine_hell_objective(p_depth,p_od,s->'objective'->>'family');
  should_event:=p_od=0 and (random()<coalesce((public.abandoned_mine_hell_config()->>'eventChance')::numeric,.4)
    or (p_depth=10 and not coalesce((s->>'lateEventSeen')::boolean,false)));
  if should_event then ev:=public.abandoned_mine_hell_event(p_depth,seen);seen:=seen||jsonb_build_array(ev->>'name');end if;
  return s||jsonb_build_object('phase','objective','objective',obj,'event',ev,'cards',public.abandoned_mine_hell_cards(p_depth,p_od),
    'selectedCard',null,'lastIncident',null,'revealsThisDepth',0,'seenEvents',seen,
    'lateEventSeen',coalesce((s->>'lateEventSeen')::boolean,false) or (ev is not null and p_depth>=9),
    'tripleCurseChance',public.abandoned_mine_hell_triple_chance(p_od),'depthEnteredAt',now());
end $$;

create or replace function public.start_abandoned_mine_hell()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.abandoned_mine_runs;
begin
  if uid is null then raise exception 'not_authenticated';end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||uid::text));
  if exists(select 1 from public.abandoned_mine_runs where player_id=uid and status<>'settled') then raise exception 'mine_run_already_open';end if;
  insert into public.abandoned_mine_runs(player_id,mode,hell_state)
  values(uid,'hell',jsonb_build_object('phase','awaiting_funding','doom',0,'doomBreaks','[]'::jsonb,'seenEvents','[]'::jsonb,'d10Rewarded',false,'hellCleared',false)) returning * into r;
  perform public.abandoned_mine_hell_log(r,'run_start');
  return to_jsonb(r);
end $$;

create or replace function public.fund_abandoned_mine_hell(p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.abandoned_mine_runs; cfg jsonb:=public.abandoned_mine_hell_config(); cost numeric; money numeric; state jsonb;
begin
  if uid is null then raise exception 'not_authenticated';end if;perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||uid::text));
  select * into r from public.abandoned_mine_runs where player_id=uid and status<>'settled' for update;
  if not found then perform public.start_abandoned_mine_hell();select * into r from public.abandoned_mine_runs where player_id=uid and status<>'settled' for update;end if;
  if r.mode<>'hell' or p_depth<>r.depth+1 or p_depth not between 1 and 10 or
    not (r.depth=0 or (r.status='ready_to_extract' and r.overdepth=0 and r.depth<10)) then raise exception 'hell_depth_out_of_sequence';end if;
  cost:=(select (value#>>'{}')::numeric from jsonb_array_elements(cfg->'depthCosts') with ordinality a(value,n) where n=p_depth);
  update public.players set money=money-cost where id=uid and money>=cost returning money into money;if not found then raise exception 'insufficient_funds';end if;
  state:=public.abandoned_mine_hell_prepare_depth(r,p_depth,0);
  insert into public.abandoned_mine_funding(run_id,depth,amount) values(r.id,p_depth,cost);
  update public.abandoned_mine_runs set depth=p_depth,progress=0,target=coalesce((state->'objective'->>'fallback')::integer,(state->'objective'->>'target')::integer),
    danger=greatest(0,coalesce((state->>'dangerFloor')::integer,0)),status='active',hell_state=state,total_funding=total_funding+cost,updated_at=now() where id=r.id returning * into r;
  perform public.abandoned_mine_hell_log(r,'depth_enter',jsonb_build_object('objective',state->'objective','event',state->'event'),cost);
  return jsonb_build_object('run',to_jsonb(r),'money',money);
end $$;

-- Preserve the existing normal roll implementation behind a mode-aware wrapper.
alter function public.record_abandoned_mine_roll(uuid,jsonb) rename to record_normal_abandoned_mine_roll;

create or replace function public.record_abandoned_mine_hell_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r public.abandoned_mine_runs; s jsonb; o jsonb; family text; rolls integer; progress numeric; target numeric; complete boolean:=false;
  rarity numeric:=greatest(0,coalesce((p_payload->>'rarity')::numeric,0));wm numeric:=greatest(0,coalesce((p_payload->>'weightMultiplier')::numeric,0));
  value_ numeric:=greatest(0,coalesce((p_payload->>'displayedValue')::numeric,0));weight_ numeric:=greatest(0,coalesce((p_payload->>'finalWeight')::numeric,0));mutated boolean:=jsonb_array_length(coalesce(p_payload->'mutationIds','[]'))>0;
  elapsed integer;
begin
  select * into r from public.abandoned_mine_runs where player_id=p_player_id and mode='hell' and status='active' for update;
  if not found then return;end if;s:=r.hell_state;if s->>'phase'<>'objective' then return;end if;o:=s->'objective';family:=o->>'family';rolls:=coalesce((o->>'rolls')::integer,0)+1;progress:=coalesce((o->>'progress')::numeric,0);target:=(o->>'target')::numeric;
  progress:=case family when 'roll_count' then rolls when 'rarity_hunt' then greatest(progress,rarity) when 'weight_hunt' then greatest(progress,wm)
    when 'mutation_hunt' then progress+case when mutated then 1 else 0 end when 'value_generated' then progress+value_
    when 'total_weight' then progress+weight_ when 'rare_or_grind' then greatest(progress,rarity) when 'weight_or_grind' then greatest(progress,wm)
    when 'combined' then greatest(progress,case when rarity>=target and wm>=coalesce((o->>'weightTarget')::numeric,0) then target else 0 end) else rolls end;
  complete:=progress>=target or (o->>'fallback' is not null and rolls>=(o->>'fallback')::integer);
  o:=o||jsonb_build_object('rolls',rolls,'progress',progress);
  if complete then
    elapsed:=greatest(0,extract(epoch from now()-(o->>'startedAt')::timestamptz)::integer);
    s:=s||jsonb_build_object('objective',o||jsonb_build_object('completedAt',now()),'phase',case when s->'event' is not null then 'event' else 'cards' end);
    update public.abandoned_mine_runs set hell_state=s,progress=rolls,target=rolls,status='active',updated_at=now() where id=r.id returning * into r;
    perform public.abandoned_mine_hell_log(r,'objective_complete',jsonb_build_object('family',family,'target',target,'rolls',rolls,'seconds',elapsed));
  else update public.abandoned_mine_runs set hell_state=s||jsonb_build_object('objective',o),progress=rolls,updated_at=now() where id=r.id;end if;
end $$;

create or replace function public.record_abandoned_mine_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.abandoned_mine_runs where player_id=p_player_id and mode='hell' and status<>'settled') then
    perform public.record_abandoned_mine_hell_roll(p_player_id,p_payload);
  else perform public.record_normal_abandoned_mine_roll(p_player_id,p_payload);end if;
end $$;

create or replace function public.resolve_abandoned_mine_hell_event(p_run_id bigint,p_option text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.abandoned_mine_runs; s jsonb; ev jsonb; opt jsonb; cost numeric; money numeric:=null;
begin
  select * into r from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;
  if not found or r.status<>'active' or r.hell_state->>'phase'<>'event' then raise exception 'hell_event_unavailable';end if;
  s:=r.hell_state;ev:=s->'event';select value into opt from jsonb_array_elements(ev->'options') where value->>'id'=p_option;
  if opt is null then raise exception 'invalid_hell_event_option';end if;cost:=coalesce((opt->>'cost')::numeric,0);
  if cost>0 and coalesce(s->'doomBreaks','[]') @> '["severed_funding"]' then raise exception 'hell_paid_support_disabled';end if;
  if coalesce((opt->>'secureCargo')::boolean,false) and coalesce(s->'doomBreaks','[]') @> '["broken_safeguards"]' then raise exception 'hell_safeguards_disabled';end if;
  if cost>0 then update public.players set money=money-cost where id=r.player_id and money>=cost returning money into money;if not found then raise exception 'insufficient_funds';end if;end if;
  if coalesce((opt->>'secureCargo')::boolean,false) then r.secured_cargo:=r.secured_cargo||r.unsecured_cargo;r.unsecured_cargo:='[]';end if;
  ev:=ev||jsonb_build_object('resolved',true,'selected',p_option);
  s:=s||jsonb_build_object('event',ev,'phase','cards','eventSpend',coalesce((s->>'eventSpend')::numeric,0)+cost);
  update public.abandoned_mine_runs set danger=greatest(coalesce((s->>'dangerFloor')::integer,0),least(100,danger+coalesce((opt->>'dangerDelta')::integer,0))),
    secured_cargo=r.secured_cargo,unsecured_cargo=r.unsecured_cargo,hell_state=s,updated_at=now() where id=r.id returning * into r;
  perform public.abandoned_mine_hell_log(r,'event_choice',jsonb_build_object('event',ev->>'name','option',p_option),cost);
  return jsonb_build_object('run',to_jsonb(r),'money',money);
end $$;

create or replace function public.reveal_abandoned_mine_hell_card(p_run_id bigint,p_slot integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.abandoned_mine_runs;s jsonb;cards jsonb;card jsonb;cost numeric;money numeric;disabled boolean;
begin
  select * into r from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;
  if not found or r.status<>'active' or r.hell_state->>'phase'<>'cards' then raise exception 'hell_cards_unavailable';end if;
  s:=r.hell_state;disabled:=coalesce(s->'doomBreaks','[]') @> '["shattered_instruments"]';if disabled then raise exception 'hell_reveals_disabled';end if;
  select value into card from jsonb_array_elements(s->'cards') where (value->>'slot')::integer=p_slot;if card is null or (card->>'revealed')::boolean then raise exception 'hell_card_invalid';end if;
  cost:=(select (value#>>'{}')::numeric from jsonb_array_elements(public.abandoned_mine_hell_config()->'revealCosts') with ordinality a(value,n) where n=r.depth);
  cost:=cost*(1+coalesce((s->>'revealTax')::numeric,0));update public.players set money=money-cost where id=r.player_id and money>=cost returning money into money;if not found then raise exception 'insufficient_funds';end if;
  select jsonb_agg(case when (value->>'slot')::integer=p_slot then value||'{"revealed":true}'::jsonb else value end order by ordinality) into cards from jsonb_array_elements(s->'cards') with ordinality;
  s:=s||jsonb_build_object('cards',cards,'revealsThisDepth',coalesce((s->>'revealsThisDepth')::integer,0)+1,'cardRevealSpend',coalesce((s->>'cardRevealSpend')::numeric,0)+cost);
  update public.abandoned_mine_runs set hell_state=s,updated_at=now() where id=r.id returning * into r;perform public.abandoned_mine_hell_log(r,'card_reveal',jsonb_build_object('slot',p_slot,'kind',card->>'kind','tier',card->>'tier'),cost);
  return jsonb_build_object('run',to_jsonb(r),'money',money);
end $$;

create or replace function public.abandoned_mine_hell_add_doom(p_state jsonb,p_amount integer,p_od integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s jsonb:=p_state;doom integer:=greatest(0,coalesce((s->>'doom')::integer,0)+p_amount);breaks jsonb:=coalesce(s->'doomBreaks','[]');pool text[]:=array['shattered_instruments','broken_safeguards','severed_funding','faulty_warning','torn_records','failed_recovery','hope_extinguished'];pick text;
begin
  while doom>=coalesce((public.abandoned_mine_hell_config()->>'doomThreshold')::integer,90) and jsonb_array_length(breaks)<array_length(pool,1) loop
    select x into pick from unnest(pool)x where not breaks @> jsonb_build_array(x) order by random() limit 1;breaks:=breaks||jsonb_build_array(pick);doom:=0;
    s:=s||jsonb_build_object('lastDoomBreak',pick,'firstDoomBreakDepth',coalesce(s->'firstDoomBreakDepth',to_jsonb(p_od)));
  end loop;return s||jsonb_build_object('doom',doom,'doomBreaks',breaks);
end $$;

create or replace function public.abandoned_mine_hell_artifact_roll(p_run public.abandoned_mine_runs,p_state jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare defs jsonb:='[{"key":"charred-miners-tag","name":"Charred Miner''s Tag","min":1,"reward":"fragment","qty":1},{"key":"melted-chain-link","name":"Melted Chain Link","min":3,"reward":"fragment","qty":2},{"key":"crimson-geode","name":"Crimson Geode","min":6,"reward":"legendary-potion","qty":1},{"key":"extinguished-hell-lantern","name":"Extinguished Hell-Lantern","min":10,"reward":"fragment","qty":5},{"key":"doomstone","name":"Doomstone","min":15,"reward":"legendary-potion","qty":2},{"key":"eye-bottomless-mine","name":"Eye of the Bottomless Mine","min":20,"reward":"mythic-potion","qty":1}]';d jsonb;odds jsonb:=public.abandoned_mine_hell_config()->'artifactOdds';found jsonb:='[]';registered boolean;qty integer;
begin
  for d in select value from jsonb_array_elements(defs) loop
    if p_run.overdepth>=(d->>'min')::integer and random()<coalesce((odds->>(d->>'key'))::numeric,0) then
      select exists(select 1 from public.museum_artifact_registrations where player_id=p_run.player_id and artifact_key=d->>'key') into registered;
      qty:=(d->>'qty')::integer;
      if registered then
        if d->>'reward'='fragment' then insert into public.player_hell_resources(player_id,curse_fragments)values(p_run.player_id,qty)on conflict(player_id)do update set curse_fragments=public.player_hell_resources.curse_fragments+excluded.curse_fragments,updated_at=now();
        else perform public.expedition_grant_consumable(p_run.player_id,d->>'reward',qty);end if;
        found:=found||jsonb_build_array(d||jsonb_build_object('duplicate',true));
      else
        found:=found||jsonb_build_array(d||jsonb_build_object('kind','artifact','collection','hell','depth',10,'overdepth',p_run.overdepth,'duplicate',false));
      end if;
    end if;
  end loop;return found;
end $$;

create or replace function public.abandoned_mine_hell_cache(p_uid uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r numeric:=random();high jsonb;minor jsonb:='[]';x numeric;i integer;cid text;qty integer;fragments integer:=0;
begin
  if r<.30 then cid:='legendary-potion';qty:=2;high:=jsonb_build_object('type','consumable','id',cid,'quantity',qty);
  elsif r<.52 then cid:='legendary-potion';qty:=3;high:=jsonb_build_object('type','consumable','id',cid,'quantity',qty);
  elsif r<.72 then cid:='mythic-potion';qty:=1;high:=jsonb_build_object('type','consumable','id',cid,'quantity',qty);
  elsif r<.84 then perform public.expedition_grant_relic(p_uid,'Ancient Relic',2);high:='{"type":"relic","id":"Ancient Relic","quantity":2}'::jsonb;
  elsif r<.92 then cid:='legendary-potion';qty:=5;high:=jsonb_build_object('type','consumable','id',cid,'quantity',qty);
  elsif r<.96 then cid:='mythic-potion';qty:=2;high:=jsonb_build_object('type','consumable','id',cid,'quantity',qty);
  elsif r<.985 then fragments:=fragments+10;high:='{"type":"curse_fragments","quantity":10,"tier":"premium"}'::jsonb;
  elsif r<.995 then insert into public.player_achievement_cosmetics(player_id,cosmetic_id,cosmetic_type)values(p_uid,'hell-cache-ember','badge')on conflict do nothing;high:='{"type":"cosmetic","id":"hell-cache-ember"}'::jsonb;
  else perform public.expedition_grant_consumable(p_uid,'mythic-potion',3);perform public.expedition_grant_relic(p_uid,'Ancient Relic',5);high:='{"type":"jackpot","mythicPotions":3,"ancientRelics":5}'::jsonb;end if;
  if cid is not null then perform public.expedition_grant_consumable(p_uid,cid,qty);end if;
  for i in 1..3 loop x:=random();if x<.45 then qty:=1;fragments:=fragments+qty;minor:=minor||jsonb_build_array(jsonb_build_object('type','curse_fragments','quantity',qty));
    elsif x<.70 then qty:=2;fragments:=fragments+qty;minor:=minor||jsonb_build_array(jsonb_build_object('type','curse_fragments','quantity',qty));
    elsif x<.80 then qty:=3;fragments:=fragments+qty;minor:=minor||jsonb_build_array(jsonb_build_object('type','curse_fragments','quantity',qty));
    else cid:=(array['lucky-potion-3','speed-potion-3','fortune-potion-3','mass-potion-3'])[1+floor(random()*4)::integer];qty:=case when x<.95 then 1 else 2 end;perform public.expedition_grant_consumable(p_uid,cid,qty);minor:=minor||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',qty));end if;end loop;
  if fragments>0 then insert into public.player_hell_resources(player_id,curse_fragments)values(p_uid,fragments)on conflict(player_id)do update set curse_fragments=public.player_hell_resources.curse_fragments+excluded.curse_fragments,updated_at=now();end if;
  return jsonb_build_object('highEnd',high,'minor',minor);
end $$;

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
    elsif card->>'key'='next_reveal_tax' then s:=s||jsonb_build_object('revealTax',coalesce((s->>'revealTax')::numeric,0)+.15);
    elsif card->>'key'='recovery_wear' then s:=s||jsonb_build_object('recoveryPenalty',coalesce((s->>'recoveryPenalty')::numeric,0)+.03);
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

create or replace function public.continue_abandoned_mine_hell_overdepth(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.abandoned_mine_runs;s jsonb;delta integer;
begin
  select * into r from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;
  if not found or r.status<>'ready_to_extract' or r.depth<>10 then raise exception 'hell_overdepth_unavailable';end if;
  if random()<coalesce((public.abandoned_mine_hell_config()->>'fortunateDescentChance')::numeric,.01) then delta:=-(1+floor(random()*8)::integer);else delta:=3+floor(random()*6)::integer;end if;
  s:=public.abandoned_mine_hell_add_doom(r.hell_state,delta,r.overdepth+1);r.overdepth:=r.overdepth+1;s:=public.abandoned_mine_hell_prepare_depth(r,10,r.overdepth)||jsonb_build_object('doom',s->'doom','doomBreaks',s->'doomBreaks','lastDoomBreak',s->'lastDoomBreak','firstDoomBreakDepth',s->'firstDoomBreakDepth');
  update public.abandoned_mine_runs set overdepth=r.overdepth,progress=0,target=coalesce((s->'objective'->>'fallback')::integer,(s->'objective'->>'target')::integer),hell_state=s,status='active',updated_at=now() where id=r.id returning * into r;
  perform public.abandoned_mine_hell_log(r,case when r.overdepth=1 then 'overdepth_entry' else 'overdepth_descend' end,jsonb_build_object('doomDelta',delta,'doomBreak',s->'lastDoomBreak'));
  return to_jsonb(r);
end $$;

create or replace function public.extract_abandoned_mine_hell(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.abandoned_mine_runs;cfg jsonb:=public.abandoned_mine_hell_config();rate numeric;eligible jsonb:='[]';item jsonb;count_ integer;take_ integer;artifacts_lost integer:=0;
begin
  select * into r from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;
  if not found or r.status not in ('ready_to_extract','forced_extraction') then raise exception 'hell_extraction_unavailable';end if;
  if r.status='ready_to_extract' then r.secured_cargo:=r.secured_cargo||r.unsecured_cargo;r.unsecured_cargo:='[]';r.status:='extracted';r.extraction_reason:='voluntary';
  else
    select count(*) into artifacts_lost from jsonb_array_elements(r.unsecured_cargo)x where x->>'kind'='artifact';
    select coalesce(jsonb_agg(value),'[]') into eligible from jsonb_array_elements(r.unsecured_cargo)value where value->>'kind' is distinct from 'artifact';count_:=jsonb_array_length(eligible);
    if coalesce(r.hell_state->'doomBreaks','[]') @> '["failed_recovery"]' then rate:=(cfg->>'failedRecoveryMin')::numeric+random()*((cfg->>'failedRecoveryMax')::numeric-(cfg->>'failedRecoveryMin')::numeric);
    else rate:=(cfg->>'forcedRecoveryMin')::numeric+random()*((cfg->>'forcedRecoveryMax')::numeric-(cfg->>'forcedRecoveryMin')::numeric)-coalesce((r.hell_state->>'recoveryPenalty')::numeric,0);end if;rate:=greatest(0,rate);take_:=floor(count_*rate)::integer+case when random()<(count_*rate-floor(count_*rate)) then 1 else 0 end;
    select coalesce(jsonb_agg(value),'[]') into eligible from (select value from jsonb_array_elements(eligible)value order by random() limit take_)x;r.secured_cargo:=r.secured_cargo||eligible;r.unsecured_cargo:='[]';r.status:='extracted';
  end if;
  update public.abandoned_mine_runs set secured_cargo=r.secured_cargo,unsecured_cargo='[]',status=r.status,extraction_reason=coalesce(r.extraction_reason,'critical_incident'),extracted_at=coalesce(extracted_at,now()),updated_at=now() where id=r.id returning * into r;
  perform public.abandoned_mine_hell_log(r,case when r.extraction_reason='voluntary' then 'voluntary_extraction' else 'forced_recovery' end,jsonb_build_object('artifactsLost',artifacts_lost,'recovered',jsonb_array_length(eligible)));
  return to_jsonb(r);
end $$;

create or replace function public.settle_abandoned_mine_hell(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.abandoned_mine_runs;item jsonb;cargo numeric:=0;registered jsonb:='[]';money numeric;
begin
  select * into r from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;if not found or r.status<>'extracted' then raise exception 'hell_not_extracted';end if;
  for item in select value from jsonb_array_elements(r.secured_cargo) loop
    if item->>'kind'='artifact' then insert into public.museum_artifact_registrations(player_id,artifact_key,artifact_name,depth_found,discovery_snapshot)values(r.player_id,item->>'key',item->>'name',10,item)on conflict(player_id,artifact_key)do nothing;if found then registered:=registered||jsonb_build_array(item);end if;
    else cargo:=cargo+coalesce((item->>'value')::numeric,0);end if;
  end loop;
  update public.players set money=money+cargo,lifetime_earnings=lifetime_earnings+cargo where id=r.player_id returning money into money;
  update public.abandoned_mine_runs set status='settled',settled_at=now(),updated_at=now(),settlement=jsonb_build_object('cargoValue',cargo,'registeredArtifacts',registered,'money',money,'mode','hell')where id=r.id returning * into r;
  perform public.abandoned_mine_hell_log(r,'run_settled',jsonb_build_object('registeredArtifacts',jsonb_array_length(registered),'cargoValue',cargo));
  return jsonb_build_object('run',to_jsonb(r),'settlement',r.settlement,'money',money);
end $$;

-- Extend the existing dashboard without exposing hidden card contents. Revealed
-- cards and the selected card are returned; face-down cards contain only slots.
create or replace function public.get_abandoned_mine_hell_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();r public.abandoned_mine_runs;safe_run jsonb;cards jsonb;resources bigint:=0;claims integer:=0;week date:=date_trunc('week',now() at time zone 'UTC')::date;artifacts jsonb;
begin
  if uid is null then raise exception 'not_authenticated';end if;select * into r from public.abandoned_mine_runs where player_id=uid and status<>'settled' order by id desc limit 1;
  select coalesce(curse_fragments,0) into resources from public.player_hell_resources where player_id=uid;select coalesce(mythic_claims,0)into claims from public.abandoned_mine_hell_weekly_claims where player_id=uid and week_start=week;
  if r.id is not null and r.mode='hell' then
    select jsonb_agg(case
      when (r.hell_state->'selectedCard'->>'slot')::integer=(value->>'slot')::integer then value
      when (value->>'revealed')::boolean and coalesce(r.hell_state->'doomBreaks','[]') @> '["torn_records"]' and value->>'kind'='curse' then value-'tier'
      when (value->>'revealed')::boolean then value
      else jsonb_build_object('slot',(value->>'slot')::integer,'revealed',false) end order by ordinality)into cards from jsonb_array_elements(r.hell_state->'cards')with ordinality;
    safe_run:=to_jsonb(r)||jsonb_build_object('hell_state',r.hell_state||jsonb_build_object('cards',cards));
    if coalesce(r.hell_state->'doomBreaks','[]') @> '["faulty_warning"]' then safe_run:=safe_run-'danger'||jsonb_build_object('dangerBand',case when r.danger<25 then 'Low' when r.danger<50 then 'Moderate' when r.danger<75 then 'High' else 'Extreme' end);end if;
  elsif r.id is not null then safe_run:=to_jsonb(r);end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.registered_at desc),'[]')into artifacts from public.museum_artifact_registrations a where a.player_id=uid and a.artifact_key in('charred-miners-tag','melted-chain-link','crimson-geode','extinguished-hell-lantern','doomstone','eye-bottomless-mine');
  return jsonb_build_object('run',safe_run,'config',public.abandoned_mine_hell_config()-'artifactOdds','curseFragments',resources,'weeklyMythicClaims',claims,'weeklyMythicCap',5,'hellArtifacts',artifacts);
end $$;

-- Prevent the legacy dashboard from becoming a side channel for face-down
-- Hell cards. Normal callers receive the byte-for-byte legacy response.
alter function public.get_abandoned_mine_dashboard() rename to get_normal_abandoned_mine_dashboard;
create or replace function public.get_abandoned_mine_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.abandoned_mine_runs where player_id=auth.uid() and status<>'settled' and mode='hell') then
    return public.get_abandoned_mine_hell_dashboard();
  end if;
  return public.get_normal_abandoned_mine_dashboard();
end $$;

revoke all on function public.abandoned_mine_hell_config(),public.abandoned_mine_hell_log(public.abandoned_mine_runs,text,jsonb,numeric),
  public.abandoned_mine_hell_curse_tier(integer,integer),public.abandoned_mine_hell_objective(integer,integer,text),
  public.abandoned_mine_hell_cards(integer,integer),public.abandoned_mine_hell_event(integer,jsonb),
  public.abandoned_mine_hell_prepare_depth(public.abandoned_mine_runs,integer,integer),public.record_normal_abandoned_mine_roll(uuid,jsonb),
  public.record_abandoned_mine_hell_roll(uuid,jsonb),public.abandoned_mine_hell_add_doom(jsonb,integer,integer),
  public.abandoned_mine_hell_artifact_roll(public.abandoned_mine_runs,jsonb),public.abandoned_mine_hell_cache(uuid) from public,anon,authenticated;
revoke all on function public.get_normal_abandoned_mine_dashboard() from public,anon,authenticated;
grant execute on function public.start_abandoned_mine_hell(),public.fund_abandoned_mine_hell(integer),
  public.resolve_abandoned_mine_hell_event(bigint,text),public.reveal_abandoned_mine_hell_card(bigint,integer),
  public.select_abandoned_mine_hell_card(bigint,integer),public.continue_abandoned_mine_hell_overdepth(bigint),
  public.extract_abandoned_mine_hell(bigint),public.settle_abandoned_mine_hell(bigint),public.get_abandoned_mine_hell_dashboard() to authenticated;
grant execute on function public.get_abandoned_mine_dashboard() to authenticated;
revoke all on function public.start_abandoned_mine_hell(),public.fund_abandoned_mine_hell(integer),
  public.resolve_abandoned_mine_hell_event(bigint,text),public.reveal_abandoned_mine_hell_card(bigint,integer),
  public.select_abandoned_mine_hell_card(bigint,integer),public.continue_abandoned_mine_hell_overdepth(bigint),
  public.extract_abandoned_mine_hell(bigint),public.settle_abandoned_mine_hell(bigint),public.get_abandoned_mine_hell_dashboard() from public,anon;
grant execute on function public.record_abandoned_mine_roll(uuid,jsonb) to service_role;
