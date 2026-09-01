-- Crystal Caverns Hell Mode V1. Deployment is intentionally left to the operator.

alter table public.crystal_cavern_runs
  add column if not exists mode text not null default 'normal',
  add column if not exists hell_state jsonb not null default '{}'::jsonb;
alter table public.crystal_cavern_runs drop constraint if exists crystal_mode;
alter table public.crystal_cavern_runs add constraint crystal_mode check(mode in('normal','hell'));

insert into public.crystal_cavern_artifacts
  (key,name,collection,min_depth,min_overdepth,min_instability,pool,weight,duplicate_value,passive_name,passive_description,sort_order)
values
('bloodstained-crystal','Bloodstained Crystal','hell',10,1,0,'hell-exclusive',1,3000000,'Sanguine Fortune','+0.08× additive Luck',300),
('cracked-resonance-bell','Cracked Resonance Bell','hell',10,3,0,'hell-exclusive',1,5000000,'Resonant Momentum','+8% Expedition bonus-progress sources',310),
('prismatic-mirror','Prismatic Mirror','hell',10,6,0,'hell-exclusive',1,8000000,'Hellish Refraction','×1.06 Mutation Chance',320),
('petrified-crystal-heart','Petrified Crystal Heart','hell',10,10,0,'hell-exclusive',1,15000000,'Petrified Fortune','×1.08 final Weight Multiplier',330),
('void-crystal','Void Crystal','hell',10,12,0,'hell-exclusive',1,25000000,'Void-Touched','×1.10 final gem value',340),
('heart-of-resonance','Heart of Resonance','hell',10,15,0,'hell-exclusive',1,50000000,'Perfect Resonance','×1.25 final Luck and ×1.05 Mutation Chance',350)
on conflict(key) do update set name=excluded.name,collection=excluded.collection,min_depth=excluded.min_depth,
 min_overdepth=excluded.min_overdepth,pool=excluded.pool,duplicate_value=excluded.duplicate_value,
 passive_name=excluded.passive_name,passive_description=excluded.passive_description,sort_order=excluded.sort_order;

create or replace function public.crystal_hell_funding(p_depth integer)
returns numeric language plpgsql immutable set search_path='' as $$
begin
 if p_depth not between 1 and 10 then raise exception 'invalid_crystal_depth'; end if;
 return (array[100000,150000,225000,325000,450000,650000,1000000,1500000,2250000,3500000]::numeric[])[p_depth];
end $$;

create or replace function public.crystal_hell_danger(p_od integer)
returns integer language plpgsql immutable set search_path='' as $$
begin
 if p_od<1 then raise exception 'invalid_overdepth'; end if;
 return case when p_od<=9 then (array[60,64,68,72,76,80,84,87,90]::integer[])[p_od]
  when p_od<=14 then 92 when p_od<=19 then 94 else 95 end;
end $$;

create or replace function public.crystal_hell_careful_cost(p_od integer)
returns numeric language plpgsql immutable set search_path='' as $$
begin
 if p_od<1 then raise exception 'invalid_overdepth'; end if;
 if p_od<=10 then return (array[500000,600000,700000,850000,1000000,1200000,1400000,1600000,1800000,2000000]::numeric[])[p_od]; end if;
 return 2000000+(p_od-10)*100000;
end $$;

create or replace function public.crystal_hell_pulse_instability(p_depth integer,p_od integer)
returns integer language sql immutable set search_path='' as $$
 select case when p_od>0 then case when p_od<=3 then 30 when p_od<=6 then 35 when p_od<=9 then 40 when p_od<=14 then 45 else 50 end
 else case when p_depth<=3 then 15 when p_depth<=6 then 20 when p_depth<=9 then 25 else 30 end end
$$;

create or replace function public.crystal_hell_add_resonance(p_run public.crystal_cavern_runs,p_amount numeric,p_source text default 'effect')
returns public.crystal_cavern_runs language plpgsql volatile security definer set search_path='' as $$
declare s jsonb:=coalesce(p_run.hell_state,'{}'); amount numeric:=greatest(0,p_amount); r numeric;
 active text:=nullif(s->>'activePulse',''); q jsonb:=coalesce(s->'pulseQueue','[]'); pulse text; generated integer:=0;
 pool text[]:=array['deafening','shockwave','overcharged','fractured-ground','prismatic-surge','crystal-fever'];
