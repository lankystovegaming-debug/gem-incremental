-- Progressive Market fees. Listing fees are deducted only after a successful
-- sale. Buy-order fees are charged when the order is posted and are not part
-- of the refundable escrow.

alter table public.auctions
  add column if not exists fee_rate numeric,
  add column if not exists fee_amount numeric;

alter table public.gem_orders
  add column if not exists fee_rate numeric,
  add column if not exists fee_amount numeric not null default 0;

create table if not exists public.market_fee_transactions (
  id bigint generated always as identity primary key,
  market_type text not null check (market_type in ('listing', 'order')),
  reference_id bigint not null,
  player_id uuid references auth.users(id) on delete set null,
  amount numeric not null check (amount >= 0),
  rate numeric not null check (rate >= 0 and rate <= 0.05),
  created_at timestamptz not null default now()
);

create index if not exists market_fee_transactions_created_idx
  on public.market_fee_transactions (created_at desc);
create index if not exists market_fee_transactions_player_idx
  on public.market_fee_transactions (player_id, created_at desc);

alter table public.market_fee_transactions enable row level security;
revoke all on table public.market_fee_transactions from anon, authenticated;
grant select, insert, update, delete on table public.market_fee_transactions to service_role;

create or replace function public._market_price_surcharge(p_price double precision)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_price < 100000 then 0
    when p_price < 1000000 then 0.0025
    when p_price < 10000000 then 0.005
    when p_price < 50000000 then 0.01
    when p_price < 100000000 then 0.015
    when p_price < 500000000 then 0.02
    else 0.03
  end::numeric;
$function$;

create or replace function public._market_sale_fee_rate(p_price double precision, p_duration_hours integer)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select least(
    0.05::numeric,
    0.005::numeric + public._market_price_surcharge(p_price) +
    case
      when p_duration_hours <= 6 then 0
      when p_duration_hours <= 12 then 0.0025
      when p_duration_hours <= 24 then 0.005
      when p_duration_hours <= 48 then 0.01
      else 0.015
    end::numeric
  );
$function$;

create or replace function public._market_order_fee_rate(p_price double precision)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_price < 100000 then 0.01
    when p_price < 1000000 then 0.0125
    when p_price < 10000000 then 0.015
    when p_price < 50000000 then 0.02
    when p_price < 100000000 then 0.03
    when p_price < 500000000 then 0.04
    else 0.05
  end::numeric;
$function$;

revoke all on function public._market_price_surcharge(double precision) from public;
revoke all on function public._market_sale_fee_rate(double precision, integer) from public;
revoke all on function public._market_order_fee_rate(double precision) from public;

create or replace function public.create_auction_lot(p_items jsonb, p_start_price double precision, p_duration_hours integer)
returns bigint language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_hours int := coalesce(p_duration_hours, 24);
  v_active int; v_item jsonb; v_gem public.inventory_gems%rowtype;
  v_lot jsonb := '[]'::jsonb; v_count int := 0; v_gemcount int := 0;
  v_maxrarity int := 0; v_headline text := null; v_username text; v_auction_id bigint;
  v_cid text; v_qty int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_start_price is null or p_start_price < 1 or p_start_price > 1e15 then raise exception 'invalid_price'; end if;
  if v_hours not in (1, 6, 12, 24, 48, 72) then v_hours := 24; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty_lot'; end if;
  if jsonb_array_length(p_items) > 25 then raise exception 'lot_too_large'; end if;

  select count(*) into v_active from public.auctions where seller_id = v_uid and status = 'active';
  if v_active >= 3 then raise exception 'too_many_listings'; end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if v_item->>'type' = 'potion' then
      v_cid := v_item->>'consumable_id';
      v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));
      update public.player_consumables set quantity = quantity - v_qty, updated_at = now()
      where player_id = v_uid and consumable_id = v_cid and quantity >= v_qty;
      if not found then raise exception 'potion_unavailable'; end if;
      v_lot := v_lot || jsonb_build_object('type', 'potion', 'consumable_id', v_cid, 'quantity', v_qty);
      v_count := v_count + v_qty;
    else
      delete from public.inventory_gems
      where id = (v_item->>'id')::bigint and player_id = v_uid and locked = false
      returning * into v_gem;
      if not found then raise exception 'gem_unavailable'; end if;
      v_lot := v_lot || (to_jsonb(v_gem) - 'id' - 'player_id' - 'created_at' || jsonb_build_object('type', 'gem'));
      v_count := v_count + 1;
      v_gemcount := v_gemcount + 1;
      if coalesce(v_gem.rarity, 0) > v_maxrarity then v_maxrarity := v_gem.rarity; end if;
      if v_headline is null then v_headline := v_gem.gem_name; end if;
    end if;
  end loop;

  if not (v_count = 1 and v_gemcount = 1) then v_headline := 'Bundle'; end if;
  select username into v_username from public.players where id = v_uid;

  insert into public.auctions (seller_id, seller_name, gem, lot, item_count, gem_name, rarity, start_price, ends_at)
  values (v_uid, v_username, null, v_lot, v_count, v_headline, v_maxrarity, p_start_price, now() + make_interval(hours => v_hours))
  returning id into v_auction_id;
  return v_auction_id;
