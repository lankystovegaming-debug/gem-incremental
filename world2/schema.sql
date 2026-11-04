-- Phase 1 additive foundations. No existing table/function/trigger is replaced.
-- All gameplay gates are constrained false: enabling requires a reviewed migration.
begin;
create schema abyss_private authorization postgres;
revoke all on schema abyss_private from public, anon, authenticated;
grant usage on schema abyss_private to service_role;

create table public.world2_manifests (
  version integer primary key check (version > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);
create table public.world2_law_definitions (
  version integer not null references public.world2_manifests(version),
  category text not null check (category in ('A','B','C')),
  law_id text not null,
  weight integer not null check (weight > 0),
  contract jsonb not null check (jsonb_typeof(contract) = 'object'),
  primary key(version,category,law_id)
);
create table public.world2_equipment_registry (
  version integer not null references public.world2_manifests(version),
  equipment_id text not null,
  native_world smallint not null default 1 check (native_world in (1,2)),
  verification text not null check (verification in ('verified','unverified')),
  contract jsonb not null check (jsonb_typeof(contract) = 'object'),
  primary key(version,equipment_id)
);
create table public.world2_adaptation_levels (
  version integer not null references public.world2_manifests(version),
  level smallint not null check (level between 0 and 5),
  factor numeric not null check (factor = (50 + 5 * level)::numeric / 100),
  qualifying_rolls bigint not null check (qualifying_rolls >= 0),
  provisional boolean not null default true check (provisional),
  primary key(version,level), unique(version,qualifying_rolls)
);
create table abyss_private.release_config (
  singleton boolean primary key default true check (singleton),
  manifest_version integer not null references public.world2_manifests(version),
  gameplay_enabled boolean not null default false check (not gameplay_enabled),
  quest_enabled boolean not null default false check (not quest_enabled),
  law_effects_enabled boolean not null default false check (not law_effects_enabled),
  adaptation_enabled boolean not null default false check (not adaptation_enabled)
);
create table public.world2_epochs (
  world_id smallint not null default 2 check(world_id=2),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  version integer not null references public.world2_manifests(version),
  a_category text not null default 'A' check(a_category='A'),
  b_category text not null default 'B' check(b_category='B'),
  c_category text not null default 'C' check(c_category='C'),
  a_id text not null,b_id text not null,c_id text not null,
  primary key(world_id,starts_at),
  check (mod(extract(epoch from starts_at)::numeric,43200)=0),
  check (ends_at=starts_at+interval '12 hours'),
  foreign key(version,a_category,a_id) references public.world2_law_definitions(version,category,law_id),
  foreign key(version,b_category,b_id) references public.world2_law_definitions(version,category,law_id),
  foreign key(version,c_category,c_id) references public.world2_law_definitions(version,category,law_id)
);
create table public.world2_player_state (
  player_id uuid primary key,
  active_world smallint not null default 1 check(active_world=1),
  abyss_unlocked boolean not null default false check(not abyss_unlocked),
  revision bigint not null default 0 check(revision>=0),
  genuine_rolls bigint not null default 0 check(genuine_rolls>=0),
  updated_at timestamptz not null default clock_timestamp()
);
-- Missing rows are World 1 / locked / zero; no backfill of players is required.
create table public.world2_craft_evidence (
  crafting_event_id uuid primary key,
  player_id uuid not null,
  recipe_id text not null,
  equipment_id text not null,
  category text not null check(category='pickaxe'),
  tier integer not null check(tier>=12),
  crafted_at timestamptz not null,
  evidence_digest text not null check(evidence_digest ~ '^[0-9a-f]{64}$'),
  evidence_source text not null check(evidence_source in ('server_craft_transaction','verified_historical_transaction')),
  unique(player_id,crafting_event_id)
);
create table public.world2_quest_progress (
  player_id uuid primary key,
  version integer not null references public.world2_manifests(version),
  stage smallint not null default 0 check(stage between 0 and 6),
  activated_at timestamptz,
  activation_total_rolls bigint check(activation_total_rolls>=0),
  eligible_sale_proceeds numeric not null default 0 check(eligible_sale_proceeds>=0),
  stage_genuine_rolls bigint not null default 0 check(stage_genuine_rolls>=0),
  craft_evidence jsonb not null default '{}' check(jsonb_typeof(craft_evidence)='object'),
  crafting_event_id uuid,
  revision bigint not null default 0 check(revision>=0),
  check(stage=0), -- contract only, no active quest in Phase 1
  foreign key(player_id,crafting_event_id) references public.world2_craft_evidence(player_id,crafting_event_id)
);
create table public.world2_player_law_state (
  player_id uuid primary key,
  world_id smallint not null default 2 check(world_id=2),
  epoch_start timestamptz not null,
  revision bigint not null default 0 check(revision>=0),
  temporary_state jsonb not null default '{}' check(jsonb_typeof(temporary_state)='object'),
  envy_remaining bigint not null default 0 check(envy_remaining>=0),
  foreign key(world_id,epoch_start) references public.world2_epochs(world_id,starts_at)
);
-- Fixed slots bound storage to 250 genuine positions per player. Loss/relic/empty
-- outcomes occupy a slot with null gem identity; extras never occupy a slot.
create table public.world2_resonance_history (
  player_id uuid not null,
  slot smallint not null check(slot between 0 and 249),
  genuine_ordinal bigint not null check(genuine_ordinal>0),
  gem_identity text,
  natural_mutation_ids text[] not null default '{}',
  outcome_kind text not null check(outcome_kind in ('ordinary','relic','empty','loss')),
  primary key(player_id,slot), unique(player_id,genuine_ordinal),
  check(slot=mod(genuine_ordinal-1,250)),
  check(outcome_kind='ordinary' or gem_identity is null)
);
create table public.world2_adaptation_progress (
  player_id uuid not null,
  source_world smallint not null check(source_world in (1,2)),
  destination_world smallint not null check(destination_world in (1,2)),
  version integer not null references public.world2_manifests(version),
  qualifying_genuine_rolls bigint not null default 0 check(qualifying_genuine_rolls>=0),
  revision bigint not null default 0 check(revision>=0),
  primary key(player_id,source_world,destination_world),
  check(source_world<>destination_world)
);
create table public.world2_equipment_buckets (
  player_id uuid not null,
  world_id smallint not null check(world_id in (1,2)),
  revision bigint not null default 0 check(revision>=0),
  counters_and_queues jsonb not null default '{}' check(jsonb_typeof(counters_and_queues)='object'),
  primary key(player_id,world_id)
);
-- One account activation record per real-time/shared mechanic, never one copy
-- per bucket. Momentum charges remain in convergence_private, not here.
create table public.world2_equipment_activations (
  player_id uuid not null,
  effect_id text not null check(effect_id in ('supersizer_blessing','convergence_surge')),
  activation_world smallint not null check(activation_world in (1,2)),
  activated_at timestamptz not null,
  expires_at timestamptz,
  remaining_genuine_rolls bigint,
  revision bigint not null default 0 check(revision>=0),
  primary key(player_id,effect_id),
  check((effect_id='supersizer_blessing' and expires_at is not null and expires_at=activated_at+interval '5 minutes' and remaining_genuine_rolls is null)
     or (effect_id='convergence_surge' and expires_at is null and remaining_genuine_rolls is not null and remaining_genuine_rolls between 0 and 10))
);
create table public.world2_outcome_receipts (
  player_id uuid not null,
  request_id uuid not null,
  subroll smallint not null check(subroll between 0 and 99),
  world_id smallint not null default 2 check(world_id=2),
  epoch_start timestamptz not null,
  lease_id uuid not null,
  internal_genuine_sequence bigint not null check(internal_genuine_sequence>0),
  world_genuine_ordinal bigint not null check(world_genuine_ordinal>0),
  revision_before bigint not null check(revision_before>=0),
  revision_after bigint not null check(revision_after=revision_before+1),
  request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
  outcome jsonb not null check(jsonb_typeof(outcome)='object'),
  committed_at timestamptz not null default clock_timestamp(),
  primary key(player_id,request_id,subroll),
  unique(player_id,request_id,subroll,world_id,epoch_start),
  unique(player_id,internal_genuine_sequence), unique(player_id,world_genuine_ordinal),
  foreign key(world_id,epoch_start) references public.world2_epochs(world_id,starts_at)
);
-- Acquisition is keyed independently of inventory ownership and survives future
-- consumption/transfers. Phase 4 must carry specimen_id through ALL rebuilds.
-- No historical row/value/weight is rewritten or relabelled by this migration.
create table public.world2_specimen_provenance (
  specimen_id uuid primary key default gen_random_uuid(),
  acquisition_player_id uuid not null,
  request_id uuid,
  subroll smallint,
  specimen_index smallint not null check(specimen_index>=0),
  origin_world smallint not null default 1 check(origin_world in (1,2)),
  epoch_world smallint,
  epoch_start timestamptz,
  source_kind text not null check(source_kind in ('genuine_primary','astral','breakneck','convergence','reward','admin','shop','legacy')),
  external_source_receipt text,
  npc_liquidation_factor numeric not null default 1 check(npc_liquidation_factor in (1,0.8)),
  ordinary_final_weight_ratio numeric check(ordinary_final_weight_ratio>=0 and ordinary_final_weight_ratio<'Infinity'::numeric),
  raw_rolled_weight_multiplier numeric check(raw_rolled_weight_multiplier>=0 and raw_rolled_weight_multiplier<'Infinity'::numeric),
  acquired_at timestamptz not null default clock_timestamp(),
  foreign key(acquisition_player_id,request_id,subroll) references public.world2_outcome_receipts(player_id,request_id,subroll),
  foreign key(acquisition_player_id,request_id,subroll,epoch_world,epoch_start)
    references public.world2_outcome_receipts(player_id,request_id,subroll,world_id,epoch_start),
  foreign key(epoch_world,epoch_start) references public.world2_epochs(world_id,starts_at),
  unique(acquisition_player_id,request_id,subroll,specimen_index),
  unique(acquisition_player_id,source_kind,external_source_receipt,specimen_index),
  check((request_id is not null and subroll is not null and external_source_receipt is null)
     or (request_id is null and subroll is null and external_source_receipt is not null
         and source_kind in ('reward','admin','shop','legacy'))),
  check((origin_world=1 and epoch_world is null and epoch_start is null and npc_liquidation_factor=1)
     or (origin_world=2 and epoch_world is not null and epoch_world=2 and epoch_start is not null))
);
create function public.world2_my_status() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
  select jsonb_build_object('activeWorld',coalesce(s.active_world,1),
    'abyssUnlocked',coalesce(s.abyss_unlocked,false),'gameplayEnabled',false,
    'questEnabled',false,'lawEffectsEnabled',false,'adaptationEnabled',false,
    'revision',coalesce(s.revision,0),'genuineRolls',coalesce(s.genuine_rolls,0))
  from (select auth.uid() as id) caller
  left join public.world2_player_state s on s.player_id=caller.id
  where caller.id is not null;
$$;
revoke all on function public.world2_my_status() from public,anon,authenticated;
grant execute on function public.world2_my_status() to authenticated;
create index world2_provenance_acquirer on public.world2_specimen_provenance(acquisition_player_id);

-- Validate ownership only when NEW storage is written. A foreign key to players
-- would install internal triggers on the existing hot player table. Avoid even
-- that W1 write-path change in Phase 1; account cleanup is a later explicit flow.
create function abyss_private.validate_player() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
declare owner_id uuid := (to_jsonb(new)->>tg_argv[0])::uuid;
begin
  if not exists(select 1 from public.players where id=owner_id) then
    raise exception 'world2_player_not_found' using errcode='23503';
  end if;
  return new;
end;
$$;
revoke all on function abyss_private.validate_player() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['world2_player_state','world2_craft_evidence','world2_quest_progress',
    'world2_player_law_state','world2_resonance_history','world2_adaptation_progress',
    'world2_equipment_buckets','world2_equipment_activations','world2_outcome_receipts'] loop
    execute format('create trigger validate_player before insert or update on public.%I for each row execute function abyss_private.validate_player(''player_id'')',t);
  end loop;
end $$;
create trigger validate_player before insert or update on public.world2_specimen_provenance
for each row execute function abyss_private.validate_player('acquisition_player_id');

create function abyss_private.immutable_record() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'world2_immutable_record' using errcode='55000'; end;
$$;
-- Immutable manifests/tuples/receipts/provenance may only be extended by INSERT.
do $$ declare t text; begin
  foreach t in array array['world2_manifests','world2_law_definitions','world2_equipment_registry',
    'world2_adaptation_levels','world2_epochs','world2_outcome_receipts','world2_specimen_provenance','world2_craft_evidence'] loop
    execute format('create trigger immutable_record before update or delete on public.%I for each row execute function abyss_private.immutable_record()',t);
  end loop;
end $$;

-- Service-only, DB-clock initializer. Per-epoch advisory lock is released at
-- transaction end; concurrent initializers observe the SAME persisted tuple.
create function public.world2_initialize_current_epoch() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  start_time timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp())/43200)*43200);
  manifest integer; result jsonb; ids text[] := '{}'; cat text; chosen text; draw integer;
