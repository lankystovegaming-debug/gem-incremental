-- Volcanic Depths Normal V1. Server-authoritative eruption, reward and OD state machine.

create table public.volcanic_depth_runs(
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'awaiting_funding',
  depth integer not null default 0,
  overdepth integer not null default 0,
  progress numeric not null default 0,
  target integer not null default 0,
  danger integer not null default 0,
  activity integer not null default 0,
  eruption_point integer not null,
  monitoring_tier integer not null default 0,
  forecast_low integer,
  forecast_high integer,
  cooling_tier integer not null default 0,
  suppression_used boolean not null default false,
  eruption_suppressed boolean not null default false,
  shelter_used boolean not null default false,
  sampled_depth integer,
  lift_used_depths integer[] not null default '{}',
  secured_cargo numeric not null default 0,
  unsecured_cargo numeric not null default 0,
  total_funding numeric not null default 0,
  pending jsonb,
  event_log jsonb not null default '[]',
  settlement jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint volcanic_status check(status in('awaiting_funding','active','ready_to_extract','eruption_choice','forced_extraction','extracted','settled')),
  constraint volcanic_depth check(depth between 0 and 10),
  constraint volcanic_activity check(activity>=0),
  constraint volcanic_monitoring check(monitoring_tier between 0 and 3),
  constraint volcanic_cooling check(cooling_tier between 0 and 3)
);
create unique index volcanic_one_open_run on public.volcanic_depth_runs(player_id) where status<>'settled';
alter table public.volcanic_depth_runs enable row level security;
revoke all on public.volcanic_depth_runs from public,anon,authenticated;
grant all on public.volcanic_depth_runs to service_role;

create table public.volcanic_artifacts(
  key text primary key,
  name text not null,
  source text not null,
  min_depth integer not null default 1,
  min_overdepth integer not null default 0,
  min_state text,
  weight numeric not null default 1,
  chance numeric,
  duplicate_value numeric not null,
  passive_name text not null,
  passive_description text not null,
  sort_order integer not null unique
);
insert into public.volcanic_artifacts values
('obsidian-fragment','Obsidian Fragment','general',1,0,null,40,null,125000,'Obsidian Edge','+0.02× additive Luck',10),
('volcanic-glass','Volcanic Glass','general',2,0,null,32,null,175000,'Tempered Glass','+2% Weight Multiplier',20),
('scorched-geode','Scorched Geode','general',3,0,null,25,null,250000,'Scorched Fortune','×1.02 Mutation Chance',30),
('basalt-tablet','Basalt Tablet','general',5,0,null,18,null,400000,'Ancient Heat','+2% normal gem sale value',40),
('mantle-stone','Mantle Stone','general',7,0,null,12,null,650000,'Mantle Pressure','+3% Weight Luck',50),
('fire-opal-cluster','Fire Opal Cluster','general',8,0,null,8,null,900000,'Firelight','+0.03× additive Roll Speed',60),
('solidified-magma-sample','Solidified Magma Sample','sampling',1,0,'unstable',10,null,600000,'Residual Heat','+3% Expedition bonus progress',70),
('living-magma','Living Magma','sampling',1,0,'critical',6,null,1750000,'Living Flame','+0.06× additive Luck',80),
('melted-seismograph','Melted Seismograph','monitoring',1,0,'critical',1,.12,1250000,'Seismic Reading','+4% relative Expedition artifact discovery',90),
('pyroclastic-crystal','Pyroclastic Crystal','general',1,0,'unstable',10,null,1000000,'Pyroclastic Fortune','×1.03 Mutation Chance',100),
('magma-heart','Magma Heart','general',1,0,'critical',30,null,2000000,'Molten Core','+4% final gem value',110),
('eruption-core','Eruption Core','suppression',1,0,null,1,.20,2500000,'Thermal Shielding','−5% relative Expedition incident chance',120),
('mantle-crystal','Mantle Crystal','d10',10,0,null,1,.20,1750000,'Mantle Resonance','+5% Weight Luck',130),
('heart-of-the-volcano','Heart of the Volcano','d10',10,0,null,1,1.0/9,3500000,'Volcanic Power','×1.05 final Roll Speed',140),
('blackened-diamond','Blackened Diamond','od',10,1,null,1,1.0/12,2000000,'Pressure Forged','+4% Weight Multiplier',200),
('infernal-geode','Infernal Geode','od',10,3,null,1,1.0/18,3500000,'Infernal Fortune','×1.04 Mutation Chance',210),
('mantle-core','Mantle Core','od',10,6,null,1,1.0/25,6000000,'Core Pressure','+7% Weight Luck',220),
('fragment-of-the-mantle','Fragment of the Mantle','od',10,10,null,1,1.0/35,10000000,'Mantle''s Blessing','×1.07 final gem value',230);
alter table public.volcanic_artifacts enable row level security;
create policy volcanic_artifacts_read on public.volcanic_artifacts for select to authenticated using(true);

