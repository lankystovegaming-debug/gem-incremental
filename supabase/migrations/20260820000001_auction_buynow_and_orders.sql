-- =========================================================
-- MARKET — BUY NOW + BUY ORDERS
--
-- buy_auction: purchase a listing outright at its price (no
-- bidding). Any leftover bid on a legacy listing is refunded.
--
-- gem_orders: players post buy orders ("I'll pay $X for a
-- <gem>"); the money is escrowed and any seller who owns that
-- gem can fulfil the order. Cancel refunds the buyer.
-- =========================================================

create or replace function public.buy_auction(p_auction_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_a public.auctions%rowtype;
  v_money double precision; v_username text; v_price double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  perform public.settle_due_auctions();

  select * into v_a from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_a.status <> 'active' or v_a.ends_at <= now() then raise exception 'auction_closed'; end if;
  if v_a.seller_id = v_uid then raise exception 'cannot_buy_own'; end if;

  v_price := v_a.start_price;

  select money into v_money from public.players where id = v_uid for update;
  if v_money < v_price then raise exception 'not_enough_money'; end if;

  if v_a.current_bidder_id is not null and v_a.current_bidder_id <> v_uid and v_a.current_bid is not null then
    update public.players set money = money + v_a.current_bid where id = v_a.current_bidder_id;
  end if;

  update public.players set money = money - v_price where id = v_uid;
  update public.players set money = money + v_price where id = v_a.seller_id;

  if v_a.lot is not null then perform public._auction_restore_lot(v_uid, v_a.lot);
  else perform public._auction_restore_gem(v_uid, v_a.gem); end if;

  select username into v_username from public.players where id = v_uid;

  update public.auctions set
    status = 'sold', settled_at = now(),
    current_bidder_id = v_uid, current_bidder_name = v_username, current_bid = v_price
  where id = p_auction_id;

  return jsonb_build_object('auctionId', p_auction_id, 'price', v_price, 'money', v_money - v_price);
end; $function$;
grant execute on function public.buy_auction(bigint) to authenticated;


create table if not exists public.gem_orders (
  id             bigint generated always as identity primary key,
  buyer_id       uuid not null references auth.users(id) on delete cascade,
  buyer_name     text,
  gem_name       text not null,
  price          double precision not null,
  status         text not null default 'open' check (status in ('open', 'filled', 'cancelled')),
  filled_by_id   uuid references auth.users(id) on delete set null,
  filled_by_name text,
  created_at     timestamptz not null default now(),
  filled_at      timestamptz
);

create index if not exists gem_orders_open_idx on public.gem_orders (gem_name, created_at desc) where status = 'open';
create index if not exists gem_orders_buyer_idx on public.gem_orders (buyer_id, created_at desc);

alter table public.gem_orders enable row level security;
drop policy if exists gem_orders_public_read on public.gem_orders;
create policy gem_orders_public_read on public.gem_orders for select using (true);
grant select on public.gem_orders to anon, authenticated;
grant select, insert, update, delete on public.gem_orders to service_role;

create or replace function public.create_gem_order(p_gem_name text, p_price double precision)
returns bigint language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_money double precision; v_username text; v_open int; v_order_id bigint;
  v_name text := btrim(coalesce(p_gem_name, ''));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_name = '' then raise exception 'invalid_gem'; end if;
  if p_price is null or p_price < 1 or p_price > 1e15 then raise exception 'invalid_price'; end if;

  select count(*) into v_open from public.gem_orders where buyer_id = v_uid and status = 'open';
  if v_open >= 10 then raise exception 'too_many_orders'; end if;

  select money into v_money from public.players where id = v_uid for update;
  if v_money < p_price then raise exception 'not_enough_money'; end if;

  update public.players set money = money - p_price where id = v_uid;
  select username into v_username from public.players where id = v_uid;

  insert into public.gem_orders (buyer_id, buyer_name, gem_name, price)
  values (v_uid, v_username, v_name, p_price)
  returning id into v_order_id;

  return v_order_id;
end; $function$;
grant execute on function public.create_gem_order(text, double precision) to authenticated;

create or replace function public.fulfill_gem_order(p_order_id bigint, p_specimen_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_o public.gem_orders%rowtype;
  v_gem public.inventory_gems%rowtype;
  v_money double precision; v_username text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_o from public.gem_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_o.status <> 'open' then raise exception 'order_closed'; end if;
  if v_o.buyer_id = v_uid then raise exception 'cannot_fill_own'; end if;

  delete from public.inventory_gems
  where id = p_specimen_id and player_id = v_uid and locked = false and gem_name = v_o.gem_name
  returning * into v_gem;
  if not found then raise exception 'gem_unavailable'; end if;

  perform public._auction_restore_gem(v_o.buyer_id, to_jsonb(v_gem) - 'id' - 'player_id' - 'created_at');
  update public.players set money = money + v_o.price where id = v_uid returning money into v_money;
  select username into v_username from public.players where id = v_uid;

  update public.gem_orders set status = 'filled', filled_by_id = v_uid, filled_by_name = v_username, filled_at = now()
  where id = p_order_id;

  return jsonb_build_object('orderId', p_order_id, 'earned', v_o.price, 'money', v_money);
end; $function$;
grant execute on function public.fulfill_gem_order(bigint, bigint) to authenticated;

create or replace function public.cancel_gem_order(p_order_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_o public.gem_orders%rowtype; v_money double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_o from public.gem_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_o.buyer_id <> v_uid then raise exception 'not_your_order'; end if;
  if v_o.status <> 'open' then raise exception 'order_closed'; end if;

  update public.players set money = money + v_o.price where id = v_uid returning money into v_money;
  update public.gem_orders set status = 'cancelled' where id = p_order_id;

  return jsonb_build_object('cancelled', p_order_id, 'money', v_money);
end; $function$;
grant execute on function public.cancel_gem_order(bigint) to authenticated;
