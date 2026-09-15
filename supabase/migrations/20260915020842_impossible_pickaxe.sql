begin;

create schema if not exists impossible_private;
revoke all on schema impossible_private from public, anon, authenticated;

create table public.impossible_pickaxe_world_first (
  singleton boolean primary key default true check (singleton),
  player_id uuid not null unique references public.players(id) on delete restrict,
  player_name text not null,
  crafted_at timestamptz not null default now()
);
alter table public.impossible_pickaxe_world_first enable row level security;
create policy impossible_world_first_public_read on public.impossible_pickaxe_world_first
  for select to anon, authenticated using (true);
grant select on public.impossible_pickaxe_world_first to anon, authenticated;
revoke insert, update, delete on public.impossible_pickaxe_world_first from anon, authenticated;

create table public.impossible_pickaxe_craft_plans (
  token uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references public.players(id) on delete cascade,
  specimen_ids bigint[] not null,
  preview jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
alter table public.impossible_pickaxe_craft_plans enable row level security;
revoke all on public.impossible_pickaxe_craft_plans from public, anon, authenticated;
grant all on public.impossible_pickaxe_craft_plans to service_role;

insert into public.cosmetic_definitions(id,name,slots,description,rarity,visual_config,source)
values
 ('impossible-profile-background','Impossible Profile Background',array['background'],'Awarded forever to the first Impossible Pickaxe crafter.','Mythic','{"icon":"◈","style":"impossible"}','world-first'),
 ('impossible-pickaxe-crafter','Impossible Pickaxe Crafter',array['trophy'],'Crafted The Impossible Pickaxe.','Mythic','{"icon":"◆","style":"impossible"}','equipment')
on conflict(id) do update set name=excluded.name,slots=excluded.slots,description=excluded.description,
 rarity=excluded.rarity,visual_config=excluded.visual_config,source=excluded.source,enabled=true;

insert into public.game_recipes(id,recipe) values(
 'impossible-pickaxe',
 '{
   "id":"impossible-pickaxe","name":"The Impossible Pickaxe","category":"pickaxe","craftingTab":"toys",
   "horizontal":true,"equipmentOverhaul":true,"manualReviewOnly":true,"consumeMaterials":true,
   "moneyCost":2500000000,"description":"Congratulations. Now explain why.",
   "requirements":[
     {"type":"impossible-safe-sacrifice","amount":1,"label":"Reviewed shared sacrifice plan"},
     {"type":"consumable","consumableId":"legendary-potion","amount":50},
     {"type":"consumable","consumableId":"mythic-potion","amount":25},
     {"type":"lifetime-rolls","rolls":1000000},
     {"type":"equipment-history","metric":"impossibleLifetimeEarnings","amount":5000000000,"label":"Lifetime earnings"},
     {"type":"equipment-history","metric":"impossibleSpecialists","amount":6,"label":"Frozen specialist set owned"},
     {"type":"equipment-history","metric":"impossibleRareHeavy10m","amount":10,"label":"1/10M+ base rarity and 5x+ final/base weight"},
     {"type":"equipment-history","metric":"impossibleRareHeavy100m","amount":1,"label":"1/100M+ base rarity and 10x+ final/base weight"},
     {"type":"equipment-history","metric":"impossibleRare100m","amount":10,"label":"1/100M+ base-rarity genuine rolls"},
     {"type":"equipment-history","metric":"impossibleRare500m","amount":1,"label":"1/500M+ base-rarity genuine roll"},
     {"type":"equipment-history","metric":"impossibleOrdinaryMutations","amount":50,"label":"Ordinary mutations discovered"},
     {"type":"equipment-history","metric":"impossibleSpecialGems","amount":10,"label":"Distinct Special Gems discovered"}
   ],
   "reward":{"id":"impossible-pickaxe","name":"The Impossible Pickaxe","category":"pickaxe","tier":19,
     "bonus":{"luck":0,"rollSpeed":0,"mutationChance":0,"weightLuck":0,"weightMultiplier":0}}
 }'::jsonb
) on conflict(id) do update set recipe=excluded.recipe;