begin
 if active='deafening' or (active='overcharged' and p_source='decision') then amount:=amount*1.5; end if;
 r:=coalesce((s->>'resonance')::numeric,0)+amount;
 while r>=100 loop
  r:=r-100; generated:=generated+1; p_run.instability:=p_run.instability+public.crystal_hell_pulse_instability(p_run.depth,p_run.overdepth);
  pulse:=pool[1+floor(random()*array_length(pool,1))::integer];if pulse='prismatic-surge'then p_run.instability:=p_run.instability+15;end if;
  if active is null and not coalesce((s->>'dampened')::boolean,false) then active:=pulse;
  else q:=q||jsonb_build_array(pulse); end if;
  if coalesce((s->>'dampened')::boolean,false) then s:=jsonb_set(s,'{dampened}','false'::jsonb); end if;
 end loop;
 s:=s||jsonb_build_object('resonance',r,'activePulse',active,'pulseQueue',q,
  'pulseCount',coalesce((s->>'pulseCount')::integer,0)+generated,
  'resonanceGeneratedDepth',coalesce((s->>'resonanceGeneratedDepth')::numeric,0)+amount);
 p_run.hell_state:=s;
 if generated>0 then p_run.event_log:=public.crystal_log(p_run.event_log,'pulse',generated||' Resonance Pulse'||case when generated=1 then''else's'end||' triggered',jsonb_build_object('source',p_source,'resonance',r)); end if;
 return p_run;
end $$;

create or replace function public.crystal_hell_finish_pulse_depth(p_run public.crystal_cavern_runs)
returns public.crystal_cavern_runs language plpgsql volatile security definer set search_path='' as $$
declare s jsonb:=coalesce(p_run.hell_state,'{}');q jsonb:=coalesce(s->'pulseQueue','[]');n text:=null;
begin
 if jsonb_array_length(q)>0 then n:=q->>0;q:=coalesce((select jsonb_agg(value order by ord) from jsonb_array_elements(q)with ordinality x(value,ord)where ord>1),'[]');end if;
 p_run.hell_state:=s||jsonb_build_object('activePulse',n,'pulseQueue',q);return p_run;
end $$;

create or replace function public.crystal_hell_severity(p_i integer,p_pulse text default null,p_roll numeric default random())
returns text language plpgsql volatile set search_path='' as $$
declare mi numeric:=.65*exp(-power(greatest(0,p_i)::numeric/145,1.406));
 cr numeric:=least(.60,.08+.92*(1-exp(-power(greatest(0,p_i)::numeric/320,1.767))));sev text;
begin
 sev:=case when p_roll<mi then'minor'when p_roll<1-cr then'major'else'critical'end;
 if p_pulse='shockwave'then sev:=case sev when'minor'then'major'else'critical'end;end if;return sev;
end $$;

create or replace function public.crystal_hell_apply_incident(p_run public.crystal_cavern_runs)
returns public.crystal_cavern_runs language plpgsql volatile security definer set search_path='' as $$
declare s jsonb:=coalesce(p_run.hell_state,'{}');pulse text:=s->>'activePulse';sev text;loss numeric;kept jsonb;
 fractured boolean:=coalesce((s->>'fractureUsed')::boolean,false);
begin
 if random()>=p_run.danger/100.0 then return p_run;end if;
 sev:=public.crystal_hell_severity(floor(p_run.instability)::integer,pulse);
 loss:=case sev when'minor'then .05+random()*.05 when'major'then .15+random()*.10 else .30+random()*.15 end;
 if pulse='fractured-ground'then loss:=least(.95,loss*1.5);end if;
 select coalesce(jsonb_agg(jsonb_set(value,'{value}',to_jsonb(round(coalesce((value->>'value')::numeric,0)*(1-loss))))),'[]')
 into kept from jsonb_array_elements(p_run.unsecured_cargo)value;p_run.unsecured_cargo:=kept;
 p_run.incident_log:=p_run.incident_log||jsonb_build_array(jsonb_build_object('severity',sev,'lossFraction',loss,'instability',p_run.instability,'at',now()));
 p_run.event_log:=public.crystal_log(p_run.event_log,'incident',initcap(sev)||' Hell incident',jsonb_build_object('severity',sev,'lossFraction',loss));
 if sev='minor'then p_run:=public.crystal_hell_add_resonance(p_run,3,'minor incident');
 elsif sev='major'then p_run.instability:=p_run.instability+3;p_run:=public.crystal_hell_add_resonance(p_run,7,'major incident');
 elsif p_run.overdepth>0 and not fractured then
  p_run.instability:=p_run.instability+20;p_run.hell_state:=coalesce(p_run.hell_state,'{}')||jsonb_build_object('fractureUsed',true);
  p_run.event_log:=public.crystal_log(p_run.event_log,'fracture','Critical Fracture — cavern integrity lost',jsonb_build_object('instabilityAdded',20));
 else p_run.status:='forced_extraction';p_run.extraction_reason:='critical_incident';p_run.unsecured_artifacts:='[]';end if;
 return p_run;