begin
  perform pg_advisory_xact_lock(20802,(extract(epoch from start_time)/43200)::integer);
  select to_jsonb(e) into result from public.world2_epochs e where e.world_id=2 and e.starts_at=start_time;
  if found then return result; end if;
  select manifest_version into strict manifest from abyss_private.release_config where singleton;
  foreach cat in array array['A','B','C'] loop
    if (select sum(weight) from public.world2_law_definitions where version=manifest and category=cat)
       <> (case cat when 'A' then 11 when 'B' then 3 else 300 end) then
      raise exception 'world2_invalid_weights';
    end if;
    draw := floor(random() * case cat when 'A' then 11 when 'B' then 3 else 300 end)::integer;
    select law_id into strict chosen from (
      select law_id,sum(weight) over(order by law_id) as cumulative
      from public.world2_law_definitions where version=manifest and category=cat
    ) d where cumulative>draw order by cumulative limit 1;
    ids:=array_append(ids,chosen);
  end loop;
  insert into public.world2_epochs(world_id,starts_at,ends_at,version,a_id,b_id,c_id)
    values(2,start_time,start_time+interval '12 hours',manifest,ids[1],ids[2],ids[3]) returning to_jsonb(world2_epochs.*) into result;
  return result;
end;
$$;
alter function public.world2_initialize_current_epoch() owner to postgres;
revoke all on function public.world2_initialize_current_epoch() from public,anon,authenticated;
grant execute on function public.world2_initialize_current_epoch() to service_role;
revoke all on function abyss_private.immutable_record() from public,anon,authenticated;

