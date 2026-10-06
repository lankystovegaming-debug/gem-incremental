-- Prismatic Geodes: server-authoritative F2P cosmetic progression.
-- Prepared for project igrddscmrdrrwtvyspbf. Deploy manually.
-- The optimized roll Edge Function is intentionally unchanged: Exotic Potion
-- uses its existing one-roll additive-Luck row and post-commit charge spend.
begin;

create schema if not exists prismatic_private;
revoke all on schema prismatic_private from public, anon, authenticated;

create table public.prismatic_wallets (
  player_id uuid primary key references public.players(id) on delete cascade,
  shards bigint not null default 0 check (shards >= 0),
  cosmetic_vouchers bigint not null default 0 check (cosmetic_vouchers >= 0),
  ultimate_vouchers bigint not null default 0 check (ultimate_vouchers >= 0),
  updated_at timestamptz not null default now()
);

create table public.prismatic_daily_stock (
  player_id uuid not null references public.players(id) on delete cascade,
  shop_date date not null,
  stock smallint not null check (stock in (1,2)),
  purchased smallint not null default 0 check (purchased between 0 and stock),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, shop_date)
);

create table public.prismatic_geode_openings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  shop_date date not null,
  geode_number smallint not null check (geode_number in (1,2)),
  price bigint not null check (price = 1000000),
  chamber_count smallint not null check (chamber_count between 1 and 10),
  rewards jsonb not null check (jsonb_typeof(rewards) = 'array'),
  grants jsonb not null check (jsonb_typeof(grants) = 'object'),
  created_at timestamptz not null default now(),
  unique (player_id, request_id),
  unique (player_id, shop_date, geode_number)
);
create index prismatic_openings_player_idx on public.prismatic_geode_openings(player_id, created_at desc);

create table public.prismatic_exchange_items (
  cosmetic_id text primary key references public.cosmetic_definitions(id) on delete restrict,
  shard_price integer not null check (shard_price > 0),
  sort_order integer not null,
  enabled boolean not null default true
);

create table public.prismatic_exchange_orders (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  purchase_kind text not null check (purchase_kind in ('item','collection')),
  purchase_id text not null,
  shard_price integer not null check (shard_price >= 0),
  granted_cosmetic_ids text[] not null,
  created_at timestamptz not null default now(),
  unique (player_id, request_id)
);

create table public.cosmetic_voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  voucher_type text not null check (voucher_type in ('cosmetic','ultimate')),
  product_kind text not null check (product_kind in ('item','collection')),
  product_id text not null,
  granted_cosmetic_ids text[] not null,
  created_at timestamptz not null default now(),
  unique (player_id, request_id)
);

alter table public.prismatic_wallets enable row level security;
alter table public.prismatic_daily_stock enable row level security;
alter table public.prismatic_geode_openings enable row level security;
alter table public.prismatic_exchange_items enable row level security;
alter table public.prismatic_exchange_orders enable row level security;
alter table public.cosmetic_voucher_redemptions enable row level security;

revoke all on public.prismatic_wallets, public.prismatic_daily_stock,
  public.prismatic_geode_openings, public.prismatic_exchange_items,
  public.prismatic_exchange_orders, public.cosmetic_voucher_redemptions
  from public, anon, authenticated;
grant all on public.prismatic_wallets, public.prismatic_daily_stock,
  public.prismatic_geode_openings, public.prismatic_exchange_items,
  public.prismatic_exchange_orders, public.cosmetic_voucher_redemptions to service_role;
grant select on public.prismatic_wallets, public.prismatic_daily_stock,
  public.prismatic_geode_openings, public.prismatic_exchange_orders,
  public.cosmetic_voucher_redemptions to authenticated;
grant select on public.prismatic_exchange_items to authenticated;

create policy own_prismatic_wallet_read on public.prismatic_wallets for select to authenticated
  using ((select auth.uid()) = player_id);
create policy own_prismatic_stock_read on public.prismatic_daily_stock for select to authenticated
  using ((select auth.uid()) = player_id);
create policy own_prismatic_openings_read on public.prismatic_geode_openings for select to authenticated
  using ((select auth.uid()) = player_id);
create policy prismatic_exchange_catalog_read on public.prismatic_exchange_items for select to authenticated
  using (enabled);
