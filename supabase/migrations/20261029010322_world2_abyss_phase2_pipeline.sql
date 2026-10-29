-- Phase 2 only. No existing W1 function/table/trigger is changed.
-- Gate and Phase 1 world/unlock constraints remain deliberately closed.
begin;
create table abyss_private.pipeline_config (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false check(not enabled)
);
insert into abyss_private.pipeline_config values(true,false);
alter table abyss_private.pipeline_config enable row level security;
revoke all on abyss_private.pipeline_config from public,anon,authenticated,service_role;

create table abyss_private.roll_batches (
 player_id uuid not null, request_id uuid not null,
 request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
 lease_id uuid not null, world_id smallint not null default 2 check(world_id=2), epoch_start timestamptz not null,
 manifest_version integer not null, accepted_at timestamptz not null,
 expires_at timestamptz not null, batch_size integer not null check(batch_size between 1 and 100),
 next_subroll integer not null default 0, first_sequence bigint not null,
 revision bigint not null, accepted_context jsonb not null, worker_token uuid not null default gen_random_uuid(),
 primary key(player_id,request_id),
 check(next_subroll between 0 and batch_size),
 foreign key(world_id,epoch_start) references public.world2_epochs(world_id,starts_at)
);
alter table abyss_private.roll_batches enable row level security;
revoke all on abyss_private.roll_batches from public,anon,authenticated,service_role;
-- Current inventory IDs are transport links only. Immutable specimen UUID and
-- acquisition survive sale/deposit. Phase 4 must propagate UUID across transfers.
create table abyss_private.specimen_links (
 specimen_id uuid primary key references public.world2_specimen_provenance(specimen_id),
 inventory_id bigint unique, route text not null,
 check(route in ('inventory','autosell','deposit','relic'))
);
alter table abyss_private.specimen_links enable row level security;
revoke all on abyss_private.specimen_links from public,anon,authenticated,service_role;

