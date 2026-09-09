-- Prepared from live optimized roll v149 and schema on igrddscmrdrrwtvyspbf.
-- Manual deployment only. Recipes use canonical private_feature_gems names.
begin;
insert into public.game_mutations(id,name,chance,multiplier,description,icon,color,enabled)
values('shifted','Shifted',5,35,'Exclusive Reality Shift: 20% on every 500th genuine Reality Shifter roll. Bypasses ordinary mutation chance.','🌀','#b388ff',true)
on conflict(id) do update set name=excluded.name,chance=excluded.chance,multiplier=excluded.multiplier,
 description=excluded.description,icon=excluded.icon,color=excluded.color,enabled=excluded.enabled;
CREATE OR REPLACE FUNCTION public.equipment_batch_progress(p_uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(p.equipment_state->'batchHistory','{}') || jsonb_build_object(
 'genuineRolls',p.equipment_genuine_rolls,'lifetimeEarnings',coalesce(p.lifetime_earnings,0),
 'endgamePickaxes',(select count(*) from public.equipment_ownership_history h where h.player_id=p.id and h.equipment_id in
 ('empyrean-pickaxe','eternity-pickaxe','tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','fortune-pickaxe','all-in-pickaxe','bedrock-pickaxe')))
 from public.players p where p.id=p_uid
$function$;
CREATE OR REPLACE FUNCTION public.plan_equipment_material(p_recipe jsonb, p_progress jsonb, p_gem jsonb, p_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_progress jsonb:=coalesce(p_progress,'{}'); v_req jsonb; v_slot jsonb; v_other jsonb;
  v_i integer; v_bulk_i integer; v_slot_i integer; v_key text; v_bulk_key text;
  v_rarity numeric:=(p_gem->>'rarity')::numeric;
  v_weight numeric:=case when (p_gem->>'base_weight')::numeric>0 then (p_gem->>'final_weight')::numeric/(p_gem->>'base_weight')::numeric else null end;
  v_needed numeric; v_space numeric; v_special boolean:=false;
begin
  if v_rarity is null then return null; end if;
  if p_recipe->>'equipmentOverhaul'='true' and not coalesce((p_recipe->>'includedSpecimens')::boolean,false) then
    for v_req,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality
      where value->>'type' in ('gem-count','specimen-condition')
      order by case when value->>'type'='specimen-condition' then 0 else 1 end,
        coalesce((value->>'minimumWeightMultiplier')::numeric,0) desc,
        coalesce((value->>'maximumWeightMultiplier')::numeric,1e100),ordinality loop
      if p_index is not null and p_index<>v_i then continue; end if;
      v_key:=coalesce(v_req->>'id',v_req->>'gem');
      if v_key is null or coalesce((v_progress->>v_key)::numeric,0)>=coalesce((v_req->>'amount')::numeric,1) then continue; end if;
      if (v_req ? 'gem' and v_req->>'gem'<>p_gem->>'gem_name')
         or v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
         or (v_req ? 'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric))
         or (v_req ? 'maximumWeightMultiplier' and (v_weight is null or v_weight>(v_req->>'maximumWeightMultiplier')::numeric)) then continue; end if;
      return jsonb_build_object('progress',jsonb_set(v_progress,array[v_key],to_jsonb(coalesce((v_progress->>v_key)::numeric,0)+1)),
        'requirementIndex',v_i,'conservationEligible',not coalesce((p_recipe->>'consumeMaterials')::boolean,false) and v_req->>'type'='gem-count' and not(v_req ?| array['minimumWeightMultiplier','maximumWeightMultiplier']));
    end loop;
    return null;
  end if;

  if coalesce((p_recipe->>'includedSpecimens')::boolean,false) and not coalesce((p_gem->>'base_weight')::numeric>0,false) then return null; end if;
  if p_index is not null then
    v_req:=p_recipe->'requirements'->p_index;
    if v_req is null or v_req->>'type' not in ('gem-count','specimen-condition') then return null; end if;
    if v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
       or (v_req ? 'gem' and v_req->>'gem'<>p_gem->>'gem_name')
       or (v_req ? 'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric)) then return null; end if;
  end if;
  for v_req,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality loop
    if v_req->>'type'<>'gem-count' then continue; end if;
    if not coalesce((p_recipe->>'includedSpecimens')::boolean,false) and p_index is distinct from v_i then continue; end if;
    v_key:=coalesce(v_req->>'id',v_req->>'gem');
    if v_key is null or coalesce((v_progress->>v_key)::numeric,0)>=coalesce((v_req->>'amount')::numeric,1) then continue; end if;
    if (v_req ? 'gem' and v_req->>'gem'<>p_gem->>'gem_name')
      or v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
      or (v_req ? 'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric))
      or (v_req ? 'maximumWeightMultiplier' and (v_weight is null or v_weight>(v_req->>'maximumWeightMultiplier')::numeric)) then continue; end if;
    v_bulk_i:=v_i; v_bulk_key:=v_key;
    v_special:=v_req ?| array['minimumWeightMultiplier','maximumWeightMultiplier','mutation','mutationId','serial','serialNumber'];
    exit;
  end loop;
  if v_bulk_i is null then return null; end if;
  v_progress:=jsonb_set(v_progress,array[v_bulk_key],to_jsonb(coalesce((v_progress->>v_bulk_key)::numeric,0)+1));
  if coalesce((p_recipe->>'includedSpecimens')::boolean,false) then
    for v_slot,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality
      where value->>'includedInBulk'='true'
        and (p_recipe->>'equipmentOverhaul' is distinct from 'true' or p_index is null
          or p_recipe->'requirements'->p_index->>'includedInBulk' is distinct from 'true' or ordinality-1=p_index)
      order by case when p_recipe->>'equipmentOverhaul'='true' then (value->>'minimumWeightMultiplier')::numeric else (value->>'minimumRarity')::numeric end desc,
        (value->>'minimumRarity')::numeric desc,(value->>'minimumWeightMultiplier')::numeric desc loop
      v_key:=v_slot->>'id';
      if coalesce((v_progress->>v_key)::numeric,0)<(v_slot->>'amount')::numeric
         and v_rarity>=(v_slot->>'minimumRarity')::numeric and v_weight>=(v_slot->>'minimumWeightMultiplier')::numeric then
        v_slot_i:=v_i;
        v_progress:=jsonb_set(v_progress,array[v_key],to_jsonb(coalesce((v_progress->>v_key)::numeric,0)+1));
        exit;
      end if;
    end loop;
    -- Clicking a specimen slot must actually advance that slot.
    if p_index is not null and p_recipe->'requirements'->p_index->>'includedInBulk'='true' and p_index is distinct from v_slot_i then return null; end if;
    -- Reserve enough unfilled bulk slots for every remaining specimen threshold.
    for v_slot in select value from jsonb_array_elements(p_recipe->'requirements') where value->>'includedInBulk'='true' loop
      select coalesce(sum(greatest(0,(value->>'amount')::numeric-coalesce((v_progress->>(value->>'id'))::numeric,0))),0) into v_needed
        from jsonb_array_elements(p_recipe->'requirements') where value->>'includedInBulk'='true' and (value->>'minimumRarity')::numeric>=(v_slot->>'minimumRarity')::numeric;
      select coalesce(sum(greatest(0,(value->>'amount')::numeric-coalesce((v_progress->>(value->>'id'))::numeric,0))),0) into v_space
        from jsonb_array_elements(p_recipe->'requirements') where value->>'type'='gem-count' and (value->>'minimumRarity')::numeric>=(v_slot->>'minimumRarity')::numeric;
      if v_needed>v_space then return null; end if;
    end loop;
  end if;
  return jsonb_build_object('progress',v_progress,'requirementIndex',coalesce(v_slot_i,v_bulk_i),'conservationEligible',not coalesce((p_recipe->>'consumeMaterials')::boolean,false) and v_slot_i is null and not v_special);
end;
$function$;
CREATE OR REPLACE FUNCTION public.deposit_equipment_material(p_player_id uuid, p_recipe_id text, p_specimen jsonb DEFAULT NULL::jsonb, p_requirement_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_req jsonb; v_key text; v_remaining integer; v_count integer; v_ids bigint[];
  v_recipe jsonb; v_progress jsonb; v_plan jsonb; v_gem public.inventory_gems%rowtype;
  v_preserved boolean:=false; v_chance numeric:=0; v_manual boolean:=p_specimen is null;
begin
  perform 1 from public.players where id=p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  select recipe into v_recipe from public.game_recipes where id=p_recipe_id;
  if v_recipe is null then raise exception 'recipe_not_found'; end if;
  insert into public.crafting_progress(player_id,recipe_id,progress) values(p_player_id,p_recipe_id,'{}') on conflict do nothing;
  select progress into v_progress from public.crafting_progress where player_id=p_player_id and recipe_id=p_recipe_id for update;
  v_recipe:=coalesce(v_progress->'_equipment_recipe',v_recipe);
  -- One set-based inventory operation for simple, fully consumed batch materials.
  -- The player lock serializes manual deposits, Auto Craft, and final crafting.
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
end;
$function$;
CREATE OR REPLACE FUNCTION public.update_qol_settings(p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid(); s jsonb; k text; v jsonb; legacy_missing boolean;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text)>200000 then raise exception 'invalid_settings'; end if;
 insert into public.player_settings(player_id) values(uid) on conflict do nothing;
 select settings into s from public.player_settings where player_id=uid for update;
 legacy_missing := not (s ? 'legacyAutoSell');
 for k,v in select * from jsonb_each(p_patch) loop
  if k='gemFilter' then
   if jsonb_typeof(v) is distinct from 'object' then raise exception 'invalid_filter'; end if;
   if exists(select 1 from jsonb_each_text(v) e where e.value is null or e.value not in ('DEFAULT','KEEP','SELL') or not exists(
    select 1 from public.player_gem_mutation_combinations d where d.player_id=uid and d.gem_name=e.key)) then raise exception 'invalid_or_undiscovered_gem'; end if;
   s:=jsonb_set(s,'{gemFilter}',coalesce(s->'gemFilter','{}')||v);
  elsif k='maxLuck' then
   if v='null'::jsonb or (jsonb_typeof(v)='string' and btrim(v #>> '{}')='') then
    s:=jsonb_set(s,'{maxLuck}','null'::jsonb);
   else
    if jsonb_typeof(v) is distinct from 'number' then raise exception 'invalid_max_luck'; end if;
    if (v::text)::numeric<1 or (v::text)::numeric>9007199254740991 then raise exception 'invalid_max_luck'; end if;
    s:=jsonb_set(s,'{maxLuck}',v);
   end if;
  elsif k in ('enableBuffs','discoveryKeep','autoRoll','autoKeep','rollAnimations','globalCash','cashGraph') then
   if jsonb_typeof(v) is distinct from 'boolean' then raise exception 'invalid_boolean'; end if;
   s:=jsonb_set(s,array[k],v);
  elsif k in ('discoveryKeepRarity','autoKeepEffectiveRarity','cutsceneMinimumRarity') then
   if jsonb_typeof(v) is distinct from 'number' then raise exception 'invalid_threshold'; end if;
   if (v::text)::numeric<1 or (v::text)::numeric>9007199254740991 then raise exception 'invalid_threshold'; end if;
   s:=jsonb_set(s,array[k],v);
  elsif k='clearLegacyAutoSell' then
   if v is distinct from 'true'::jsonb then raise exception 'invalid_boolean'; end if;
   s:=jsonb_set(s,'{legacyAutoSell}','false');
  elsif k in ('legacyAutoSell','legacyAutoSellTier') then
   if k='legacyAutoSell' and jsonb_typeof(v) is distinct from 'boolean' then raise exception 'invalid_boolean'; end if;
   if k='legacyAutoSellTier' and v #>> '{}' not in ('common','uncommon','rare','epic','legendary','mythic') then raise exception 'invalid_tier'; end if;
   if legacy_missing then s:=jsonb_set(s,array[k],v); end if;
  elsif k='gemRealism' then s:=jsonb_set(s,array[k],v);
  else raise exception 'unknown_setting'; end if;
 end loop;
 update public.player_settings set settings=s,updated_at=now() where player_id=uid;
 return s;
end $function$;
-- Defense in depth for service writes and old save clients as well as the settings RPC.
create function public.validate_max_luck_setting() returns trigger language plpgsql set search_path='' as $$
declare v jsonb:=new.settings->'maxLuck'; begin
 if v is null or v='null'::jsonb then return new; end if;
 if jsonb_typeof(v)='string' and btrim(v #>> '{}')='' then
  new.settings:=jsonb_set(new.settings,'{maxLuck}','null'); return new;
 end if;
 if jsonb_typeof(v) is distinct from 'number' then raise exception 'invalid_max_luck'; end if;
 if (v::text)::numeric<1 or (v::text)::numeric>9007199254740991 then raise exception 'invalid_max_luck'; end if;
 return new;
end $$;
revoke all on function public.validate_max_luck_setting() from public,anon,authenticated;
create trigger zz_validate_max_luck_setting before insert or update on public.player_settings
for each row execute function public.validate_max_luck_setting();
insert into public.game_recipes(id,recipe) values('reality-shifter','{"id":"reality-shifter","name":"Reality Shifter","category":"pickaxe","craftingTab":"toys","horizontal":true,"equipmentOverhaul":true,"moneyCost":125000000,"requirements":[{"type":"gem-count","gem":"Eternal Glowstone","amount":1000},{"type":"gem-count","gem":"Nyx Obsidian","amount":1000},{"type":"gem-count","gem":"Solarion","amount":1},{"type":"gem-count","gem":"Polaris","amount":1},{"type":"equipment-history","metric":"genuineRolls","amount":50000,"label":"Lifetime genuine rolls","consume":false}],"reward":{"id":"reality-shifter","name":"Reality Shifter","category":"pickaxe","tier":15,"bonus":{"luck":39,"rollSpeed":-0.6,"mutationChance":-1,"weightLuck":-0.2,"weightMultiplier":-0.2}},"consumeMaterials":true,"description":"Reality shall conform before our power. Kneel, for you are in the presence of a god."}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('bedrock-pickaxe','{"id":"bedrock-pickaxe","name":"Bedrock Pickaxe","category":"pickaxe","craftingTab":"pickaxe","horizontal":true,"equipmentOverhaul":true,"moneyCost":150000000,"requirements":[{"id":"bedrock-pickaxe-common","type":"gem-count","label":"Common","amount":10000,"minimumRarity":1,"maximumRarity":9},{"id":"bedrock-pickaxe-uncommon","type":"gem-count","label":"Uncommon","amount":7500,"minimumRarity":10,"maximumRarity":49},{"id":"bedrock-pickaxe-rare","type":"gem-count","label":"Rare","amount":5000,"minimumRarity":50,"maximumRarity":99},{"id":"bedrock-pickaxe-epic","type":"gem-count","label":"Epic","amount":2500,"minimumRarity":100,"maximumRarity":999},{"type":"equipment-history","metric":"genuineRolls","amount":250000,"label":"Lifetime genuine rolls","consume":false}],"reward":{"id":"bedrock-pickaxe","name":"Bedrock Pickaxe","category":"pickaxe","tier":15,"bonus":{"luck":24,"rollSpeed":2.1,"mutationChance":0.05,"weightLuck":4,"weightMultiplier":0.55}},"consumeMaterials":true}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
commit;
