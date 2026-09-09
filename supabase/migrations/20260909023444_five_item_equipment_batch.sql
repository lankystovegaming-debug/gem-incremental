-- Prepared against live project igrddscmrdrrwtvyspbf / optimized roll v147.
-- Manual deployment only. No existing equipment or recipes are retired.
begin;
-- Metadata is needed by server leaderboard/rarity calculations and live catalogs.
-- The optimized roll function explicitly excludes Balanced from ordinary mutation RNG.
insert into public.game_mutations(id,name,chance,multiplier,description,icon,color,enabled)
values('balanced','Balanced',20,1.2,'Exclusive to All Rounder Toy: 1/20 per genuine roll, stacking with ordinary mutations.','⚖️','#80cbc4',true)
on conflict(id) do update set name=excluded.name,chance=excluded.chance,multiplier=excluded.multiplier,
 description=excluded.description,icon=excluded.icon,color=excluded.color,enabled=excluded.enabled;
create table public.equipment_ownership_history (
 player_id uuid not null references public.players(id) on delete cascade,
 equipment_id text not null, primary key(player_id,equipment_id)
);
alter table public.equipment_ownership_history enable row level security;
revoke all on public.equipment_ownership_history from public,anon,authenticated;
grant all on public.equipment_ownership_history to service_role;
create function public.track_equipment_ownership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.equipment_ownership_history values(new.player_id,new.equipment_id) on conflict do nothing;
 return new;
end $$;
revoke all on function public.track_equipment_ownership() from public,anon,authenticated;
create trigger track_equipment_ownership after insert or update of equipment_id on public.player_equipment for each row execute function public.track_equipment_ownership();
insert into public.equipment_ownership_history select distinct player_id,equipment_id from public.player_equipment on conflict do nothing;
insert into public.equipment_ownership_history
 select (snapshot->>'player_id')::uuid,snapshot->>'equipment_id' from public.equipment_overhaul_archive a
 where kind='equipment' and exists(select 1 from public.players p where p.id=(a.snapshot->>'player_id')::uuid)
 on conflict do nothing;

-- Raw rarity history is indexed by genuine roll number. Never use effective rarity.
-- Natural weight is only recoverable for retained specimens matched to a genuine roll.
with raw as (
 select player_id,count(distinct roll_number) filter(where rarity>=5000000) raw5m,
 count(distinct roll_number) filter(where rarity>=10000000) raw10m
 from public.best_roll_history where rarity>=5000000 group by player_id
), heavy as (
 select i.player_id,count(distinct i.roll_number) heavy5 from public.inventory_gems i
 where i.rolled_weight_multiplier>=5 and exists(select 1 from public.best_roll_history h
 where h.player_id=i.player_id and h.roll_number=i.roll_number and h.gem_name=i.gem_name and h.final_weight=i.final_weight)
 group by i.player_id
)
update public.players p set equipment_state=jsonb_set(coalesce(p.equipment_state,'{}'),'{batchHistory}',
 jsonb_build_object('raw5m',coalesce(r.raw5m,0),'raw10m',coalesce(r.raw10m,0),'heavy5',coalesce(h.heavy5,0)))
from (select id from public.players) ids left join raw r on r.player_id=ids.id left join heavy h on h.player_id=ids.id where p.id=ids.id;

