-- Phase 3 additive law persistence fixes. All gameplay gates remain false.
-- Envy is epoch-local. Exact integer numeric avoids a gameplay cap and JS loss.
begin;
alter table public.world2_player_law_state alter column envy_remaining type numeric using envy_remaining::numeric;
alter table public.world2_player_law_state add constraint world2_envy_integer
 check(envy_remaining=trunc(envy_remaining) and envy_remaining<'Infinity'::numeric);

create or replace function public.world2_roll_context(p_player_id uuid) returns jsonb
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
  'envyRemaining',coalesce((select envy_remaining::text from public.world2_player_law_state where player_id=p_player_id and epoch_start=(e->>'starts_at')::timestamptz),'0'),
  'lawState',coalesce((select to_jsonb(x)||jsonb_build_object('envy_remaining',x.envy_remaining::text) from public.world2_player_law_state x where player_id=p_player_id and epoch_start=(e->>'starts_at')::timestamptz),'{}'));
end $$;

create or replace function public.world2_begin_subroll(p_player_id uuid,p_request_id uuid,p_digest text,
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
  'envyRemaining',coalesce((select envy_remaining::text from public.world2_player_law_state where player_id=p_player_id and epoch_start=b.epoch_start),'0'),
  'history',coalesce((select jsonb_agg(to_jsonb(h) order by genuine_ordinal) from public.world2_resonance_history h where player_id=p_player_id),'[]'));
end $$;

create or replace function public.world2_commit_subroll(p_player_id uuid,p_request_id uuid,p_digest text,
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
 values(p_player_id,b.epoch_start,(c->>'revision')::bigint+1,p_outcome->'lawState',coalesce((p_outcome->>'envyRemaining')::numeric,(c->>'envyRemaining')::numeric))
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
  'bucket',p_outcome->'bucket','lawState',p_outcome->'lawState','envyRemaining',coalesce(p_outcome->>'envyRemaining',c->>'envyRemaining'));
 insert into public.world2_outcome_receipts(player_id,request_id,subroll,epoch_start,lease_id,internal_genuine_sequence,
  world_genuine_ordinal,revision_before,revision_after,request_digest,outcome)
 values(p_player_id,p_request_id,p_subroll,b.epoch_start,b.lease_id,(c->>'sequence')::bigint,
  (c->>'ordinal')::bigint,(c->>'revision')::bigint,(c->>'revision')::bigint+1,p_digest,result);
 for item in select value from jsonb_array_elements(specimens) loop
  insert into public.world2_specimen_provenance(specimen_id,acquisition_player_id,request_id,subroll,specimen_index,
   origin_world,epoch_world,epoch_start,source_kind,npc_liquidation_factor,ordinary_final_weight_ratio,raw_rolled_weight_multiplier)
  values((item->>'specimenId')::uuid,p_player_id,p_request_id,p_subroll,idx,2,2,b.epoch_start,item->>'source',case when (select a_id from public.world2_epochs where world_id=2 and starts_at=b.epoch_start)='austerity' then 0.8 else 1 end,
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

-- CREATE OR REPLACE retains the existing service-only grants and ownership.
commit;
