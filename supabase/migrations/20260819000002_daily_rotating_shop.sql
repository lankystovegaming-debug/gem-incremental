-- Global daily Shop rotation with per-player stock and one personal refresh.
create table if not exists public.daily_shop_catalog (
  id text primary key,
  category text not null check (category in ('tier2','tier3','bundle','specialist','rare')),
  name text not null,
  description text not null,
  price numeric not null check (price >= 0),
  stock_min integer not null check (stock_min > 0),
  stock_max integer not null check (stock_max >= stock_min),
  weight numeric not null check (weight > 0),
  contents jsonb not null check (jsonb_typeof(contents) = 'array')
);

create table if not exists public.daily_shop_rotations (
  rotation_date date not null,
  slot integer not null check (slot between 1 and 6),
  offer_id text not null references public.daily_shop_catalog(id),
  stock integer not null check (stock > 0),
  primary key (rotation_date, slot)
);

create table if not exists public.daily_shop_personal_rotations (
  player_id uuid not null,
  rotation_date date not null,
  slot integer not null check (slot between 4 and 6),
  offer_id text not null references public.daily_shop_catalog(id),
  stock integer not null check (stock > 0),
  primary key (player_id, rotation_date, slot)
);

create table if not exists public.daily_shop_purchases (
  player_id uuid not null,
  rotation_date date not null,
  rotation_kind text not null check (rotation_kind in ('global','refresh')),
  slot integer not null check (slot between 1 and 6),
  quantity integer not null default 0 check (quantity >= 0),
  primary key (player_id, rotation_date, rotation_kind, slot)
);

alter table public.daily_shop_catalog enable row level security;
alter table public.daily_shop_rotations enable row level security;
alter table public.daily_shop_personal_rotations enable row level security;
alter table public.daily_shop_purchases enable row level security;