end; $function$;

create or replace function public.buy_auction(p_auction_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_a public.auctions%rowtype;
  v_money double precision; v_username text; v_price double precision;
  v_duration_hours integer; v_fee_rate numeric; v_fee numeric; v_seller_proceeds double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public.settle_due_auctions();

  select * into v_a from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_a.status <> 'active' or v_a.ends_at <= now() then raise exception 'auction_closed'; end if;
  if v_a.seller_id = v_uid then raise exception 'cannot_buy_own'; end if;

  v_price := v_a.start_price;
  v_duration_hours := greatest(1, round(extract(epoch from (v_a.ends_at - v_a.created_at)) / 3600)::integer);
  v_fee_rate := public._market_sale_fee_rate(v_price, v_duration_hours);
  v_fee := round((v_price::numeric * v_fee_rate), 2);
  v_seller_proceeds := v_price - v_fee::double precision;

  select money into v_money from public.players where id = v_uid for update;
  if v_money < v_price then raise exception 'not_enough_money'; end if;

  if v_a.current_bidder_id is not null and v_a.current_bidder_id <> v_uid and v_a.current_bid is not null then
    update public.players set money = money + v_a.current_bid where id = v_a.current_bidder_id;
  end if;
  update public.players set money = money - v_price where id = v_uid;
  update public.players set money = money + v_seller_proceeds where id = v_a.seller_id;
  if not found then raise exception 'auction_seller_player_missing:%', p_auction_id; end if;

  if v_a.lot is not null then perform public._auction_restore_lot(v_uid, v_a.lot);
  else perform public._auction_restore_gem(v_uid, v_a.gem); end if;

  select username into v_username from public.players where id = v_uid;
  update public.auctions set status = 'sold', settled_at = now(), current_bidder_id = v_uid,
    current_bidder_name = v_username, current_bid = v_price, fee_rate = v_fee_rate, fee_amount = v_fee
  where id = p_auction_id;

  insert into public.market_fee_transactions (market_type, reference_id, player_id, amount, rate)
  values ('listing', p_auction_id, v_a.seller_id, v_fee, v_fee_rate);

  return jsonb_build_object('auctionId', p_auction_id, 'price', v_price, 'fee', v_fee,
    'sellerProceeds', v_seller_proceeds, 'money', v_money - v_price);
end; $function$;

create or replace function public.create_gem_order(p_gem_name text, p_price double precision)
returns bigint language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_money double precision; v_username text; v_open int; v_order_id bigint;
  v_name text := btrim(coalesce(p_gem_name, ''));
  v_fee_rate numeric; v_fee numeric; v_total double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_name = '' then raise exception 'invalid_gem'; end if;
  if p_price is null or p_price < 1 or p_price > 1e15 then raise exception 'invalid_price'; end if;

  select count(*) into v_open from public.gem_orders where buyer_id = v_uid and status = 'open';
  if v_open >= 10 then raise exception 'too_many_orders'; end if;

  v_fee_rate := public._market_order_fee_rate(p_price);
  v_fee := round((p_price::numeric * v_fee_rate), 2);
  v_total := p_price + v_fee::double precision;

  select money into v_money from public.players where id = v_uid for update;
  if v_money < v_total then raise exception 'not_enough_money'; end if;

  update public.players set money = money - v_total where id = v_uid;
  select username into v_username from public.players where id = v_uid;

  insert into public.gem_orders (buyer_id, buyer_name, gem_name, price, fee_rate, fee_amount)
  values (v_uid, v_username, v_name, p_price, v_fee_rate, v_fee)
  returning id into v_order_id;

  insert into public.market_fee_transactions (market_type, reference_id, player_id, amount, rate)
  values ('order', v_order_id, v_uid, v_fee, v_fee_rate);

  return v_order_id;
end; $function$;

grant execute on function public.create_auction_lot(jsonb, double precision, integer) to authenticated;
grant execute on function public.buy_auction(bigint) to authenticated;
grant execute on function public.create_gem_order(text, double precision) to authenticated;

-- The fee ledger is not exposed to players. This compact aggregate is only
-- executable by the service role and is returned through the authenticated
-- admin Edge Function.
create or replace function public.admin_market_fee_summary()
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'total', coalesce(sum(amount), 0),
    'listingTotal', coalesce(sum(amount) filter (where market_type = 'listing'), 0),
    'orderTotal', coalesce(sum(amount) filter (where market_type = 'order'), 0),
    'last24Hours', coalesce(sum(amount) filter (where created_at >= now() - interval '24 hours'), 0),
    'feesCharged', count(*)
  )
  from public.market_fee_transactions;
$function$;

revoke all on function public.admin_market_fee_summary() from public, anon, authenticated;
grant execute on function public.admin_market_fee_summary() to service_role;