create policy own_prismatic_orders_read on public.prismatic_exchange_orders for select to authenticated
  using ((select auth.uid()) = player_id);
create policy own_voucher_redemptions_read on public.cosmetic_voucher_redemptions for select to authenticated
  using ((select auth.uid()) = player_id);

-- F2P-exclusive cosmetics deliberately do not enter cosmetic_store_items, so
-- Facets and Store vouchers cannot acquire them.
insert into public.cosmetic_definitions(id,name,slots,description,rarity,visual_config,source) values
 ('prismatic-title','[PRISMATIC]',array['title'],'A title cut from refracted crystal light.','Mythic','{"style":"prismatic","icon":"◇"}','prismatic'),
 ('prismatic-leaderboard-skin','Prismatic Leaderboard Skin',array['leaderboard_skin'],'Faceted crystal edges and restrained refracted highlights.','Mythic','{"style":"prismatic","icon":"◇"}','prismatic'),
 ('prismatic-roll-card','Prismatic Roll Card',array['roll_card'],'A translucent gem-cut roll surface with shifting refraction.','Mythic','{"style":"prismatic","icon":"◇"}','prismatic'),
 ('prismatic-background','Prismatic Profile Background',array['background'],'Angular crystal planes with subtle split-light highlights.','Mythic','{"style":"prismatic","icon":"◇"}','prismatic')
on conflict (id) do update set name=excluded.name,slots=excluded.slots,description=excluded.description,
  rarity=excluded.rarity,visual_config=excluded.visual_config,source='prismatic',enabled=true;

insert into public.prismatic_exchange_items(cosmetic_id,shard_price,sort_order) values
 ('prismatic-title',10,10),('prismatic-leaderboard-skin',15,20),
 ('prismatic-roll-card',20,30),('prismatic-background',20,40)
on conflict (cosmetic_id) do update set shard_price=excluded.shard_price,sort_order=excluded.sort_order,enabled=true;

-- Exotic Potion is a single successful-roll +100,000 Luck charge. It has no
-- shop, recipe, market value or alternate grant path.
insert into public.game_consumables(id,name,family,tier,effect_value,duration_seconds,purchasable,shop_price)
values ('exotic-potion','Exotic Potion','luck',4,100000,1,false,null)
on conflict (id) do update set name=excluded.name,family='luck',tier=4,effect_value=100000,
  duration_seconds=1,purchasable=false,shop_price=null;

create or replace function public.activate_one_roll_potion(p_consumable_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); effect numeric; required_rolls bigint; total bigint; owned integer;
 existing_id text; remaining integer; activated timestamptz; charge_count integer;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 case p_consumable_id
  when 'legendary-potion' then effect:=1000; required_rolls:=1000;
  when 'mythic-potion' then effect:=10000; required_rolls:=2500;
  -- Geode rarity is the acquisition gate; the product specification does not
  -- add a second lifetime-roll requirement for Exotic Potion.
  when 'exotic-potion' then effect:=100000; required_rolls:=0;
  else raise exception 'invalid_consumable';
 end case;
 select total_rolls into total from public.players where id=uid for update;
 if not found then raise exception 'player_not_found'; end if;
 if coalesce(total,0)<required_rolls then raise exception 'lifetime_rolls_required:%',required_rolls; end if;
 select consumable_id into existing_id from public.player_one_roll_boosts where player_id=uid for update;
 if found and existing_id is distinct from p_consumable_id then raise exception 'one_roll_boost_already_active'; end if;
 select quantity into owned from public.player_consumables where player_id=uid and consumable_id=p_consumable_id for update;
 if not found or owned<1 then raise exception 'consumable_not_owned'; end if;
 update public.player_consumables set quantity=quantity-1,updated_at=now()
  where player_id=uid and consumable_id=p_consumable_id returning quantity into remaining;
 insert into public.player_one_roll_boosts(player_id,consumable_id,effect_value,charges)
 values(uid,p_consumable_id,effect,1) on conflict(player_id) do update
  set charges=public.player_one_roll_boosts.charges+1,activated_at=now()
 returning activated_at,charges into activated,charge_count;
 return jsonb_build_object('success',true,'quantity',remaining,'boost',jsonb_build_object(
  'family','luck','effectValue',effect,'oneRoll',true,'charges',charge_count,'activatedAt',activated));