create or replace function public.volcanic_log(p_log jsonb,p_kind text,p_message text,p_extra jsonb default '{}') returns jsonb language sql volatile set search_path='' as $$
 select coalesce(p_log,'[]')||jsonb_build_array(jsonb_build_object('kind',p_kind,'message',p_message,'at',now())||coalesce(p_extra,'{}'))
$$;
create or replace function public.volcanic_funding(p_depth integer) returns numeric language sql immutable set search_path='' as $$
 select (array[150000,200000,300000,450000,700000,1000000,1500000,2300000,3500000,5500000]::numeric[])[p_depth]
$$;
create or replace function public.volcanic_target(p_depth integer,p_od integer default 0) returns integer language sql immutable set search_path='' as $$
 select case when p_od>0 then 1100+35*p_od else (array[100,150,200,275,350,450,575,725,900,1100]::integer[])[p_depth] end
$$;
create or replace function public.volcanic_danger(p_depth integer,p_od integer default 0) returns integer language sql immutable set search_path='' as $$
 select case when p_od=0 then (array[0,2,4,7,10,14,19,25,32,40]::integer[])[p_depth]
 when p_od<=14 then (array[30,34,38,42,46,50,54,58,62,66,69,72,75,78]::integer[])[p_od]
 when p_od<=19 then 80 else 85 end
$$;
create or replace function public.volcanic_activity_gain(p_depth integer) returns integer language sql immutable set search_path='' as $$
 select (array[5,6,7,8,10,12,15,18,22,27]::integer[])[p_depth]
$$;
create or replace function public.volcanic_state(p_activity integer,p_eruption integer) returns text language sql immutable set search_path='' as $$
 select case when p_eruption-p_activity<=0 then 'eruption' when p_eruption-p_activity<=14 then 'critical' when p_eruption-p_activity<=29 then 'unstable' when p_eruption-p_activity<=49 then 'heating' else 'stable' end
$$;
create or replace function public.volcanic_activity_multiplier(p_state text) returns numeric language sql immutable set search_path='' as $$
 select case p_state when 'critical' then 1.75 when 'unstable' then 1.35 when 'heating' then 1.15 else 1 end
$$;
create or replace function public.volcanic_od_cargo_range(p_od integer) returns numeric[] language plpgsql immutable set search_path='' as $$
declare lo numeric;hi numeric;scale numeric;begin
 if p_od<=10 then lo:=(array[400000,500000,650000,800000,1000000,1250000,1500000,1800000,2100000,2500000]::numeric[])[p_od];hi:=(array[600000,750000,950000,1200000,1500000,1900000,2300000,2700000,3200000,3800000]::numeric[])[p_od];
 else scale:=1+.18*sqrt(p_od-10);lo:=2500000*scale;hi:=3800000*scale;end if;return array[lo,hi];end $$;
create or replace function public.volcanic_cargo_value(p_depth integer,p_od integer default 0) returns numeric language plpgsql volatile set search_path='' as $$
declare lo numeric;hi numeric;r numeric[];begin if p_od>0 then r:=public.volcanic_od_cargo_range(p_od);lo:=r[1];hi:=r[2];else lo:=(array[30000,50000,75000,125000,200000,325000,525000,850000,1200000,2750000]::numeric[])[p_depth];hi:=(array[60000,90000,125000,200000,325000,525000,850000,1300000,1800000,4000000]::numeric[])[p_depth];end if;return round(lo+random()*(hi-lo));end $$;

