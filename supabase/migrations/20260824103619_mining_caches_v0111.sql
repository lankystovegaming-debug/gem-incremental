-- v0.11.1: replace legacy Loot Boxes with server-authoritative Mining Caches.
-- Existing coins are converted once, at their established $100,000 value.

alter table public.players
  add column if not exists legacy_cache_credits bigint not null default 0
  check (legacy_cache_credits >= 0);

create table if not exists public.legacy_cache_conversions (
  player_id uuid primary key references public.players(id) on delete cascade,
  original_coins bigint not null check (original_coins >= 0),
  credits_granted bigint not null check (credits_granted >= 0),
  converted_at timestamptz not null default now(),
  applied_at timestamptz
);

insert into public.legacy_cache_conversions(player_id, original_coins, credits_granted)
select id, greatest(coalesce(coins, 0), 0), greatest(coalesce(coins, 0), 0)
from public.players
on conflict (player_id) do nothing;

update public.players p
set legacy_cache_credits = c.credits_granted,
    coins = 0
from public.legacy_cache_conversions c
where c.player_id = p.id and c.applied_at is null;

update public.legacy_cache_conversions set applied_at = now() where applied_at is null;

create table if not exists public.mining_cache_definitions (
  id text primary key,
  name text not null,
  description text not null,
  prices bigint[] not null,
  sort integer not null,
  enabled boolean not null default true
);

create table if not exists public.mining_cache_rewards (
  id text primary key,
  cache_id text not null references public.mining_cache_definitions(id) on delete cascade,
  label text not null,
  description text not null,
  weight numeric not null check (weight > 0),
  quality integer not null default 0,
  payload jsonb not null,
  enabled boolean not null default true
);