create function public.equipment_batch_progress(p_uid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(p.equipment_state->'batchHistory','{}') || jsonb_build_object(
 'genuineRolls',p.equipment_genuine_rolls,'lifetimeEarnings',coalesce(p.lifetime_earnings,0),
 'endgamePickaxes',(select count(*) from public.equipment_ownership_history h where h.player_id=p.id and h.equipment_id in
 ('empyrean-pickaxe','eternity-pickaxe','tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','fortune-pickaxe','all-in-pickaxe')))
 from public.players p where p.id=p_uid
$$;
revoke all on function public.equipment_batch_progress(uuid) from public,anon,authenticated;
grant execute on function public.equipment_batch_progress(uuid) to service_role;

create or replace function public.get_equipment_overhaul_progress() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin
 if uid is null then raise exception 'not_authenticated'; end if;
 return jsonb_build_object('daily_window',public.equipment_special_discoveries(uid,'daily_window'),
 'global_event',public.equipment_special_discoveries(uid,'global_event'),'special',public.equipment_special_discoveries(uid,'special'),
 'genuineRolls',(select equipment_genuine_rolls from public.players where id=uid),
 'state',(select equipment_state from public.players where id=uid),'batchHistory',public.equipment_batch_progress(uid));
end $$;

-- A House Edge loss commits progression and equipment state together, with no specimen.
create function public.commit_jackpot_loss(p_player_id uuid,p_lease_id uuid,p_genuine_roll bigint,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.players%rowtype; begin
 select * into p from public.players where id=p_player_id for update;
 if not found or p.roll_lease_id is distinct from p_lease_id then raise exception 'invalid_roll_lease'; end if;
 if p.equipment_state_roll>=p_genuine_roll then return jsonb_build_object('total_rolls',p.total_rolls,'duplicate',true); end if;
 if p_genuine_roll<>p.equipment_genuine_rolls+1 then raise exception 'invalid_genuine_roll'; end if;
 if not exists(select 1 from public.player_equipment where player_id=p_player_id and equipment_id='jackpot-slot' and equipped) then raise exception 'invalid_equipment'; end if;
 update public.players set equipment_state=p_state,equipment_state_roll=p_genuine_roll,
 equipment_genuine_rolls=p_genuine_roll,total_rolls=coalesce(total_rolls,0)+1 where id=p_player_id returning * into p;
 return jsonb_build_object('total_rolls',p.total_rolls);
end $$;
revoke all on function public.commit_jackpot_loss(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.commit_jackpot_loss(uuid,uuid,bigint,jsonb) to service_role;
insert into public.game_recipes(id,recipe) values('fortune-pickaxe','{"id":"fortune-pickaxe","name":"Fortune Pickaxe","category":"pickaxe","craftingTab":"pickaxe","horizontal":true,"equipmentOverhaul":true,"moneyCost":200000000,"requirements":[{"id":"fortune-pickaxe-legendary","type":"gem-count","label":"Legendary","amount":1500,"minimumRarity":1000,"maximumRarity":9999},{"id":"fortune-pickaxe-mythic","type":"gem-count","label":"Mythic","amount":500,"minimumRarity":10000,"maximumRarity":99999},{"id":"fortune-pickaxe-exotic","type":"gem-count","label":"Exotic","amount":25,"minimumRarity":100000,"maximumRarity":999999},{"id":"fortune-pickaxe-exalted","type":"gem-count","label":"Exalted","amount":2,"minimumRarity":1000000,"maximumRarity":9999999},{"type":"equipment-history","metric":"raw5m","amount":3,"label":"Raw-rarity ≥1/5M rolls","consume":false},{"type":"equipment-history","metric":"raw10m","amount":1,"label":"Raw-rarity ≥1/10M rolls","consume":false}],"reward":{"id":"fortune-pickaxe","name":"Fortune Pickaxe","category":"pickaxe","tier":15,"bonus":{"luck":32,"rollSpeed":1.7,"mutationChance":-0.05,"weightLuck":3,"weightMultiplier":0.4}},"description":"A pickaxe made for miners who believe you can never have too much luck. Sacrifices a little of everything else for a simple advantage: more Luck."}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('all-in-pickaxe','{"id":"all-in-pickaxe","name":"All-In Pickaxe","category":"pickaxe","craftingTab":"pickaxe","horizontal":true,"equipmentOverhaul":true,"moneyCost":250000000,"requirements":[{"id":"all-in-pickaxe-legendary","type":"gem-count","label":"Legendary","amount":5000,"minimumRarity":1000,"maximumRarity":9999},{"id":"all-in-pickaxe-mythic","type":"gem-count","label":"Mythic","amount":1500,"minimumRarity":10000,"maximumRarity":99999},{"id":"all-in-pickaxe-exotic","type":"gem-count","label":"Exotic","amount":100,"minimumRarity":100000,"maximumRarity":999999},{"id":"all-in-pickaxe-exalted","type":"gem-count","label":"Exalted","amount":5,"minimumRarity":1000000,"maximumRarity":9999999},{"type":"equipment-history","metric":"endgamePickaxes","amount":3,"label":"Distinct post-Celestial endgame Pickaxes ever owned","consume":false},{"type":"equipment-history","metric":"raw10m","amount":1,"label":"Raw-rarity ≥1/10M rolls","consume":false}],"reward":{"id":"all-in-pickaxe","name":"All-In Pickaxe","category":"pickaxe","tier":15,"bonus":{"luck":249,"rollSpeed":-0.8,"mutationChance":-0.9,"weightLuck":-0.9,"weightMultiplier":-0.9}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('all-rounder-toy','{"id":"all-rounder-toy","name":"All Rounder Toy","category":"pickaxe","craftingTab":"toys","horizontal":true,"equipmentOverhaul":true,"moneyCost":50000000,"requirements":[{"id":"all-rounder-toy-epic","type":"gem-count","label":"Epic","amount":200,"minimumRarity":100,"maximumRarity":999},{"id":"all-rounder-toy-mythic","type":"gem-count","label":"Mythic","amount":100,"minimumRarity":10000,"maximumRarity":99999},{"type":"gem-count","gem":"Uranium","amount":50},{"id":"all-rounder-toy-exotic","type":"gem-count","label":"Exotic","amount":20,"minimumRarity":100000,"maximumRarity":999999},{"type":"gem-count","gem":"Cryoshock","amount":5},{"id":"all-rounder-toy-exalted","type":"gem-count","label":"Exalted","amount":3,"minimumRarity":1000000,"maximumRarity":9999999}],"reward":{"id":"all-rounder-toy","name":"All Rounder Toy","category":"pickaxe","tier":15,"bonus":{"luck":1,"rollSpeed":1,"mutationChance":1,"weightLuck":1,"weightMultiplier":1}},"description":"Tired of unbalanced stats and broken abilities? Well, wish no more—introducing the All Rounder Toy with balanced stats."}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('jackpot-slot','{"id":"jackpot-slot","name":"Jackpot Slot","category":"pickaxe","craftingTab":"toys","horizontal":true,"equipmentOverhaul":true,"moneyCost":77700000,"requirements":[{"id":"jackpot-slot-common","type":"gem-count","label":"Common","amount":7777,"minimumRarity":1,"maximumRarity":9},{"id":"jackpot-slot-mythic","type":"gem-count","label":"Mythic","amount":777,"minimumRarity":10000,"maximumRarity":99999},{"id":"jackpot-slot-exotic","type":"gem-count","label":"Exotic","amount":77,"minimumRarity":100000,"maximumRarity":999999},{"id":"jackpot-slot-exalted","type":"gem-count","label":"Exalted","amount":7,"minimumRarity":1000000,"maximumRarity":9999999},{"type":"equipment-history","metric":"genuineRolls","amount":77700,"label":"Lifetime genuine rolls","consume":false}],"reward":{"id":"jackpot-slot","name":"Jackpot Slot","category":"pickaxe","tier":15,"bonus":{"luck":6.77,"rollSpeed":0.77,"mutationChance":-0.23,"weightLuck":0.77,"weightMultiplier":-0.23}},"description":"Slots slots slots, I bet everything on slots. Ain’t no body taking my spot, I just hit the jackpotttt"}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('money-pickaxe','{"id":"money-pickaxe","name":"Money Pickaxe","category":"pickaxe","craftingTab":"toys","horizontal":true,"equipmentOverhaul":true,"moneyCost":100000000,"requirements":[{"id":"money-pickaxe-common","type":"gem-count","label":"Common","amount":10000,"minimumRarity":1,"maximumRarity":9},{"id":"money-pickaxe-rare","type":"gem-count","label":"Rare","amount":5000,"minimumRarity":50,"maximumRarity":99},{"type":"gem-count","gem":"Quartz","amount":2500},{"type":"gem-count","gem":"Calcite","amount":1000},{"type":"gem-count","gem":"Feldspar","amount":500},{"type":"equipment-history","metric":"heavy5","amount":250,"label":"Specimens ≥5× natural weight","consume":false},{"type":"equipment-history","metric":"lifetimeEarnings","amount":1000000000,"label":"Lifetime earnings ($)","consume":false}],"reward":{"id":"money-pickaxe","name":"Money Pickaxe","category":"pickaxe","tier":15,"bonus":{"luck":-0.99,"rollSpeed":-0.7,"mutationChance":1,"weightLuck":9,"weightMultiplier":199}},"description":"Rarity doesn''t pay the bills. 200× more rock does."}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
CREATE OR REPLACE FUNCTION public.craft_equipment_recipe(p_recipe_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_recipe jsonb; v_reward jsonb; v_bonus jsonb;
  v_money_cost double precision; v_progress jsonb; v_req jsonb; v_idx integer;
  v_key text; v_target numeric; v_have numeric; v_required_equipment text;
  v_new_money double precision; v_total_rolls bigint;
  v_potion record; v_remaining integer; v_take integer;
  v_best_100k double precision; v_best_1m double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(cp.progress->'_equipment_recipe',r.recipe) into v_recipe from public.game_recipes r left join public.crafting_progress cp on cp.recipe_id=r.id and cp.player_id=v_uid where r.id=p_recipe_id;
  if v_recipe is null then raise exception 'recipe_not_found'; end if;
  v_reward:=v_recipe->'reward';
  if v_reward is null or v_reward->>'type'='consumable' then raise exception 'recipe_not_found'; end if;
  v_bonus:=coalesce(v_reward->'bonus','{}'::jsonb);
  v_money_cost:=coalesce((v_recipe->>'moneyCost')::double precision,0);

  select money,total_rolls,best_rare_natural_weight_100k,best_rare_natural_weight_1m
  into v_new_money,v_total_rolls,v_best_100k,v_best_1m
  from public.players where id=v_uid for update;
  if not found then raise exception 'player_not_found'; end if;

  select progress into v_progress from public.crafting_progress
  where player_id=v_uid and recipe_id=p_recipe_id;
  v_progress:=coalesce(v_progress,'{}'::jsonb);

  for v_req,v_idx in
    select value,(ordinality-1)::integer
    from jsonb_array_elements(coalesce(v_recipe->'requirements','[]'::jsonb)) with ordinality
  loop
    if v_req->>'type'='equipment' then
      if not exists(select 1 from public.player_equipment where player_id=v_uid and (equipment_id=v_req->>'equipmentId' or (p_recipe_id='plastic-shopping-bag' and v_req->>'equipmentId'='omnidimensional-vault' and equipment_id='dimensional-vault')))
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='equipment-history' then
      if coalesce((public.equipment_batch_progress(v_uid)->>(v_req->>'metric'))::numeric,0)<(v_req->>'amount')::numeric then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='special-discoveries' then
      if public.equipment_special_discoveries(v_uid,v_req->>'classification')<(v_req->>'amount')::integer then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='potion-tier' then
      v_remaining:=(v_req->>'amount')::integer;
      for v_potion in select pc.consumable_id,pc.quantity from public.player_consumables pc
        join public.game_consumables c on c.id=pc.consumable_id
        where pc.player_id=v_uid and c.tier=(v_req->>'tier')::integer and c.duration_seconds>1
          and c.family in ('luck','rollSpeed','weightLuck','weightMultiplier')
        order by pc.consumable_id for update of pc loop
        v_take:=least(v_remaining,v_potion.quantity);
        update public.player_consumables set quantity=quantity-v_take,updated_at=now() where player_id=v_uid and consumable_id=v_potion.consumable_id;
        v_remaining:=v_remaining-v_take;
        exit when v_remaining=0;
      end loop;
      if v_remaining>0 then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='consumable' then
      update public.player_consumables set quantity=quantity-(v_req->>'amount')::integer,updated_at=now()
      where player_id=v_uid and consumable_id=v_req->>'consumableId' and quantity>=(v_req->>'amount')::integer;
      if not found then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='lifetime-rolls' then
      if coalesce(v_total_rolls,0)<coalesce((v_req->>'rolls')::bigint,0)
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='roll-history-condition' then
      v_have:=case when coalesce((v_req->>'minimumRarity')::numeric,0)>=1000000
        then coalesce(v_best_1m,0) else coalesce(v_best_100k,0) end;
      if v_have<coalesce((v_req->>'minimumWeightMultiplier')::numeric,0)
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='rarity-points' then
      v_key:=coalesce(v_req->>'id','rarity-points-'||v_idx::text);
      if coalesce((v_progress->v_key->>'points')::numeric,0)<coalesce((v_req->>'points')::numeric,0)
        or jsonb_array_length(coalesce(v_progress->v_key->'gemTypes','[]'::jsonb))<coalesce((v_req->>'minimumUniqueGemTypes')::integer,0)
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='gem-range' then
      v_key:=coalesce(v_req->>'id','gem-range-'||v_idx::text);
      if exists(select 1 from jsonb_array_elements_text(coalesce(v_req->'gems','[]'::jsonb)) gem
        where coalesce((v_progress->v_key->>gem.value)::numeric,0)<coalesce((v_req->>'amountEach')::numeric,1))
      then raise exception 'requirements_not_met'; end if;
    else
      v_key:=coalesce(v_req->>'id',case
        when v_req->>'type'='gem-count' then v_req->>'gem'
        when v_req->>'type'='consumable' then coalesce(v_req->>'consumableId','consumable-'||v_idx::text)
        else (v_req->>'type')||'-'||v_idx::text end);
      v_target:=case v_req->>'type'
        when 'gem-total-weight' then coalesce((v_req->>'totalWeight')::numeric,0)
        when 'specimen-total-weight' then coalesce((v_req->>'totalWeight')::numeric,0)
        when 'specimen-value-total' then coalesce((v_req->>'totalValue')::numeric,0)
        else coalesce((v_req->>'amount')::numeric,1) end;
      v_have:=coalesce((v_progress->>v_key)::numeric,0);
      if v_have<v_target then raise exception 'requirements_not_met'; end if;
    end if;
  end loop;

  if v_new_money<v_money_cost then raise exception 'not_enough_money'; end if;
  select r->>'equipmentId' into v_required_equipment
  from jsonb_array_elements(coalesce(v_recipe->'requirements','[]'::jsonb)) r
  where r->>'type'='equipment' limit 1;
  -- Linear secondaries consume their preceding tier. Horizontal builds and ownership gates do not.
  if v_required_equipment is not null and not coalesce((v_recipe->>'includedSpecimens')::boolean,false)
     and not coalesce((v_recipe->>'horizontal')::boolean,false)
     and not exists(select 1 from jsonb_array_elements(v_recipe->'requirements') q where q->>'type'='equipment' and q->>'consume'='false') then
    delete from public.player_equipment where player_id=v_uid and equipment_id=v_required_equipment;
  end if;
  update public.player_equipment set equipped=false where player_id=v_uid and category=v_reward->>'category' and equipped;

  insert into public.player_equipment(
    player_id,equipment_id,category,tier,name,luck_bonus,roll_speed_bonus,
    weight_luck_bonus,weight_multiplier_bonus,equipped
  ) values(
    v_uid,v_reward->>'id',v_reward->>'category',coalesce((v_reward->>'tier')::integer,1),
    v_reward->>'name',coalesce((v_bonus->>'luck')::double precision,0),
    coalesce((v_bonus->>'rollSpeed')::double precision,0),
    coalesce((v_bonus->>'weightLuck')::double precision,0),
    coalesce((v_bonus->>'weightMultiplier')::double precision,0),true
  ) on conflict(player_id,equipment_id) do update set
    category=excluded.category,tier=excluded.tier,name=excluded.name,
    luck_bonus=excluded.luck_bonus,roll_speed_bonus=excluded.roll_speed_bonus,
    weight_luck_bonus=excluded.weight_luck_bonus,
    weight_multiplier_bonus=excluded.weight_multiplier_bonus,equipped=true;

  update public.players set money=money-v_money_cost where id=v_uid returning money into v_new_money;
  delete from public.crafting_progress where player_id=v_uid and recipe_id=p_recipe_id;
  update public.player_crafting set
    active_auto_craft=case when active_auto_craft=p_recipe_id then null else active_auto_craft end,
    updated_at=now() where player_id=v_uid;
  return jsonb_build_object('money',v_new_money,'equipmentId',v_reward->>'id');
end;
$function$;
commit;