end $$;

create or replace function public.crystal_hell_add_opportunities(p_run public.crystal_cavern_runs,p_pool text,p_count integer,p_base numeric,p_quality boolean default false)
returns public.crystal_cavern_runs language plpgsql volatile security definer set search_path='' as $$
declare i integer;a jsonb;chance numeric:=p_base;pulse text:=p_run.hell_state->>'activePulse';second_chance numeric;
begin
 if pulse='overcharged'then chance:=chance*1.5;elsif pulse='prismatic-surge'then chance:=chance*2;end if;
 for i in 1..p_count loop
  if pulse='crystal-fever'then p_run:=public.crystal_hell_add_resonance(p_run,8,'artifact opportunity');end if;
  if random()<least(1,public.crystal_artifact_chance(chance,floor(p_run.instability)::integer))then
   a:=public.crystal_roll_artifact(p_run,p_pool,p_quality);if a is not null then p_run.unsecured_artifacts:=p_run.unsecured_artifacts||jsonb_build_array(a);end if;
   if pulse='crystal-fever'and random()<least(1,public.crystal_artifact_chance(chance,floor(p_run.instability)::integer)*.25)then
    a:=public.crystal_roll_artifact(p_run,p_pool,p_quality);if a is not null then p_run.unsecured_artifacts:=p_run.unsecured_artifacts||jsonb_build_array(a);end if;
   end if;
  end if;
 end loop;return p_run;
end $$;

create or replace function public.crystal_hell_exclusive_checks(p_run public.crystal_cavern_runs)
returns public.crystal_cavern_runs language plpgsql volatile security definer set search_path='' as $$
declare d record;a public.crystal_cavern_artifacts;
begin
 for d in select*from(values('bloodstained-crystal',1,.125::numeric),('cracked-resonance-bell',3,1.0/12),('prismatic-mirror',6,.0625),('petrified-crystal-heart',10,.05),('void-crystal',12,.125),('heart-of-resonance',15,.5))v(k,min_od,chance)loop
  if p_run.overdepth>=d.min_od and random()<d.chance then select*into a from public.crystal_cavern_artifacts where key=d.k;
   p_run.unsecured_artifacts:=p_run.unsecured_artifacts||jsonb_build_array(jsonb_build_object('kind','artifact','key',a.key,'name',a.name,'duplicateValue',a.duplicate_value,'depth',10,'overdepth',p_run.overdepth,'instability',p_run.instability));
  end if;
 end loop;return p_run;
end $$;

create or replace function public.crystal_hell_challenge(p_od integer,p_state jsonb)
returns jsonb language plpgsql volatile set search_path='' as $$
declare eligible text[]:=array['resonance-build'];compound boolean:=p_od>=20 and random()<case when p_od>=30 then .75 else .50 end;one text;two text:=null;
begin
 if p_od>=4 then eligible:=eligible||array['instability-surge','unstable-survival','resonant-survival'];end if;if p_od>=7 then eligible:=eligible||array['pulse-trial'];end if;
 one:=eligible[1+floor(random()*array_length(eligible,1))::integer];
 if compound then loop two:=eligible[1+floor(random()*array_length(eligible,1))::integer];exit when two<>one and not(one='pulse-trial'and two='resonant-survival')and not(one='resonant-survival'and two='pulse-trial');end loop;end if;
 return jsonb_build_object('families',jsonb_build_array(one)||case when two is null then'[]'::jsonb else jsonb_build_array(two)end,'compound',compound,
  'startResonance',coalesce((p_state->>'resonance')::numeric,0),'startInstability',coalesce((p_state->>'instabilitySnapshot')::numeric,0),'startPulses',coalesce((p_state->>'pulseCount')::integer,0));
end $$;