create table if not exists public.player_mining_cache_state (
  player_id uuid primary key references public.players(id) on delete cascade,
  purchase_date date not null default ((now() at time zone 'UTC')::date),
  purchase_counts jsonb not null default '{}'::jsonb,
  pity jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.mining_cache_opens (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  cache_id text not null references public.mining_cache_definitions(id),
  choices jsonb not null check (jsonb_array_length(choices) = 3),
  price bigint not null,
  cash_paid bigint not null,
  credits_used bigint not null default 0,
  purchased_at timestamptz not null default now(),
  claimed_at timestamptz,
  selected_index integer,
  selected_reward jsonb
);
create unique index if not exists mining_cache_one_pending_per_player
  on public.mining_cache_opens(player_id) where claimed_at is null;
create index if not exists mining_cache_opens_player_history
  on public.mining_cache_opens(player_id, purchased_at desc);

create table if not exists public.player_mining_cache_items (
  player_id uuid not null references public.players(id) on delete cascade,
  item_id text not null,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key(player_id, item_id)
);

alter table public.mining_cache_definitions enable row level security;
alter table public.mining_cache_rewards enable row level security;
alter table public.player_mining_cache_state enable row level security;
alter table public.mining_cache_opens enable row level security;
alter table public.player_mining_cache_items enable row level security;
alter table public.legacy_cache_conversions enable row level security;

drop policy if exists mining_cache_definitions_read on public.mining_cache_definitions;
create policy mining_cache_definitions_read on public.mining_cache_definitions for select to authenticated using (true);
drop policy if exists mining_cache_rewards_read on public.mining_cache_rewards;
create policy mining_cache_rewards_read on public.mining_cache_rewards for select to authenticated using (true);
drop policy if exists mining_cache_state_own on public.player_mining_cache_state;
create policy mining_cache_state_own on public.player_mining_cache_state for select to authenticated using (player_id = auth.uid());
drop policy if exists mining_cache_opens_own on public.mining_cache_opens;
create policy mining_cache_opens_own on public.mining_cache_opens for select to authenticated using (player_id = auth.uid());
drop policy if exists mining_cache_items_own on public.player_mining_cache_items;
create policy mining_cache_items_own on public.player_mining_cache_items for select to authenticated using (player_id = auth.uid());
drop policy if exists legacy_cache_conversion_own on public.legacy_cache_conversions;
create policy legacy_cache_conversion_own on public.legacy_cache_conversions for select to authenticated using (player_id = auth.uid());

revoke insert, update, delete on public.mining_cache_definitions, public.mining_cache_rewards,
  public.player_mining_cache_state, public.mining_cache_opens,
  public.player_mining_cache_items, public.legacy_cache_conversions from anon, authenticated;
grant select on public.mining_cache_definitions, public.mining_cache_rewards,
  public.player_mining_cache_state, public.mining_cache_opens,
  public.player_mining_cache_items, public.legacy_cache_conversions to authenticated;

insert into public.mining_cache_definitions(id,name,description,prices,sort) values
('prospector','Prospector Cache','An affordable cache of useful potions with a chance at relics.',array[200000,300000,500000,800000,1200000]::bigint[],1),
('deep','Deep Cache','Stronger supplies, relics and Forge materials from deeper ground.',array[800000,1400000,2400000]::bigint[],2),
('void','Void Cache','Endgame rewards with the strongest guarantees and strictest daily limit.',array[4000000,7000000]::bigint[],3)
on conflict(id) do update set name=excluded.name,description=excluded.description,prices=excluded.prices,sort=excluded.sort,enabled=true;

delete from public.mining_cache_rewards;
insert into public.mining_cache_rewards(id,cache_id,label,description,weight,quality,payload) values
('p-t1x3','prospector','Three Tier I Potions','Three randomly selected Tier I potions.',22,0,'{"kind":"random_potion","tier":1,"quantity":3}'),
('p-t2','prospector','Tier II Potion','One randomly selected Tier II potion.',22,0,'{"kind":"random_potion","tier":2,"quantity":1}'),
('p-t1mix','prospector','Tier I Collection','One of every Tier I potion.',16,0,'{"kind":"mixed_potion","tier":1,"quantity":1}'),
('p-t2x2','prospector','Two Tier II Potions','Two randomly selected Tier II potions.',12,0,'{"kind":"random_potion","tier":2,"quantity":2}'),
('p-t3','prospector','Tier III Potion','One randomly selected Tier III potion.',10,0,'{"kind":"random_potion","tier":3,"quantity":1}'),
('p-er1','prospector','Enchant Relic','One Enchant Relic.',8,1,'{"kind":"relic","name":"Enchant Relic","quantity":1}'),
('p-t2mix','prospector','Tier II Collection','One of every Tier II potion.',5,0,'{"kind":"mixed_potion","tier":2,"quantity":1}'),
('p-legendary','prospector','Legendary Potion','One Legendary Potion.',3,1,'{"kind":"consumable","id":"legendary-potion","quantity":1}'),
('p-er2','prospector','Two Enchant Relics','Two Enchant Relics.',1.5,1,'{"kind":"relic","name":"Enchant Relic","quantity":2}'),
('p-ar1','prospector','Ancient Relic','One Ancient Relic.',0.5,2,'{"kind":"relic","name":"Ancient Relic","quantity":1}'),
('d-t2mix','deep','Tier II Collection','One of every Tier II potion.',18,0,'{"kind":"mixed_potion","tier":2,"quantity":1}'),
('d-t3x2','deep','Two Tier III Potions','Two randomly selected Tier III potions.',17,0,'{"kind":"random_potion","tier":3,"quantity":2}'),
('d-er1','deep','Enchant Relic','One Enchant Relic.',15,1,'{"kind":"relic","name":"Enchant Relic","quantity":1}'),
('d-legendary','deep','Legendary Potion','One Legendary Potion.',13,1,'{"kind":"consumable","id":"legendary-potion","quantity":1}'),
('d-t3mix','deep','Tier III Collection','One of every Tier III potion.',11,0,'{"kind":"mixed_potion","tier":3,"quantity":1}'),
('d-er2','deep','Two Enchant Relics','Two Enchant Relics.',9,1,'{"kind":"relic","name":"Enchant Relic","quantity":2}'),
('d-reroll','deep','Forge Reroll Token','Waives one Masterwork passive reroll cost.',7,1,'{"kind":"cache_item","id":"forge-reroll-token","quantity":1}'),
('d-legendary2','deep','Two Legendary Potions','Two Legendary Potions.',4,1,'{"kind":"consumable","id":"legendary-potion","quantity":2}'),
('d-ar1','deep','Ancient Relic','One Ancient Relic.',3,2,'{"kind":"relic","name":"Ancient Relic","quantity":1}'),
('d-mythic','deep','Mythic Potion','One Mythic Potion.',1.5,2,'{"kind":"consumable","id":"mythic-potion","quantity":1}'),
('d-er3','deep','Three Enchant Relics','Three Enchant Relics.',1,1,'{"kind":"relic","name":"Enchant Relic","quantity":3}'),
('d-ar2','deep','Two Ancient Relics','Two Ancient Relics.',0.5,2,'{"kind":"relic","name":"Ancient Relic","quantity":2}'),
('v-t3mix','void','Large Tier III Collection','Two of every Tier III potion.',18,0,'{"kind":"mixed_potion","tier":3,"quantity":2}'),
('v-legendary2','void','Two Legendary Potions','Two Legendary Potions.',16,1,'{"kind":"consumable","id":"legendary-potion","quantity":2}'),
('v-er3','void','Three Enchant Relics','Three Enchant Relics.',14,1,'{"kind":"relic","name":"Enchant Relic","quantity":3}'),
('v-reroll2','void','Two Forge Reroll Tokens','Waives two Masterwork passive reroll costs.',12,1,'{"kind":"cache_item","id":"forge-reroll-token","quantity":2}'),
('v-mythic','void','Mythic Potion','One Mythic Potion.',10,2,'{"kind":"consumable","id":"mythic-potion","quantity":1}'),
('v-ar1','void','Ancient Relic','One Ancient Relic.',9,2,'{"kind":"relic","name":"Ancient Relic","quantity":1}'),
('v-legendary3','void','Three Legendary Potions','Three Legendary Potions.',7,1,'{"kind":"consumable","id":"legendary-potion","quantity":3}'),
('v-er5','void','Five Enchant Relics','Five Enchant Relics.',6,1,'{"kind":"relic","name":"Enchant Relic","quantity":5}'),
('v-mythic2','void','Two Mythic Potions','Two Mythic Potions.',3,2,'{"kind":"consumable","id":"mythic-potion","quantity":2}'),
('v-ar2','void','Two Ancient Relics','Two Ancient Relics.',2.5,2,'{"kind":"relic","name":"Ancient Relic","quantity":2}'),
('v-perfect','void','Perfect Forge Token','Makes the next Masterwork passive selection offer three choices.',1.5,3,'{"kind":"cache_item","id":"perfect-forge-token","quantity":1}'),
('v-ar3','void','Three Ancient Relics','Three Ancient Relics.',0.7,3,'{"kind":"relic","name":"Ancient Relic","quantity":3}'),
('v-mythic3','void','Three Mythic Potions','Three Mythic Potions.',0.3,3,'{"kind":"consumable","id":"mythic-potion","quantity":3}');

create or replace function public.materialize_mining_cache_reward(p_reward jsonb)
returns jsonb language plpgsql volatile set search_path='' as $$
declare v_kind text:=p_reward->>'kind'; v_tier int; v_qty int; v_family text; v_items jsonb:='[]'; v_i int;
begin
  if v_kind='random_potion' then
    v_tier:=(p_reward->>'tier')::int; v_qty:=(p_reward->>'quantity')::int;
    for v_i in 1..v_qty loop
      select x into v_family from unnest(array['lucky','speed','fortune','mass']) x order by random() limit 1;
      v_items:=v_items||jsonb_build_array(jsonb_build_object('id',v_family||'-potion-'||v_tier,'quantity',1));
    end loop;
    return p_reward||jsonb_build_object('items',v_items);
  elsif v_kind='mixed_potion' then
    v_tier:=(p_reward->>'tier')::int; v_qty:=(p_reward->>'quantity')::int;
    select jsonb_agg(jsonb_build_object('id',x||'-potion-'||v_tier,'quantity',v_qty)) into v_items
      from unnest(array['lucky','speed','fortune','mass']) x;
    return p_reward||jsonb_build_object('items',v_items);
  end if;
  return p_reward;
end $$;

create or replace function public.get_mining_cache_state()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_today date:=(now() at time zone 'UTC')::date; v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into public.player_mining_cache_state(player_id) values(v_uid) on conflict do nothing;
  update public.player_mining_cache_state set purchase_date=v_today,purchase_counts='{}',updated_at=now()
    where player_id=v_uid and purchase_date<>v_today;
  select jsonb_build_object(
    'wallet',jsonb_build_object('money',p.money,'credits',p.legacy_cache_credits),
    'definitions',(select coalesce(jsonb_agg(to_jsonb(d) order by d.sort),'[]') from public.mining_cache_definitions d where d.enabled),
    'rewards',(select coalesce(jsonb_agg(to_jsonb(r) order by r.cache_id,r.weight desc),'[]') from public.mining_cache_rewards r where r.enabled),
    'counts',s.purchase_counts,'pity',s.pity,
    'pending',(select to_jsonb(o) from public.mining_cache_opens o where o.player_id=v_uid and o.claimed_at is null),
    'history',(select coalesce(jsonb_agg(x),'[]') from (select to_jsonb(o) x from public.mining_cache_opens o where o.player_id=v_uid and o.claimed_at is not null order by o.claimed_at desc limit 20) q),
    'items',(select coalesce(jsonb_object_agg(i.item_id,i.quantity),'{}') from public.player_mining_cache_items i where i.player_id=v_uid)
  ) into v_result from public.players p join public.player_mining_cache_state s on s.player_id=p.id where p.id=v_uid;
  if v_result is null then raise exception 'player_not_found'; end if;
  return v_result;
end $$;

create or replace function public.purchase_mining_cache(p_cache_id text,p_use_credits boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_def public.mining_cache_definitions%rowtype; v_state public.player_mining_cache_state%rowtype;
  v_count int; v_price bigint; v_credits bigint; v_use bigint:=0; v_cash bigint; v_choices jsonb:='[]'; v_pick record; v_min_quality int:=0; v_pity_count int; v_high_count int:=0; v_pity jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_def from public.mining_cache_definitions where id=p_cache_id and enabled;
  if not found then raise exception 'cache_not_found'; end if;
  if exists(select 1 from public.mining_cache_opens where player_id=v_uid and claimed_at is null) then raise exception 'pending_choice_exists'; end if;
  insert into public.player_mining_cache_state(player_id) values(v_uid) on conflict do nothing;
  select * into v_state from public.player_mining_cache_state where player_id=v_uid for update;
  if v_state.purchase_date<>(now() at time zone 'UTC')::date then v_state.purchase_counts:='{}'; v_state.purchase_date:=(now() at time zone 'UTC')::date; end if;
  v_count:=coalesce((v_state.purchase_counts->>p_cache_id)::int,0);
  if v_count>=array_length(v_def.prices,1) then raise exception 'daily_limit_reached'; end if;
  v_price:=v_def.prices[v_count+1];
  select legacy_cache_credits into v_credits from public.players where id=v_uid for update;
  if p_use_credits then v_use:=least(v_credits,floor(v_price/200000.0)::bigint); end if;
  v_cash:=v_price-(v_use*100000);
  update public.players set money=money-v_cash,legacy_cache_credits=legacy_cache_credits-v_use
    where id=v_uid and money>=v_cash and legacy_cache_credits>=v_use;
  if not found then raise exception 'not_enough_money'; end if;

  v_pity:=v_state.pity;
  if p_cache_id='prospector' then
    v_pity_count:=coalesce((v_pity->>'prospector')::int,0)+1;
    v_pity:=jsonb_set(v_pity,'{prospector}',to_jsonb(v_pity_count),true);
    if v_pity_count>=5 then v_min_quality:=1; end if;
  elsif p_cache_id='deep' then
    v_pity_count:=coalesce((v_pity->>'deep_rare')::int,0)+1; v_high_count:=coalesce((v_pity->>'deep_high')::int,0)+1;
    v_pity:=jsonb_set(jsonb_set(v_pity,'{deep_rare}',to_jsonb(v_pity_count),true),'{deep_high}',to_jsonb(v_high_count),true);
    if v_high_count>=8 then v_min_quality:=2; elsif v_pity_count>=3 then v_min_quality:=1; end if;
  else
    v_pity_count:=coalesce((v_pity->>'void_premium')::int,0)+1; v_high_count:=coalesce((v_pity->>'void_high')::int,0)+1;
    v_pity:=jsonb_set(jsonb_set(v_pity,'{void_premium}',to_jsonb(v_pity_count),true),'{void_high}',to_jsonb(v_high_count),true);
    if v_high_count>=6 then v_min_quality:=3; elsif v_pity_count>=2 then v_min_quality:=2; end if;
  end if;

  for v_pick in
    select r.* from public.mining_cache_rewards r where r.cache_id=p_cache_id and r.enabled and r.quality>=v_min_quality
    order by -ln(greatest(random(),0.0000001))/r.weight limit 1
  loop v_choices:=v_choices||jsonb_build_array(jsonb_build_object('id',v_pick.id,'label',v_pick.label,'description',v_pick.description,'quality',v_pick.quality,'reward',public.materialize_mining_cache_reward(v_pick.payload))); end loop;
  while jsonb_array_length(v_choices)<3 loop
    select r.* into v_pick from public.mining_cache_rewards r where r.cache_id=p_cache_id and r.enabled
      and not exists(select 1 from jsonb_array_elements(v_choices) c where c->>'id'=r.id)
      order by -ln(greatest(random(),0.0000001))/r.weight limit 1;
    v_choices:=v_choices||jsonb_build_array(jsonb_build_object('id',v_pick.id,'label',v_pick.label,'description',v_pick.description,'quality',v_pick.quality,'reward',public.materialize_mining_cache_reward(v_pick.payload)));
  end loop;
  update public.player_mining_cache_state set purchase_date=v_state.purchase_date,
    purchase_counts=jsonb_set(v_state.purchase_counts,array[p_cache_id],to_jsonb(v_count+1),true),
    pity=v_pity,updated_at=now() where player_id=v_uid;
  insert into public.mining_cache_opens(player_id,cache_id,choices,price,cash_paid,credits_used)
    values(v_uid,p_cache_id,v_choices,v_price,v_cash,v_use);
  return public.get_mining_cache_state();
end $$;

create or replace function public.claim_mining_cache(p_open_id uuid,p_choice_index integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_open public.mining_cache_opens%rowtype; v_choice jsonb; v_reward jsonb; v_item jsonb; v_kind text; v_q int; v_i int; v_quality int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_choice_index not between 0 and 2 then raise exception 'invalid_choice'; end if;
  select * into v_open from public.mining_cache_opens where id=p_open_id and player_id=v_uid and claimed_at is null for update;
  if not found then raise exception 'pending_choice_not_found'; end if;
  v_choice:=v_open.choices->p_choice_index; v_reward:=v_choice->'reward'; v_kind:=v_reward->>'kind'; v_quality:=(v_choice->>'quality')::int;
  if v_kind in ('random_potion','mixed_potion') then
    for v_item in select value from jsonb_array_elements(v_reward->'items') loop
      insert into public.player_consumables(player_id,consumable_id,quantity,updated_at) values(v_uid,v_item->>'id',(v_item->>'quantity')::int,now())
      on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+excluded.quantity,updated_at=now();
    end loop;
  elsif v_kind='consumable' then
    insert into public.player_consumables(player_id,consumable_id,quantity,updated_at) values(v_uid,v_reward->>'id',(v_reward->>'quantity')::int,now())
    on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+excluded.quantity,updated_at=now();
  elsif v_kind='relic' then
    v_q:=(v_reward->>'quantity')::int;
    for v_i in 1..v_q loop insert into public.inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,value,locked)
      values(v_uid,v_reward->>'name',case when v_reward->>'name'='Ancient Relic' then 1500 else 250 end,0,0,1,0,0,0,false); end loop;
  elsif v_kind='cache_item' then
    insert into public.player_mining_cache_items(player_id,item_id,quantity,updated_at) values(v_uid,v_reward->>'id',(v_reward->>'quantity')::int,now())
    on conflict(player_id,item_id) do update set quantity=public.player_mining_cache_items.quantity+excluded.quantity,updated_at=now();
  else raise exception 'unsupported_reward'; end if;
  if v_open.cache_id='prospector' and v_quality>=1 then
    update public.player_mining_cache_state set pity=jsonb_set(pity,'{prospector}','0',true),updated_at=now() where player_id=v_uid;
  elsif v_open.cache_id='deep' and v_quality>=2 then
    update public.player_mining_cache_state set pity=jsonb_set(jsonb_set(pity,'{deep_rare}','0',true),'{deep_high}','0',true),updated_at=now() where player_id=v_uid;
  elsif v_open.cache_id='deep' and v_quality>=1 then
    update public.player_mining_cache_state set pity=jsonb_set(pity,'{deep_rare}','0',true),updated_at=now() where player_id=v_uid;
  elsif v_open.cache_id='void' and v_quality>=3 then
    update public.player_mining_cache_state set pity=jsonb_set(jsonb_set(pity,'{void_premium}','0',true),'{void_high}','0',true),updated_at=now() where player_id=v_uid;
  elsif v_open.cache_id='void' and v_quality>=2 then
    update public.player_mining_cache_state set pity=jsonb_set(pity,'{void_premium}','0',true),updated_at=now() where player_id=v_uid;
  end if;
  update public.mining_cache_opens set claimed_at=now(),selected_index=p_choice_index,selected_reward=v_choice where id=v_open.id;
  return public.get_mining_cache_state();
end $$;

-- The retired RPCs remain as explicit errors for stale clients.
create or replace function public.buy_coins_with_money(p_count integer) returns jsonb language plpgsql security definer set search_path='' as $$ begin raise exception 'coins_retired'; end $$;
create or replace function public.open_loot_box(p_box_id text) returns jsonb language plpgsql security definer set search_path='' as $$ begin raise exception 'loot_boxes_retired'; end $$;

-- Cache Forge tokens are consumed automatically on a random passive reroll.
create or replace function public.masterwork_equipment_with_cache_tokens(p_equipment_row_id bigint,p_action text,p_choice text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_action text:=p_action; v_result jsonb; v_token text; v_money numeric; v_enchant int; v_ancient int; v_i int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_action='reroll' and exists(select 1 from public.player_mining_cache_items where player_id=v_uid and item_id='perfect-forge-token' and quantity>0 for update) then v_token:='perfect-forge-token'; v_action:='insight';
  elsif p_action='reroll' and exists(select 1 from public.player_mining_cache_items where player_id=v_uid and item_id='forge-reroll-token' and quantity>0 for update) then v_token:='forge-reroll-token'; end if;
  v_result:=public.masterwork_equipment_beta(p_equipment_row_id,v_action,p_choice);
  if v_token is not null then
    v_money:=coalesce((v_result->>'spentMoney')::numeric,0); v_enchant:=coalesce((v_result->>'spentEnchantRelics')::int,0); v_ancient:=coalesce((v_result->>'spentAncientRelics')::int,0);
    update public.players set money=money+v_money where id=v_uid;
    for v_i in 1..v_enchant loop insert into public.inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,value,locked) values(v_uid,'Enchant Relic',250,0,0,1,0,0,0,false); end loop;
    for v_i in 1..v_ancient loop insert into public.inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,value,locked) values(v_uid,'Ancient Relic',1500,0,0,1,0,0,0,false); end loop;
    update public.player_mining_cache_items set quantity=quantity-1,updated_at=now() where player_id=v_uid and item_id=v_token;
    v_result:=v_result||jsonb_build_object('spentMoney',0,'spentEnchantRelics',0,'spentAncientRelics',0,'cacheTokenUsed',v_token);
  end if;
  return v_result;
end $$;

revoke all on function public.materialize_mining_cache_reward(jsonb) from public,anon,authenticated;
revoke all on function public.get_mining_cache_state() from public,anon;
revoke all on function public.purchase_mining_cache(text,boolean) from public,anon;
revoke all on function public.claim_mining_cache(uuid,integer) from public,anon;
revoke all on function public.masterwork_equipment_with_cache_tokens(bigint,text,text) from public,anon;
grant execute on function public.get_mining_cache_state() to authenticated;
grant execute on function public.purchase_mining_cache(text,boolean) to authenticated;
grant execute on function public.claim_mining_cache(uuid,integer) to authenticated;
grant execute on function public.masterwork_equipment_with_cache_tokens(bigint,text,text) to authenticated;

-- Remove Sandbox completely from the feature registry. The application files
-- and navigation entry are removed by the matching v0.11.1 client update.
delete from public.game_section_settings where id='sandbox';