insert into public.daily_shop_catalog(id,category,name,description,price,stock_min,stock_max,weight,contents) values
('lucky-2','tier2','Lucky Potion II','+25% Luck for 60 seconds.',40000,3,6,1,'[{"type":"consumable","id":"lucky-potion-2","quantity":1}]'),
('speed-2','tier2','Speed Potion II','+25% Roll Speed for 60 seconds.',30000,3,6,1,'[{"type":"consumable","id":"speed-potion-2","quantity":1}]'),
('fortune-2','tier2','Fortune Potion II','+25% Weight Luck for 60 seconds.',40000,3,6,1,'[{"type":"consumable","id":"fortune-potion-2","quantity":1}]'),
('mass-2','tier2','Mass Potion II','+15% Weight Multiplier for 60 seconds.',60000,3,5,1,'[{"type":"consumable","id":"mass-potion-2","quantity":1}]'),
('lucky-3','tier3','Lucky Potion III','+50% Luck for 60 seconds.',175000,1,3,1,'[{"type":"consumable","id":"lucky-potion-3","quantity":1}]'),
('speed-3','tier3','Speed Potion III','+50% Roll Speed for 60 seconds.',125000,1,3,1,'[{"type":"consumable","id":"speed-potion-3","quantity":1}]'),
('fortune-3','tier3','Fortune Potion III','+50% Weight Luck for 60 seconds.',175000,1,3,1,'[{"type":"consumable","id":"fortune-potion-3","quantity":1}]'),
('mass-3','tier3','Mass Potion III','+25% Weight Multiplier for 60 seconds.',250000,1,2,1,'[{"type":"consumable","id":"mass-potion-3","quantity":1}]'),
('prospector-pack','bundle','Prospector Pack','3 Lucky I and 3 Fortune I potions.',7500,3,3,24,'[{"type":"consumable","id":"lucky-potion-1","quantity":3},{"type":"consumable","id":"fortune-potion-1","quantity":3}]'),
('rapid-pack','bundle','Rapid Mining Pack','5 Speed I potions.',5000,3,3,24,'[{"type":"consumable","id":"speed-potion-1","quantity":5}]'),
('heavy-pack','bundle','Heavy Mining Pack','3 Fortune I and 3 Mass I potions.',10000,3,3,20,'[{"type":"consumable","id":"fortune-potion-1","quantity":3},{"type":"consumable","id":"mass-potion-1","quantity":3}]'),
('balanced-pack','bundle','Balanced Pack','2 of every Tier I potion.',12000,2,2,20,'[{"type":"consumable","id":"lucky-potion-1","quantity":2},{"type":"consumable","id":"speed-potion-1","quantity":2},{"type":"consumable","id":"fortune-potion-1","quantity":2},{"type":"consumable","id":"mass-potion-1","quantity":2}]'),
('advanced-pack','bundle','Advanced Pack','1 of every Tier II potion.',150000,2,2,12,'[{"type":"consumable","id":"lucky-potion-2","quantity":1},{"type":"consumable","id":"speed-potion-2","quantity":1},{"type":"consumable","id":"fortune-potion-2","quantity":1},{"type":"consumable","id":"mass-potion-2","quantity":1}]'),
('special-lucky-2','specialist','Lucky II Bundle','3 Lucky Potion II.',110000,2,2,15,'[{"type":"consumable","id":"lucky-potion-2","quantity":3}]'),
('special-speed-2','specialist','Speed II Bundle','3 Speed Potion II.',85000,2,2,15,'[{"type":"consumable","id":"speed-potion-2","quantity":3}]'),
('special-fortune-2','specialist','Fortune II Bundle','3 Fortune Potion II.',110000,2,2,15,'[{"type":"consumable","id":"fortune-potion-2","quantity":3}]'),
('special-mass-2','specialist','Mass II Bundle','3 Mass Potion II.',170000,2,2,12,'[{"type":"consumable","id":"mass-potion-2","quantity":3}]'),
('special-enchant-relic','specialist','Enchant Relic','Forge fuel or a new pickaxe enchant.',750000,1,2,18,'[{"type":"relic","id":"Enchant Relic","quantity":1}]'),
('special-legendary','specialist','Legendary Potion','+1,000 Luck for one successful roll.',3000000,1,1,12,'[{"type":"consumable","id":"legendary-potion","quantity":1}]'),
('special-ancient-relic','specialist','Ancient Relic','Rare Forge fuel and Ancient enchanting.',6000000,1,1,5,'[{"type":"relic","id":"Ancient Relic","quantity":1}]'),
('mixed-forge-pack','specialist','Mixed Forge Pack','3 Enchant Relics and 1 Lucky Potion III.',2500000,1,1,8,'[{"type":"relic","id":"Enchant Relic","quantity":3},{"type":"consumable","id":"lucky-potion-3","quantity":1}]'),
('special-mythic','specialist','Mythic Potion','+10,000 Luck for one successful roll.',10000000,1,1,1,'[{"type":"consumable","id":"mythic-potion","quantity":1}]'),
('rare-legendary','rare','Legendary Potion','+1,000 Luck for one successful roll.',3000000,1,1,35,'[{"type":"consumable","id":"legendary-potion","quantity":1}]'),
('rare-enchant-3','rare','Enchant Relic Bundle','3 Enchant Relics.',2000000,1,1,25,'[{"type":"relic","id":"Enchant Relic","quantity":3}]'),
('rare-all-tier3','rare','Tier III Collection','1 of every Tier III potion.',700000,1,1,18,'[{"type":"consumable","id":"lucky-potion-3","quantity":1},{"type":"consumable","id":"speed-potion-3","quantity":1},{"type":"consumable","id":"fortune-potion-3","quantity":1},{"type":"consumable","id":"mass-potion-3","quantity":1}]'),
('rare-ancient','rare','Ancient Relic','Rare Forge fuel and Ancient enchanting.',6000000,1,1,10,'[{"type":"relic","id":"Ancient Relic","quantity":1}]'),
('rare-ancient-2','rare','Ancient Relic Bundle','2 Ancient Relics.',11000000,1,1,5,'[{"type":"relic","id":"Ancient Relic","quantity":2}]'),
('rare-mythic','rare','Mythic Potion','+10,000 Luck for one successful roll.',30000000,1,1,5,'[{"type":"consumable","id":"mythic-potion","quantity":1}]'),
('rare-mythic-2','rare','Mythic Potion Bundle','2 Mythic Potions.',55000000,1,1,1,'[{"type":"consumable","id":"mythic-potion","quantity":2}]'),
('perfect-forge-cache','rare','Perfect Forge Cache','2 Ancient Relics, 5 Enchant Relics, and 1 Lucky Potion III.',20000000,1,1,1,'[{"type":"relic","id":"Ancient Relic","quantity":2},{"type":"relic","id":"Enchant Relic","quantity":5},{"type":"consumable","id":"lucky-potion-3","quantity":1}]')
on conflict (id) do update set category=excluded.category,name=excluded.name,description=excluded.description,price=excluded.price,stock_min=excluded.stock_min,stock_max=excluded.stock_max,weight=excluded.weight,contents=excluded.contents;