-- A current, DB-created preclaim snapshot is required so speed cannot be priced
-- using a stale epoch or state. This is a service contract, never browser input.
create function public.world2_roll_context(p_player_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s jsonb; e jsonb; p jsonb; gear jsonb;
begin
 if not coalesce((select enabled from abyss_private.pipeline_config where singleton),false)
  or not coalesce((select gameplay_enabled from abyss_private.release_config where singleton),false) then
  return jsonb_build_object('status','disabled');
 end if;
 select to_jsonb(x) into p from public.players x where id=p_player_id for update;
 if p is null then raise exception 'world2_player_not_found'; end if;
 select to_jsonb(x) into s from public.world2_player_state x where player_id=p_player_id;
 if s->>'active_world'<>'2' or not coalesce((s->>'abyss_unlocked')::boolean,false) then
  raise exception 'world2_locked';
 end if;
 e:=public.world2_initialize_current_epoch();
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into gear
 from public.player_equipment x where player_id=p_player_id and equipped;
 return jsonb_build_object('status','ready','player',p,'worldState',s,'epoch',e,'equipment',gear,
  'bucket',coalesce((select to_jsonb(x) from public.world2_equipment_buckets x where player_id=p_player_id and world_id=2),'{}'),
  'runtime',public.roll_refresh_context(p_player_id,clock_timestamp()),
  'temporaryLawState',coalesce((select temporary_state from public.world2_player_law_state where player_id=p_player_id and epoch_start=(e->>'starts_at')::timestamptz),'{}'),
  'envyRemaining',coalesce((select envy_remaining from public.world2_player_law_state where player_id=p_player_id),0),
  'lawState',coalesce((select to_jsonb(x) from public.world2_player_law_state x where player_id=p_player_id),'{}'));
end $$;

-- Replays are returned BEFORE gate/lease/context checks. They are immutable;
-- a committed prefix can always be recovered, including after a disabled release.
create function public.world2_claim_batch(p_player_id uuid,p_request_id uuid,p_digest text,
 p_batch_size integer,p_single_cooldown_ms numeric,p_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare b abyss_private.roll_batches%rowtype; p public.players%rowtype;
 c jsonb; claim jsonb; access jsonb; outcomes jsonb; accepted timestamptz;
begin
 if p_request_id is null or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
    or p_batch_size is null or p_batch_size not between 1 and 100 then raise exception 'world2_invalid_request'; end if;
 select * into p from public.players where id=p_player_id for update;
 if not found then raise exception 'world2_player_not_found'; end if;
 select * into b from abyss_private.roll_batches where player_id=p_player_id and request_id=p_request_id;
 if found then
  if b.request_digest<>p_digest or b.batch_size<>p_batch_size then raise exception 'world2_request_conflict'; end if;
  select coalesce(jsonb_agg(outcome order by subroll),'[]') into outcomes
   from public.world2_outcome_receipts where player_id=p_player_id and request_id=p_request_id;
  return jsonb_build_object('status',case when b.next_subroll=b.batch_size then 'complete'
   when b.expires_at<=clock_timestamp() or p.roll_lease_expires_at is null or p.roll_lease_expires_at<=clock_timestamp() or p.roll_lease_id is distinct from b.lease_id
    then 'partial' else 'in_flight' end,'outcomes',outcomes,'completed',b.next_subroll,'requested',b.batch_size);
 end if;
 c:=public.world2_roll_context(p_player_id);
 if c->>'status'='disabled' then return c; end if;
 -- Read the clock AFTER acquiring the player lock and obtaining the epoch.
 accepted:=clock_timestamp();
 if c is distinct from p_context or accepted >= (c#>>'{epoch,ends_at}')::timestamptz then
  return jsonb_build_object('status','stale_context');
 end if;
 if p_single_cooldown_ms is null or p_single_cooldown_ms<=0 or p_single_cooldown_ms>300000
    or p_single_cooldown_ms='NaN'::numeric then raise exception 'world2_invalid_cooldown'; end if;
 access:=public.roll_batch_unlock_status(p_player_id,p_batch_size);
 if access->>'status' is distinct from 'unlocked' then return access; end if;
 -- Identical accepted batch formula to deployed roll v179: single * size.
 begin
  claim:=public.claim_server_roll(p_player_id,p_single_cooldown_ms*p_batch_size);
  accepted:=clock_timestamp();
  if claim->>'status'='claimed' and accepted >= (c#>>'{epoch,ends_at}')::timestamptz then
   raise exception 'world2_epoch_changed_during_claim' using errcode='W2001';
  end if;
 exception when sqlstate 'W2001' then
  -- Roll back the just-created lease/cooldown before asking the server to
  -- price a fresh context. Never leave an invisible accepted claim behind.
  return jsonb_build_object('status','stale_context');
 end;
 if claim->>'status'<>'claimed' then return claim; end if;
 insert into abyss_private.roll_batches(player_id,request_id,request_digest,lease_id,
  epoch_start,manifest_version,accepted_at,expires_at,batch_size,first_sequence,revision,accepted_context)
 select p_player_id,p_request_id,p_digest,(claim->>'leaseId')::uuid,
  (c#>>'{epoch,starts_at}')::timestamptz,(c#>>'{epoch,version}')::integer,accepted,
  roll_lease_expires_at,p_batch_size,(claim->>'genuineRoll')::bigint,(c#>>'{worldState,revision}')::bigint,c
 from public.players where id=p_player_id returning * into b;
 return jsonb_build_object('status','claimed','workerToken',b.worker_token,
  'epoch',c->'epoch','context',c,'leaseId',b.lease_id,'requested',b.batch_size);
end $$;

-- Only the original claim returns the worker capability. Concurrent duplicate
-- HTTP requests can replay receipts, but cannot draw another RNG candidate.
create function public.world2_begin_subroll(p_player_id uuid,p_request_id uuid,p_digest text,
 p_subroll integer,p_worker_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare b abyss_private.roll_batches%rowtype; p public.players%rowtype; s public.world2_player_state%rowtype; r jsonb;
begin
 select * into p from public.players where id=p_player_id for update;
 select * into b from abyss_private.roll_batches where player_id=p_player_id and request_id=p_request_id;
 if not found or b.request_digest is distinct from p_digest then raise exception 'world2_request_conflict'; end if;
 select outcome into r from public.world2_outcome_receipts where player_id=p_player_id and request_id=p_request_id and subroll=p_subroll;
 if found then return jsonb_build_object('status','replay','outcome',r); end if;
 if not coalesce((select enabled from abyss_private.pipeline_config where singleton),false)
  or not coalesce((select gameplay_enabled from abyss_private.release_config where singleton),false) then raise exception 'world2_disabled'; end if;
 if p_worker_token is null or b.worker_token is distinct from p_worker_token
  or b.lease_id is distinct from p.roll_lease_id or b.expires_at<=clock_timestamp()
  or p.roll_lease_expires_at is null or p.roll_lease_expires_at<=clock_timestamp() then raise exception 'world2_stale_lease'; end if;
 select * into s from public.world2_player_state where player_id=p_player_id for update;
 if (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.player_equipment x where player_id=p_player_id and equipped) is distinct from b.accepted_context->'equipment' then raise exception 'world2_equipment_changed'; end if;
 if s.active_world is distinct from 2 or not s.abyss_unlocked or s.revision is distinct from b.revision
  or p_subroll is distinct from b.next_subroll or p_subroll>=b.batch_size
  or p.equipment_genuine_rolls+1<>b.first_sequence+p_subroll
  or p.equipment_state_roll+1<>b.first_sequence+p_subroll then raise exception 'world2_stale_state'; end if;
 return jsonb_build_object('status','ready','sequence',b.first_sequence+p_subroll,
  'acceptedContext',b.accepted_context,'revision',s.revision,'ordinal',s.genuine_rolls+1,'epochStart',b.epoch_start,
  'runtime',public.roll_refresh_context(p_player_id,clock_timestamp()),
  'player',to_jsonb(p),'bucket',coalesce((select counters_and_queues from public.world2_equipment_buckets where player_id=p_player_id and world_id=2),'{}'),
  -- Epoch-local state resets by epoch identity even when consecutive laws repeat.
  'lawState',coalesce((select temporary_state from public.world2_player_law_state where player_id=p_player_id and epoch_start=b.epoch_start),'{}'),
  'envyRemaining',coalesce((select envy_remaining from public.world2_player_law_state where player_id=p_player_id),0),
  'history',coalesce((select jsonb_agg(to_jsonb(h) order by genuine_ordinal) from public.world2_resonance_history h where player_id=p_player_id),'[]'));
end $$;

-- Outcome input is produced by trusted server evaluation only. No browser RPC
-- has execution rights. Law algorithms/catalogue are intentionally Phase 3.
create function public.world2_commit_subroll(p_player_id uuid,p_request_id uuid,p_digest text,
 p_subroll integer,p_worker_token uuid,p_outcome jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare b abyss_private.roll_batches%rowtype; c jsonb; route jsonb;
 primary_spec jsonb:=p_outcome->'primary'; item jsonb; saved public.inventory_gems%rowtype;
 keep boolean; sold boolean:=false; result jsonb; specimens jsonb:='[]'; sid uuid;
 kind text:=p_outcome->>'kind'; idx integer:=0; cap integer; money_before numeric; money_after numeric;
 runtime jsonb; mutation_ids text[]; n bigint; route_name text;
begin
 -- Begin enforces lock order, replay-before-validation and both genuine fences.
 c:=public.world2_begin_subroll(p_player_id,p_request_id,p_digest,p_subroll,p_worker_token);
 if c->>'status'='replay' then return c->'outcome'; end if;
 select * into b from abyss_private.roll_batches where player_id=p_player_id and request_id=p_request_id;
 if kind is null or kind not in ('ordinary','relic','empty','loss') or jsonb_typeof(p_outcome) is distinct from 'object'
  or jsonb_typeof(p_outcome->'bucket') is distinct from 'object'
  or jsonb_typeof(p_outcome->'lawState') is distinct from 'object'
  or jsonb_typeof(p_outcome->'extras') is distinct from 'array'
  or jsonb_array_length(p_outcome->'extras')>100 then raise exception 'world2_invalid_outcome'; end if;
 if kind in ('ordinary','relic') and (jsonb_typeof(primary_spec) is distinct from 'object' or nullif(primary_spec->>'gem_name','') is null)
  or kind in ('empty','loss') and primary_spec is distinct from 'null'::jsonb then raise exception 'world2_invalid_primary'; end if;
 if kind<>'ordinary' and jsonb_array_length(p_outcome->'extras')<>0 then raise exception 'world2_invalid_extras'; end if;
 -- Server-derived inventory capacity includes research through the deployed context.
 runtime:=public.roll_refresh_context(p_player_id,clock_timestamp());
 cap:=coalesce((runtime#>>'{player,inventory_capacity}')::integer,0) +
  greatest(0,coalesce(trunc((runtime#>>'{player,player_research_effects,0,inventory_bonus}')::numeric)::integer,0));
 select money into money_before from public.players where id=p_player_id;
 if kind='ordinary' then
  route:=public.roll_route_result(p_player_id,b.lease_id,primary_spec,
   coalesce((p_outcome->>'filterKeep')::boolean,false),runtime->>'activeAutoCraft',null);
  if route->>'autoCraftError' is not null then raise exception 'world2_deposit_failed'; end if;
  keep:=coalesce(route#>>'{bundle,status}','none')<>'deposited' and
   (not coalesce((route#>>'{autoCraft,deposited}')::boolean,false) or coalesce((route#>>'{autoCraft,preserved}')::boolean,false));
  route_name:=case when keep then 'inventory' else 'deposit' end;
  if keep then
   select count(*) into n from public.inventory_gems where player_id=p_player_id and gem_name not in ('Enchant Relic','Ancient Relic');
   if n>=cap then raise exception 'inventory_full'; end if;
   saved:=public.roll_insert_inventory_specimen(p_player_id,primary_spec||jsonb_build_object('genuine_roll',true,'roll_number',(c#>>'{player,total_rolls}')::bigint+1));
   if coalesce((p_outcome->>'filterSell')::boolean,false) and not coalesce((route#>>'{bundle,keepInInventory}')::boolean,false)
    and not coalesce((route#>>'{autoCraft,deposited}')::boolean,false) then
    perform public.sell_inventory_gem(p_player_id,saved.id,'auto'); sold:=true; route_name:='autosell';
   end if;
  end if;
 elsif kind='relic' then
  perform public.grant_player_relic(p_player_id,primary_spec->>'gem_name',1); route_name:='relic';
 end if;
 -- One identity per acquired specimen, even if immediately sold or deposited.
 if kind in ('ordinary','relic') then
  sid:=gen_random_uuid();
  specimens:=jsonb_build_array(jsonb_build_object('specimenId',sid,'source','genuine_primary','specimen',primary_spec,'inventoryId',saved.id,'route',route_name));
 end if;
 for item in select value from jsonb_array_elements(p_outcome->'extras') loop
  if item->>'source' is null or item->>'source' not in ('astral','breakneck','convergence')
   or jsonb_typeof(item->'specimen') is distinct from 'object' then raise exception 'world2_invalid_extra'; end if;
  select count(*) into n from public.inventory_gems where player_id=p_player_id and gem_name not in ('Enchant Relic','Ancient Relic');
  -- Fail the whole subroll rather than silently drop a promised bonus.
  if n>=cap then raise exception 'inventory_full'; end if;
  saved:=public.roll_insert_inventory_specimen(p_player_id,item->'specimen'||jsonb_build_object('genuine_roll',false));
  specimens:=specimens||jsonb_build_array(jsonb_build_object('specimenId',gen_random_uuid(),'source',item->>'source','specimen',item->'specimen','inventoryId',saved.id,'route','inventory'));
 end loop;
 mutation_ids:=case when kind='ordinary' then array(select jsonb_array_elements_text(coalesce(primary_spec->'natural_mutation_ids','[]'))) else '{}'::text[] end;
 update public.players set total_rolls=total_rolls+1,equipment_genuine_rolls=equipment_genuine_rolls+1,
  equipment_state_roll=(c->>'sequence')::bigint where id=p_player_id;
 -- W1 equipment_state is deliberately untouched; only its sequence fence advances.
 update public.world2_player_state set genuine_rolls=genuine_rolls+1,revision=revision+1,updated_at=clock_timestamp() where player_id=p_player_id;
 insert into public.world2_equipment_buckets(player_id,world_id,revision,counters_and_queues)
 values(p_player_id,2,(c->>'revision')::bigint+1,p_outcome->'bucket')
 on conflict(player_id,world_id) do update set revision=excluded.revision,counters_and_queues=excluded.counters_and_queues;
 insert into public.world2_player_law_state(player_id,epoch_start,revision,temporary_state,envy_remaining)
 values(p_player_id,b.epoch_start,(c->>'revision')::bigint+1,p_outcome->'lawState',coalesce((p_outcome->>'envyRemaining')::bigint,(c->>'envyRemaining')::bigint))
 on conflict(player_id) do update set epoch_start=excluded.epoch_start,revision=excluded.revision,temporary_state=excluded.temporary_state,envy_remaining=excluded.envy_remaining;
 insert into public.world2_resonance_history(player_id,slot,genuine_ordinal,gem_identity,natural_mutation_ids,outcome_kind)
 values(p_player_id,mod((c->>'ordinal')::bigint-1,250),(c->>'ordinal')::bigint,
  case when kind='ordinary' then primary_spec->>'gem_name' end,mutation_ids,kind)
 on conflict(player_id,slot) do update set genuine_ordinal=excluded.genuine_ordinal,gem_identity=excluded.gem_identity,natural_mutation_ids=excluded.natural_mutation_ids,outcome_kind=excluded.outcome_kind;
 select money into money_after from public.players where id=p_player_id;
 result:=jsonb_build_object('kind',kind,'subroll',p_subroll,'epochStart',b.epoch_start,
  'manifestVersion',b.manifest_version,'sequence',c->'sequence','ordinal',c->'ordinal',
  'revision',(c->>'revision')::bigint+1,'specimens',specimens,'route',route,'sold',sold,
  'cashDelta',money_after-money_before,'totalRolls',(c#>>'{player,total_rolls}')::bigint+1,
  'bucket',p_outcome->'bucket','lawState',p_outcome->'lawState');
 insert into public.world2_outcome_receipts(player_id,request_id,subroll,epoch_start,lease_id,internal_genuine_sequence,
  world_genuine_ordinal,revision_before,revision_after,request_digest,outcome)
 values(p_player_id,p_request_id,p_subroll,b.epoch_start,b.lease_id,(c->>'sequence')::bigint,
  (c->>'ordinal')::bigint,(c->>'revision')::bigint,(c->>'revision')::bigint+1,p_digest,result);
 for item in select value from jsonb_array_elements(specimens) loop
  insert into public.world2_specimen_provenance(specimen_id,acquisition_player_id,request_id,subroll,specimen_index,
   origin_world,epoch_world,epoch_start,source_kind,npc_liquidation_factor,ordinary_final_weight_ratio,raw_rolled_weight_multiplier)
  values((item->>'specimenId')::uuid,p_player_id,p_request_id,p_subroll,idx,2,2,b.epoch_start,item->>'source',1,
   (item#>>'{specimen,ordinary_final_weight_ratio}')::numeric,(item#>>'{specimen,rolled_weight_multiplier}')::numeric);
  insert into abyss_private.specimen_links values((item->>'specimenId')::uuid,(item->>'inventoryId')::bigint,item->>'route');
  idx:=idx+1;
 end loop;
 -- Check the clock AGAIN after waiting for routing locks. Crossing a deadline
 -- aborts every effect in this transaction, not only the receipt.
 if b.expires_at<=clock_timestamp() or (select roll_lease_expires_at from public.players where id=p_player_id)<=clock_timestamp() then raise exception 'world2_stale_lease'; end if;
 update abyss_private.roll_batches set next_subroll=next_subroll+1,revision=revision+1
  where player_id=p_player_id and request_id=p_request_id;
 if p_subroll=b.batch_size-1 then perform public.release_server_roll(p_player_id,b.lease_id); end if;
 return result;
end $$;

-- Reserved switch boundary. Phase 1's false gates/constraints still prohibit W2.
-- A later activation must call this boundary and never update active_world directly.
create function public.world2_switch_world(p_player_id uuid,p_world integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.players%rowtype;
begin
 select * into p from public.players where id=p_player_id for update;
 if not found then raise exception 'world2_player_not_found'; end if;
 if p.roll_lease_id is not null and p.roll_lease_expires_at>clock_timestamp() then raise exception 'world2_roll_in_flight'; end if;
 if p_world is null or p_world not in (1,2) then raise exception 'world2_invalid_world'; end if;
 if not coalesce((select enabled from abyss_private.pipeline_config where singleton),false)
  or not coalesce((select gameplay_enabled from abyss_private.release_config where singleton),false) then raise exception 'world2_disabled'; end if;
 update public.world2_player_state set active_world=p_world,revision=revision+1,updated_at=clock_timestamp()
 where player_id=p_player_id and (p_world=1 or abyss_unlocked);
 if not found then raise exception 'world2_locked'; end if;
 return jsonb_build_object('activeWorld',p_world);
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
  and proname in ('world2_roll_context','world2_claim_batch','world2_begin_subroll','world2_commit_subroll','world2_switch_world') loop
  execute format('alter function %s owner to postgres',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