create or replace function public.crystal_hell_evaluate_challenge(p_run public.crystal_cavern_runs)
returns public.crystal_cavern_runs language plpgsql volatile security definer set search_path='' as $$
declare s jsonb:=p_run.hell_state;ch jsonb:=s->'challenge';f text;ok boolean:=true;count_ integer;start_r numeric;start_i numeric;start_p integer;
begin
 if ch is null then return p_run;end if;start_r:=coalesce((ch->>'startResonance')::numeric,0);start_i:=coalesce((ch->>'startInstability')::numeric,0);start_p:=coalesce((ch->>'startPulses')::integer,0);
 for f in select jsonb_array_elements_text(ch->'families')loop
  ok:=ok and case f when'resonance-build'then coalesce((s->>'resonanceGeneratedDepth')::numeric,0)>=10+floor(p_run.overdepth/5)*2
   when'instability-surge'then p_run.instability-start_i>=8+floor(p_run.overdepth/5)*2
   when'unstable-survival'then p_run.instability>=80+p_run.overdepth*10
   when'pulse-trial'then coalesce((s->>'pulseCount')::integer,0)>start_p
   when'resonant-survival'then coalesce((s->>'pulseCount')::integer,0)=start_p and coalesce((s->>'resonance')::numeric,0)>=60 else false end;
 end loop;
 if ok then count_:=case when coalesce((ch->>'compound')::boolean,false)then 2 else 1 end;p_run:=public.crystal_hell_add_opportunities(p_run,'od',count_,least(.40,.20+(p_run.overdepth-1)*.03),false);p_run.event_log:=public.crystal_log(p_run.event_log,'challenge','Hell Challenge completed',jsonb_build_object('opportunities',count_));
 else p_run.instability:=p_run.instability+10;p_run:=public.crystal_hell_add_resonance(p_run,25,'challenge failure');p_run.event_log:=public.crystal_log(p_run.event_log,'challenge','Hell Challenge failed',jsonb_build_object('instabilityAdded',10,'resonanceAdded',25));end if;
 p_run.hell_state:=jsonb_set(p_run.hell_state,'{challenge}','null'::jsonb);return p_run;
end $$;

create or replace function public.start_crystal_caverns_hell()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;begin if auth.uid()is null then raise exception'not_authenticated';end if;
 perform pg_advisory_xact_lock(hashtext('crystal-caverns:'||auth.uid()::text));
 if exists(select 1 from public.crystal_cavern_runs where player_id=auth.uid()and status<>'settled')then raise exception'crystal_run_already_open';end if;
 insert into public.crystal_cavern_runs(player_id,mode,hell_state)values(auth.uid(),'hell',jsonb_build_object('resonance',0,'activePulse',null,'pulseQueue','[]'::jsonb,'pulseCount',0,'fractureUsed',false,'dampened',false))returning*into r;return to_jsonb(r);end $$;