create or replace function public.ensure_daily_shop_rotation(p_date date)
returns void language plpgsql security definer set search_path='' as $$
declare v_slot integer; v_category text; v_offer public.daily_shop_catalog%rowtype; v_previous text;
begin
  perform pg_advisory_xact_lock(hashtext('daily-shop-' || p_date::text));
  if (select count(*) from public.daily_shop_rotations where rotation_date=p_date) = 6 then return; end if;
  delete from public.daily_shop_rotations where rotation_date=p_date;
  for v_slot in 1..6 loop
    v_category := case when v_slot<=2 then 'tier2' when v_slot=3 then 'tier3' when v_slot=4 then 'bundle' when v_slot=5 then 'specialist' else 'rare' end;
    select * into v_offer from public.daily_shop_catalog c where c.category=v_category and (v_slot<>2 or c.id<>v_previous)
      order by (-ln(greatest(random(),0.0000001))/c.weight) limit 1;
    insert into public.daily_shop_rotations values(p_date,v_slot,v_offer.id,
      v_offer.stock_min + floor(random()*(v_offer.stock_max-v_offer.stock_min+1))::integer);
    if v_slot=1 then v_previous:=v_offer.id; end if;
  end loop;
end; $$;
revoke all on function public.ensure_daily_shop_rotation(date) from public;

create or replace function public.get_daily_shop()
returns table(slot integer,offer_id text,name text,description text,price numeric,stock integer,purchased integer,remaining integer,contents jsonb,resets_at timestamptz,refreshed boolean)
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_date date:=(now() at time zone 'UTC')::date; v_refreshed boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public.ensure_daily_shop_rotation(v_date);
  v_refreshed:=exists(select 1 from public.daily_shop_personal_rotations where player_id=v_uid and rotation_date=v_date);
  return query
  with effective as (
    select r.slot,r.offer_id,r.stock,'global'::text kind from public.daily_shop_rotations r where r.rotation_date=v_date and (r.slot<=3 or not v_refreshed)
    union all select r.slot,r.offer_id,r.stock,'refresh'::text from public.daily_shop_personal_rotations r where r.player_id=v_uid and r.rotation_date=v_date
  )
  select e.slot,c.id,c.name,c.description,c.price,e.stock,coalesce(p.quantity,0),greatest(0,e.stock-coalesce(p.quantity,0)),c.contents,
    ((v_date+1)::timestamp at time zone 'UTC'),v_refreshed
  from effective e join public.daily_shop_catalog c on c.id=e.offer_id
  left join public.daily_shop_purchases p on p.player_id=v_uid and p.rotation_date=v_date and p.rotation_kind=e.kind and p.slot=e.slot
  order by e.slot;
end; $$;
revoke all on function public.get_daily_shop() from public;
grant execute on function public.get_daily_shop() to authenticated;