create or replace function public.volcanic_player_effects(p_uid uuid) returns jsonb language sql stable security definer set search_path='' as $$
with owned as(select artifact_key k from public.museum_artifact_registrations where player_id=p_uid)
select jsonb_build_object(
 'luckBonus',(case when exists(select 1 from owned where k='obsidian-fragment')then .02 else 0 end)+(case when exists(select 1 from owned where k='living-magma')then .06 else 0 end),
 'rollSpeedBonus',case when exists(select 1 from owned where k='fire-opal-cluster')then .03 else 0 end,
 'rollSpeedMultiplier',case when exists(select 1 from owned where k='heart-of-the-volcano')then 1.05 else 1 end,
 'weightLuckMultiplier',(case when exists(select 1 from owned where k='mantle-stone')then 1.03 else 1 end)*(case when exists(select 1 from owned where k='mantle-crystal')then 1.05 else 1 end)*(case when exists(select 1 from owned where k='mantle-core')then 1.07 else 1 end),
 'weightMultiplierMultiplier',(case when exists(select 1 from owned where k='volcanic-glass')then 1.02 else 1 end)*(case when exists(select 1 from owned where k='blackened-diamond')then 1.04 else 1 end),
 'mutationChanceMultiplier',(case when exists(select 1 from owned where k='scorched-geode')then 1.02 else 1 end)*(case when exists(select 1 from owned where k='pyroclastic-crystal')then 1.03 else 1 end)*(case when exists(select 1 from owned where k='infernal-geode')then 1.04 else 1 end),
 'gemValueMultiplier',(case when exists(select 1 from owned where k='basalt-tablet')then 1.02 else 1 end)*(case when exists(select 1 from owned where k='magma-heart')then 1.04 else 1 end)*(case when exists(select 1 from owned where k='fragment-of-the-mantle')then 1.07 else 1 end),
 'bonusProgressMultiplier',case when exists(select 1 from owned where k='solidified-magma-sample')then 1.03 else 1 end,
 'artifactChanceMultiplier',case when exists(select 1 from owned where k='melted-seismograph')then 1.04 else 1 end,
 'incidentChanceMultiplier',case when exists(select 1 from owned where k='eruption-core')then .95 else 1 end)
$$;