create or replace function public.fund_crystal_hell_depth(p_run_id bigint,p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;c numeric;m numeric;begin select*into r from public.crystal_cavern_runs where id=p_run_id and player_id=auth.uid()for update;
 if not found or r.mode<>'hell'or r.overdepth<>0 or r.status<>'awaiting_funding'or p_depth<>r.depth+1 then raise exception'crystal_hell_depth_unavailable';end if;
 c:=public.crystal_hell_funding(p_depth);update public.players p set money=p.money-c where id=r.player_id and p.money>=c returning p.money into m;if not found then raise exception'insufficient_funds';end if;
 update public.crystal_cavern_runs set depth=p_depth,progress=0,target=100+p_depth*50,danger=public.crystal_base_danger(p_depth),status='active',total_funding=total_funding+c,
  hell_state=hell_state||jsonb_build_object('resonanceGeneratedDepth',0,'instabilitySnapshot',instability),event_log=public.crystal_log(event_log,'depth','Funded and entered Hell D'||p_depth,jsonb_build_object('cost',c)),updated_at=now()where id=r.id returning*into r;
 return jsonb_build_object('run',to_jsonb(r),'money',m,'cost',c);end $$;

do $$begin
 if to_regprocedure('public.record_normal_crystal_cavern_roll(uuid,jsonb)')is null then alter function public.record_crystal_cavern_roll(uuid,jsonb)rename to record_normal_crystal_cavern_roll;end if;
end $$;

create or replace function public.record_crystal_hell_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;bonus numeric:=0;base_progress numeric;gain numeric;igain numeric;newp numeric;base numeric;auto_i integer;pending jsonb:=null;depth_r integer;
begin select*into r from public.crystal_cavern_runs where player_id=p_player_id and mode='hell'and status='active'for update;if not found or nullif(p_payload->>'gemName','')is null then return;end if;
 if coalesce((p_payload->>'rarity')::numeric,0)>=50 then bonus:=bonus+1;end if;if coalesce((p_payload->>'rarity')::numeric,0)>=1000 then bonus:=bonus+3;end if;if coalesce((p_payload->>'rarity')::numeric,0)>=10000 then bonus:=bonus+7;end if;
 if jsonb_array_length(coalesce(p_payload->'mutationIds','[]'))>0 then bonus:=bonus+3;end if;if coalesce((p_payload->>'weightMultiplier')::numeric,0)>=2 then bonus:=bonus+3;end if;
 base_progress:=1+bonus*coalesce((public.crystal_player_effects(p_player_id)->>'bonusProgressMultiplier')::numeric,1);gain:=base_progress*case r.intensity when'forceful'then 1.25 when'fracturing'then 1.60 else 1 end;
 igain:=base_progress*case r.intensity when'forceful'then 2 when'fracturing'then 5 else 0 end/50.0;r.instability:=r.instability+igain;newp:=least(r.target,r.progress+gain);
 if r.progress<r.target and newp>=r.target then
  r:=public.crystal_hell_apply_incident(r);
  if r.status<>'forced_extraction'then
   r.unsecured_cargo:=r.unsecured_cargo||jsonb_build_array(public.crystal_cargo(r.depth,r.overdepth));
   if r.overdepth>0 then
    auto_i:=case when r.overdepth<=3 then 8 when r.overdepth<=6 then 10 else 12 end;r.instability:=r.instability+auto_i;
    depth_r:=case when r.overdepth<=3 then 10 when r.overdepth<=6 then 13 when r.overdepth<=9 then 16 when r.overdepth<=14 then 20 when r.overdepth<=19 then 24 else 30 end;
    r:=public.crystal_hell_add_resonance(r,depth_r,'successful OD clear');base:=least(.40,.20+(r.overdepth-1)*.03);r:=public.crystal_hell_add_opportunities(r,'od',1,base,false);r:=public.crystal_hell_exclusive_checks(r);r:=public.crystal_hell_evaluate_challenge(r);
    if random()<.35 then pending:=jsonb_build_object('type','hell_od_formation');else r.status:='ready_to_extract';end if;
   else
    depth_r:=case when r.depth<=3 then 4 when r.depth<=6 then 6 when r.depth<=9 then 8 else 10 end;r:=public.crystal_hell_add_resonance(r,depth_r,'successful depth clear');
    base:=case when r.depth<=3 then .15 when r.depth<=6 then .20 when r.depth<=9 then .25 else .40 end;r:=public.crystal_hell_add_opportunities(r,'general',1,base,false);
    if r.depth=10 then
     if random()<public.crystal_artifact_chance(.20,floor(r.instability)::integer)then r.unsecured_artifacts:=r.unsecured_artifacts||jsonb_build_array(public.crystal_roll_artifact(r,'d10-sphere'));end if;
     if random()<public.crystal_artifact_chance(1.0/9,floor(r.instability)::integer)then r.unsecured_artifacts:=r.unsecured_artifacts||jsonb_build_array(public.crystal_roll_artifact(r,'d10-heart'));end if;
     pending:=jsonb_build_object('type','hell_d10_choice');elsif r.depth in(4,7,9)then pending:=jsonb_build_object('type','hell_formation');elsif r.depth in(3,6)then pending:=jsonb_build_object('type','hell_outpost');elsif r.depth in(2,5,8)and random()<.5 then pending:=jsonb_build_object('type','hell_event','event',(array['pocket','resonance','deposit'])[1+floor(random()*3)::integer]);else r.status:='awaiting_funding';end if;
   end if;
   r:=public.crystal_hell_finish_pulse_depth(r);if pending is not null then r.status:='decision';r.pending:=pending;end if;
  end if;
 end if;
 update public.crystal_cavern_runs set progress=newp,status=r.status,instability=r.instability,secured_cargo=r.secured_cargo,unsecured_cargo=r.unsecured_cargo,secured_artifacts=r.secured_artifacts,unsecured_artifacts=r.unsecured_artifacts,pending=r.pending,incident_log=r.incident_log,event_log=r.event_log,extraction_reason=r.extraction_reason,hell_state=r.hell_state,updated_at=now()where id=r.id;
end $$;

create or replace function public.record_crystal_cavern_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from public.crystal_cavern_runs where player_id=p_player_id and mode='hell'and status='active')then perform public.record_crystal_hell_roll(p_player_id,p_payload);else perform public.record_normal_crystal_cavern_roll(p_player_id,p_payload);end if;end $$;

