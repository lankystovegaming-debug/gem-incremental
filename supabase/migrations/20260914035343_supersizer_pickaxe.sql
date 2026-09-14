-- Supersizer Pickaxe. Prepared against live optimized roll v154 and the
-- authoritative schema on project igrddscmrdrrwtvyspbf.
-- Manual deployment only: this migration does not deploy the roll/sell functions.
begin;

insert into public.game_mutations(id,name,chance,multiplier,description,icon,color,enabled) values
 ('supersizer-small','Small',3,.75,'Supersizer-exclusive size: ×0.75 weight and ×0.75 value. Size mutations are mutually exclusive.','▫️','#90a4ae',true),
 ('supersizer-big','Big',10,1.25,'Supersizer-exclusive size: ×1.25 weight and ×1.25 value. Size mutations are mutually exclusive.','▪️','#80cbc4',true),
 ('supersizer-giant','Giant',100,2,'Supersizer-exclusive size: ×2 weight and ×2 value. Size mutations are mutually exclusive.','⬛','#66bb6a',true),
 ('supersizer-massive','Massive',1000,5,'Supersizer-exclusive size: ×5 weight and ×5 value. Size mutations are mutually exclusive.','🟫','#f9a825',true),
 ('supersizer-colossal','Colossal',10000,10,'Supersizer-exclusive size: ×10 weight and ×10 value. Size mutations are mutually exclusive.','🟥','#ef6c00',true),
 ('supersizer-titanic','Titanic',100000,20,'Supersizer-exclusive size: ×20 weight and ×20 value. Size mutations are mutually exclusive.','🔶','#e53935',true),
 ('supersizer-gargantuan','Gargantuan',1000000,25,'Supersizer-exclusive size: ×25 weight and ×25 value. Starts Gargantuan’s Blessing after the roll.','🌋','#ab47bc',true)
on conflict(id) do update set name=excluded.name,chance=excluded.chance,multiplier=excluded.multiplier,
 description=excluded.description,icon=excluded.icon,color=excluded.color,enabled=excluded.enabled;

insert into public.game_recipes(id,recipe) values(
 'supersizer-pickaxe',
 $recipe${
  "id":"supersizer-pickaxe","name":"Supersizer Pickaxe","category":"pickaxe","craftingTab":"pickaxe",
  "horizontal":true,"equipmentOverhaul":true,"consumeMaterials":true,"moneyCost":1099000000,
  "description":"The mining industry said this was excessive. We made it bigger.",
  "requirements":[
   {"id":"supersizer-value-50m","type":"specimen-condition","minimumValue":50000000,"amount":1,"label":"1 gem worth at least $50M"},
   {"id":"supersizer-value-10m","type":"specimen-condition","minimumValue":10000000,"amount":2,"label":"2 gems worth at least $10M"},
   {"type":"consumable","consumableId":"mythic-potion","amount":10},
   {"type":"consumable","consumableId":"legendary-potion","amount":25},
   {"id":"supersizer-quartz","type":"specimen-condition","gem":"Quartz","minimumFinalWeight":1000,"amount":50,"label":"50 Quartz at 1,000g+ final weight"},
   {"id":"supersizer-pickaxe-exotic","type":"gem-count","label":"Exotic","amount":75,"minimumRarity":100000,"maximumRarity":999999},
   {"id":"supersizer-pickaxe-mythic","type":"gem-count","label":"Mythic","amount":125,"minimumRarity":10000,"maximumRarity":99999},
   {"type":"equipment-history","metric":"supersizerHeavy10","amount":3,"label":"3 historical specimens at ≥10× final/base weight","consume":false},
   {"type":"equipment-history","metric":"supersizerRareHeavy5","amount":5,"label":"5 historical 1/10M+ base-rarity specimens at ≥5× final/base weight","consume":false},
   {"type":"equipment-history","metric":"genuineRolls","amount":300000,"label":"Lifetime genuine rolls","consume":false},
   {"type":"equipment-history","metric":"supersizerSpecialists","amount":3,"label":"Distinct eligible post-Celestial specialist Pickaxes ever owned","consume":false}
  ],
  "reward":{"id":"supersizer-pickaxe","name":"Supersizer Pickaxe","category":"pickaxe","tier":18,
   "bonus":{"luck":18.91,"rollSpeed":1.75,"mutationChance":-0.5,"weightLuck":4.5,"weightMultiplier":1.4,"finalSell":0.25}}
 }$recipe$::jsonb
) on conflict(id) do update set recipe=excluded.recipe;