create or replace function public.refresh_daily_shop()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_date date:=(now() at time zone 'UTC')::date; v_slot integer; v_category text; v_offer public.daily_shop_catalog%rowtype; v_money double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('daily-shop-refresh-'||v_uid::text||v_date::text));
  if exists(select 1 from public.daily_shop_personal_rotations where player_id=v_uid and rotation_date=v_date) then raise exception 'daily_shop_already_refreshed'; end if;
  update public.players set money=money-2000000 where id=v_uid and money>=2000000 returning money into v_money;
  if not found then raise exception 'insufficient_funds'; end if;
  for v_slot in 4..6 loop
    v_category:=case when v_slot=4 then 'bundle' when v_slot=5 then 'specialist' else 'rare' end;
    select * into v_offer from public.daily_shop_catalog c where c.category=v_category order by (-ln(greatest(random(),0.0000001))/c.weight) limit 1;
    insert into public.daily_shop_personal_rotations values(v_uid,v_date,v_slot,v_offer.id,v_offer.stock_min+floor(random()*(v_offer.stock_max-v_offer.stock_min+1))::integer);
  end loop;
  return jsonb_build_object('money',v_money,'refreshed',true);
end; $$;
revoke all on function public.refresh_daily_shop() from public;
grant execute on function public.refresh_daily_shop() to authenticated;

create or replace function public.buy_daily_shop_offer(p_slot integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_date date:=(now() at time zone 'UTC')::date; v_kind text; v_offer public.daily_shop_catalog%rowtype; v_stock integer; v_bought integer; v_money double precision; v_item jsonb; v_qty integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_slot not between 1 and 6 then raise exception 'invalid_shop_slot'; end if;
  perform public.ensure_daily_shop_rotation(v_date);
  if p_slot>=4 and exists(select 1 from public.daily_shop_personal_rotations where player_id=v_uid and rotation_date=v_date) then
    v_kind:='refresh'; select c,r.stock into v_offer,v_stock from public.daily_shop_personal_rotations r join public.daily_shop_catalog c on c.id=r.offer_id where r.player_id=v_uid and r.rotation_date=v_date and r.slot=p_slot;
  else
    v_kind:='global'; select c,r.stock into v_offer,v_stock from public.daily_shop_rotations r join public.daily_shop_catalog c on c.id=r.offer_id where r.rotation_date=v_date and r.slot=p_slot;
  end if;
  insert into public.daily_shop_purchases(player_id,rotation_date,rotation_kind,slot,quantity) values(v_uid,v_date,v_kind,p_slot,0) on conflict do nothing;
  select quantity into v_bought from public.daily_shop_purchases where player_id=v_uid and rotation_date=v_date and rotation_kind=v_kind and slot=p_slot for update;
  if v_bought>=v_stock then raise exception 'daily_shop_sold_out'; end if;
  update public.players set money=money-v_offer.price where id=v_uid and money>=v_offer.price returning money into v_money;
  if not found then raise exception 'insufficient_funds'; end if;
  for v_item in select value from jsonb_array_elements(v_offer.contents) loop
    v_qty:=greatest(1,(v_item->>'quantity')::integer);
    if v_item->>'type'='consumable' then
      insert into public.player_consumables(player_id,consumable_id,quantity,updated_at) values(v_uid,v_item->>'id',v_qty,now())
      on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+excluded.quantity,updated_at=now();
    elsif v_item->>'type'='relic' then
      insert into public.inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,value,locked)
      select v_uid,v_item->>'id',case when v_item->>'id'='Ancient Relic' then 1500 else 250 end,0,0,1,0,0,0,false from generate_series(1,v_qty);
    end if;
  end loop;
  update public.daily_shop_purchases set quantity=quantity+1 where player_id=v_uid and rotation_date=v_date and rotation_kind=v_kind and slot=p_slot returning quantity into v_bought;
  return jsonb_build_object('money',v_money,'slot',p_slot,'purchased',v_bought,'remaining',v_stock-v_bought,'offerId',v_offer.id);
end; $$;
revoke all on function public.buy_daily_shop_offer(integer) from public;
grant execute on function public.buy_daily_shop_offer(integer) to authenticated;
