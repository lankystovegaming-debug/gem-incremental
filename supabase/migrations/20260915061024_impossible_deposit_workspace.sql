begin;

create index if not exists inventory_gems_impossible_deposit_idx
on public.inventory_gems(player_id,value,id)
where not locked and not museum_locked
  and gem_name not in ('Enchant Relic','Ancient Relic');

-- Deposits use the existing private crafting_progress row. Manual deposits
-- atomically remove a real unlocked inventory gem; Auto Craft records the
-- authoritative rolled specimen instead of inserting it into inventory.
create or replace function impossible_private.deposit_materials(p_uid uuid)
returns jsonb language sql volatile security definer set search_path='' as $$
 select coalesce(
   (select progress->'_impossibleSacrifice' from public.crafting_progress
    where player_id=p_uid and recipe_id='impossible-pickaxe'),
   jsonb_build_object(
     'selectedCount',0,'common',0,'legendary',0,'mythic',0,'exotic',0,'exalted',0,'cosmicPlus',0,
     'multiplier10',0,'multiplier15',0,'multiplier25',0,'value100m',0,'weight5m',0,
     'totalWeight',0,'totalValue',0,'highestValue','[]'::jsonb
   )
 )
$$;
revoke all on function impossible_private.deposit_materials(uuid) from public,anon,authenticated;

create or replace function impossible_private.deposit_ready(p_material jsonb)
returns boolean language sql immutable security definer set search_path='' as $$
 select coalesce((p_material->>'common')::numeric,0)>=1000
   and coalesce((p_material->>'legendary')::numeric,0)>=67000
   and coalesce((p_material->>'mythic')::numeric,0)>=30000
   and coalesce((p_material->>'exotic')::numeric,0)>=500
   and coalesce((p_material->>'exalted')::numeric,0)>=30
   and coalesce((p_material->>'cosmicPlus')::numeric,0)>=15
   and coalesce((p_material->>'multiplier10')::numeric,0)>=14
   and coalesce((p_material->>'multiplier15')::numeric,0)>=4
   and coalesce((p_material->>'multiplier25')::numeric,0)>=1
   and coalesce((p_material->>'value100m')::numeric,0)>=1
   and coalesce((p_material->>'weight5m')::numeric,0)>=1
   and coalesce((p_material->>'totalWeight')::numeric,0)>=1000000000
   and coalesce((p_material->>'totalValue')::numeric,0)>=1000000000
$$;
revoke all on function impossible_private.deposit_ready(jsonb) from public,anon,authenticated;