-- Extend the existing hot-path passive RPC instead of adding another network call per roll.
create or replace function public.player_expedition_artifact_effects(p_player_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.expedition_artifact_effects(p_player_id)||public.volcanic_player_effects(p_player_id)
$$;

-- First copies are protected by registering immediately. Duplicates become unsecured economic cargo.
create or replace function public.volcanic_award_artifact(p_run public.volcanic_depth_runs,p_key text) returns public.volcanic_depth_runs language plpgsql volatile security definer set search_path='' as $$
declare a public.volcanic_artifacts;inserted integer;begin select*into a from public.volcanic_artifacts where key=p_key;if not found then return p_run;end if;
 insert into public.museum_artifact_registrations(player_id,artifact_key,artifact_name,depth_found,discovery_snapshot)
 values(p_run.player_id,a.key,a.name,case when p_run.overdepth>0 then p_run.overdepth else p_run.depth end,jsonb_build_object('destination','volcanic-depths','depth',p_run.depth,'overdepth',p_run.overdepth,'activity',p_run.activity)) on conflict(player_id,artifact_key)do nothing;
 get diagnostics inserted=row_count;if inserted=0 then p_run.unsecured_cargo:=p_run.unsecured_cargo+a.duplicate_value;p_run.event_log:=public.volcanic_log(p_run.event_log,'artifact','Duplicate '||a.name||' added as unsecured cargo',jsonb_build_object('value',a.duplicate_value));else p_run.event_log:=public.volcanic_log(p_run.event_log,'artifact','Museum discovery protected: '||a.name,jsonb_build_object('artifactKey',a.key));end if;return p_run;end $$;
create or replace function public.volcanic_general_artifact(p_run public.volcanic_depth_runs) returns public.volcanic_depth_runs language plpgsql volatile security definer set search_path='' as $$
declare st text:=public.volcanic_state(p_run.activity,p_run.eruption_point);base numeric;bonus numeric;pick text;begin base:=case when p_run.depth<=3 then .15 when p_run.depth<=6 then .20 when p_run.depth<=9 then .25 else .40 end;bonus:=coalesce((public.volcanic_player_effects(p_run.player_id)->>'artifactChanceMultiplier')::numeric,1);
 if random()>=least(1,base*public.volcanic_activity_multiplier(st)*bonus)then return p_run;end if;
 select key into pick from public.volcanic_artifacts where source='general'and p_run.depth>=min_depth and(min_state is null or min_state='unstable'and st in('unstable','critical')or min_state='critical'and st='critical')order by -ln(greatest(random(),.000000001))/weight limit 1;
 if pick is not null then p_run:=public.volcanic_award_artifact(p_run,pick);end if;return p_run;end $$;
create or replace function public.volcanic_special_check(p_run public.volcanic_depth_runs,p_key text,p_chance numeric,p_activity_multiplier boolean default false) returns public.volcanic_depth_runs language plpgsql volatile security definer set search_path='' as $$
declare chance_ numeric:=p_chance;begin if p_activity_multiplier then chance_:=chance_*public.volcanic_activity_multiplier(public.volcanic_state(p_run.activity,p_run.eruption_point));end if;if random()<least(1,chance_)then p_run:=public.volcanic_award_artifact(p_run,p_key);end if;return p_run;end $$;

create or replace function public.volcanic_erupt(p_run public.volcanic_depth_runs,p_cause text) returns public.volcanic_depth_runs language plpgsql volatile security definer set search_path='' as $$
declare chance_ numeric;begin
 if not p_run.suppression_used and p_run.cooling_tier>0 then chance_:=(array[.20,.30,.40]::numeric[])[p_run.cooling_tier];p_run.cooling_tier:=0;if random()<chance_ then p_run.suppression_used:=true;p_run.eruption_suppressed:=true;p_run.event_log:=public.volcanic_log(p_run.event_log,'suppression','Cooling successfully suppressed the eruption');p_run:=public.volcanic_special_check(p_run,'eruption-core',.20,false);return p_run;else p_run.event_log:=public.volcanic_log(p_run.event_log,'eruption','Cooling failed to suppress the eruption');end if;end if;
 p_run.unsecured_cargo:=round(p_run.unsecured_cargo*.20);p_run.status:='eruption_choice';p_run.pending:=jsonb_build_object('type','eruption_choice','cause',p_cause,'odAvailable',true);p_run.event_log:=public.volcanic_log(p_run.event_log,'eruption','Eruption destroyed 80% of unsecured cargo');return p_run;end $$;
create or replace function public.volcanic_apply_normal_incident(p_run public.volcanic_depth_runs) returns public.volcanic_depth_runs language plpgsql volatile security definer set search_path='' as $$
declare sev text;loss numeric;r numeric:=random();modifier numeric:=coalesce((public.volcanic_player_effects(p_run.player_id)->>'incidentChanceMultiplier')::numeric,1);begin if random()>=p_run.danger/100.0*modifier then return p_run;end if;sev:=case when r<.65 then'minor'when r<.92 then'major'else'critical'end;loss:=case sev when'minor'then .05+random()*.05 when'major'then .15+random()*.10 else .35+random()*.15 end;p_run.unsecured_cargo:=round(p_run.unsecured_cargo*(1-loss));p_run.event_log:=public.volcanic_log(p_run.event_log,sev,initcap(sev)||' incident',jsonb_build_object('lossFraction',loss));if sev='critical'then p_run.status:='forced_extraction';p_run.pending:=jsonb_build_object('type','forced_extraction','cause','critical_incident');end if;return p_run;end $$;
create or replace function public.volcanic_apply_od_incident(p_run public.volcanic_depth_runs) returns public.volcanic_depth_runs language plpgsql volatile security definer set search_path='' as $$
declare sev text;r numeric:=random();retention numeric;overwhelming numeric;modifier numeric:=coalesce((public.volcanic_player_effects(p_run.player_id)->>'incidentChanceMultiplier')::numeric,1);begin if random()>=p_run.danger/100.0*modifier then return p_run;end if;sev:=case when r<.65 then'minor'when r<.92 then'major'else'critical'end;if p_run.overdepth between 8 and 14 and sev='minor'and random()<.20 then sev:='major';elsif p_run.overdepth>=15 then if sev='minor'then sev:='major';end if;if sev='major'and random()<.20 then sev:='critical';end if;end if;
 retention:=case when p_run.overdepth<=3 then .20 when p_run.overdepth<=7 then .15 when p_run.overdepth<=14 then .10 else 0 end;overwhelming:=case when p_run.overdepth<=3 then 0 when p_run.overdepth<=7 then .03 when p_run.overdepth<=14 then .08 when p_run.overdepth<=19 then .18 else .25 end;p_run.unsecured_cargo:=round(p_run.unsecured_cargo*retention);
 if random()<overwhelming then p_run.status:='forced_extraction';p_run.pending:=jsonb_build_object('type','forced_extraction','cause','overwhelming_eruption');p_run.event_log:=public.volcanic_log(p_run.event_log,'overwhelming','Overwhelming Eruption forced extraction',jsonb_build_object('retention',retention));return p_run;end if;
 if sev='critical'then if not p_run.shelter_used then p_run.shelter_used:=true;p_run.event_log:=public.volcanic_log(p_run.event_log,'critical','Emergency Shelter absorbed the first OD Critical',jsonb_build_object('retention',retention));else p_run.status:='forced_extraction';p_run.pending:=jsonb_build_object('type','forced_extraction','cause','second_od_critical');p_run.event_log:=public.volcanic_log(p_run.event_log,'critical','Second OD Critical forced extraction',jsonb_build_object('retention',retention));end if;else p_run.event_log:=public.volcanic_log(p_run.event_log,sev,initcap(sev)||' OD incident',jsonb_build_object('retention',retention));end if;return p_run;end $$;

create or replace function public.start_volcanic_depths() returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;begin if auth.uid()is null then raise exception'not_authenticated';end if;if exists(select 1 from public.volcanic_depth_runs where player_id=auth.uid()and status<>'settled')then raise exception'volcanic_run_already_open';end if;insert into public.volcanic_depth_runs(player_id,eruption_point)values(auth.uid(),115+floor(random()*61)::integer)returning*into r;return to_jsonb(r)-'eruption_point';end $$;
create or replace function public.fund_volcanic_depth(p_run_id bigint,p_depth integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;c numeric;m numeric;begin select*into r from public.volcanic_depth_runs where id=p_run_id and player_id=auth.uid()for update;if not found or r.overdepth<>0 or r.status<>'awaiting_funding'or p_depth<>r.depth+1 then raise exception'volcanic_depth_unavailable';end if;c:=public.volcanic_funding(p_depth);update public.players p set money=p.money-c where id=r.player_id and p.money>=c returning p.money into m;if not found then raise exception'insufficient_funds';end if;update public.volcanic_depth_runs set depth=p_depth,progress=0,target=public.volcanic_target(p_depth),danger=public.volcanic_danger(p_depth),status='active',pending=null,total_funding=total_funding+c,updated_at=now()where id=r.id returning*into r;return jsonb_build_object('run',to_jsonb(r)-'eruption_point','money',m,'cost',c);end $$;

create or replace function public.record_volcanic_depth_roll(p_player_id uuid,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;bonus integer:=0;base_progress numeric;gain numeric;newp numeric;st text;key_ text;begin select*into r from public.volcanic_depth_runs where player_id=p_player_id and status='active'for update;if not found then return;end if;
 if coalesce((p_payload->>'rarity')::numeric,0)>=50 then bonus:=bonus+1;end if;if coalesce((p_payload->>'rarity')::numeric,0)>=1000 then bonus:=bonus+3;end if;if coalesce((p_payload->>'rarity')::numeric,0)>=10000 then bonus:=bonus+7;end if;if jsonb_array_length(coalesce(p_payload->'mutationIds','[]'))>0 then bonus:=bonus+3;end if;if coalesce((p_payload->>'weightMultiplier')::numeric,0)>=2 then bonus:=bonus+3;end if;base_progress:=1+bonus;gain:=base_progress*coalesce((public.volcanic_player_effects(p_player_id)->>'bonusProgressMultiplier')::numeric,1);newp:=least(r.target,r.progress+gain);
 if r.progress<r.target and newp>=r.target then
  if r.overdepth>0 then r:=public.volcanic_apply_od_incident(r);if r.status<>'forced_extraction'then r.unsecured_cargo:=r.unsecured_cargo+public.volcanic_cargo_value(10,r.overdepth);for key_ in select key from public.volcanic_artifacts where source='od'and r.overdepth>=min_overdepth and random()<chance loop r:=public.volcanic_award_artifact(r,key_);end loop;r.status:='ready_to_extract';r.pending:=jsonb_build_object('type','od_cleared','od',r.overdepth);end if;
  else r.activity:=r.activity+public.volcanic_activity_gain(r.depth);if r.eruption_suppressed then r.eruption_suppressed:=false;r:=public.volcanic_erupt(r,'activity_after_suppression');elsif r.activity>=r.eruption_point then r:=public.volcanic_erupt(r,'depth_activity');end if;
   if r.status='active'then r:=public.volcanic_apply_normal_incident(r);end if;if r.status='active'then r.unsecured_cargo:=r.unsecured_cargo+public.volcanic_cargo_value(r.depth);r:=public.volcanic_general_artifact(r);st:=public.volcanic_state(r.activity,r.eruption_point);if st='critical'and r.monitoring_tier>0 then r:=public.volcanic_special_check(r,'melted-seismograph',.12,true);end if;if r.depth=10 then r:=public.volcanic_special_check(r,'mantle-crystal',.20,true);r:=public.volcanic_special_check(r,'heart-of-the-volcano',1.0/9,true);r.status:='ready_to_extract';r.pending:=jsonb_build_object('type','d10_chamber');else r.status:='awaiting_funding';r.pending:=null;end if;end if;
  end if;
 end if;update public.volcanic_depth_runs set(progress,status,activity,cooling_tier,suppression_used,eruption_suppressed,shelter_used,secured_cargo,unsecured_cargo,pending,event_log,updated_at)=(newp,r.status,r.activity,r.cooling_tier,r.suppression_used,r.eruption_suppressed,r.shelter_used,r.secured_cargo,r.unsecured_cargo,r.pending,r.event_log,now())where id=r.id;end $$;

create or replace function public.buy_volcanic_monitoring(p_run_id bigint,p_tier integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;c numeric;width_ integer;low_ integer;minlow integer;maxlow integer;m numeric;begin select*into r from public.volcanic_depth_runs where id=p_run_id and player_id=auth.uid()for update;if not found or r.overdepth>0 or r.status not in('awaiting_funding','ready_to_extract')or p_tier not between 1 and 3 or p_tier<=r.monitoring_tier or r.depth<(array[3,6,9]::integer[])[p_tier]then raise exception'volcanic_monitoring_unavailable';end if;c:=(array[400000,1250000,2000000]::numeric[])[p_tier];update public.players p set money=p.money-c where id=r.player_id and p.money>=c returning money into m;if not found then raise exception'insufficient_funds';end if;width_:=case p_tier when 1 then 30+floor(random()*16)::integer when 2 then 15+floor(random()*11)::integer else 6+floor(random()*7)::integer end;minlow:=greatest(coalesce(r.forecast_low,-2147483648),r.eruption_point-width_+(case p_tier when 1 then 5 when 2 then 3 else 1 end));maxlow:=least(coalesce(r.forecast_high-width_,2147483647),r.eruption_point-(case p_tier when 1 then 5 when 2 then 3 else 1 end));if minlow>maxlow then width_:=greatest(2,coalesce(r.forecast_high-r.forecast_low,width_)-2);minlow:=greatest(coalesce(r.forecast_low,r.eruption_point-width_),r.eruption_point-width_+1);maxlow:=least(coalesce(r.forecast_high-width_,r.eruption_point-1),r.eruption_point-1);end if;low_:=minlow+floor(random()*(maxlow-minlow+1))::integer;update public.volcanic_depth_runs set monitoring_tier=p_tier,forecast_low=low_,forecast_high=low_+width_,total_funding=total_funding+c,updated_at=now()where id=r.id returning*into r;return jsonb_build_object('run',to_jsonb(r)-'eruption_point','money',m,'cost',c);end $$;
create or replace function public.buy_volcanic_cooling(p_run_id bigint,p_tier integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;c numeric;m numeric;begin select*into r from public.volcanic_depth_runs where id=p_run_id and player_id=auth.uid()for update;if not found or r.overdepth>0 or r.status not in('awaiting_funding','ready_to_extract')or r.suppression_used or p_tier not between 1 and 3 or r.depth<(array[3,6,9]::integer[])[p_tier]then raise exception'volcanic_cooling_unavailable';end if;c:=(array[500000,1500000,4000000]::numeric[])[p_tier];update public.players p set money=p.money-c where id=r.player_id and p.money>=c returning money into m;if not found then raise exception'insufficient_funds';end if;update public.volcanic_depth_runs set cooling_tier=p_tier,total_funding=total_funding+c,updated_at=now()where id=r.id returning*into r;return jsonb_build_object('run',to_jsonb(r)-'eruption_point','money',m,'cost',c);end $$;
create or replace function public.use_volcanic_lift(p_run_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;cap numeric;moved numeric;begin select*into r from public.volcanic_depth_runs where id=p_run_id and player_id=auth.uid()for update;if not found or r.overdepth>0 or r.status not in('awaiting_funding','ready_to_extract')or r.depth not in(3,6,9)or r.depth=any(r.lift_used_depths)then raise exception'volcanic_lift_unavailable';end if;cap:=case r.depth when 3 then 150000 when 6 then 500000 else 1500000 end;moved:=least(cap,r.unsecured_cargo);update public.volcanic_depth_runs set secured_cargo=secured_cargo+moved,unsecured_cargo=unsecured_cargo-moved,lift_used_depths=array_append(lift_used_depths,r.depth),event_log=public.volcanic_log(event_log,'lift','Evacuation Lift secured cargo',jsonb_build_object('value',moved)),updated_at=now()where id=r.id returning*into r;return to_jsonb(r)-'eruption_point';end $$;
create or replace function public.sample_volcanic_magma(p_run_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;st text;c numeric;add_ integer;success_ numeric;m numeric;pick text;begin select*into r from public.volcanic_depth_runs where id=p_run_id and player_id=auth.uid()for update;if not found or r.overdepth>0 or r.status not in('awaiting_funding','ready_to_extract')or r.sampled_depth=r.depth then raise exception'volcanic_sampling_unavailable';end if;st:=public.volcanic_state(r.activity,r.eruption_point);if st not in('unstable','critical')then raise exception'volcanic_sampling_unavailable';end if;c:=case st when'unstable'then 1500000 else 3000000 end;add_:=case st when'unstable'then 5 else 8 end;success_:=case st when'unstable'then .80 else .65 end;update public.players p set money=p.money-c where id=r.player_id and p.money>=c returning money into m;if not found then raise exception'insufficient_funds';end if;r.activity:=r.activity+add_;r.sampled_depth:=r.depth;r.total_funding:=r.total_funding+c;if r.eruption_suppressed then r.eruption_suppressed:=false;r:=public.volcanic_erupt(r,'sampling_after_suppression');elsif r.activity>=r.eruption_point then r:=public.volcanic_erupt(r,'sampling');end if;if r.status not in('eruption_choice')and random()<success_ then if st='unstable'then pick:='solidified-magma-sample';else select key into pick from public.volcanic_artifacts where key in('solidified-magma-sample','living-magma')order by -ln(greatest(random(),.000000001))/weight limit 1;end if;r:=public.volcanic_award_artifact(r,pick);else r.event_log:=public.volcanic_log(r.event_log,'sampling','Magma sample was lost');end if;update public.volcanic_depth_runs set(status,activity,cooling_tier,suppression_used,eruption_suppressed,sampled_depth,unsecured_cargo,total_funding,pending,event_log,updated_at)=(r.status,r.activity,r.cooling_tier,r.suppression_used,r.eruption_suppressed,r.sampled_depth,r.unsecured_cargo,r.total_funding,r.pending,r.event_log,now())where id=r.id returning*into r;return jsonb_build_object('run',to_jsonb(r)-'eruption_point','money',m,'cost',c);end $$;
create or replace function public.continue_volcanic_overdepth(p_run_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;n integer;begin select*into r from public.volcanic_depth_runs where id=p_run_id and player_id=auth.uid()for update;if not found or r.status not in('ready_to_extract','eruption_choice')then raise exception'volcanic_overdepth_unavailable';end if;if r.status='ready_to_extract'and r.depth<10 and r.overdepth=0 then raise exception'volcanic_overdepth_unavailable';end if;n:=r.overdepth+1;update public.volcanic_depth_runs set overdepth=n,progress=0,target=public.volcanic_target(10,n),danger=public.volcanic_danger(10,n),status='active',pending=null,updated_at=now()where id=r.id returning*into r;return to_jsonb(r)-'eruption_point';end $$;
create or replace function public.extract_volcanic_depths(p_run_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;begin select*into r from public.volcanic_depth_runs where id=p_run_id and player_id=auth.uid()for update;if not found or r.depth=0 or r.status not in('awaiting_funding','ready_to_extract','eruption_choice','forced_extraction')then raise exception'volcanic_extraction_unavailable';end if;update public.volcanic_depth_runs set status='extracted',secured_cargo=secured_cargo+unsecured_cargo,unsecured_cargo=0,pending=null,updated_at=now()where id=r.id returning*into r;return to_jsonb(r)-'eruption_point';end $$;
create or replace function public.settle_volcanic_depths(p_run_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;m numeric;begin select*into r from public.volcanic_depth_runs where id=p_run_id and player_id=auth.uid()for update;if not found or r.status<>'extracted'then raise exception'volcanic_not_extracted';end if;update public.players p set money=p.money+r.secured_cargo,lifetime_earnings=p.lifetime_earnings+r.secured_cargo where id=r.player_id returning money into m;update public.volcanic_depth_runs set status='settled',settled_at=now(),settlement=jsonb_build_object('cargoValue',secured_cargo,'money',m),updated_at=now()where id=r.id returning*into r;return jsonb_build_object('run',to_jsonb(r)-'eruption_point','money',m,'settlement',r.settlement);end $$;
create or replace function public.get_volcanic_depths_dashboard() returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;rj jsonb;a jsonb;m numeric;begin if auth.uid()is null then raise exception'not_authenticated';end if;select*into r from public.volcanic_depth_runs where player_id=auth.uid()and status<>'settled'order by id desc limit 1;rj:=case when r.id is null then null else (to_jsonb(r)-'eruption_point')||jsonb_build_object('activity_state',public.volcanic_state(r.activity,r.eruption_point))end;select money into m from public.players where id=auth.uid();select coalesce(jsonb_agg(to_jsonb(x)order by sort_order),'[]')into a from(select v.*,exists(select 1 from public.museum_artifact_registrations z where z.player_id=auth.uid()and z.artifact_key=v.key)registered from public.volcanic_artifacts v)x;return jsonb_build_object('destination',jsonb_build_object('id','volcanic-depths','name','Volcanic Depths'),'run',rj,'money',m,'artifacts',a,'funding',to_jsonb(array[150000,200000,300000,450000,700000,1000000,1500000,2300000,3500000,5500000]),'danger',to_jsonb(array[0,2,4,7,10,14,19,25,32,40]));end $$;

-- Route the existing optimized roll edge-function RPC through Volcanic when active.
create or replace function public.record_abandoned_mine_roll(p_player_id uuid,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.volcanic_depth_runs where player_id=p_player_id and status='active')then perform public.record_volcanic_depth_roll(p_player_id,p_payload);
 elsif exists(select 1 from public.crystal_cavern_runs where player_id=p_player_id and status='active')then perform public.record_crystal_cavern_roll(p_player_id,p_payload);
 elsif exists(select 1 from public.abandoned_mine_runs where player_id=p_player_id and mode='hell'and status<>'settled')then perform public.record_abandoned_mine_hell_roll(p_player_id,p_payload);
 else perform public.record_normal_abandoned_mine_roll(p_player_id,p_payload);end if;end $$;

revoke all on function public.volcanic_player_effects(uuid),public.record_volcanic_depth_roll(uuid,jsonb),public.volcanic_award_artifact(public.volcanic_depth_runs,text),public.volcanic_general_artifact(public.volcanic_depth_runs),public.volcanic_special_check(public.volcanic_depth_runs,text,numeric,boolean),public.volcanic_erupt(public.volcanic_depth_runs,text),public.volcanic_apply_normal_incident(public.volcanic_depth_runs),public.volcanic_apply_od_incident(public.volcanic_depth_runs)from public,anon,authenticated;
grant execute on function public.volcanic_player_effects(uuid),public.record_volcanic_depth_roll(uuid,jsonb)to service_role;
revoke all on function public.player_expedition_artifact_effects(uuid)from public,anon,authenticated;grant execute on function public.player_expedition_artifact_effects(uuid)to service_role;
revoke all on function public.start_volcanic_depths(),public.fund_volcanic_depth(bigint,integer),public.buy_volcanic_monitoring(bigint,integer),public.buy_volcanic_cooling(bigint,integer),public.use_volcanic_lift(bigint),public.sample_volcanic_magma(bigint),public.continue_volcanic_overdepth(bigint),public.extract_volcanic_depths(bigint),public.settle_volcanic_depths(bigint),public.get_volcanic_depths_dashboard()from public,anon;
grant execute on function public.start_volcanic_depths(),public.fund_volcanic_depth(bigint,integer),public.buy_volcanic_monitoring(bigint,integer),public.buy_volcanic_cooling(bigint,integer),public.use_volcanic_lift(bigint),public.sample_volcanic_magma(bigint),public.continue_volcanic_overdepth(bigint),public.extract_volcanic_depths(bigint),public.settle_volcanic_depths(bigint),public.get_volcanic_depths_dashboard()to authenticated;
