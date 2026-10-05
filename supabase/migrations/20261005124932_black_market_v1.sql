-- Weekend-only, fixed-price Black Market. All inventory and money movement is
-- performed by the RPCs below so listing escrow and purchases stay atomic.

begin;

create schema if not exists black_market_private;
revoke all on schema black_market_private from public, anon, authenticated;

create table public.black_market_listings (
  id bigint generated always as identity primary key,
  seller_id uuid not null,
  seller_name text,
  buyer_id uuid,
  buyer_name text,
  lot jsonb not null check (jsonb_typeof(lot) = 'array' and jsonb_array_length(lot) > 0),
  item_count integer not null check (item_count > 0),
  item_name text not null,
  rarity integer not null default 0,
  reference_value numeric not null check (reference_value > 0),
  asking_price numeric not null check (asking_price > 0),
  listing_fee numeric not null check (listing_fee >= 0),
  sale_tax numeric check (sale_tax >= 0),
  seller_proceeds numeric check (seller_proceeds >= 0),
  status text not null default 'active'
    check (status in ('active', 'sold', 'returned', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sold_at timestamptz,
  closed_at timestamptz,
  closure_reason text,
  check (asking_price >= reference_value * 0.5),
  check (asking_price <= reference_value * 25),
  check (
    (status = 'active' and closed_at is null and closure_reason is null)
    or (status <> 'active' and closed_at is not null and closure_reason is not null)
  ),
  check (
    (status = 'sold' and buyer_id is not null and sold_at is not null
      and sale_tax is not null and seller_proceeds is not null)
    or status <> 'sold'
  )
);

create index black_market_active_expiry_idx
  on public.black_market_listings (expires_at, id) where status = 'active';
create index black_market_active_created_idx
  on public.black_market_listings (created_at desc) where status = 'active';
create index black_market_seller_history_idx
  on public.black_market_listings (seller_id, created_at desc);

alter table public.black_market_listings enable row level security;
create policy black_market_public_read on public.black_market_listings
  for select to anon, authenticated using (true);
revoke all on public.black_market_listings from public, anon, authenticated;
grant select on public.black_market_listings to anon, authenticated;
grant select, insert, update, delete on public.black_market_listings to service_role;

create table public.black_market_transactions (
  id bigint generated always as identity primary key,
  listing_id bigint references public.black_market_listings(id) on delete set null,
  event_type text not null check (event_type in ('created', 'sold', 'returned', 'cancelled')),
  seller_id uuid not null,
  buyer_id uuid,
  lot jsonb not null,
  item_count integer not null,
  reference_value numeric not null,
  asking_price numeric not null,
  listing_fee numeric not null,
  sale_tax numeric,
  seller_proceeds numeric,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index black_market_transactions_listing_idx
  on public.black_market_transactions (listing_id, occurred_at);
create index black_market_transactions_seller_idx
  on public.black_market_transactions (seller_id, occurred_at desc);
create index black_market_transactions_buyer_idx
  on public.black_market_transactions (buyer_id, occurred_at desc)
  where buyer_id is not null;

alter table public.black_market_transactions enable row level security;
revoke all on public.black_market_transactions from public, anon, authenticated;
grant select, insert, update, delete on public.black_market_transactions to service_role;

create function black_market_private.is_open(p_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extract(isodow from timezone('Asia/Singapore', p_at))::integer in (6, 7)
$$;

create function black_market_private.weekend_opens_at(p_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (
    date_trunc('week', timezone('Asia/Singapore', p_at)) + interval '5 days'
  ) at time zone 'Asia/Singapore'
$$;

create function black_market_private.weekend_closes_at(p_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (
    date_trunc('week', timezone('Asia/Singapore', p_at)) + interval '7 days'
  ) at time zone 'Asia/Singapore'
$$;

revoke all on function black_market_private.is_open(timestamptz) from public, anon, authenticated;
revoke all on function black_market_private.weekend_opens_at(timestamptz) from public, anon, authenticated;
revoke all on function black_market_private.weekend_closes_at(timestamptz) from public, anon, authenticated;

create function public.get_black_market_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_open boolean := black_market_private.is_open(v_now);
  v_opens_at timestamptz;
  v_closes_at timestamptz;
begin
  if v_open then
    v_opens_at := black_market_private.weekend_opens_at(v_now);
    v_closes_at := black_market_private.weekend_closes_at(v_now);
  else
    v_opens_at := black_market_private.weekend_opens_at(v_now);
    if v_opens_at <= v_now then v_opens_at := v_opens_at + interval '7 days'; end if;
    v_closes_at := v_opens_at + interval '2 days';
  end if;

  return jsonb_build_object(
    'open', v_open,
    'timezone', 'Asia/Singapore',
    'serverNow', v_now,
    'opensAt', v_opens_at,
    'closesAt', v_closes_at
  );
end;
$$;

create function public.settle_expired_black_market_listings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.black_market_listings%rowtype;
  v_count integer := 0;
begin
  for v_listing in
    select * from public.black_market_listings
    where status = 'active' and expires_at <= now()
    order by id
    for update skip locked
  loop
    perform public._auction_restore_lot(v_listing.seller_id, v_listing.lot);

    update public.black_market_listings
    set status = 'returned', closed_at = now(), closure_reason = 'weekend_closed'
    where id = v_listing.id;

    insert into public.black_market_transactions (
      listing_id, event_type, seller_id, buyer_id, lot, item_count,
      reference_value, asking_price, listing_fee, sale_tax, seller_proceeds, details
    ) values (
      v_listing.id, 'returned', v_listing.seller_id, null, v_listing.lot,
      v_listing.item_count, v_listing.reference_value, v_listing.asking_price,
      v_listing.listing_fee, null, null,
      jsonb_build_object('closureReason', 'weekend_closed')
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function public.create_black_market_listing(p_items jsonb, p_asking_price numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_item jsonb;
  v_gem public.inventory_gems%rowtype;
  v_lot jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_gem_count integer := 0;
  v_max_rarity integer := 0;
  v_headline text;
  v_username text;
  v_money numeric;
  v_listing_id bigint;
  v_active integer;
  v_cid text;
  v_qty integer;
  v_consumable_value numeric;
  v_reference_value numeric := 0;
  v_listing_fee numeric;
  v_expires_at timestamptz;
  v_gem_id bigint;
  v_seen_gem_ids bigint[] := '{}'::bigint[];
  v_seen_consumables text[] := '{}'::text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not black_market_private.is_open(v_now) then raise exception 'black_market_closed'; end if;
  if p_asking_price is null or p_asking_price <= 0 or p_asking_price > 1e18 then
    raise exception 'invalid_price';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_lot';
  end if;
  if jsonb_array_length(p_items) > 25 then raise exception 'lot_too_large'; end if;

  perform public.settle_expired_black_market_listings();

  select money::numeric, username into v_money, v_username
  from public.players where id = v_uid for update;
  if not found then raise exception 'seller_player_missing'; end if;

  select count(*) into v_active
  from public.black_market_listings
  where seller_id = v_uid and status = 'active';
  if v_active >= 3 then raise exception 'too_many_black_market_listings'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if v_item->>'type' = 'potion' then
      v_cid := nullif(btrim(v_item->>'consumable_id'), '');
      begin
        v_qty := (v_item->>'quantity')::integer;
      exception when others then
        raise exception 'invalid_quantity';
      end;
      if v_cid is null or v_qty is null or v_qty <= 0 or v_qty > 1000000 then
        raise exception 'invalid_quantity';
      end if;
      if v_cid = any(v_seen_consumables) then raise exception 'duplicate_item'; end if;
      v_seen_consumables := array_append(v_seen_consumables, v_cid);

      v_consumable_value := public._market_consumable_shop_value(v_cid);
      if v_consumable_value is null or v_consumable_value <= 0 then
        raise exception 'consumable_not_market_priced:%', coalesce(v_cid, '');
      end if;

      update public.player_consumables
      set quantity = quantity - v_qty, updated_at = now()
      where player_id = v_uid and consumable_id = v_cid and quantity >= v_qty;
      if not found then raise exception 'potion_unavailable'; end if;

      v_reference_value := v_reference_value + v_consumable_value * v_qty;
      v_lot := v_lot || jsonb_build_object(
        'type', 'potion', 'consumable_id', v_cid, 'quantity', v_qty
      );
      v_count := v_count + v_qty;
    elsif v_item->>'type' = 'gem' then
      begin
        v_gem_id := (v_item->>'id')::bigint;
      exception when others then
        raise exception 'gem_unavailable';
      end;
      if v_gem_id is null or v_gem_id = any(v_seen_gem_ids) then raise exception 'duplicate_item'; end if;
      v_seen_gem_ids := array_append(v_seen_gem_ids, v_gem_id);

      select * into v_gem from public.inventory_gems
      where id = v_gem_id and player_id = v_uid for update;
      if not found then raise exception 'gem_unavailable'; end if;
      if coalesce(v_gem.locked, false)
         or coalesce(v_gem.museum_locked, false)
         or v_gem.gem_name in ('Enchant Relic', 'Ancient Relic')
         or public.gem_automatic_consumption_protected(v_gem.gem_name)
         or 'soulbound' = any(coalesce(v_gem.mutation_ids, '{}'::text[]))
         or v_gem.mutation_id = 'soulbound' then
        raise exception 'item_not_tradeable';
      end if;

      delete from public.inventory_gems where id = v_gem.id and player_id = v_uid;

      v_reference_value := v_reference_value + greatest(0::numeric, coalesce(v_gem.value, 0)::numeric);
      v_lot := v_lot || (
        to_jsonb(v_gem) - 'id' - 'player_id' - 'created_at' || jsonb_build_object('type', 'gem')
      );
      v_count := v_count + 1;
      v_gem_count := v_gem_count + 1;
      v_max_rarity := greatest(v_max_rarity, coalesce(v_gem.rarity, 0));
      if v_headline is null then v_headline := v_gem.gem_name; end if;
    else
      raise exception 'item_not_tradeable';
    end if;
  end loop;

  if v_reference_value <= 0 then raise exception 'invalid_reference_value'; end if;
  if p_asking_price < v_reference_value * 0.5 then
    raise exception 'black_market_price_below_minimum:%', v_reference_value * 0.5;
  end if;
  if p_asking_price > v_reference_value * 25 then
    raise exception 'black_market_price_above_maximum:%', v_reference_value * 25;
  end if;

  v_listing_fee := round(p_asking_price * 0.02, 2);
  if v_money < v_listing_fee then raise exception 'not_enough_money_for_listing_fee'; end if;
  update public.players set money = money - v_listing_fee::double precision where id = v_uid;

  if not (v_count = 1 and v_gem_count = 1) then v_headline := 'Bundle'; end if;
  v_expires_at := black_market_private.weekend_closes_at(v_now);

  insert into public.black_market_listings (
    seller_id, seller_name, lot, item_count, item_name, rarity,
    reference_value, asking_price, listing_fee, expires_at
  ) values (
    v_uid, v_username, v_lot, v_count, coalesce(v_headline, 'Bundle'), v_max_rarity,
    v_reference_value, p_asking_price, v_listing_fee, v_expires_at
  ) returning id into v_listing_id;

  insert into public.black_market_transactions (
    listing_id, event_type, seller_id, buyer_id, lot, item_count,
    reference_value, asking_price, listing_fee, sale_tax, seller_proceeds, details
  ) values (
    v_listing_id, 'created', v_uid, null, v_lot, v_count,
    v_reference_value, p_asking_price, v_listing_fee, null, null,
    jsonb_build_object('expiresAt', v_expires_at)
  );

  insert into public.market_fee_transactions (market_type, reference_id, player_id, amount, rate)
  values ('listing', v_listing_id, v_uid, v_listing_fee, 0.02);

  return jsonb_build_object(
    'listingId', v_listing_id,
    'referenceValue', v_reference_value,
    'askingPrice', p_asking_price,
    'listingFee', v_listing_fee,
    'expiresAt', v_expires_at,
    'money', v_money - v_listing_fee
  );
end;
$$;

create function public.buy_black_market_listing(p_listing_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_listing public.black_market_listings%rowtype;
  v_money numeric;
  v_username text;
  v_sale_tax numeric;
  v_proceeds numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not black_market_private.is_open(v_now) then raise exception 'black_market_closed'; end if;

  perform public.settle_expired_black_market_listings();

  select * into v_listing from public.black_market_listings
  where id = p_listing_id for update;
  if not found then raise exception 'black_market_listing_not_found'; end if;
  if v_listing.status <> 'active' or v_listing.expires_at <= v_now then
    raise exception 'black_market_listing_closed';
  end if;
  if v_listing.seller_id = v_uid then raise exception 'cannot_buy_own_listing'; end if;

  perform 1 from public.players
  where id in (v_uid, v_listing.seller_id)
  order by id for update;

  select money::numeric, username into v_money, v_username
  from public.players where id = v_uid;
  if not found then raise exception 'buyer_player_missing'; end if;
  if v_money < v_listing.asking_price then raise exception 'not_enough_money'; end if;

  v_sale_tax := round(v_listing.asking_price * 0.15, 2);
  v_proceeds := v_listing.asking_price - v_sale_tax;

  update public.players
  set money = money - v_listing.asking_price::double precision
  where id = v_uid and money >= v_listing.asking_price::double precision;
  if not found then raise exception 'not_enough_money'; end if;

  perform public._auction_restore_lot(v_uid, v_listing.lot);

  update public.players
  set money = money + v_proceeds::double precision
  where id = v_listing.seller_id;
  if not found then raise exception 'seller_player_missing'; end if;

  update public.black_market_listings
  set status = 'sold', buyer_id = v_uid, buyer_name = v_username,
      sale_tax = v_sale_tax, seller_proceeds = v_proceeds,
      sold_at = v_now, closed_at = v_now, closure_reason = 'sold'
  where id = v_listing.id;

  insert into public.black_market_transactions (
    listing_id, event_type, seller_id, buyer_id, lot, item_count,
    reference_value, asking_price, listing_fee, sale_tax, seller_proceeds, details
  ) values (
    v_listing.id, 'sold', v_listing.seller_id, v_uid, v_listing.lot,
    v_listing.item_count, v_listing.reference_value, v_listing.asking_price,
    v_listing.listing_fee, v_sale_tax, v_proceeds,
    jsonb_build_object('closureReason', 'sold')
  );

  insert into public.market_fee_transactions (market_type, reference_id, player_id, amount, rate)
  values ('listing', v_listing.id, v_listing.seller_id, v_sale_tax, 0.15);

  return jsonb_build_object(
    'listingId', v_listing.id,
    'price', v_listing.asking_price,
    'saleTax', v_sale_tax,
    'sellerProceeds', v_proceeds,
    'money', v_money - v_listing.asking_price
  );
end;
$$;

create function public.cancel_black_market_listing(p_listing_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.black_market_listings%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public.settle_expired_black_market_listings();

  select * into v_listing from public.black_market_listings
  where id = p_listing_id for update;
  if not found then raise exception 'black_market_listing_not_found'; end if;
  if v_listing.seller_id <> v_uid then raise exception 'not_your_black_market_listing'; end if;
  if v_listing.status <> 'active' then raise exception 'black_market_listing_closed'; end if;

  perform public._auction_restore_lot(v_uid, v_listing.lot);

  update public.black_market_listings
  set status = 'cancelled', closed_at = now(), closure_reason = 'seller_cancelled'
  where id = v_listing.id;

  insert into public.black_market_transactions (
    listing_id, event_type, seller_id, buyer_id, lot, item_count,
    reference_value, asking_price, listing_fee, sale_tax, seller_proceeds, details
  ) values (
    v_listing.id, 'cancelled', v_uid, null, v_listing.lot, v_listing.item_count,
    v_listing.reference_value, v_listing.asking_price, v_listing.listing_fee,
    null, null, jsonb_build_object('closureReason', 'seller_cancelled')
  );

  return jsonb_build_object('cancelled', v_listing.id, 'listingFeeRefunded', false);
end;
$$;

-- The 15% Black Market sale tax is intentionally above the auction fee cap.
alter table public.market_fee_transactions
  drop constraint if exists market_fee_transactions_rate_check;
alter table public.market_fee_transactions
  add constraint market_fee_transactions_rate_check check (rate >= 0 and rate <= 0.15);

-- Preserve economy-ledger attribution for every Black Market wallet movement.
insert into economy_private.cash_paths(function_name, category, direction) values
  ('create_black_market_listing', 'market_escrow', 'transfer'),
  ('buy_black_market_listing', 'market_escrow', 'transfer')
on conflict(function_name) do update
set category = excluded.category, direction = excluded.direction;

revoke all on function public.get_black_market_status() from public;
revoke all on function public.settle_expired_black_market_listings() from public, anon, authenticated;
revoke all on function public.create_black_market_listing(jsonb,numeric) from public, anon;
revoke all on function public.buy_black_market_listing(bigint) from public, anon;
revoke all on function public.cancel_black_market_listing(bigint) from public, anon;

grant execute on function public.get_black_market_status() to anon, authenticated;
grant execute on function public.settle_expired_black_market_listings() to service_role;
grant execute on function public.create_black_market_listing(jsonb,numeric) to authenticated;
grant execute on function public.buy_black_market_listing(bigint) to authenticated;
grant execute on function public.cancel_black_market_listing(bigint) to authenticated;

do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('settle-black-market-listings'); exception when others then null; end;
    perform cron.schedule(
      'settle-black-market-listings',
      '* * * * *',
      'select public.settle_expired_black_market_listings();'
    );
  else
    raise notice 'pg_cron is not installed; schedule public.settle_expired_black_market_listings() once per minute.';
  end if;
end;
$$;

commit;