create or replace function impossible_private.deposit_specimen(
  p_uid uuid,p_specimen jsonb,p_only_if_useful boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_progress jsonb; v_material jsonb; v_high jsonb; v_summary jsonb;
 v_name text:=p_specimen->>'gem_name'; v_rarity numeric:=coalesce((p_specimen->>'rarity')::numeric,0);
 v_base numeric:=coalesce((p_specimen->>'base_weight')::numeric,0);
 v_weight numeric:=coalesce((p_specimen->>'final_weight')::numeric,0);
 v_value numeric:=coalesce((p_specimen->>'value')::numeric,0);
 v_multiplier numeric:=case when coalesce((p_specimen->>'base_weight')::numeric,0)>0
   then coalesce((p_specimen->>'final_weight')::numeric,0)/(p_specimen->>'base_weight')::numeric else 0 end;
 v_useful boolean;
begin
 if p_uid is null or p_specimen is null or v_name is null then raise exception 'invalid_impossible_deposit'; end if;
 if v_name in ('Enchant Relic','Ancient Relic') then
   return jsonb_build_object('deposited',false,'preserved',true,'reason','protected_relic');
 end if;
 insert into public.crafting_progress(player_id,recipe_id,progress)
 values(p_uid,'impossible-pickaxe','{}'::jsonb) on conflict(player_id,recipe_id) do nothing;
 select progress into v_progress from public.crafting_progress
 where player_id=p_uid and recipe_id='impossible-pickaxe' for update;
 v_material:=impossible_private.deposit_materials(p_uid);

 v_useful:=
   (v_rarity between 1 and 9 and coalesce((v_material->>'common')::numeric,0)<1000)
   or (v_rarity between 1000 and 9999 and coalesce((v_material->>'legendary')::numeric,0)<67000)
   or (v_rarity between 10000 and 99999 and coalesce((v_material->>'mythic')::numeric,0)<30000)
   or (v_rarity between 100000 and 999999 and coalesce((v_material->>'exotic')::numeric,0)<500)
   or (v_rarity between 1000000 and 9999999 and coalesce((v_material->>'exalted')::numeric,0)<30)
   or (v_rarity>=10000000 and coalesce((v_material->>'cosmicPlus')::numeric,0)<15)
   or (v_multiplier>=10 and coalesce((v_material->>'multiplier10')::numeric,0)<14)
   or (v_multiplier>=15 and coalesce((v_material->>'multiplier15')::numeric,0)<4)
   or (v_multiplier>=25 and coalesce((v_material->>'multiplier25')::numeric,0)<1)
   or (v_value>=100000000 and coalesce((v_material->>'value100m')::numeric,0)<1)
   or (v_weight>=5000000 and coalesce((v_material->>'weight5m')::numeric,0)<1)
   or coalesce((v_material->>'totalWeight')::numeric,0)<1000000000
   or coalesce((v_material->>'totalValue')::numeric,0)<1000000000;
 if p_only_if_useful and not v_useful then
   return jsonb_build_object('deposited',false,'preserved',true,'reason','not_needed','materials',v_material);
 end if;

 v_summary:=jsonb_build_object(
   'id',coalesce((p_specimen->>'id')::bigint,0),'gem_name',v_name,'rarity',v_rarity,
   'final_weight',v_weight,'value',v_value,'final_multiplier',round(v_multiplier,2)
 );
 select coalesce(jsonb_agg(item order by (item->>'value')::numeric desc,(item->>'id')::bigint),'[]'::jsonb)
 into v_high from (
   select item from jsonb_array_elements(coalesce(v_material->'highestValue','[]'::jsonb)||jsonb_build_array(v_summary)) item
   order by (item->>'value')::numeric desc,(item->>'id')::bigint limit 20
 ) ranked;
 v_material:=jsonb_build_object(
   'selectedCount',coalesce((v_material->>'selectedCount')::numeric,0)+1,
   'common',coalesce((v_material->>'common')::numeric,0)+case when v_rarity between 1 and 9 then 1 else 0 end,
   'legendary',coalesce((v_material->>'legendary')::numeric,0)+case when v_rarity between 1000 and 9999 then 1 else 0 end,
   'mythic',coalesce((v_material->>'mythic')::numeric,0)+case when v_rarity between 10000 and 99999 then 1 else 0 end,
   'exotic',coalesce((v_material->>'exotic')::numeric,0)+case when v_rarity between 100000 and 999999 then 1 else 0 end,
   'exalted',coalesce((v_material->>'exalted')::numeric,0)+case when v_rarity between 1000000 and 9999999 then 1 else 0 end,
   'cosmicPlus',coalesce((v_material->>'cosmicPlus')::numeric,0)+case when v_rarity>=10000000 then 1 else 0 end,
   'multiplier10',coalesce((v_material->>'multiplier10')::numeric,0)+case when v_multiplier>=10 then 1 else 0 end,
   'multiplier15',coalesce((v_material->>'multiplier15')::numeric,0)+case when v_multiplier>=15 then 1 else 0 end,
   'multiplier25',coalesce((v_material->>'multiplier25')::numeric,0)+case when v_multiplier>=25 then 1 else 0 end,
   'value100m',coalesce((v_material->>'value100m')::numeric,0)+case when v_value>=100000000 then 1 else 0 end,
   'weight5m',coalesce((v_material->>'weight5m')::numeric,0)+case when v_weight>=5000000 then 1 else 0 end,
   'totalWeight',coalesce((v_material->>'totalWeight')::numeric,0)+v_weight,
   'totalValue',coalesce((v_material->>'totalValue')::numeric,0)+v_value,
   'highestValue',v_high
 );
 v_progress:=jsonb_set(v_progress,'{_impossibleSacrifice}',v_material,true);
 update public.crafting_progress set progress=v_progress,updated_at=now()
 where player_id=p_uid and recipe_id='impossible-pickaxe';
 return jsonb_build_object('deposited',true,'preserved',false,'recipeId','impossible-pickaxe',
   'requirementIndex',0,'progress',v_progress,'materials',v_material);
end $$;
revoke all on function impossible_private.deposit_specimen(uuid,jsonb,boolean) from public,anon,authenticated;

create or replace function impossible_private.workspace(p_uid uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_material jsonb; v_req jsonb; v_first jsonb; v_legendary integer; v_mythic integer; v_owned boolean; v_auto boolean;
begin
 v_material:=impossible_private.deposit_materials(p_uid);
 v_req:=impossible_private.requirements(p_uid);
 select to_jsonb(w) into v_first from public.impossible_pickaxe_world_first w where singleton;
 select coalesce(quantity,0) into v_legendary from public.player_consumables where player_id=p_uid and consumable_id='legendary-potion';
 select coalesce(quantity,0) into v_mythic from public.player_consumables where player_id=p_uid and consumable_id='mythic-potion';
 select exists(select 1 from public.player_equipment where player_id=p_uid and equipment_id='impossible-pickaxe') into v_owned;
 select coalesce(active_auto_craft='impossible-pickaxe',false) into v_auto from public.player_crafting where player_id=p_uid;
 return jsonb_build_object('worldFirst',v_first,'requirements',v_req,'owned',v_owned,'autoCraft',coalesce(v_auto,false),
   'specialistSet',jsonb_build_array('tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','fortune-pickaxe','supersizer-pickaxe'),
   'preview',jsonb_build_object('materials',v_material,'history',v_req,'potions',jsonb_build_object(
     'legendary',coalesce(v_legendary,0),'mythic',coalesce(v_mythic,0)),'highestValue',coalesce(v_material->'highestValue','[]'::jsonb)));
end $$;
revoke all on function impossible_private.workspace(uuid) from public,anon,authenticated;

create or replace function public.get_impossible_pickaxe_status()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 return impossible_private.workspace(uid);
end $$;
revoke all on function public.get_impossible_pickaxe_status() from public,anon,authenticated;
grant execute on function public.get_impossible_pickaxe_status() to authenticated;

create or replace function public.deposit_impossible_pickaxe_gems(p_gem_ids bigint[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); ids bigint[]; locked_ids bigint[]; gem public.inventory_gems%rowtype; deposited integer:=0; result jsonb;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 select coalesce(array_agg(distinct id order by id),'{}'::bigint[]) into ids from unnest(coalesce(p_gem_ids,'{}'::bigint[])) id;
 if cardinality(ids)=0 or cardinality(ids)>200 then raise exception 'select_between_1_and_200_gems'; end if;
 perform 1 from public.players where id=uid for update;
 if exists(select 1 from public.player_equipment where player_id=uid and equipment_id='impossible-pickaxe') then raise exception 'already_owned'; end if;
 select coalesce(array_agg(id order by id),'{}'::bigint[]) into locked_ids from (
   select id from public.inventory_gems where player_id=uid and id=any(ids)
     and not coalesce(locked,false) and not coalesce(museum_locked,false)
     and gem_name not in ('Enchant Relic','Ancient Relic')
   order by id for update
 ) selected;
 if locked_ids is distinct from ids then
   raise exception 'gem_selection_changed';
 end if;
 for gem in select * from public.inventory_gems where player_id=uid and id=any(ids) order by id loop
   result:=impossible_private.deposit_specimen(uid,to_jsonb(gem),false);
   if coalesce((result->>'deposited')::boolean,false) then
     delete from public.inventory_gems where id=gem.id and player_id=uid;
     deposited:=deposited+1;
   end if;
 end loop;
 return impossible_private.workspace(uid)||jsonb_build_object('depositedCount',deposited);
end $$;
revoke all on function public.deposit_impossible_pickaxe_gems(bigint[]) from public,anon,authenticated;
grant execute on function public.deposit_impossible_pickaxe_gems(bigint[]) to authenticated;

-- Preserve the optimized roll Edge Function: its existing single Auto Craft
-- RPC now routes Impossible specimens into the shared pool in this database
-- helper, without adding another request to the roll path.
create or replace function public.deposit_equipment_material(p_player_id uuid,p_recipe_id text,p_specimen jsonb default null,p_requirement_index integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_req jsonb; v_key text; v_remaining integer; v_count integer; v_ids bigint[];
  v_recipe jsonb; v_progress jsonb; v_plan jsonb; v_gem public.inventory_gems%rowtype;
  v_preserved boolean:=false; v_chance numeric:=0; v_manual boolean:=p_specimen is null;
begin
  perform 1 from public.players where id=p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  select recipe into v_recipe from public.game_recipes where id=p_recipe_id;
  if v_recipe is null then raise exception 'recipe_not_found'; end if;
  if p_recipe_id='impossible-pickaxe' then
    if v_manual then return jsonb_build_object('deposited',false,'reason','use_impossible_workspace'); end if;
    return impossible_private.deposit_specimen(p_player_id,p_specimen,true);
  end if;
  insert into public.crafting_progress(player_id,recipe_id,progress) values(p_player_id,p_recipe_id,'{}') on conflict do nothing;
  select progress into v_progress from public.crafting_progress where player_id=p_player_id and recipe_id=p_recipe_id for update;
  v_recipe:=coalesce(v_progress->'_equipment_recipe',v_recipe);
  -- Preserve the latest set-based bulk path for every existing consumed
  -- equipment recipe. Impossible manual deposits use their dedicated RPC.
  if v_manual and v_recipe->>'consumeMaterials'='true' then
    v_req:=v_recipe->'requirements'->p_requirement_index;
    if p_requirement_index is null or p_requirement_index<0 or v_req->>'type' is distinct from 'gem-count'
      then raise exception 'invalid_bulk_requirement'; end if;
    v_key:=coalesce(v_req->>'id',v_req->>'gem');
    v_remaining:=greatest(0,(v_req->>'amount')::integer-coalesce((v_progress->>v_key)::integer,0));
    select coalesce(array_agg(id),'{}'::bigint[]) into v_ids from (
      select id from public.inventory_gems where player_id=p_player_id and not locked and not coalesce(museum_locked,false)
       and rarity>=coalesce((v_req->>'minimumRarity')::numeric,0)
       and rarity<=coalesce((v_req->>'maximumRarity')::numeric,1e100)
       and (not(v_req ? 'gem') or gem_name=v_req->>'gem')
      order by final_weight,id limit v_remaining for update
    ) eligible;
    v_count:=cardinality(v_ids);
    if v_count=0 then return jsonb_build_object('deposited',false,'progress',v_progress); end if;
    delete from public.inventory_gems where player_id=p_player_id and id=any(v_ids);
    v_progress:=jsonb_set(v_progress,array[v_key],to_jsonb(coalesce((v_progress->>v_key)::integer,0)+v_count));
    update public.crafting_progress set progress=v_progress,updated_at=now() where player_id=p_player_id and recipe_id=p_recipe_id;
    return jsonb_build_object('deposited',true,'depositedCount',v_count,'progress',v_progress,'preserved',false);
  end if;
  if v_manual then
    if p_requirement_index is null then raise exception 'requirement_required'; end if;
    for v_gem in select * from public.inventory_gems where player_id=p_player_id and not coalesce(locked,false)
      and (not coalesce((v_recipe->>'includedSpecimens')::boolean,false) or base_weight>0)
      and rarity>=coalesce((v_recipe->'requirements'->p_requirement_index->>'minimumRarity')::numeric,0)
      and rarity<=coalesce((v_recipe->'requirements'->p_requirement_index->>'maximumRarity')::numeric,1e100)
      and (not (v_recipe->'requirements'->p_requirement_index ? 'gem') or gem_name=v_recipe->'requirements'->p_requirement_index->>'gem')
      and (not (v_recipe->'requirements'->p_requirement_index ? 'minimumWeightMultiplier') or final_weight/nullif(base_weight,0) >= (v_recipe->'requirements'->p_requirement_index->>'minimumWeightMultiplier')::numeric)
      order by final_weight,id for update loop
      v_plan:=public.plan_equipment_material(v_recipe,v_progress,to_jsonb(v_gem),p_requirement_index);
      if v_plan is not null then exit; end if;
    end loop;
  else
    v_plan:=public.plan_equipment_material(v_recipe,v_progress,p_specimen,p_requirement_index);
  end if;
  if v_plan is null then return jsonb_build_object('deposited',false,'progress',v_progress); end if;
  if (v_plan->>'conservationEligible')::boolean then
    select coalesce(max(case equipment_id when 'plastic-shopping-bag' then 0.125 else 0 end),0)
      into v_chance from public.player_equipment where player_id=p_player_id and equipped and category='bag';
    v_preserved:=random()<v_chance;
  end if;
  update public.crafting_progress set progress=v_plan->'progress',updated_at=now() where player_id=p_player_id and recipe_id=p_recipe_id;
  if v_manual and not v_preserved then delete from public.inventory_gems where id=v_gem.id and player_id=p_player_id; end if;
  return v_plan || jsonb_build_object('deposited',true,'preserved',v_preserved,'consumedSpecimen',case when v_manual and not v_preserved then jsonb_build_object('id',v_gem.id,'gemName',v_gem.gem_name,'weight',v_gem.final_weight,'value',v_gem.value) else null end);
end $$;
revoke all on function public.deposit_equipment_material(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.deposit_equipment_material(uuid,text,jsonb,integer) to service_role;

create or replace function public.prepare_impossible_pickaxe_craft()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); token uuid:=gen_random_uuid(); workspace jsonb; preview jsonb; req jsonb; material jsonb;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('impossible-plan:'||uid::text,0));
 if exists(select 1 from public.player_equipment where player_id=uid and equipment_id='impossible-pickaxe') then raise exception 'already_owned'; end if;
 workspace:=impossible_private.workspace(uid); preview:=workspace->'preview'; req:=workspace->'requirements'; material:=preview->'materials';
 if not impossible_private.deposit_ready(material)
   or coalesce((preview->'potions'->>'legendary')::numeric,0)<50 or coalesce((preview->'potions'->>'mythic')::numeric,0)<25
   or (req->>'impossibleRareHeavy10m')::numeric<10 or (req->>'impossibleRareHeavy100m')::numeric<1
   or (req->>'impossibleRare100m')::numeric<10 or (req->>'impossibleRare500m')::numeric<1
   or (req->>'impossibleOrdinaryMutations')::numeric<50 or (req->>'impossibleSpecialGems')::numeric<10
   or (req->>'impossibleSpecialists')::numeric<6 or (req->>'impossibleLifetimeEarnings')::numeric<5000000000
   or (req->>'totalRolls')::numeric<1000000 or (select money from public.players where id=uid)<2500000000 then
   return jsonb_build_object('ready',false,'preview',preview,'message','Requirements are not yet complete. Deposits already made remain credited.');
 end if;
 update public.player_crafting set active_auto_craft=null,updated_at=now() where player_id=uid and active_auto_craft='impossible-pickaxe';
 delete from public.impossible_pickaxe_craft_plans where player_id=uid or expires_at<=now();
 insert into public.impossible_pickaxe_craft_plans(token,player_id,specimen_ids,preview) values(token,uid,'{}'::bigint[],preview);
 return jsonb_build_object('ready',true,'token',token,'preview',preview,'worldFirst',workspace->'worldFirst');
end $$;
revoke all on function public.prepare_impossible_pickaxe_craft() from public,anon,authenticated;
grant execute on function public.prepare_impossible_pickaxe_craft() to authenticated;

create or replace function public.craft_impossible_pickaxe(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); plan public.impossible_pickaxe_craft_plans%rowtype; req jsonb; material jsonb;
 money_after numeric; first_winner boolean:=false; name text; crafted timestamptz:=clock_timestamp(); affected integer;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 select * into plan from public.impossible_pickaxe_craft_plans where token=p_token and player_id=uid for update;
 if not found or plan.expires_at<=now() then raise exception 'craft_plan_expired'; end if;
 select username into name from public.players where id=uid for update;
 if exists(select 1 from public.player_equipment where player_id=uid and equipment_id='impossible-pickaxe') then raise exception 'already_owned'; end if;
 req:=impossible_private.requirements(uid); material:=impossible_private.deposit_materials(uid);
 if material is distinct from plan.preview->'materials' or not impossible_private.deposit_ready(material) then raise exception 'craft_plan_changed'; end if;
 if (req->>'impossibleRareHeavy10m')::numeric<10 or (req->>'impossibleRareHeavy100m')::numeric<1
   or (req->>'impossibleRare100m')::numeric<10 or (req->>'impossibleRare500m')::numeric<1
   or (req->>'impossibleOrdinaryMutations')::numeric<50 or (req->>'impossibleSpecialGems')::numeric<10
   or (req->>'impossibleSpecialists')::numeric<6 or (req->>'impossibleLifetimeEarnings')::numeric<5000000000
   or (req->>'totalRolls')::numeric<1000000 then raise exception 'requirements_not_met'; end if;
 update public.player_consumables set quantity=quantity-50,updated_at=now()
 where player_id=uid and consumable_id='legendary-potion' and quantity>=50;
 if not found then raise exception 'requirements_not_met'; end if;
 update public.player_consumables set quantity=quantity-25,updated_at=now()
 where player_id=uid and consumable_id='mythic-potion' and quantity>=25;
 if not found then raise exception 'requirements_not_met'; end if;
 update public.players set money=money-2500000000 where id=uid and money>=2500000000 returning money into money_after;
 if not found then raise exception 'not_enough_money'; end if;
 update public.player_equipment set equipped=false where player_id=uid and category='pickaxe' and equipped;
 insert into public.player_equipment(player_id,equipment_id,category,tier,name,luck_bonus,roll_speed_bonus,
   mutation_chance_bonus,weight_luck_bonus,weight_multiplier_bonus,equipped)
 values(uid,'impossible-pickaxe','pickaxe',19,'The Impossible Pickaxe',0,0,0,0,0,true)
 on conflict(player_id,equipment_id) do update set equipped=true;
 insert into public.impossible_pickaxe_world_first(singleton,player_id,player_name,crafted_at)
 values(true,uid,coalesce(nullif(name,''),'Unknown Player'),crafted) on conflict(singleton) do nothing;
 get diagnostics affected=row_count; first_winner:=affected=1;
 if first_winner then
   update public.players set equipment_state=jsonb_set(coalesce(equipment_state,'{}'::jsonb),'{impossibleWorldFirst}','true'::jsonb,true) where id=uid;
   insert into public.player_cosmetics(player_id,cosmetic_id,source,source_key,earned_at)
   values(uid,'impossible-profile-background','world-first','impossible-pickaxe',crafted) on conflict(player_id,cosmetic_id) do nothing;
   insert into public.player_cosmetic_loadouts(player_id,equipment)
   values(uid,'{"background":"impossible-profile-background"}'::jsonb)
   on conflict(player_id) do update set equipment=jsonb_set(coalesce(public.player_cosmetic_loadouts.equipment,'{}'::jsonb),
     '{background}','"impossible-profile-background"'::jsonb,true),updated_at=now();
 end if;
 insert into public.player_cosmetics(player_id,cosmetic_id,source,source_key,earned_at)
 values(uid,'impossible-pickaxe-crafter','equipment','impossible-pickaxe',crafted) on conflict(player_id,cosmetic_id) do nothing;
 delete from public.crafting_progress where player_id=uid and recipe_id='impossible-pickaxe';
 delete from public.impossible_pickaxe_craft_plans where player_id=uid;
 update public.player_crafting set active_auto_craft=null,updated_at=now() where player_id=uid and active_auto_craft='impossible-pickaxe';
 return jsonb_build_object('equipmentId','impossible-pickaxe','money',money_after,'worldFirst',first_winner,'craftedAt',crafted);
end $$;
revoke all on function public.craft_impossible_pickaxe(uuid) from public,anon,authenticated;
grant execute on function public.craft_impossible_pickaxe(uuid) to authenticated;

commit;
