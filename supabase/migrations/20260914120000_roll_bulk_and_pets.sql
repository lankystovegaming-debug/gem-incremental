-- 20260914120000_roll_bulk_and_pets.sql
-- Adds roll-bulk equipment, a disabled-by-default pet collection backend,
-- pet-luck consumables, and admin CRUD for live equipment/pets.

begin;

alter table public.player_equipment
  add column if not exists roll_bulk_bonus integer not null default 0;

alter table public.player_equipment
  add column if not exists pet_luck_bonus numeric not null default 0;

alter table public.player_boosts
  drop constraint if exists player_boosts_family_check;
alter table public.player_boosts
  add constraint player_boosts_family_check check (
    family in ('luck','rollSpeed','weightLuck','weightMultiplier','relic','petLuck')
  );

alter table public.game_consumables
  drop constraint if exists game_consumables_family_check;
alter table public.game_consumables
  add constraint game_consumables_family_check check (
    family in ('luck','rollSpeed','weightLuck','weightMultiplier','relic','petLuck','material')
  );

create table if not exists public.game_pets (
  id text primary key,
  name text not null,
  chance_denominator numeric not null default 100000000 check(chance_denominator >= 1),
  affected_by_luck boolean not null default false,
  enabled boolean not null default false,
  stats jsonb not null default '{}'::jsonb,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.game_pets enable row level security;
revoke all on public.game_pets from public, anon, authenticated;
create policy game_pets_admin_select on public.game_pets
  for select to authenticated using(exists(select 1 from public.admins a where a.user_id=(select auth.uid())));
grant select on public.game_pets to authenticated, service_role;

create table if not exists public.player_pets (
  player_id uuid not null references public.players(id) on delete cascade,
  pet_id text not null references public.game_pets(id) on delete cascade,
  quantity integer not null default 1 check(quantity >= 1),
  first_obtained_at timestamptz not null default now(),
  last_obtained_at timestamptz not null default now(),
  primary key(player_id, pet_id)
);
alter table public.player_pets enable row level security;
create policy player_pets_self_select on public.player_pets
  for select to authenticated using(player_id=(select auth.uid()));
revoke all on public.player_pets from anon;
grant select on public.player_pets to authenticated;

-- Admin-created equipment is stored in the existing JSON catalog and also
-- materialized as a normal game recipe so it can actually be crafted.
create or replace function public.admin_save_equipment(
  p_id text,
  p_name text,
  p_category text,
  p_tier integer,
  p_boost_mode text,
  p_boost_value numeric,
  p_money_cost numeric,
  p_requirements jsonb,
  p_description text default '',
  p_enabled boolean default true
)
returns public.admin_content_catalog
language plpgsql security definer set search_path=public
as $$
declare
  r public.admin_content_catalog;
  bonus jsonb := '{}'::jsonb;
  recipe jsonb;
begin
  if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
  if p_id is null or btrim(p_id)='' or p_name is null or btrim(p_name)='' then raise exception 'invalid_equipment'; end if;
  if p_category is null or p_category not in ('pickaxe','clover','lantern','boots','bag','petGear') then raise exception 'invalid_equipment_category'; end if;
  if p_boost_mode not in ('rollSpeed','rollBulk','petLuck') then raise exception 'invalid_equipment_boost'; end if;
  if coalesce(p_boost_value,0) < 0 then raise exception 'invalid_equipment_boost'; end if;
  if p_boost_mode='rollSpeed' then bonus:=jsonb_build_object('rollSpeed',p_boost_value); end if;
  if p_boost_mode='rollBulk' then bonus:=jsonb_build_object('rollBulk',greatest(0,trunc(p_boost_value))); end if;
  if p_boost_mode='petLuck' then bonus:=jsonb_build_object('petLuck',p_boost_value); end if;

  recipe:=jsonb_build_object(
    'id',p_id,'name',p_name,'category',p_category,'craftingTab',p_category,
    'horizontal',true,'equipmentOverhaul',true,'moneyCost',greatest(0,coalesce(p_money_cost,0)),
    'description',coalesce(p_description,''),
    'requirements',coalesce(p_requirements,'[]'::jsonb),
    'reward',jsonb_build_object(
      'id',p_id,'name',p_name,'category',p_category,'tier',greatest(1,coalesce(p_tier,1)),
      'bonus',bonus
    )
  );

  insert into public.admin_content_catalog(content_type,content_key,name,enabled,config,updated_by)
  values('equipment',p_id,p_name,coalesce(p_enabled,true),
    jsonb_build_object(
      'category',p_category,'tier',greatest(1,coalesce(p_tier,1)),
      'boostMode',p_boost_mode,'boostValue',p_boost_value,
      'rollSpeed',coalesce(bonus->>'rollSpeed','0')::numeric,
      'rollBulk',coalesce(bonus->>'rollBulk','0')::numeric,
      'petLuck',coalesce(bonus->>'petLuck','0')::numeric,
      'moneyCost',greatest(0,coalesce(p_money_cost,0)),
      'requirements',coalesce(p_requirements,'[]'::jsonb),
      'description',coalesce(p_description,'')
    ),auth.uid())
  on conflict(content_type,content_key) do update set
    name=excluded.name,enabled=excluded.enabled,config=excluded.config,
    updated_at=now(),updated_by=auth.uid()
  returning * into r;

  insert into public.game_recipes(id,recipe) values(p_id,recipe)
  on conflict(id) do update set recipe=excluded.recipe;
  return r;
end $$;

create or replace function public.admin_delete_equipment(p_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
  delete from public.admin_content_catalog where content_type='equipment' and content_key=p_id;
  delete from public.game_recipes where id=p_id and recipe->>'equipmentOverhaul'='true';
end $$;

grant execute on function public.admin_save_equipment(text,text,text,integer,text,numeric,numeric,jsonb,text,boolean),
  public.admin_delete_equipment(text) to authenticated;

-- Pet admin CRUD. `affected_by_luck` is retained for future use, but the
-- initial game design keeps it false: normal gem Luck can never affect pets.
create or replace function public.admin_save_pet(
  p_id text,p_name text,p_chance_denominator numeric default 100000000,
  p_affected_by_luck boolean default false,p_stats jsonb default '{}'::jsonb,
  p_description text default '',p_enabled boolean default false
)
returns public.game_pets
language plpgsql security definer set search_path=public
as $$
declare r public.game_pets;
begin
  if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
  if p_id is null or btrim(p_id)='' or p_name is null or btrim(p_name)='' then raise exception 'invalid_pet'; end if;
  if coalesce(p_chance_denominator,100000000) < 1 then raise exception 'invalid_pet_chance'; end if;
  insert into public.game_pets(id,name,chance_denominator,affected_by_luck,enabled,stats,description,updated_by)
  values(btrim(p_id),btrim(p_name),p_chance_denominator,coalesce(p_affected_by_luck,false),
    coalesce(p_enabled,false),coalesce(p_stats,'{}'::jsonb),coalesce(p_description,''),auth.uid())
  on conflict(id) do update set
    name=excluded.name,chance_denominator=excluded.chance_denominator,
    affected_by_luck=excluded.affected_by_luck,enabled=excluded.enabled,
    stats=excluded.stats,description=excluded.description,updated_at=now(),updated_by=auth.uid()
  returning * into r;
  return r;
end $$;

create or replace function public.admin_delete_pet(p_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
  delete from public.game_pets where id=p_id;
end $$;
grant execute on function public.admin_save_pet(text,text,numeric,boolean,jsonb,text,boolean),
  public.admin_delete_pet(text) to authenticated;

-- Service-role-only reward commit. It is idempotent for a player's collection
-- and consumes every stacked pet-luck boost exactly when a pet is obtained.
create or replace function public.claim_pet_reward(p_player_id uuid,p_pet_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_quantity integer;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
    then raise exception 'service_role_required'; end if;
  if not exists(select 1 from public.game_pets where id=p_pet_id and enabled) then
    raise exception 'pet_not_available'; end if;

  insert into public.player_pets(player_id,pet_id,quantity)
  values(p_player_id,p_pet_id,1)
  on conflict(player_id,pet_id) do update set
    quantity=public.player_pets.quantity+1,last_obtained_at=now();
  select quantity into v_quantity from public.player_pets
    where player_id=p_player_id and pet_id=p_pet_id;

  delete from public.player_boosts where player_id=p_player_id and family='petLuck';
  return jsonb_build_object('petId',p_pet_id,'quantity',v_quantity);
end $$;
revoke all on function public.claim_pet_reward(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_pet_reward(uuid,text) to service_role;

-- Crafted pet-luck toys. They have no timer: they remain stacked until a pet
-- is successfully rolled, exactly as requested.
insert into public.game_consumables(id,name,family,tier,effect_value,duration_seconds,purchasable,shop_price)
values
 ('pet-luck-treat','Pet Luck Treat','petLuck',1,0.25,1,false,null),
 ('enchanted-pet-toy','Enchanted Pet Toy','petLuck',2,0.75,1,false,null),
 ('celestial-pet-charm','Celestial Pet Charm','petLuck',3,2.0,1,false,null),
 ('mythic-pet-whistle','Mythic Pet Whistle','petLuck',4,5.0,1,false,null)
on conflict(id) do update set family=excluded.family,tier=excluded.tier,
 effect_value=excluded.effect_value,duration_seconds=1,purchasable=false,shop_price=null;

-- The base 1/100m pet set is intentionally strong and future-proof: stats are
-- stored separately so enabling the pet inventory later can consume them.
insert into public.game_pets(id,name,chance_denominator,affected_by_luck,enabled,stats,description)
values
 ('celestial-fox','Celestial Fox',100000000,false,true,'{"luck":1.75,"rollSpeed":0.35,"mutationLuck":1.5,"weightLuck":0.75,"weightMultiplier":0.5}','A ridiculously lucky fox.'),
 ('void-dragon','Void Dragon',100000000,false,true,'{"luck":3,"rollSpeed":0.5,"mutationLuck":2.5,"weightLuck":1.25,"weightMultiplier":1}','A dragon from beyond the mine.'),
 ('chrono-bunny','Chrono Bunny',100000000,false,true,'{"luck":2.25,"rollSpeed":0.9,"mutationLuck":1.25,"weightLuck":0.5,"weightMultiplier":0.75}','It seems to roll before you do.'),
 ('prismatic-griffin','Prismatic Griffin',100000000,false,true,'{"luck":4,"rollSpeed":0.4,"mutationLuck":3,"weightLuck":1.5,"weightMultiplier":1.25}','A top-end all-rounder pet.'),
 ('singularity-cat','Singularity Cat',100000000,false,true,'{"luck":5,"rollSpeed":0.75,"mutationLuck":4,"weightLuck":2,"weightMultiplier":2}','The absurd late-game pet.')
on conflict(id) do update set name=excluded.name,chance_denominator=excluded.chance_denominator,
 affected_by_luck=false,enabled=true,stats=excluded.stats,description=excluded.description;


-- Pet-luck toys are prepared as an indefinite stacked boost. The next successful
-- pet roll consumes the entire family, regardless of how many toys were stacked.
create or replace function public.activate_pet_luck_boost(p_consumable_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); c public.game_consumables%rowtype; owned integer; total numeric;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from public.game_consumables where id=p_consumable_id and family='petLuck' and purchasable=false;
  if not found then raise exception 'consumable_not_found'; end if;
  select quantity into owned from public.player_consumables
    where player_id=uid and consumable_id=p_consumable_id for update;
  if coalesce(owned,0)<1 then raise exception 'none_owned'; end if;

  update public.player_consumables
    set quantity=quantity-1,updated_at=now()
    where player_id=uid and consumable_id=p_consumable_id;

  select coalesce(effect_value,0)+coalesce((
    select effect_value from public.player_boosts
    where player_id=uid and family='petLuck'
    limit 1
  ),0) into total;

  insert into public.player_boosts(player_id,family,tier,effect_value,expires_at)
  values(uid,'petLuck',coalesce(c.tier,1),total,'9999-12-31 23:59:59+00')
  on conflict (player_id,family) do update set
    tier=greatest(public.player_boosts.tier,excluded.tier),
    effect_value=excluded.effect_value,
    expires_at='9999-12-31 23:59:59+00';
  return jsonb_build_object('family','petLuck','effectValue',total);
end $$;
grant execute on function public.activate_pet_luck_boost(text) to authenticated;

-- Pet-luck consumables are craftable in the existing Toys tab.
insert into public.game_recipes(id,recipe) values
 ('pet-luck-treat', '{"id":"pet-luck-treat","name":"Pet Luck Treat","category":"toys","craftingTab":"toys","requirements":[{"type":"gem-count","gem":"Quartz","amount":25},{"type":"gem-count","gem":"Peridot","amount":5}],"moneyCost":1000,"reward":{"type":"consumable","id":"pet-luck-treat","name":"Pet Luck Treat","family":"petLuck","tier":1,"amount":1,"effectValue":0.25}}'::jsonb),
 ('enchanted-pet-toy', '{"id":"enchanted-pet-toy","name":"Enchanted Pet Toy","category":"toys","craftingTab":"toys","requirements":[{"type":"consumable","consumableId":"pet-luck-treat","amount":2},{"type":"gem-count","gem":"Amethyst","amount":10},{"type":"gem-count","gem":"Sapphire","amount":5}],"moneyCost":10000,"reward":{"type":"consumable","id":"enchanted-pet-toy","name":"Enchanted Pet Toy","family":"petLuck","tier":2,"amount":1,"effectValue":0.75}}'::jsonb),
 ('celestial-pet-charm', '{"id":"celestial-pet-charm","name":"Celestial Pet Charm","category":"toys","craftingTab":"toys","requirements":[{"type":"consumable","consumableId":"enchanted-pet-toy","amount":2},{"type":"gem-count","gem":"Diamond","amount":5},{"type":"gem-count","gem":"Aether Quartz","amount":2}],"moneyCost":250000,"reward":{"type":"consumable","id":"celestial-pet-charm","name":"Celestial Pet Charm","family":"petLuck","tier":3,"amount":1,"effectValue":2}}'::jsonb),
 ('mythic-pet-whistle', '{"id":"mythic-pet-whistle","name":"Mythic Pet Whistle","category":"toys","craftingTab":"toys","requirements":[{"type":"consumable","consumableId":"celestial-pet-charm","amount":2},{"type":"gem-count","gem":"Chronite","amount":2},{"type":"gem-count","gem":"Void Opal","amount":1}],"moneyCost":5000000,"reward":{"type":"consumable","id":"mythic-pet-whistle","name":"Mythic Pet Whistle","family":"petLuck","tier":4,"amount":1,"effectValue":5}}'::jsonb)
on conflict(id) do update set recipe=excluded.recipe;

-- Crafted pet gear can occupy the existing Bags slot only when explicitly
-- equipped; its actual pet bonus is read from this new column and does not
-- alter normal Luck/Roll Speed.
insert into public.game_recipes(id,recipe) values
 ('pet-luck-collar','{"id":"pet-luck-collar","name":"Pet Luck Collar","category":"petGear","craftingTab":"petGear","horizontal":true,"requirements":[{"type":"gem-count","gem":"Emerald","amount":25},{"type":"gem-count","gem":"Sapphire","amount":15},{"type":"gem-count","gem":"Chronite","amount":1}],"moneyCost":750000,"reward":{"id":"pet-luck-collar","name":"Pet Luck Collar","category":"petGear","tier":20,"bonus":{"petLuck":3}}}'::jsonb),
 ('cosmic-pet-harness','{"id":"cosmic-pet-harness","name":"Cosmic Pet Harness","category":"petGear","craftingTab":"petGear","horizontal":true,"requirements":[{"type":"equipment","equipmentId":"pet-luck-collar"},{"type":"gem-count","gem":"Aether Quartz","amount":5},{"type":"gem-count","gem":"Void Opal","amount":2}],"moneyCost":25000000,"reward":{"id":"cosmic-pet-harness","name":"Cosmic Pet Harness","category":"petGear","tier":21,"bonus":{"petLuck":8}}}'::jsonb)
on conflict(id) do update set recipe=excluded.recipe;

-- Upgrade the final craft path so petLuck/rollBulk survive crafting.
create or replace function public.normalize_pet_equipment_stats() returns trigger
language plpgsql set search_path=public as $$
declare b jsonb;
begin
  select coalesce(recipe->'reward'->'bonus','{}'::jsonb) into b
  from public.game_recipes where id=new.equipment_id;
  if b is not null then
    new.roll_bulk_bonus:=coalesce((b->>'rollBulk')::integer,0);
    new.pet_luck_bonus:=coalesce((b->>'petLuck')::numeric,0);
  end if;
  return new;
end $$;
drop trigger if exists normalize_pet_equipment_stats on public.player_equipment;
create trigger normalize_pet_equipment_stats
before insert or update on public.player_equipment
for each row execute function public.normalize_pet_equipment_stats();

-- Dynamic batch unlock: the old 1/2/3/4 gates remain, while every roll-bulk
-- point adds one additional batch slot above 4.
create or replace function public.roll_batch_unlock_status(p_player_id uuid,p_batch_size integer)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_rolls bigint; v_celestial boolean; v_bulk integer; v_max integer;
begin
  if p_player_id is null or p_batch_size is null or p_batch_size<1 then
    return jsonb_build_object('status','invalid_batch_size'); end if;
  select equipment_genuine_rolls into v_rolls from public.players where id=p_player_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select exists(select 1 from public.equipment_ownership_history where player_id=p_player_id and equipment_id='celestial-pickaxe')
      or exists(select 1 from public.player_equipment where player_id=p_player_id and equipment_id='celestial-pickaxe')
    into v_celestial;
  select coalesce(sum(greatest(0,roll_bulk_bonus)),0) into v_bulk
    from public.player_equipment where player_id=p_player_id and equipped;
  v_max:=least(100,4+v_bulk);
  if p_batch_size<=2 then return jsonb_build_object('status','unlocked','maximumBatchSize',v_max); end if;
  if p_batch_size=3 and v_rolls>=100000 then return jsonb_build_object('status','unlocked','maximumBatchSize',v_max); end if;
  if p_batch_size=4 and v_rolls>=500000 and v_celestial then return jsonb_build_object('status','unlocked','maximumBatchSize',v_max); end if;
  if p_batch_size>4 and p_batch_size<=v_max and v_rolls>=500000 and v_celestial
    then return jsonb_build_object('status','unlocked','maximumBatchSize',v_max); end if;
  if p_batch_size>v_max then return jsonb_build_object('status','invalid_batch_size','maximumBatchSize',v_max,'rollBulkBonus',v_bulk); end if;
  return jsonb_build_object('status','batch_locked','genuineRolls',v_rolls,
    'requiredGenuineRolls',case when p_batch_size>=3 then 100000 else 0 end,
    'requiresCelestialPickaxe',p_batch_size>=4,'hasCelestialPickaxe',v_celestial,
    'maximumBatchSize',v_max,'rollBulkBonus',v_bulk);
end $$;
revoke all on function public.roll_batch_unlock_status(uuid,integer) from public,anon,authenticated;
grant execute on function public.roll_batch_unlock_status(uuid,integer) to service_role;

-- Settings now accepts a saved batch size up to the server's hard ceiling.
create or replace function public.update_qol_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s jsonb;
  k text;
  v jsonb;
  legacy_missing boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text) > 200000 then
    raise exception 'invalid_settings';
  end if;

  insert into public.player_settings(player_id) values(uid) on conflict do nothing;
  select settings into s from public.player_settings where player_id = uid for update;
  legacy_missing := not (s ? 'legacyAutoSell');

  for k, v in select * from jsonb_each(p_patch) loop
    if k = 'gemFilter' then
      if jsonb_typeof(v) is distinct from 'object' then raise exception 'invalid_filter'; end if;
      if exists(
        select 1
        from jsonb_each_text(v) e
        where e.value is null
          or e.value not in ('DEFAULT', 'KEEP', 'SELL')
          or not exists(
            select 1
            from public.player_gem_mutation_combinations d
            where d.player_id = uid and d.gem_name = e.key
          )
      ) then
        raise exception 'invalid_or_undiscovered_gem';
      end if;
      s := jsonb_set(s, '{gemFilter}', coalesce(s->'gemFilter', '{}') || v);
    elsif k = 'maxLuck' then
      if v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
        s := jsonb_set(s, '{maxLuck}', 'null'::jsonb);
      else
        if jsonb_typeof(v) is distinct from 'number' then raise exception 'invalid_max_luck'; end if;
        if (v::text)::numeric < 1 or (v::text)::numeric > 9007199254740991 then
          raise exception 'invalid_max_luck';
        end if;
        s := jsonb_set(s, '{maxLuck}', v);
      end if;
    elsif k in ('enableBuffs', 'discoveryKeep', 'autoRoll', 'autoKeep', 'rollAnimations', 'globalCash', 'cashGraph') then
      if jsonb_typeof(v) is distinct from 'boolean' then raise exception 'invalid_boolean'; end if;
      s := jsonb_set(s, array[k], v);
    elsif k = 'batchSize' then
      if jsonb_typeof(v) is distinct from 'number'
         or (v::text)::numeric <> trunc((v::text)::numeric)
         or (v::text)::numeric < 1
         or (v::text)::numeric > 100 then
        raise exception 'invalid_batch_size';
      end if;
      s := jsonb_set(s, '{batchSize}', v);
    elsif k in ('discoveryKeepRarity', 'autoKeepEffectiveRarity', 'cutsceneMinimumRarity') then
      if jsonb_typeof(v) is distinct from 'number' then raise exception 'invalid_threshold'; end if;
      if (v::text)::numeric < 1 or (v::text)::numeric > 9007199254740991 then
        raise exception 'invalid_threshold';
      end if;
      s := jsonb_set(s, array[k], v);
    elsif k = 'clearLegacyAutoSell' then
      if v is distinct from 'true'::jsonb then raise exception 'invalid_boolean'; end if;
      s := jsonb_set(s, '{legacyAutoSell}', 'false');
    elsif k in ('legacyAutoSell', 'legacyAutoSellTier') then
      if k = 'legacyAutoSell' and jsonb_typeof(v) is distinct from 'boolean' then
        raise exception 'invalid_boolean';
      end if;
      if k = 'legacyAutoSellTier' and v #>> '{}' not in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic') then
        raise exception 'invalid_tier';
      end if;
      if legacy_missing then s := jsonb_set(s, array[k], v); end if;
    elsif k = 'gemRealism' then
      s := jsonb_set(s, array[k], v);
    else
      raise exception 'unknown_setting';
    end if;
  end loop;

  update public.player_settings set settings = s, updated_at = now() where player_id = uid;
  return s;
end;
$$;
grant execute on function public.update_qol_settings(jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