end $$;
revoke all on function public.activate_one_roll_potion(text) from public,anon,authenticated;
grant execute on function public.activate_one_roll_potion(text) to authenticated;

create or replace function prismatic_private.today_sg() returns date language sql stable set search_path='' as $$
 select (clock_timestamp() at time zone 'Asia/Singapore')::date
$$;

create or replace function prismatic_private.ensure_daily(p_player uuid) returns public.prismatic_daily_stock
language plpgsql volatile security definer set search_path='' as $$
declare result public.prismatic_daily_stock%rowtype; today date:=prismatic_private.today_sg();
begin
 insert into public.prismatic_wallets(player_id) values(p_player) on conflict do nothing;
 insert into public.prismatic_daily_stock(player_id,shop_date,stock)
 values(p_player,today,case when random()<0.05 then 2 else 1 end) on conflict do nothing;
 select * into result from public.prismatic_daily_stock where player_id=p_player and shop_date=today;
 return result;
end $$;
revoke all on function prismatic_private.today_sg(),prismatic_private.ensure_daily(uuid) from public,anon,authenticated;

create or replace function prismatic_private.collection_price(p_player uuid) returns integer
language sql stable security definer set search_path='' as $$
 select ceil(coalesce(sum(i.shard_price) filter(where o.cosmetic_id is null),0)*50.0/65.0)::integer
 from public.prismatic_exchange_items i
 left join public.player_cosmetics o on o.player_id=p_player and o.cosmetic_id=i.cosmetic_id
 join public.cosmetic_definitions d on d.id=i.cosmetic_id and d.enabled
 where i.enabled
$$;
revoke all on function prismatic_private.collection_price(uuid) from public,anon,authenticated;

create or replace function public.get_prismatic_store() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); daily public.prismatic_daily_stock%rowtype; wallet public.prismatic_wallets%rowtype;
begin
 if uid is null then raise exception 'Sign in to use Prismatic.' using errcode='42501'; end if;
 perform 1 from public.players where id=uid for update;
 if not found then raise exception 'Player not found.'; end if;
 daily:=prismatic_private.ensure_daily(uid);
 select * into wallet from public.prismatic_wallets where player_id=uid;
 return jsonb_build_object(
  'serverNow',clock_timestamp(),'shopDate',daily.shop_date,
  'stock',jsonb_build_object('total',daily.stock,'purchased',daily.purchased,'remaining',daily.stock-daily.purchased,'doubleStock',daily.stock=2,'price',1000000),
  'wallet',jsonb_build_object('shards',wallet.shards,'cosmeticVouchers',wallet.cosmetic_vouchers,'ultimateVouchers',wallet.ultimate_vouchers),
  'collectionPrice',prismatic_private.collection_price(uid),
  'owned',coalesce((select jsonb_agg(o.cosmetic_id) from public.player_cosmetics o where o.player_id=uid and o.cosmetic_id like 'prismatic-%'),'[]'::jsonb)
 );
end $$;
revoke all on function public.get_prismatic_store() from public,anon,authenticated;
grant execute on function public.get_prismatic_store() to authenticated;

create or replace function public.open_prismatic_geode(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); daily public.prismatic_daily_stock%rowtype; existing public.prismatic_geode_openings%rowtype;
 wallet public.prismatic_wallets%rowtype; chambers integer; i integer; draw integer; reward jsonb; rewards jsonb:='[]';
 cash_total bigint:=0; shard_total bigint:=0; regular_total bigint:=0; ultimate_total bigint:=0;
 potion_counts jsonb:='{}'; potion_id text; opening_id uuid; after_money double precision;