create or replace function impossible_private.requirements(p_uid uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 -- best_roll_history is the durable genuine-roll ledger and its rarity is the
 -- rolled gem's base rarity. Joining the live catalog keeps base weights
 -- authoritative without copying frontend formula data into this migration.
 with history as (
   select
     count(*) filter(where h.rarity>=10000000 and g.base_weight>0 and h.final_weight/g.base_weight>=5) rare_heavy_10m,
     count(*) filter(where h.rarity>=100000000 and g.base_weight>0 and h.final_weight/g.base_weight>=10) rare_heavy_100m,
     count(distinct h.roll_number) filter(where h.rarity>=100000000 and h.roll_number is not null) rare_100m,
     count(distinct h.roll_number) filter(where h.rarity>=500000000 and h.roll_number is not null) rare_500m
   from public.best_roll_history h
   left join public.private_feature_gems g on g.name=h.gem_name
   where h.player_id=p_uid
 ), mutations as (
   select count(distinct mutation_id) ordinary
   from public.player_gem_mutation_combinations c
   cross join lateral unnest(coalesce(c.mutation_ids,'{}'::text[])) mutation_id
   join public.game_mutations m on m.id=mutation_id and m.enabled
   where c.player_id=p_uid and mutation_id not in (
     'balanced','shifted','supersizer-small','supersizer-big','supersizer-giant',
     'supersizer-massive','supersizer-colossal','supersizer-titanic','supersizer-gargantuan',
     'silly-small','silly-large','happy'
   )
 ), specials as (
   select count(distinct g.name) amount
   from public.private_feature_gems g
   join public.player_gem_mutation_combinations c on c.player_id=p_uid and c.gem_name=g.name
   where g.special_gem and g.enabled
 ), specialists as (
   -- Frozen at launch: the four named specialist builds plus the serious
   -- Fortune and Supersizer endpoints. Progression picks, Toys and All-In do
   -- not silently become eligible as the catalog grows.
   select count(distinct h.equipment_id) amount
   from public.equipment_ownership_history h
   where h.player_id=p_uid and h.equipment_id in (
     'tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','fortune-pickaxe','supersizer-pickaxe'
   )
 )
 select jsonb_build_object(
   'impossibleRareHeavy10m',coalesce(history.rare_heavy_10m,0),
   'impossibleRareHeavy100m',coalesce(history.rare_heavy_100m,0),
   'impossibleRare100m',coalesce(history.rare_100m,0),
   'impossibleRare500m',coalesce(history.rare_500m,0),
   'impossibleOrdinaryMutations',coalesce(mutations.ordinary,0),
   'impossibleSpecialGems',coalesce(specials.amount,0),
   'impossibleSpecialists',coalesce(specialists.amount,0),
   'impossibleLifetimeEarnings',coalesce(p.lifetime_earnings,0),
   'totalRolls',coalesce(p.total_rolls,0)
 )
 from public.players p cross join history cross join mutations cross join specials cross join specialists
 where p.id=p_uid
$$;
revoke all on function impossible_private.requirements(uuid) from public,anon,authenticated;

create or replace function impossible_private.pick_band(
  p_uid uuid,p_excluded bigint[],p_min numeric,p_max numeric,p_amount integer
) returns bigint[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(id order by value,final_weight,id),'{}'::bigint[])
 from (
   select i.id,i.value,i.final_weight from public.inventory_gems i
   where i.player_id=p_uid and not i.locked and i.id<>all(coalesce(p_excluded,'{}'::bigint[]))
     and i.gem_name not in ('Enchant Relic','Ancient Relic')
     and i.rarity>=p_min and (p_max is null or i.rarity<=p_max)
   order by i.value,i.final_weight,i.id limit greatest(0,p_amount)
 ) picked
$$;
revoke all on function impossible_private.pick_band(uuid,bigint[],numeric,numeric,integer) from public,anon,authenticated;

create or replace function public.get_impossible_pickaxe_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); first_record jsonb; req jsonb; owned boolean;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 select to_jsonb(w) into first_record from public.impossible_pickaxe_world_first w where singleton;
 req:=impossible_private.requirements(uid);
 select exists(select 1 from public.player_equipment where player_id=uid and equipment_id='impossible-pickaxe') into owned;
 return jsonb_build_object('worldFirst',first_record,'requirements',req,'owned',owned,
   'specialistSet',jsonb_build_array('tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','fortune-pickaxe','supersizer-pickaxe'));