create or replace function public.equipment_batch_progress(p_uid uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(p.equipment_state->'batchHistory','{}') || jsonb_build_object(
  'genuineRolls',p.equipment_genuine_rolls,
  'lifetimeEarnings',coalesce(p.lifetime_earnings,0),
  'endgamePickaxes',(select count(*) from public.equipment_ownership_history h where h.player_id=p.id and h.equipment_id in
   ('empyrean-pickaxe','eternity-pickaxe','tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','fortune-pickaxe','all-in-pickaxe','bedrock-pickaxe')),
  'supersizerSpecialists',(select count(distinct h.equipment_id) from public.equipment_ownership_history h where h.player_id=p.id and h.equipment_id in
   ('fortune-pickaxe','empyrean-pickaxe','eternity-pickaxe','tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','bedrock-pickaxe')),
  'supersizerHeavy10',greatest(coalesce((p.equipment_state->'batchHistory'->>'supersizerHeavy10')::numeric,0),
   (select count(*) from public.inventory_gems i where i.player_id=p.id and i.base_weight>0 and i.final_weight/i.base_weight>=10)),
  'supersizerRareHeavy5',greatest(coalesce((p.equipment_state->'batchHistory'->>'supersizerRareHeavy5')::numeric,0),
   (select count(*) from public.inventory_gems i where i.player_id=p.id and i.rarity>=10000000 and i.base_weight>0 and i.final_weight/i.base_weight>=5))
 ) from public.players p where p.id=p_uid
$$;
revoke all on function public.equipment_batch_progress(uuid) from public,anon,authenticated;
grant execute on function public.equipment_batch_progress(uuid) to service_role;

-- The preview and authoritative deposit path share this allocator. Value uses
-- inventory_gems.value; rarity uses the stored canonical base-rarity denominator.
create or replace function public.plan_equipment_material(p_recipe jsonb,p_progress jsonb,p_gem jsonb,p_index integer default null)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
 v_progress jsonb:=coalesce(p_progress,'{}');v_req jsonb;v_slot jsonb;
 v_i integer;v_bulk_i integer;v_slot_i integer;v_key text;v_bulk_key text;
 v_rarity numeric:=(p_gem->>'rarity')::numeric;
 v_final_weight numeric:=(p_gem->>'final_weight')::numeric;
 v_value numeric:=(p_gem->>'value')::numeric;
 v_weight numeric:=case when (p_gem->>'base_weight')::numeric>0 then v_final_weight/(p_gem->>'base_weight')::numeric else null end;
 v_needed numeric;v_space numeric;v_special boolean:=false;
begin
 if v_rarity is null then return null;end if;
 if p_recipe->>'equipmentOverhaul'='true' and not coalesce((p_recipe->>'includedSpecimens')::boolean,false) then
  for v_req,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality
   where value->>'type' in('gem-count','specimen-condition')
   order by case when value->>'type'='specimen-condition' then 0 else 1 end,
    coalesce((value->>'minimumValue')::numeric,0) desc,coalesce((value->>'minimumFinalWeight')::numeric,0) desc,
    coalesce((value->>'minimumWeightMultiplier')::numeric,0) desc,
    coalesce((value->>'maximumWeightMultiplier')::numeric,1e100),ordinality loop
   if p_index is not null and p_index<>v_i then continue;end if;
   v_key:=coalesce(v_req->>'id',v_req->>'gem');
   if v_key is null or coalesce((v_progress->>v_key)::numeric,0)>=coalesce((v_req->>'amount')::numeric,1) then continue;end if;
   if (v_req?'gem' and v_req->>'gem'<>p_gem->>'gem_name')
    or v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
    or (v_req?'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric))
    or (v_req?'maximumWeightMultiplier' and (v_weight is null or v_weight>(v_req->>'maximumWeightMultiplier')::numeric))
    or (v_req?'minimumFinalWeight' and (v_final_weight is null or v_final_weight<(v_req->>'minimumFinalWeight')::numeric))
    or (v_req?'minimumValue' and (v_value is null or v_value<(v_req->>'minimumValue')::numeric)) then continue;end if;
   return jsonb_build_object('progress',jsonb_set(v_progress,array[v_key],to_jsonb(coalesce((v_progress->>v_key)::numeric,0)+1)),
    'requirementIndex',v_i,'conservationEligible',not coalesce((p_recipe->>'consumeMaterials')::boolean,false)
     and v_req->>'type'='gem-count' and not(v_req?|array['minimumWeightMultiplier','maximumWeightMultiplier','minimumFinalWeight','minimumValue']));
  end loop;
  return null;
 end if;
 if coalesce((p_recipe->>'includedSpecimens')::boolean,false) and not coalesce((p_gem->>'base_weight')::numeric>0,false) then return null;end if;
 if p_index is not null then
  v_req:=p_recipe->'requirements'->p_index;
  if v_req is null or v_req->>'type' not in('gem-count','specimen-condition') then return null;end if;
  if v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
   or (v_req?'gem' and v_req->>'gem'<>p_gem->>'gem_name')
   or (v_req?'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric))
   or (v_req?'maximumWeightMultiplier' and (v_weight is null or v_weight>(v_req->>'maximumWeightMultiplier')::numeric))
   or (v_req?'minimumFinalWeight' and (v_final_weight is null or v_final_weight<(v_req->>'minimumFinalWeight')::numeric))
   or (v_req?'minimumValue' and (v_value is null or v_value<(v_req->>'minimumValue')::numeric)) then return null;end if;
 end if;
 for v_req,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality loop
  if v_req->>'type'<>'gem-count' then continue;end if;
  if not coalesce((p_recipe->>'includedSpecimens')::boolean,false) and p_index is distinct from v_i then continue;end if;
  v_key:=coalesce(v_req->>'id',v_req->>'gem');
  if v_key is null or coalesce((v_progress->>v_key)::numeric,0)>=coalesce((v_req->>'amount')::numeric,1) then continue;end if;
  if (v_req?'gem' and v_req->>'gem'<>p_gem->>'gem_name')
   or v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
   or (v_req?'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric))
   or (v_req?'maximumWeightMultiplier' and (v_weight is null or v_weight>(v_req->>'maximumWeightMultiplier')::numeric))
   or (v_req?'minimumFinalWeight' and (v_final_weight is null or v_final_weight<(v_req->>'minimumFinalWeight')::numeric))
   or (v_req?'minimumValue' and (v_value is null or v_value<(v_req->>'minimumValue')::numeric)) then continue;end if;
  v_bulk_i:=v_i;v_bulk_key:=v_key;
  v_special:=v_req?|array['minimumWeightMultiplier','maximumWeightMultiplier','minimumFinalWeight','minimumValue','mutation','mutationId','serial','serialNumber'];
  exit;
 end loop;
 if v_bulk_i is null then return null;end if;
 v_progress:=jsonb_set(v_progress,array[v_bulk_key],to_jsonb(coalesce((v_progress->>v_bulk_key)::numeric,0)+1));
 if coalesce((p_recipe->>'includedSpecimens')::boolean,false) then
  for v_slot,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality
   where value->>'includedInBulk'='true' and(p_recipe->>'equipmentOverhaul' is distinct from'true' or p_index is null
    or p_recipe->'requirements'->p_index->>'includedInBulk' is distinct from'true' or ordinality-1=p_index)
   order by case when p_recipe->>'equipmentOverhaul'='true' then(value->>'minimumWeightMultiplier')::numeric else(value->>'minimumRarity')::numeric end desc,
    (value->>'minimumRarity')::numeric desc,(value->>'minimumWeightMultiplier')::numeric desc loop
   v_key:=v_slot->>'id';
   if coalesce((v_progress->>v_key)::numeric,0)<(v_slot->>'amount')::numeric
    and v_rarity>=(v_slot->>'minimumRarity')::numeric and v_weight>=(v_slot->>'minimumWeightMultiplier')::numeric then
    v_slot_i:=v_i;v_progress:=jsonb_set(v_progress,array[v_key],to_jsonb(coalesce((v_progress->>v_key)::numeric,0)+1));exit;
   end if;
  end loop;
  if p_index is not null and p_recipe->'requirements'->p_index->>'includedInBulk'='true' and p_index is distinct from v_slot_i then return null;end if;
  for v_slot in select value from jsonb_array_elements(p_recipe->'requirements') where value->>'includedInBulk'='true' loop
   select coalesce(sum(greatest(0,(value->>'amount')::numeric-coalesce((v_progress->>(value->>'id'))::numeric,0))),0) into v_needed
    from jsonb_array_elements(p_recipe->'requirements') where value->>'includedInBulk'='true' and(value->>'minimumRarity')::numeric>=(v_slot->>'minimumRarity')::numeric;
   select coalesce(sum(greatest(0,(value->>'amount')::numeric-coalesce((v_progress->>(value->>'id'))::numeric,0))),0) into v_space
    from jsonb_array_elements(p_recipe->'requirements') where value->>'type'='gem-count' and(value->>'minimumRarity')::numeric>=(v_slot->>'minimumRarity')::numeric;
   if v_needed>v_space then return null;end if;
  end loop;
 end if;
 return jsonb_build_object('progress',v_progress,'requirementIndex',coalesce(v_slot_i,v_bulk_i),'conservationEligible',not coalesce((p_recipe->>'consumeMaterials')::boolean,false) and v_slot_i is null and not v_special);
end$$;

-- Server-authoritative sell multiplier. Both permanent and blessing effects
-- require Supersizer to remain equipped. The database clock owns expiry.
create or replace function public.equipment_gem_sell_multiplier(p_player_id uuid)
returns numeric language sql stable security definer set search_path='' as $$
 select
  case when exists(select 1 from public.player_equipment e where e.player_id=p.id and e.equipment_id='supersizer-pickaxe' and e.equipped)
   then 1.25 * case when nullif(p.equipment_state->>'supersizerBlessingUntil','')::timestamptz>now() then 1.5 else 1 end
   else 1 end
  * case when public.player_has_mine_artifact(p.id,'foreman-seal') then 1.03 else 1 end
 from public.players p where p.id=p_player_id
$$;
revoke all on function public.equipment_gem_sell_multiplier(uuid) from public,anon,authenticated;
grant execute on function public.equipment_gem_sell_multiplier(uuid) to service_role;

create or replace function public.sell_inventory_gem(p_player_id uuid,p_specimen_id bigint)
returns double precision language plpgsql security definer set search_path='public' as $$
declare v_value double precision;v_locked boolean;v_new_money double precision;v_gem_name text;v_name text;
begin
 select value,locked,gem_name into v_value,v_locked,v_gem_name from public.inventory_gems
  where id=p_specimen_id and player_id=p_player_id for update;
 if not found then raise exception'gem_not_found';end if;
 if v_locked then raise exception'gem_locked';end if;
 v_value:=v_value*public.equipment_gem_sell_multiplier(p_player_id);
 update public.players set money=money+v_value,lifetime_earnings=lifetime_earnings+v_value
  where id=p_player_id returning money into v_new_money;
 delete from public.inventory_gems where id=p_specimen_id and player_id=p_player_id;
 begin
  select username into v_name from public.players where id=p_player_id;
  insert into public.global_cash_events(player_name,gem_name,amount)values(v_name,v_gem_name,v_value);
 exception when others then null;end;
 return v_new_money;
end$$;
revoke all on function public.sell_inventory_gem(uuid,bigint) from public,anon,authenticated;
grant execute on function public.sell_inventory_gem(uuid,bigint) to service_role;

commit;
