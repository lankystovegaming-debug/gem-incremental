begin;

-- Lower the Impossible Pickaxe's combined sacrificed final-weight target.
-- Both final validation and Auto Craft usefulness use the same threshold.
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
   and coalesce((p_material->>'totalWeight')::numeric,0)>=500000000
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
   or coalesce((v_material->>'totalWeight')::numeric,0)<500000000
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

commit;
