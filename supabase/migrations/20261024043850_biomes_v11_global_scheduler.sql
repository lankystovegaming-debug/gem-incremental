-- Biomes V1.1. Local migration only; owner deploys.
begin;
create table public.biome_definitions (
  key text primary key, ordinal integer unique not null,
  interval_minutes numeric not null check(interval_minutes>0),
  duration_minutes integer not null check(duration_minutes>0),
  phenomenon boolean not null default false
);
create table public.biome_occurrences (
  id uuid primary key default gen_random_uuid(),
  biome_key text not null references public.biome_definitions(key),
  starts_at timestamptz not null unique, ends_at timestamptz not null,
  check(ends_at>starts_at)
);
create table public.biome_scheduler (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  last_tick timestamptz, occurrence_id uuid references public.biome_occurrences(id)
);
insert into public.biome_scheduler(singleton) values(true);
create table public.biome_gem_rules (
  biome_key text not null references public.biome_definitions(key),
  gem_name text not null, denominator numeric not null check(denominator>=1),
  exclusive boolean not null default false,
  primary key(biome_key,gem_name)
);
create table public.player_biome_discoveries (
  player_id uuid not null references public.players(id) on delete cascade,
  biome_key text not null references public.biome_definitions(key),
  occurrence_id uuid not null references public.biome_occurrences(id),
  first_genuine_roll bigint not null, discovered_at timestamptz not null default clock_timestamp(),
  primary key(player_id,biome_key)
);
alter table public.biome_definitions enable row level security;
alter table public.biome_occurrences enable row level security;
alter table public.biome_scheduler enable row level security;
alter table public.biome_gem_rules enable row level security;
alter table public.player_biome_discoveries enable row level security;
revoke all on public.biome_definitions, public.biome_occurrences, public.biome_scheduler,
 public.biome_gem_rules, public.player_biome_discoveries from public,anon,authenticated;
grant select on public.player_biome_discoveries to authenticated;
create policy own_biome_discoveries on public.player_biome_discoveries for select
 to authenticated using ((select auth.uid())=player_id);
insert into public.biome_definitions values('Volcanic',0,120,5,false);
insert into public.biome_definitions values('Oceanic',1,180,5,false);
insert into public.biome_definitions values('Deep Earth',2,240,6,false);
insert into public.biome_definitions values('Frozen',3,300,5,false);
insert into public.biome_definitions values('Nightfall',4,480,4,false);
insert into public.biome_definitions values('Cosmic',5,1080,4,false);
insert into public.biome_definitions values('Void',6,4320,3,false);
insert into public.biome_definitions values('Heavenly',7,5760,3,false);
insert into public.biome_definitions values('Infernal',8,5760,3,false);
insert into public.biome_definitions values('Distortion',9,20160,2,true);
insert into public.biome_gem_rules values('Volcanic','Obsidian',6,false);
insert into public.biome_gem_rules values('Volcanic','Pyrite',100,false);
insert into public.biome_gem_rules values('Volcanic','Moltenite',5000,false);
insert into public.biome_gem_rules values('Volcanic','Volcanic Achalite',1000000,false);
insert into public.biome_gem_rules values('Volcanic','Krotite',12000000,false);
insert into public.biome_gem_rules values('Volcanic','Caldera Heart',75000000,true);
insert into public.biome_gem_rules values('Oceanic','Aquamarine',75,false);
insert into public.biome_gem_rules values('Oceanic','Larimar',250,false);
insert into public.biome_gem_rules values('Oceanic','Paraíba Tourmaline',12500,false);
insert into public.biome_gem_rules values('Oceanic','Ammolite',4500000,false);
insert into public.biome_gem_rules values('Oceanic','Thalassa',31122819,false);
insert into public.biome_gem_rules values('Oceanic','Heart of the Tide',40000000,true);
insert into public.biome_gem_rules values('Deep Earth','Diamond',750,false);
insert into public.biome_gem_rules values('Deep Earth','Majorite',11000000,false);
insert into public.biome_gem_rules values('Deep Earth','Akimotoite',11400000,false);
insert into public.biome_gem_rules values('Deep Earth','Bridgmanite',14600000,false);
insert into public.biome_gem_rules values('Deep Earth','Davemaoite',18200000,false);
insert into public.biome_gem_rules values('Deep Earth','Stishovite',23000000,false);
insert into public.biome_gem_rules values('Deep Earth','Seifertite',29000000,false);
insert into public.biome_gem_rules values('Deep Earth','Telluric Heart',175000000,true);
insert into public.biome_gem_rules values('Frozen','Cryoshock',25000,false);
insert into public.biome_gem_rules values('Frozen','Permafrost',1200000,false);
insert into public.biome_gem_rules values('Frozen','Frostspike',15000000,false);
insert into public.biome_gem_rules values('Frozen','Polaris',45000000,false);
insert into public.biome_gem_rules values('Frozen','Aurorite',100000000,false);
insert into public.biome_gem_rules values('Frozen','Absolute Zero',125000000,true);
insert into public.biome_gem_rules values('Nightfall','Nyx Obsidian',3000,false);
insert into public.biome_gem_rules values('Nightfall','Noctilucent',1800000,false);
insert into public.biome_gem_rules values('Nightfall','Umbra shard',13555555,false);
insert into public.biome_gem_rules values('Nightfall','Eventide',20000000,false);
insert into public.biome_gem_rules values('Nightfall','Deadstar',35000000,false);
insert into public.biome_gem_rules values('Nightfall','Midnight',250000000,true);
insert into public.biome_gem_rules values('Cosmic','Martian Opal',1500000,false);
insert into public.biome_gem_rules values('Cosmic','Presolar Moissanite',1600000,false);
insert into public.biome_gem_rules values('Cosmic','Redshift Crystal',4400000,false);
insert into public.biome_gem_rules values('Cosmic','Deadstar',35000000,false);
insert into public.biome_gem_rules values('Cosmic','Tistarite',30000000,false);
insert into public.biome_gem_rules values('Cosmic','Asterism',30000000,false);
insert into public.biome_gem_rules values('Cosmic','Allendeite',44000000,false);
insert into public.biome_gem_rules values('Cosmic','Panguite',54000000,false);
insert into public.biome_gem_rules values('Cosmic','Hapkeite',66000000,false);
insert into public.biome_gem_rules values('Cosmic','Tranquillityite',110000000,false);
insert into public.biome_gem_rules values('Cosmic','ton 618',61861861,false);
insert into public.biome_gem_rules values('Void','Void Pearl',12500,false);
insert into public.biome_gem_rules values('Void','Void Opal',50000,false);
insert into public.biome_gem_rules values('Void','Core of Oblivion',4806402,false);
insert into public.biome_gem_rules values('Void','Nullstone',8000000,false);
insert into public.biome_gem_rules values('Void','Last Light',84000000,false);
insert into public.biome_gem_rules values('Void','False Vacuum',60000000,false);
insert into public.biome_gem_rules values('Void','Heat Death',150000000,false);
insert into public.biome_gem_rules values('Heavenly','Aether Quartz',35000,false);
insert into public.biome_gem_rules values('Heavenly','Haloite',1800000,false);
insert into public.biome_gem_rules values('Heavenly','First Light',17847004,false);
insert into public.biome_gem_rules values('Heavenly','Ascendentite',20000000,false);
insert into public.biome_gem_rules values('Heavenly','Seraphite',39682539,false);
insert into public.biome_gem_rules values('Heavenly','Aurorium',50000000,false);
insert into public.biome_gem_rules values('Heavenly','Last Light',84000000,false);
insert into public.biome_gem_rules values('Infernal','Moltenite',10000,false);
insert into public.biome_gem_rules values('Infernal','Brimstone',1600000,false);
insert into public.biome_gem_rules values('Infernal','Infernite',20000000,false);
insert into public.biome_gem_rules values('Infernal','Netherwrong',47500000,false);
insert into public.biome_gem_rules values('Infernal','Damnation',333333333,true);
insert into public.biome_gem_rules values('Distortion','Probability Crystal',25000,false);
insert into public.biome_gem_rules values('Distortion','Singularity Shard',400000,false);
insert into public.biome_gem_rules values('Distortion','Paradoxite',880000,false);
insert into public.biome_gem_rules values('Distortion','False Vacuum',48000000,false);
insert into public.biome_gem_rules values('Distortion','Reality Fragment',52500000,false);
insert into public.biome_gem_rules values('Distortion','Glitched Gem',110100111,false);
insert into public.biome_gem_rules values('Distortion','Aberration',750000000,true);

