begin;

-- PostgreSQL only provides round(value, decimal_places) for numeric values.
-- The inventory weight columns are floating-point, so cast the preview-only
-- multiplier after division. This does not change selection or craft formulas.
create or replace function public.prepare_impossible_pickaxe_craft()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); ids bigint[]:='{}'; picked bigint[]; needed integer; token uuid:=gen_random_uuid();
 total_weight numeric:=0; total_value numeric:=0; weight_deficit numeric; value_deficit numeric;
 req jsonb; preview jsonb; materials jsonb; first_record jsonb; pot_legendary integer; pot_mythic integer;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('impossible-plan:'||uid::text,0));
 if exists(select 1 from public.player_equipment where player_id=uid and equipment_id='impossible-pickaxe') then
   raise exception 'already_owned';
 end if;

 select coalesce(array_agg(id),'{}'::bigint[]) into picked from (
   select id from public.inventory_gems where player_id=uid and not locked and base_weight>0
    and final_weight/base_weight>=25 and gem_name not in ('Enchant Relic','Ancient Relic') order by value,final_weight,id limit 1
 ) q; ids:=ids||picked;
 select coalesce(array_agg(id),'{}'::bigint[]) into picked from (
   select id from public.inventory_gems where player_id=uid and not locked and base_weight>0
    and final_weight/base_weight>=15 and id<>all(ids) and gem_name not in ('Enchant Relic','Ancient Relic') order by value,final_weight,id limit 3
 ) q; ids:=ids||picked;
 select coalesce(array_agg(id),'{}'::bigint[]) into picked from (
   select id from public.inventory_gems where player_id=uid and not locked and base_weight>0
    and final_weight/base_weight>=10 and id<>all(ids) and gem_name not in ('Enchant Relic','Ancient Relic') order by value,final_weight,id limit 10
 ) q; ids:=ids||picked;

 if not exists(select 1 from public.inventory_gems where id=any(ids) and value>=100000000) then
   select coalesce(array_agg(id),'{}'::bigint[]) into picked from (
     select id from public.inventory_gems where player_id=uid and not locked and value>=100000000 and id<>all(ids)
      and gem_name not in ('Enchant Relic','Ancient Relic') order by value,final_weight,id limit 1
   ) q; ids:=ids||picked;
 end if;
 if not exists(select 1 from public.inventory_gems where id=any(ids) and final_weight>=5000000) then
   select coalesce(array_agg(id),'{}'::bigint[]) into picked from (
     select id from public.inventory_gems where player_id=uid and not locked and final_weight>=5000000 and id<>all(ids)
      and gem_name not in ('Enchant Relic','Ancient Relic') order by value,final_weight,id limit 1
   ) q; ids:=ids||picked;
 end if;

 needed:=1000-(select count(*) from public.inventory_gems where id=any(ids) and rarity between 1 and 9);
 ids:=ids||impossible_private.pick_band(uid,ids,1,9,needed);
 needed:=67000-(select count(*) from public.inventory_gems where id=any(ids) and rarity between 1000 and 9999);
 ids:=ids||impossible_private.pick_band(uid,ids,1000,9999,needed);
 needed:=30000-(select count(*) from public.inventory_gems where id=any(ids) and rarity between 10000 and 99999);
 ids:=ids||impossible_private.pick_band(uid,ids,10000,99999,needed);
 needed:=500-(select count(*) from public.inventory_gems where id=any(ids) and rarity between 100000 and 999999);
 ids:=ids||impossible_private.pick_band(uid,ids,100000,999999,needed);
 needed:=30-(select count(*) from public.inventory_gems where id=any(ids) and rarity between 1000000 and 9999999);
 ids:=ids||impossible_private.pick_band(uid,ids,1000000,9999999,needed);
 needed:=15-(select count(*) from public.inventory_gems where id=any(ids) and rarity>=10000000);
 ids:=ids||impossible_private.pick_band(uid,ids,10000000,null,needed);

 select coalesce(sum(final_weight),0),coalesce(sum(value),0) into total_weight,total_value
 from public.inventory_gems where id=any(ids);
 weight_deficit:=greatest(0,1000000000-total_weight); value_deficit:=greatest(0,1000000000-total_value);
 if weight_deficit>0 or value_deficit>0 then
   with candidates as (
     select i.id,i.final_weight,i.value,
       i.final_weight/greatest(weight_deficit,1)+i.value/greatest(value_deficit,1) score
     from public.inventory_gems i where i.player_id=uid and not i.locked and i.id<>all(ids)
       and i.gem_name not in ('Enchant Relic','Ancient Relic')
   ), running as (
     select id,final_weight,value,
       sum(final_weight) over(order by score desc,id) weight_running,
       sum(value) over(order by score desc,id) value_running
     from candidates
   )
   select coalesce(array_agg(id order by id),'{}'::bigint[]) into picked from running
   where weight_running-final_weight<weight_deficit or value_running-value<value_deficit;
   ids:=ids||picked;
 end if;

 select coalesce(sum(final_weight),0),coalesce(sum(value),0) into total_weight,total_value
 from public.inventory_gems where id=any(ids);
 req:=impossible_private.requirements(uid);
 select coalesce(quantity,0) into pot_legendary from public.player_consumables where player_id=uid and consumable_id='legendary-potion';
 select coalesce(quantity,0) into pot_mythic from public.player_consumables where player_id=uid and consumable_id='mythic-potion';
 select jsonb_build_object(
   'common',count(*) filter(where rarity between 1 and 9),
   'legendary',count(*) filter(where rarity between 1000 and 9999),
   'mythic',count(*) filter(where rarity between 10000 and 99999),
   'exotic',count(*) filter(where rarity between 100000 and 999999),
   'exalted',count(*) filter(where rarity between 1000000 and 9999999),
   'cosmicPlus',count(*) filter(where rarity>=10000000),
   'multiplier10',count(*) filter(where base_weight>0 and final_weight/base_weight>=10),
   'multiplier15',count(*) filter(where base_weight>0 and final_weight/base_weight>=15),
   'multiplier25',count(*) filter(where base_weight>0 and final_weight/base_weight>=25),
   'value100m',count(*) filter(where value>=100000000),
   'weight5m',count(*) filter(where final_weight>=5000000),
   'totalWeight',coalesce(sum(final_weight),0),'totalValue',coalesce(sum(value),0),'selectedCount',count(*)
 ) into materials from public.inventory_gems where id=any(ids);

 preview:=jsonb_build_object('materials',materials,'history',req,'potions',jsonb_build_object(
   'legendary',coalesce(pot_legendary,0),'mythic',coalesce(pot_mythic,0)),
   'highestValue',coalesce((select jsonb_agg(to_jsonb(x)) from (
     select id,gem_name,rarity,final_weight,value,round((final_weight/greatest(base_weight,0.000001))::numeric,2) final_multiplier
     from public.inventory_gems where id=any(ids) order by value desc,id limit 20
   ) x),'[]'::jsonb),
   'expiresAt',now()+interval '15 minutes');

 if (materials->>'common')::integer<1000 or (materials->>'legendary')::integer<67000
   or (materials->>'mythic')::integer<30000 or (materials->>'exotic')::integer<500
   or (materials->>'exalted')::integer<30 or (materials->>'cosmicPlus')::integer<15
   or (materials->>'multiplier10')::integer<14 or (materials->>'multiplier15')::integer<4
   or (materials->>'multiplier25')::integer<1 or (materials->>'value100m')::integer<1
   or (materials->>'weight5m')::integer<1 or total_weight<1000000000 or total_value<1000000000
   or coalesce(pot_legendary,0)<50 or coalesce(pot_mythic,0)<25
   or (req->>'impossibleRareHeavy10m')::numeric<10 or (req->>'impossibleRareHeavy100m')::numeric<1
   or (req->>'impossibleRare100m')::numeric<10 or (req->>'impossibleRare500m')::numeric<1
   or (req->>'impossibleOrdinaryMutations')::numeric<50 or (req->>'impossibleSpecialGems')::numeric<10
   or (req->>'impossibleSpecialists')::numeric<6 or (req->>'impossibleLifetimeEarnings')::numeric<5000000000
   or (req->>'totalRolls')::numeric<1000000
   or (select money from public.players where id=uid)<2500000000
 then
   return jsonb_build_object('ready',false,'preview',preview,'message','Requirements are not yet complete. No items were consumed.');
 end if;

 if exists(select 1 from public.player_equipment where player_id=uid and equipment_id='impossible-pickaxe') then
   raise exception 'already_owned';
 end if;
 delete from public.impossible_pickaxe_craft_plans where player_id=uid or expires_at<=now();
 insert into public.impossible_pickaxe_craft_plans(token,player_id,specimen_ids,preview) values(token,uid,ids,preview);
 select to_jsonb(w) into first_record from public.impossible_pickaxe_world_first w where singleton;
 return jsonb_build_object('ready',true,'token',token,'preview',preview,'worldFirst',first_record);
end $$;

revoke all on function public.prepare_impossible_pickaxe_craft() from public,anon,authenticated;
grant execute on function public.prepare_impossible_pickaxe_craft() to authenticated;

commit;