end $$;
revoke all on function public.get_impossible_pickaxe_status() from public,anon,authenticated;
grant execute on function public.get_impossible_pickaxe_status() to authenticated;

create or replace function public.prepare_impossible_pickaxe_craft()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); ids bigint[]:='{}'; picked bigint[]; needed integer; token uuid:=gen_random_uuid();
 total_weight numeric:=0; total_value numeric:=0; weight_deficit numeric; value_deficit numeric;
 req jsonb; preview jsonb; materials jsonb; first_record jsonb; pot_legendary integer; pot_mythic integer;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 -- Serialize this exceptionally large planner per account without holding the
 -- player's hot roll-state row locked while the read-only selection runs.
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

create or replace function public.craft_impossible_pickaxe(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); plan public.impossible_pickaxe_craft_plans%rowtype; req jsonb; material jsonb;
 money_after numeric; first_winner boolean:=false; name text; crafted timestamptz:=clock_timestamp(); deleted_count integer;
begin
 if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 select * into plan from public.impossible_pickaxe_craft_plans where token=p_token and player_id=uid for update;
 if not found or plan.expires_at<=now() then raise exception 'craft_plan_expired'; end if;
 select username into name from public.players where id=uid for update;
 if exists(select 1 from public.player_equipment where player_id=uid and equipment_id='impossible-pickaxe') then raise exception 'already_owned'; end if;
 req:=impossible_private.requirements(uid);
 if (req->>'impossibleRareHeavy10m')::numeric<10 or (req->>'impossibleRareHeavy100m')::numeric<1
   or (req->>'impossibleRare100m')::numeric<10 or (req->>'impossibleRare500m')::numeric<1
   or (req->>'impossibleOrdinaryMutations')::numeric<50 or (req->>'impossibleSpecialGems')::numeric<10
   or (req->>'impossibleSpecialists')::numeric<6 or (req->>'impossibleLifetimeEarnings')::numeric<5000000000
   or (req->>'totalRolls')::numeric<1000000 then raise exception 'requirements_not_met'; end if;

 select jsonb_build_object(
   'rows',count(*),'common',count(*) filter(where rarity between 1 and 9),
   'legendary',count(*) filter(where rarity between 1000 and 9999),
   'mythic',count(*) filter(where rarity between 10000 and 99999),
   'exotic',count(*) filter(where rarity between 100000 and 999999),
   'exalted',count(*) filter(where rarity between 1000000 and 9999999),
   'cosmicPlus',count(*) filter(where rarity>=10000000),
   'multiplier10',count(*) filter(where base_weight>0 and final_weight/base_weight>=10),
   'multiplier15',count(*) filter(where base_weight>0 and final_weight/base_weight>=15),
   'multiplier25',count(*) filter(where base_weight>0 and final_weight/base_weight>=25),
   'value100m',count(*) filter(where value>=100000000),'weight5m',count(*) filter(where final_weight>=5000000),
   'totalWeight',coalesce(sum(final_weight),0),'totalValue',coalesce(sum(value),0)
 ) into material from public.inventory_gems where player_id=uid and not locked and id=any(plan.specimen_ids);
 if (material->>'rows')::integer<>cardinality(plan.specimen_ids)
   or (material->>'common')::integer<1000 or (material->>'legendary')::integer<67000
   or (material->>'mythic')::integer<30000 or (material->>'exotic')::integer<500
   or (material->>'exalted')::integer<30 or (material->>'cosmicPlus')::integer<15
   or (material->>'multiplier10')::integer<14 or (material->>'multiplier15')::integer<4
   or (material->>'multiplier25')::integer<1 or (material->>'value100m')::integer<1
   or (material->>'weight5m')::integer<1 or (material->>'totalWeight')::numeric<1000000000
   or (material->>'totalValue')::numeric<1000000000 then raise exception 'craft_plan_changed'; end if;

 update public.player_consumables set quantity=quantity-50,updated_at=now()
 where player_id=uid and consumable_id='legendary-potion' and quantity>=50;
 if not found then raise exception 'requirements_not_met'; end if;
 update public.player_consumables set quantity=quantity-25,updated_at=now()
 where player_id=uid and consumable_id='mythic-potion' and quantity>=25;
 if not found then raise exception 'requirements_not_met'; end if;
 update public.players set money=money-2500000000 where id=uid and money>=2500000000 returning money into money_after;
 if not found then raise exception 'not_enough_money'; end if;
 delete from public.inventory_gems where player_id=uid and not locked and id=any(plan.specimen_ids);
 get diagnostics deleted_count=row_count;
 if deleted_count<>cardinality(plan.specimen_ids) then raise exception 'craft_plan_changed'; end if;

 update public.player_equipment set equipped=false where player_id=uid and category='pickaxe' and equipped;
 insert into public.player_equipment(player_id,equipment_id,category,tier,name,luck_bonus,roll_speed_bonus,
   mutation_chance_bonus,weight_luck_bonus,weight_multiplier_bonus,equipped)
 values(uid,'impossible-pickaxe','pickaxe',19,'The Impossible Pickaxe',0,0,0,0,0,true)
 on conflict(player_id,equipment_id) do update set equipped=true;

 insert into public.impossible_pickaxe_world_first(singleton,player_id,player_name,crafted_at)
 values(true,uid,coalesce(nullif(name,''),'Unknown Player'),crafted) on conflict(singleton) do nothing;
 get diagnostics deleted_count=row_count; first_winner:=deleted_count=1;
 if first_winner then
   update public.players set equipment_state=jsonb_set(coalesce(equipment_state,'{}'::jsonb),'{impossibleWorldFirst}','true'::jsonb,true) where id=uid;
   insert into public.player_cosmetics(player_id,cosmetic_id,source,source_key,earned_at)
   values(uid,'impossible-profile-background','world-first','impossible-pickaxe',crafted)
   on conflict(player_id,cosmetic_id) do nothing;
   insert into public.player_cosmetic_loadouts(player_id,equipment)
   values(uid,'{"background":"impossible-profile-background"}'::jsonb)
   on conflict(player_id) do update set equipment=jsonb_set(
     coalesce(public.player_cosmetic_loadouts.equipment,'{}'::jsonb),
     '{background}','"impossible-profile-background"'::jsonb,true
   ),updated_at=now();
 end if;
 insert into public.player_cosmetics(player_id,cosmetic_id,source,source_key,earned_at)
 values(uid,'impossible-pickaxe-crafter','equipment','impossible-pickaxe',crafted)
 on conflict(player_id,cosmetic_id) do nothing;
 delete from public.impossible_pickaxe_craft_plans where player_id=uid;
 return jsonb_build_object('equipmentId','impossible-pickaxe','money',money_after,'worldFirst',first_winner,'craftedAt',crafted);
end $$;
revoke all on function public.craft_impossible_pickaxe(uuid) from public,anon,authenticated;
grant execute on function public.craft_impossible_pickaxe(uuid) to authenticated;

commit;