begin
 if uid is null then raise exception 'Sign in to open a Geode.' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Invalid opening request.'; end if;
 perform 1 from public.players where id=uid for update;
 if not found then raise exception 'Player not found.'; end if;
 select * into existing from public.prismatic_geode_openings where player_id=uid and request_id=p_request_id;
 if found then return public.get_prismatic_store()||jsonb_build_object('opening',to_jsonb(existing),'duplicate',true); end if;
 daily:=prismatic_private.ensure_daily(uid);
 select * into daily from public.prismatic_daily_stock where player_id=uid and shop_date=daily.shop_date for update;
 if daily.purchased>=daily.stock then raise exception 'daily_geode_stock_exhausted'; end if;
 update public.players set money=money-1000000 where id=uid and money>=1000000 returning money into after_money;
 if after_money is null then raise exception 'insufficient_funds'; end if;
 draw:=floor(random()*1000000)::integer;
 chambers:=case when draw<200000 then 1 when draw<400000 then 2 when draw<570000 then 3
  when draw<710000 then 4 when draw<810000 then 5 when draw<880000 then 6 when draw<930000 then 7
  when draw<965000 then 8 when draw<985000 then 9 else 10 end;
 for i in 1..chambers loop
  draw:=floor(random()*1000000)::integer;
  reward:=case
   when draw<250000 then jsonb_build_object('type','cash','id','cash-50000','label','$50,000','amount',50000,'rarity','common')
   when draw<400000 then jsonb_build_object('type','cash','id','cash-150000','label','$150,000','amount',150000,'rarity','common')
   when draw<473500 then jsonb_build_object('type','cash','id','cash-500000','label','$500,000','amount',500000,'rarity','uncommon')
   when draw<573500 then jsonb_build_object('type','potion','id','lucky-potion-4','label','Lucky Potion IV','amount',1,'rarity','uncommon')
   when draw<673500 then jsonb_build_object('type','potion','id','fortune-potion-4','label','Fortune Potion IV','amount',1,'rarity','uncommon')
   when draw<773500 then jsonb_build_object('type','potion','id','speed-potion-4','label','Speed Potion IV','amount',1,'rarity','uncommon')
   when draw<853500 then jsonb_build_object('type','potion','id','mass-potion-4','label','Mass Potion IV','amount',1,'rarity','uncommon')
   when draw<903500 then jsonb_build_object('type','potion','id','money-up-potion-2','label','Money Up Potion II','amount',1,'rarity','rare')
   when draw<923500 then jsonb_build_object('type','potion','id','relic-potion','label','Relic Potion','amount',1,'rarity','rare')
   when draw<973500 then jsonb_build_object('type','shard','id','prismatic-shard','label','Prismatic Shard','amount',1,'rarity','rare')
   when draw<993500 then jsonb_build_object('type','potion','id','legendary-potion','label','Legendary Potion','amount',1,'rarity','epic')
   when draw<998500 then jsonb_build_object('type','potion','id','mythic-potion','label','Mythic Potion','amount',1,'rarity','legendary')
   when draw<999500 then jsonb_build_object('type','potion','id','exotic-potion','label','Exotic Potion','amount',1,'rarity','mythic')
   when draw<999999 then jsonb_build_object('type','voucher','id','cosmetic-voucher','label','Cosmetic Voucher','amount',1,'rarity','jackpot')
   else jsonb_build_object('type','voucher','id','ultimate-cosmetic-voucher','label','Ultimate Cosmetic Voucher','amount',1,'rarity','ultimate') end;
  rewards:=rewards||reward;
  if reward->>'type'='cash' then cash_total:=cash_total+(reward->>'amount')::bigint;
  elsif reward->>'type'='shard' then shard_total:=shard_total+1;
  elsif reward->>'id'='cosmetic-voucher' then regular_total:=regular_total+1;
  elsif reward->>'id'='ultimate-cosmetic-voucher' then ultimate_total:=ultimate_total+1;
  elsif reward->>'type'='potion' then
   potion_id:=reward->>'id'; potion_counts:=jsonb_set(potion_counts,array[potion_id],to_jsonb(coalesce((potion_counts->>potion_id)::integer,0)+1),true);
  end if;
 end loop;
 if cash_total>0 then update public.players set money=money+cash_total where id=uid returning money into after_money; end if;
 for potion_id in select key from jsonb_each(potion_counts) loop
  insert into public.player_consumables(player_id,consumable_id,quantity,updated_at)
  values(uid,potion_id,(potion_counts->>potion_id)::integer,now()) on conflict(player_id,consumable_id) do update
  set quantity=public.player_consumables.quantity+excluded.quantity,updated_at=now();
 end loop;
 update public.prismatic_wallets set shards=shards+shard_total,cosmetic_vouchers=cosmetic_vouchers+regular_total,
  ultimate_vouchers=ultimate_vouchers+ultimate_total,updated_at=now() where player_id=uid returning * into wallet;
 update public.prismatic_daily_stock set purchased=purchased+1,updated_at=now()
  where player_id=uid and shop_date=daily.shop_date returning * into daily;
 insert into public.prismatic_geode_openings(player_id,request_id,shop_date,geode_number,price,chamber_count,rewards,grants)
 values(uid,p_request_id,daily.shop_date,daily.purchased,1000000,chambers,rewards,jsonb_build_object(
  'cash',cash_total,'potions',potion_counts,'shards',shard_total,'cosmeticVouchers',regular_total,'ultimateVouchers',ultimate_total,'moneyAfter',after_money))
 returning id into opening_id;
 insert into public.economy_cash_ledger(player_id,account,amount,direction,category,subcategory,reference,metadata)
 values(uid,'wallet',-1000000,'sink','prismatic_geode','purchase',opening_id::text,jsonb_build_object('shopDate',daily.shop_date,'geodeNumber',daily.purchased));
 if cash_total>0 then
  insert into public.economy_cash_ledger(player_id,account,amount,direction,category,subcategory,reference,metadata)
  values(uid,'wallet',cash_total,'source','prismatic_geode','chamber_rewards',opening_id::text,jsonb_build_object('chambers',chambers));
 end if;
 return public.get_prismatic_store()||jsonb_build_object('opening',jsonb_build_object(
  'id',opening_id,'shop_date',daily.shop_date,'geode_number',daily.purchased,'price',1000000,
  'chamber_count',chambers,'rewards',rewards,'grants',jsonb_build_object('cash',cash_total,'potions',potion_counts,
  'shards',shard_total,'cosmeticVouchers',regular_total,'ultimateVouchers',ultimate_total,'moneyAfter',after_money)),'duplicate',false);
