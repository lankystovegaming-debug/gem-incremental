begin;
alter table public.biome_occurrences add constraint biome_no_overlap
 exclude using gist (tstzrange(starts_at,ends_at,'[)') with &&);
alter table public.players add column biome_batch_snapshot jsonb;
alter table public.players add column biome_batch_lease uuid;
-- Private snapshot is set by the service-only accepted claim, never client input.
create function public.biome_acceptance_snapshot(p_player_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 with instant as materialized (select clock_timestamp() as accepted_at)
 select jsonb_build_object('version','biomes-v1.1','acceptedAt',instant.accepted_at,
  'tournament',coalesce((select settings->'biomeTournamentMode' from public.player_settings where player_id=p_player_id),'false'::jsonb),
  'occurrence',(
   select jsonb_build_object('id',o.id,'key',o.biome_key,'startsAt',o.starts_at,'endsAt',o.ends_at,
    'denominators',(select jsonb_object_agg(gem_name,denominator) from public.biome_gem_rules where biome_key=o.biome_key))
   from public.biome_scheduler s join public.biome_occurrences o on o.id=s.occurrence_id
   where o.starts_at<=instant.accepted_at and o.ends_at>instant.accepted_at
  )) from instant;
$$;
revoke all on function public.biome_acceptance_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.biome_acceptance_snapshot(uuid) to service_role;
create or replace function public.claim_equipment_roll_batch(
  p_player_id uuid,
  p_cooldown_ms numeric,
  p_equipment_state jsonb,
  p_equipment_ids bigint[],
  p_batch_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_ids bigint[];
  v_access jsonb;
  v_claim jsonb;
  v_surge jsonb;
  v_biome jsonb;
begin
  select equipment_state
  into v_state
  from public.players
  where id = p_player_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_access := public.roll_batch_unlock_status(p_player_id, p_batch_size);
  if v_access->>'status' <> 'unlocked' then
    return v_access;
  end if;

  select coalesce(array_agg(id order by id), '{}'::bigint[])
  into v_ids
  from public.player_equipment
  where player_id = p_player_id
    and equipped;

  if v_state is distinct from p_equipment_state
     or v_ids is distinct from (
       select coalesce(array_agg(x order by x), '{}'::bigint[])
       from unnest(p_equipment_ids) x
     ) then
    return jsonb_build_object('status', 'state_changed');
  end if;

  v_claim := public.claim_server_roll(p_player_id, p_cooldown_ms);
  if v_claim->>'status' = 'claimed' then
    v_surge := public.claim_guild_mythic_surge(p_player_id);
    v_biome := public.biome_acceptance_snapshot(p_player_id);
    update public.players set biome_batch_snapshot=v_biome,
      biome_batch_lease=(v_claim->>'leaseId')::uuid where id=p_player_id;
    v_claim := v_claim || jsonb_build_object(
      'batchSize', p_batch_size,
      'biomeSnapshot', v_biome,
      'mythicSurge', v_surge
    );
  end if;
  return v_claim;
end;
$$;

revoke all on function public.claim_equipment_roll_batch(uuid, numeric, jsonb, bigint[], integer)
  from public, anon, authenticated;
grant execute on function public.claim_equipment_roll_batch(uuid, numeric, jsonb, bigint[], integer)
  to service_role;


-- Runs inside existing commit_equipment_roll / roll_finalize_atomic transactions.
-- A rollback removes discovery too. Bonus inventory inserts do not trigger it.
create function public.discover_committed_biome() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.equipment_state_roll=old.equipment_state_roll+1
    and new.biome_batch_lease is not null
    and new.biome_batch_lease=old.roll_lease_id
    and new.biome_batch_snapshot->'occurrence'->>'id' is not null then
  insert into public.player_biome_discoveries(player_id,biome_key,occurrence_id,first_genuine_roll)
   values(new.id,new.biome_batch_snapshot->'occurrence'->>'key',
    (new.biome_batch_snapshot->'occurrence'->>'id')::uuid,new.equipment_state_roll)
   on conflict(player_id,biome_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.discover_committed_biome() from public,anon,authenticated;
create trigger discover_committed_biome after update of equipment_state_roll on public.players
 for each row when (new.equipment_state_roll is distinct from old.equipment_state_roll)
 execute function public.discover_committed_biome();

-- This independent preference changes only biome eligibility/amplification.
create function public.set_biome_tournament_mode(p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 if p_enabled is null then raise exception 'invalid_boolean'; end if;
 perform 1 from public.players where id=v_uid for update;
 insert into public.player_settings(player_id,settings) values(v_uid,jsonb_build_object('biomeTournamentMode',p_enabled))
 on conflict(player_id) do update set settings=public.player_settings.settings||excluded.settings,updated_at=now();
 return p_enabled;
end $$;
revoke all on function public.set_biome_tournament_mode(boolean) from public,anon;
grant execute on function public.set_biome_tournament_mode(boolean) to authenticated;
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Permafrost',12000000.0,850,8000,400,false,true,'{"biome": "Frozen", "biomeKind": "native", "optionalCollection": false}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Permafrost');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Frozen", "biomeKind": "native", "optionalCollection": false}'::jsonb,
 rarity=12000000.0,base_weight=850,value_per_gram=8000,affected_by_luck=true where name='Permafrost';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Brimstone',16000000.0,666,15000,401,false,true,'{"biome": "Infernal", "biomeKind": "native", "optionalCollection": false}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Brimstone');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Infernal", "biomeKind": "native", "optionalCollection": false}'::jsonb,
 rarity=16000000.0,base_weight=666,value_per_gram=15000,affected_by_luck=true where name='Brimstone';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Noctilucent',18000000.0,300,40000,402,false,true,'{"biome": "Nightfall", "biomeKind": "native", "optionalCollection": false}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Noctilucent');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Nightfall", "biomeKind": "native", "optionalCollection": false}'::jsonb,
 rarity=18000000.0,base_weight=300,value_per_gram=40000,affected_by_luck=true where name='Noctilucent';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Haloite',18000000.0,120,100000,403,false,true,'{"biome": "Heavenly", "biomeKind": "native", "optionalCollection": false}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Haloite');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Heavenly", "biomeKind": "native", "optionalCollection": false}'::jsonb,
 rarity=18000000.0,base_weight=120,value_per_gram=100000,affected_by_luck=true where name='Haloite';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Heart of the Tide',40000000.0,1250,16000,404,false,true,'{"biome": "Oceanic", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Oceanic"}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Heart of the Tide');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Oceanic", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Oceanic"}'::jsonb,
 rarity=40000000.0,base_weight=1250,value_per_gram=16000,affected_by_luck=true where name='Heart of the Tide';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Caldera Heart',75000000.0,4500,7500,405,false,true,'{"biome": "Volcanic", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Volcanic"}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Caldera Heart');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Volcanic", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Volcanic"}'::jsonb,
 rarity=75000000.0,base_weight=4500,value_per_gram=7500,affected_by_luck=true where name='Caldera Heart';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Absolute Zero',125000000.0,0.01,5000000000.0,406,false,true,'{"biome": "Frozen", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Frozen"}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Absolute Zero');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Frozen", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Frozen"}'::jsonb,
 rarity=125000000.0,base_weight=0.01,value_per_gram=5000000000.0,affected_by_luck=true where name='Absolute Zero';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Telluric Heart',175000000.0,12000,5000,407,false,true,'{"biome": "Deep Earth", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Deep Earth"}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Telluric Heart');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Deep Earth", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Deep Earth"}'::jsonb,
 rarity=175000000.0,base_weight=12000,value_per_gram=5000,affected_by_luck=true where name='Telluric Heart';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Midnight',250000000.0,12,7500000.0,408,false,true,'{"biome": "Nightfall", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Nightfall"}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Midnight');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Nightfall", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Nightfall"}'::jsonb,
 rarity=250000000.0,base_weight=12,value_per_gram=7500000.0,affected_by_luck=true where name='Midnight';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Damnation',333333333,666,200000,409,false,true,'{"biome": "Infernal", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Infernal", "rarityClass": "anomalous"}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Damnation');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Infernal", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Infernal", "rarityClass": "anomalous"}'::jsonb,
 rarity=333333333,base_weight=666,value_per_gram=200000,affected_by_luck=true where name='Damnation';
insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,affected_by_luck,metadata,description,hide_rarity_until_discovered)
 select 'Aberration',750000000.0,1e-06,150000000000000.0,410,false,true,'{"biome": "Distortion", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Distortion", "rarityClass": "anomalous"}'::jsonb,'',true
 where not exists(select 1 from public.private_feature_gems where name='Aberration');
update public.private_feature_gems set metadata=coalesce(metadata,'{}')||'{"biome": "Distortion", "biomeKind": "exclusive", "optionalCollection": true, "requiredBiome": "Distortion", "rarityClass": "anomalous"}'::jsonb,
 rarity=750000000.0,base_weight=1e-06,value_per_gram=150000000000000.0,affected_by_luck=true where name='Aberration';
update public.private_feature_gems set description='A mineral trapped beneath ice for longer than recorded history. It refuses to thaw.' where name='Permafrost';
update public.private_feature_gems set description='A mineral that burns continuously without losing mass.' where name='Brimstone';
update public.private_feature_gems set description='It only begins to shine after everything around it goes dark.' where name='Noctilucent';
update public.private_feature_gems set description='A ring-shaped crystal that casts light inward rather than outward.' where name='Haloite';
update public.private_feature_gems set description='A crystalline sphere that contains a miniature tide. Water endlessly rises and falls beneath its surface despite having nowhere to go.' where name='Heart of the Tide';
update public.private_feature_gems set description='A crystalline mass formed at the centre of a collapsing magma chamber. Its surface has cooled into black stone, but something beneath it continues to glow.' where name='Caldera Heart';
update public.private_feature_gems set description='There is no heat left to take.' where name='Absolute Zero';
update public.private_feature_gems set description='A dense crystalline mass carried upward from a depth no drill has ever reached. Even at the surface, it remains under pressures that should be impossible.' where name='Telluric Heart';
update public.private_feature_gems set description='A fragment of the darkest point of night. Light bends around it as though midnight itself has been given form.' where name='Midnight';
update public.private_feature_gems set description='Something that should never have crystallised.' where name='Damnation';
update public.private_feature_gems set description='Reality tried to correct itself. This was the result.' where name='Aberration';

create or replace function public.sync_gem_index_achievements_v013(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gems numeric := 0;
  v_mutations numeric := 0;
  v_catalog_total numeric := 0;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then
    raise exception 'forbidden';
  end if;

  select count(distinct combination.gem_name)
  into v_gems
  from public.player_gem_mutation_combinations combination
  where combination.player_id = p_uid
    and not exists(select 1 from public.private_feature_gems g where g.name=combination.gem_name
      and g.metadata->>'optionalCollection'='true');

  select count(*) into v_catalog_total
  from public.private_feature_gems gem
  where gem.enabled and coalesce(gem.metadata->>'optionalCollection','false')<>'true';

  perform public.achievement_set_progress_v013(p_uid, 'Index Apprentice', v_gems, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Index Explorer', v_gems, 25);
  perform public.achievement_set_progress_v013(p_uid, 'Index Scholar', v_gems, 50);
  perform public.achievement_set_progress_v013(p_uid, 'Index Expert', v_gems, 100);
  perform public.achievement_set_progress_v013(p_uid, 'The Complete Index', v_gems, v_catalog_total);

  select count(distinct mutation.mutation_id)
  into v_mutations
  from public.player_gem_mutation_combinations combination
  cross join lateral unnest(coalesce(combination.mutation_ids, '{}'::text[]))
    as mutation(mutation_id)
  where combination.player_id = p_uid;

  select count(*) into v_catalog_total
  from public.game_mutations mutation
  where mutation.enabled;

  perform public.achievement_set_progress_v013(p_uid, 'Five Mutation Types', v_mutations, 5);
  perform public.achievement_set_progress_v013(p_uid, 'Ten Mutation Types', v_mutations, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Mutation Mastery', v_mutations, v_catalog_total);
end;
$$;

revoke all on function public.sync_gem_index_achievements_v013(uuid) from public,anon,authenticated;
grant execute on function public.sync_gem_index_achievements_v013(uuid) to service_role;

-- Protect new authoritative fields even where an old table-level UPDATE grant exists.
create function public.protect_biome_snapshot() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user not in ('postgres','service_role','supabase_admin') then
  raise exception 'biome_snapshot_is_server_owned';
 end if;
 return new;
end $$;
revoke all on function public.protect_biome_snapshot() from public,anon,authenticated;
create trigger protect_biome_snapshot before update of biome_batch_snapshot,biome_batch_lease,equipment_state_roll on public.players
 for each row when (new.equipment_state_roll is distinct from old.equipment_state_roll or new.biome_batch_snapshot is distinct from old.biome_batch_snapshot or new.biome_batch_lease is distinct from old.biome_batch_lease)
 execute function public.protect_biome_snapshot();
commit;