create or replace function public.resolve_crystal_hell_decision(p_run_id bigint,p_choice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;t text;e text;c numeric:=0;di integer:=0;dr integer:=0;cnt integer:=0;quality boolean:=false;pool text:='formation';m numeric:=null;nextp jsonb:=null;
begin select*into r from public.crystal_cavern_runs where id=p_run_id and player_id=auth.uid()for update;if not found or r.mode<>'hell'or r.status<>'decision'then raise exception'crystal_hell_decision_unavailable';end if;t:=r.pending->>'type';
 if t='hell_event'then e:=r.pending->>'event';if p_choice='leave'then null;elsif e='pocket'and p_choice='excavate'then di:=5;dr:=6;cnt:=1;pool:='general';elsif e='resonance'and p_choice='trigger'then di:=8;dr:=12;cnt:=1;quality:=true;elsif e='deposit'and p_choice='break'then di:=3;dr:=8;r.unsecured_cargo:=r.unsecured_cargo||jsonb_build_array(public.crystal_cargo(r.depth,0));else raise exception'invalid_crystal_hell_choice';end if;r.status:='awaiting_funding';
 elsif t in('hell_formation','hell_od_formation')then
  if p_choice='leave'then null;elsif t='hell_od_formation'and p_choice='careful'then c:=public.crystal_hell_careful_cost(r.overdepth);di:=8;dr:=10;cnt:=2;quality:=true;pool:='od';
  elsif t='hell_od_formation'and p_choice='shatter'then di:=25;dr:=25;cnt:=4;pool:='od';
  elsif t='hell_formation'and p_choice='careful'then c:=case r.depth when 4 then 750000 when 7 then 2000000 else 4500000 end;di:=case r.depth when 4 then 4 when 7 then 6 else 8 end;dr:=8;cnt:=case when r.depth=9 then 2 else 1 end;quality:=true;
  elsif t='hell_formation'and p_choice='shatter'then di:=case r.depth when 4 then 12 when 7 then 18 else 25 end;dr:=18;cnt:=case r.depth when 4 then 2 when 7 then 3 else 4 end;else raise exception'invalid_crystal_hell_choice';end if;
  if t='hell_od_formation'then r.status:='ready_to_extract';elsif r.depth=9 then r.status:='decision';nextp:=jsonb_build_object('type','hell_outpost');else r.status:='awaiting_funding';end if;
 elsif t='hell_outpost'then
  if p_choice not in('secure','reinforce','dampen')then raise exception'invalid_crystal_hell_choice';end if;c:=case r.depth when 3 then case p_choice when'secure'then 250000 when'reinforce'then 500000 else 750000 end when 6 then case p_choice when'secure'then 1000000 when'reinforce'then 1750000 else 2500000 end else case p_choice when'secure'then 3500000 when'reinforce'then 5500000 else 7500000 end end;
  if p_choice='reinforce'then r.danger:=greatest(0,r.danger-15);elsif p_choice='dampen'then r.hell_state:=r.hell_state||jsonb_build_object('dampened',true);end if;r.secured_cargo:=r.secured_cargo||r.unsecured_cargo;r.unsecured_cargo:='[]';r.secured_artifacts:=r.secured_artifacts||r.unsecured_artifacts;r.unsecured_artifacts:='[]';r.status:='awaiting_funding';
 elsif t='hell_d10_choice'then if p_choice='extract'then r.status:='ready_to_extract';elsif p_choice='fracture'then di:=30;dr:=50;r.status:='ready_to_extract';nextp:=jsonb_build_object('fractured',true);else raise exception'invalid_crystal_hell_choice';end if;else raise exception'invalid_crystal_hell_choice';end if;
 if c>0 then update public.players p set money=p.money-c where id=r.player_id and p.money>=c returning p.money into m;if not found then raise exception'insufficient_funds';end if;r.total_funding:=r.total_funding+c;end if;
 r.instability:=r.instability+di;if dr>0 then r:=public.crystal_hell_add_resonance(r,dr,'decision');end if;if cnt>0 then r:=public.crystal_hell_add_opportunities(r,pool,cnt,case when r.overdepth>0 then least(.40,.20+(r.overdepth-1)*.03)else case when r.depth<=6 then .20 else .25 end end,quality);end if;
 r.pending:=nextp;update public.crystal_cavern_runs set(status,instability,danger,secured_cargo,unsecured_cargo,secured_artifacts,unsecured_artifacts,pending,total_funding,event_log,hell_state,updated_at)=(r.status,r.instability,r.danger,r.secured_cargo,r.unsecured_cargo,r.secured_artifacts,r.unsecured_artifacts,r.pending,r.total_funding,r.event_log,r.hell_state,now())where id=r.id returning*into r;
 return jsonb_build_object('run',to_jsonb(r),'money',m,'cost',c);end $$;

create or replace function public.continue_crystal_hell_overdepth(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;n integer;m numeric;s jsonb;begin select*into r from public.crystal_cavern_runs where id=p_run_id and player_id=auth.uid()for update;
 if not found or r.mode<>'hell'or r.status<>'ready_to_extract'or r.depth<>10 or not(coalesce((r.pending->>'fractured')::boolean,false)or r.overdepth>0)then raise exception'crystal_hell_overdepth_unavailable';end if;n:=r.overdepth+1;select money into m from public.players where id=r.player_id;s:=r.hell_state||jsonb_build_object('resonanceGeneratedDepth',0,'instabilitySnapshot',r.instability);s:=s||jsonb_build_object('challenge',public.crystal_hell_challenge(n,s));
 update public.crystal_cavern_runs set overdepth=n,progress=0,target=600+n*50,danger=public.crystal_hell_danger(n),status='active',pending=null,hell_state=s,event_log=public.crystal_log(event_log,'depth','Descended to Hell OD'||n,jsonb_build_object('cost',0,'danger',public.crystal_hell_danger(n))),updated_at=now()where id=r.id returning*into r;
 return jsonb_build_object('run',to_jsonb(r),'money',m,'cost',0);end $$;

create or replace function public.skip_crystal_hell_outpost(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;begin
 select*into r from public.crystal_cavern_runs where id=p_run_id and player_id=auth.uid()for update;
 if not found or r.mode<>'hell' or r.status<>'decision' or coalesce(r.pending->>'type','')<>'hell_outpost' or r.depth not in(3,6,9)then raise exception'crystal_hell_outpost_unavailable';end if;
 update public.crystal_cavern_runs set status='awaiting_funding',pending=null,event_log=public.crystal_log(event_log,'outpost','Skipped Hell stabilisation outpost',jsonb_build_object('depth',r.depth)),updated_at=now()where id=r.id returning*into r;
 return to_jsonb(r);end $$;

create or replace function public.crystal_player_effects(p_uid uuid)
returns jsonb language sql stable security definer set search_path='' as $$
with owned as(select artifact_key k from public.museum_artifact_registrations where player_id=p_uid)
select jsonb_build_object(
 'luckBonus',(case when exists(select 1 from owned where k='crystal-splinter')then .02 else 0 end)+(case when exists(select 1 from owned where k='fractured-prism')then .03 else 0 end)+(case when exists(select 1 from owned where k='bloodstained-crystal')then .08 else 0 end),
 'finalLuckMultiplier',case when exists(select 1 from owned where k='heart-of-resonance')then 1.25 else 1 end,
 'weightLuckMultiplier',(case when exists(select 1 from owned where k='calcified-geode')then 1.02 else 1 end)*(case when exists(select 1 from owned where k='perfect-crystal-sphere')then 1.03 else 1 end),
 'weightMultiplierMultiplier',(case when exists(select 1 from owned where k='quartz-cluster')then 1.02 else 1 end)*(case when exists(select 1 from owned where k='ancient-crystal-chisel')then 1.03 else 1 end)*(case when exists(select 1 from owned where k='impossible-crystal')then 1.04 else 1 end)*(case when exists(select 1 from owned where k='petrified-crystal-heart')then 1.08 else 1 end),
 'artifactChanceMultiplier',(case when exists(select 1 from owned where k='broken-survey-lens')then 1.02 else 1 end)*(case when exists(select 1 from owned where k='prismatic-fossil')then 1.03 else 1 end),
 'gemValueMultiplier',(case when exists(select 1 from owned where k='crystallized-lantern')then 1.02 else 1 end)*(case when exists(select 1 from owned where k='unstable-crystal-heart')then 1.03 else 1 end)*(case when exists(select 1 from owned where k='frozen-light-fragment')then 1.03 else 1 end)*(case when exists(select 1 from owned where k='void-crystal')then 1.10 else 1 end),
 'mutationChanceMultiplier',(case when exists(select 1 from owned where k='prismatic-shard')then 1.02 else 1 end)*(case when exists(select 1 from owned where k='heart-of-the-cavern')then 1.02 else 1 end)*(case when exists(select 1 from owned where k='fractured-core')then 1.03 else 1 end)*(case when exists(select 1 from owned where k='prismatic-mirror')then 1.06 else 1 end)*(case when exists(select 1 from owned where k='heart-of-resonance')then 1.05 else 1 end),
 'bonusProgressMultiplier',(case when exists(select 1 from owned where k='resonance-core')then 1.03 else 1 end)*(case when exists(select 1 from owned where k='resonant-geode')then 1.04 else 1 end)*(case when exists(select 1 from owned where k='cracked-resonance-bell')then 1.08 else 1 end),
 'heavyGemValueMultiplier',case when exists(select 1 from owned where k='shattered-heart')then 1.05 else 1 end)
$$;

create or replace function public.get_crystal_caverns_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;rj jsonb;a jsonb;m numeric;next_danger integer;formation_cost numeric;begin if auth.uid()is null then raise exception'not_authenticated';end if;
 select*into r from public.crystal_cavern_runs x where player_id=auth.uid()and status<>'settled'order by id desc limit 1;rj:=case when r.id is null then null else to_jsonb(r)end;select p.money into m from public.players p where id=auth.uid();
 select coalesce(jsonb_agg(to_jsonb(x)order by x.sort_order),'[]')into a from(select c.*,exists(select 1 from public.museum_artifact_registrations z where z.player_id=auth.uid()and z.artifact_key=c.key)registered from public.crystal_cavern_artifacts c)x;
 if r.id is not null and r.depth=10 then next_danger:=case when r.mode='hell'then public.crystal_hell_danger(r.overdepth+1)else public.crystal_base_danger(10,r.overdepth+1)end;if r.overdepth>0 then formation_cost:=case when r.mode='hell'then public.crystal_hell_careful_cost(r.overdepth)else public.crystal_overdepth_formation_cost(r.overdepth)end;end if;end if;
 return jsonb_build_object('destination',jsonb_build_object('id','crystal-caverns','name','Crystal Caverns'),'run',rj,'money',m,'artifacts',a,
  'funding',to_jsonb(array[200000,300000,450000,650000,900000,1300000,2000000,3000000,4500000,7000000]),'hellFunding',to_jsonb(array[100000,150000,225000,325000,450000,650000,1000000,1500000,2250000,3500000]),
  'danger',to_jsonb(array[0,3,7,12,18,26,35,45,57,70]),'nextOverdepthCost',0,'nextOverdepthDanger',next_danger,'overdepthFormationCost',formation_cost);
end $$;

revoke all on function public.start_crystal_caverns_hell(),public.fund_crystal_hell_depth(bigint,integer),public.resolve_crystal_hell_decision(bigint,text),public.skip_crystal_hell_outpost(bigint),public.continue_crystal_hell_overdepth(bigint)from public,anon;
grant execute on function public.start_crystal_caverns_hell(),public.fund_crystal_hell_depth(bigint,integer),public.resolve_crystal_hell_decision(bigint,text),public.skip_crystal_hell_outpost(bigint),public.continue_crystal_hell_overdepth(bigint)to authenticated;
revoke all on function public.record_crystal_hell_roll(uuid,jsonb),public.record_crystal_cavern_roll(uuid,jsonb),public.record_normal_crystal_cavern_roll(uuid,jsonb)from public,anon,authenticated;
grant execute on function public.record_crystal_hell_roll(uuid,jsonb),public.record_crystal_cavern_roll(uuid,jsonb),public.record_normal_crystal_cavern_roll(uuid,jsonb)to service_role;
revoke all on function public.crystal_hell_add_resonance(public.crystal_cavern_runs,numeric,text),public.crystal_hell_finish_pulse_depth(public.crystal_cavern_runs),public.crystal_hell_apply_incident(public.crystal_cavern_runs),public.crystal_hell_add_opportunities(public.crystal_cavern_runs,text,integer,numeric,boolean),public.crystal_hell_exclusive_checks(public.crystal_cavern_runs),public.crystal_hell_evaluate_challenge(public.crystal_cavern_runs)from public,anon,authenticated;