-- One serialized categorical draw on the current minute. No backlog replay.
create function public.advance_global_biome() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_tick timestamptz := date_trunc('minute',clock_timestamp());
 v_state public.biome_scheduler%rowtype;
 v_active public.biome_occurrences%rowtype;
 v_u numeric; v_r numeric; v_draw double precision; v_cumulative numeric:=0;
 v_definition public.biome_definitions%rowtype;
begin
 select * into v_state from public.biome_scheduler where singleton for update;
 if not v_state.enabled then return jsonb_build_object('status','disabled'); end if;
 if v_state.last_tick>=v_tick then return jsonb_build_object('status','already_processed'); end if;
 update public.biome_scheduler set last_tick=v_tick where singleton;
 select * into v_active from public.biome_occurrences where id=v_state.occurrence_id;
 -- Half-open [start,end); expire BEFORE drawing on this same tick.
 if v_active.ends_at>v_tick then return jsonb_build_object('status','active'); end if;
 update public.biome_scheduler set occurrence_id=null where singleton;
 select sum(duration_minutes/interval_minutes),sum(1/interval_minutes) into v_u,v_r
 from public.biome_definitions;
 if 1-v_u+v_r<=0 then raise exception 'invalid_biome_calibration'; end if;
 v_draw:=random();
 for v_definition in select * from public.biome_definitions order by ordinal loop
  v_cumulative:=v_cumulative+(1/v_definition.interval_minutes)/(1-v_u+v_r);
  if v_draw<v_cumulative then
   insert into public.biome_occurrences(biome_key,starts_at,ends_at)
    values(v_definition.key,v_tick,v_tick+make_interval(mins=>v_definition.duration_minutes))
    returning * into v_active;
   update public.biome_scheduler set occurrence_id=v_active.id where singleton;
   return jsonb_build_object('status','activated','occurrenceId',v_active.id);
  end if;
 end loop;
 return jsonb_build_object('status','normal');
end $$;
revoke all on function public.advance_global_biome() from public,anon,authenticated;
grant execute on function public.advance_global_biome() to service_role;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('advance-global-biomes','* * * * *','select public.advance_global_biome();');
 end if;
end $$;
commit;