end $$;
revoke all on function public.open_prismatic_geode(uuid) from public,anon,authenticated;
grant execute on function public.open_prismatic_geode(uuid) to authenticated;

create or replace function public.purchase_prismatic_exchange_item(p_kind text,p_item_id text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wallet public.prismatic_wallets%rowtype; existing public.prismatic_exchange_orders%rowtype;
 price integer; ids text[]; remaining bigint;
begin
 if uid is null then raise exception 'Sign in to use the Prismatic Exchange.' using errcode='42501'; end if;
 if p_request_id is null or p_kind not in ('item','collection') then raise exception 'Invalid exchange request.'; end if;
 perform 1 from public.players where id=uid for update; if not found then raise exception 'Player not found.'; end if;
 perform prismatic_private.ensure_daily(uid);
 select * into existing from public.prismatic_exchange_orders where player_id=uid and request_id=p_request_id;
 if found then return public.get_prismatic_store()||jsonb_build_object('orderId',existing.id,'duplicate',true); end if;
 select * into wallet from public.prismatic_wallets where player_id=uid for update;
 if p_kind='item' then
  select i.shard_price,array[i.cosmetic_id] into price,ids from public.prismatic_exchange_items i
  join public.cosmetic_definitions d on d.id=i.cosmetic_id and d.enabled where i.cosmetic_id=p_item_id and i.enabled;
  if price is null then raise exception 'Prismatic cosmetic not found.'; end if;
  if exists(select 1 from public.player_cosmetics where player_id=uid and cosmetic_id=p_item_id) then raise exception 'You already own this cosmetic.' using errcode='23505'; end if;
 else
  if p_item_id<>'prismatic' then raise exception 'Prismatic collection not found.'; end if;
  select coalesce(array_agg(i.cosmetic_id order by i.sort_order) filter(where o.cosmetic_id is null),'{}'),
   ceil(coalesce(sum(i.shard_price) filter(where o.cosmetic_id is null),0)*50.0/65.0)::integer into ids,price
  from public.prismatic_exchange_items i join public.cosmetic_definitions d on d.id=i.cosmetic_id and d.enabled
  left join public.player_cosmetics o on o.player_id=uid and o.cosmetic_id=i.cosmetic_id where i.enabled;
  if cardinality(ids)=0 then raise exception 'You already own this collection.' using errcode='23505'; end if;
 end if;
 update public.prismatic_wallets set shards=shards-price,updated_at=now() where player_id=uid and shards>=price returning shards into remaining;
 if remaining is null then raise exception 'Not enough Prismatic Shards.' using errcode='22003'; end if;
 insert into public.player_cosmetics(player_id,cosmetic_id,source,source_key)
 select uid,x,'prismatic_exchange',p_kind||':'||p_item_id from unnest(ids) x on conflict do nothing;
 insert into public.prismatic_exchange_orders(player_id,request_id,purchase_kind,purchase_id,shard_price,granted_cosmetic_ids)
 values(uid,p_request_id,p_kind,p_item_id,price,ids) returning id into existing.id;
 return public.get_prismatic_store()||jsonb_build_object('orderId',existing.id,'duplicate',false,'price',price,'granted',ids);
end $$;
revoke all on function public.purchase_prismatic_exchange_item(text,text,uuid) from public,anon,authenticated;
grant execute on function public.purchase_prismatic_exchange_item(text,text,uuid) to authenticated;

create or replace function public.redeem_cosmetic_voucher(p_voucher_type text,p_kind text,p_product_id text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wallet public.prismatic_wallets%rowtype; existing public.cosmetic_voucher_redemptions%rowtype; ids text[];
begin
 if uid is null then raise exception 'Sign in to redeem a voucher.' using errcode='42501'; end if;
 if p_request_id is null or p_voucher_type not in ('cosmetic','ultimate') or p_kind not in ('item','collection') then raise exception 'Invalid voucher request.'; end if;
 if p_voucher_type='cosmetic' and p_kind<>'item' then raise exception 'Cosmetic Vouchers cannot redeem collections.'; end if;
 perform 1 from public.players where id=uid for update; if not found then raise exception 'Player not found.'; end if;
 perform prismatic_private.ensure_daily(uid);
 select * into existing from public.cosmetic_voucher_redemptions where player_id=uid and request_id=p_request_id;
 if found then return public.get_prismatic_store()||public.get_cosmetic_store()||jsonb_build_object('redemptionId',existing.id,'duplicate',true); end if;
 select * into wallet from public.prismatic_wallets where player_id=uid for update;
 if p_kind='item' then
  select array[i.cosmetic_id] into ids from public.cosmetic_store_items i join public.cosmetic_definitions d on d.id=i.cosmetic_id
  where i.cosmetic_id=p_product_id and i.enabled and d.enabled;
  if ids is null then raise exception 'This product is not voucher eligible.'; end if;
  if exists(select 1 from public.player_cosmetics where player_id=uid and cosmetic_id=p_product_id) then raise exception 'You already own this cosmetic.' using errcode='23505'; end if;
 else
  if not exists(select 1 from public.cosmetic_store_collections where id=p_product_id and enabled) then raise exception 'Collection not found.'; end if;
  select coalesce(array_agg(i.cosmetic_id order by i.sort_order),'{}') into ids
  from public.cosmetic_store_items i join public.cosmetic_definitions d on d.id=i.cosmetic_id
  where i.collection_id=p_product_id and i.enabled and d.enabled
   and not exists(select 1 from public.player_cosmetics o where o.player_id=uid and o.cosmetic_id=i.cosmetic_id);
  if cardinality(ids)=0 then raise exception 'You already own this collection.' using errcode='23505'; end if;
 end if;
 if p_voucher_type='cosmetic' then
  update public.prismatic_wallets set cosmetic_vouchers=cosmetic_vouchers-1,updated_at=now()
   where player_id=uid and cosmetic_vouchers>0 returning * into wallet;
 else
  update public.prismatic_wallets set ultimate_vouchers=ultimate_vouchers-1,updated_at=now()
   where player_id=uid and ultimate_vouchers>0 returning * into wallet;
 end if;
 if wallet.player_id is null then raise exception 'You do not own that voucher.' using errcode='22003'; end if;
 insert into public.player_cosmetics(player_id,cosmetic_id,source,source_key)
 select uid,x,'prismatic_voucher',p_voucher_type||':'||p_kind||':'||p_product_id from unnest(ids) x on conflict do nothing;
 insert into public.cosmetic_voucher_redemptions(player_id,request_id,voucher_type,product_kind,product_id,granted_cosmetic_ids)
 values(uid,p_request_id,p_voucher_type,p_kind,p_product_id,ids) returning id into existing.id;
 return public.get_prismatic_store()||public.get_cosmetic_store()||jsonb_build_object('redemptionId',existing.id,'duplicate',false,'granted',ids);
end $$;
revoke all on function public.redeem_cosmetic_voucher(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.redeem_cosmetic_voucher(text,text,text,uuid) to authenticated;

commit;
