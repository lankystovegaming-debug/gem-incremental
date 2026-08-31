-- Prevent near-free wealth transfers through fixed-price listings and buy
-- orders. Fees are intentionally left unchanged.

create or replace function public._market_consumable_shop_value(p_consumable_id text)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select case p_consumable_id
    when 'lucky-potion-1' then 200
    when 'speed-potion-1' then 150
    when 'fortune-potion-1' then 200
    when 'mass-potion-1' then 300
    when 'lucky-potion-2' then 40000
    when 'speed-potion-2' then 30000
    when 'fortune-potion-2' then 40000
    when 'mass-potion-2' then 60000
    when 'lucky-potion-3' then 175000
    when 'speed-potion-3' then 125000
    when 'fortune-potion-3' then 175000
    when 'mass-potion-3' then 250000
    else 0
  end::numeric;
$function$;

revoke all on function public._market_consumable_shop_value(text) from public, anon, authenticated;

create or replace function public.create_auction_lot(p_items jsonb, p_start_price double precision, p_duration_hours integer)
returns bigint language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_hours int := coalesce(p_duration_hours, 24);
  v_active int; v_item jsonb; v_gem public.inventory_gems%rowtype;
  v_lot jsonb := '[]'::jsonb; v_count int := 0; v_gemcount int := 0;
  v_maxrarity int := 0; v_headline text := null; v_username text; v_auction_id bigint;
  v_cid text; v_qty int; v_reference_value numeric := 0; v_minimum_price numeric;
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
      v_reference_value := v_reference_value + public._market_consumable_shop_value(v_cid) * v_qty;
      v_lot := v_lot || jsonb_build_object('type', 'potion', 'consumable_id', v_cid, 'quantity', v_qty);
      v_count := v_count + v_qty;
    else
      delete from public.inventory_gems
      where id = (v_item->>'id')::bigint and player_id = v_uid and locked = false
      returning * into v_gem;
      if not found then raise exception 'gem_unavailable'; end if;
      v_reference_value := v_reference_value + greatest(0, coalesce(v_gem.value, 0));
      v_lot := v_lot || (to_jsonb(v_gem) - 'id' - 'player_id' - 'created_at' || jsonb_build_object('type', 'gem'));
      v_count := v_count + 1; v_gemcount := v_gemcount + 1;
      if coalesce(v_gem.rarity, 0) > v_maxrarity then v_maxrarity := v_gem.rarity; end if;
      if v_headline is null then v_headline := v_gem.gem_name; end if;
    end if;
  end loop;

  v_minimum_price := greatest(1, ceil(v_reference_value * 0.25));
  if p_start_price < v_minimum_price then raise exception 'price_below_lot_minimum:%', v_minimum_price; end if;

  if not (v_count = 1 and v_gemcount = 1) then v_headline := 'Bundle'; end if;
  select username into v_username from public.players where id = v_uid;
  insert into public.auctions (seller_id, seller_name, gem, lot, item_count, gem_name, rarity, start_price, ends_at)
  values (v_uid, v_username, null, v_lot, v_count, v_headline, v_maxrarity, p_start_price, now() + make_interval(hours => v_hours))
  returning id into v_auction_id;
  return v_auction_id;
end; $function$;

create or replace function public.create_gem_order(p_gem_name text, p_price double precision)
returns bigint language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid(); v_money double precision; v_username text; v_open integer; v_order_id bigint;
  v_name text := btrim(coalesce(p_gem_name, '')); v_fee_rate numeric; v_fee numeric; v_total double precision;
  v_base_value numeric; v_minimum_price numeric; v_maximum_price numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_name = '' then raise exception 'invalid_gem'; end if;
  if p_price is null or p_price < 1 or p_price > 1e15 then raise exception 'invalid_price'; end if;

  select greatest(0, coalesce(g.base_weight, 0) * coalesce(g.value_per_gram, 0))
  into v_base_value
  from public.private_feature_gems g
  where g.name = v_name and g.enabled = true
  order by g.sort_order, g.rarity
  limit 1;
  if v_base_value is null then raise exception 'gem_catalog_unavailable'; end if;
  v_minimum_price := ceil(v_base_value * 0.25);
  v_maximum_price := floor(v_base_value * 4);
  if p_price < v_minimum_price or p_price > v_maximum_price then
    raise exception 'order_price_out_of_range:%:%', v_minimum_price, v_maximum_price;
  end if;

  select count(*) into v_open from public.gem_orders where buyer_id = v_uid and status = 'open';
  if v_open >= 10 then raise exception 'too_many_orders'; end if;
  v_fee_rate := public.player_market_fee_rate(v_uid, public._market_order_fee_rate(p_price));
  v_fee := round(p_price::numeric * v_fee_rate, 2); v_total := p_price + v_fee::double precision;
  select money into v_money from public.players where id = v_uid for update;
  if v_money < v_total then raise exception 'not_enough_money'; end if;
  update public.players set money = money - v_total where id = v_uid;
  select username into v_username from public.players where id = v_uid;
  insert into public.gem_orders(buyer_id, buyer_name, gem_name, price, fee_rate, fee_amount)
  values(v_uid, v_username, v_name, p_price, v_fee_rate, v_fee) returning id into v_order_id;
  insert into public.market_fee_transactions(market_type, reference_id, player_id, amount, rate)
  values('order', v_order_id, v_uid, v_fee, v_fee_rate);
  return v_order_id;
end; $function$;

revoke all on function public.create_auction_lot(jsonb, double precision, integer) from public, anon;
revoke all on function public.create_gem_order(text, double precision) from public, anon;
grant execute on function public.create_auction_lot(jsonb, double precision, integer) to authenticated;
grant execute on function public.create_gem_order(text, double precision) to authenticated;