-- No mutation policy is granted to a client, including the owner of a player.
-- service_role access is explicit; the definer initializer is the only epoch writer.
do $$ declare t text; begin
  foreach t in array array['world2_manifests','world2_law_definitions','world2_equipment_registry',
    'world2_adaptation_levels','world2_epochs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to anon,authenticated,service_role',t);
    execute format('create policy published_contract on public.%I for select to anon,authenticated using(true)',t);
  end loop;
  foreach t in array array['world2_player_state','world2_quest_progress','world2_player_law_state',
    'world2_resonance_history','world2_adaptation_progress','world2_equipment_buckets','world2_equipment_activations',
    'world2_outcome_receipts','world2_craft_evidence'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
    execute format('create policy owner_read on public.%I for select to authenticated using((select auth.uid())=player_id)',t);
  end loop;
end $$;
alter table public.world2_specimen_provenance enable row level security;
revoke all on public.world2_specimen_provenance from public,anon,authenticated,service_role;
-- Provenance/receipts are append-only even for the future server writer.
grant select,insert on public.world2_specimen_provenance to service_role;
revoke update,delete on public.world2_outcome_receipts from service_role;
revoke update,delete on public.world2_craft_evidence from service_role;
-- Provenance has acquisition identity, not current ownership. Expose only via a
-- future ownership-checked inventory join; acquirer-read would leak transfers.
alter table abyss_private.release_config enable row level security;
revoke all on abyss_private.release_config from public,anon,authenticated,service_role;
grant select on abyss_private.release_config to service_role;
-- CONFIGURATION_SEED
commit;
