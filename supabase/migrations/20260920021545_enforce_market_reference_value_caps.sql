-- Make fixed-price listing limits server-authoritative for every current
-- consumable. Existing listings are intentionally left untouched.

create or replace function public._market_consumable_shop_value(p_consumable_id text)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select case p_consumable_id
    when 'lucky-potion-1' then 100
    when 'lucky-potion-2' then 40000
    when 'lucky-potion-3' then 150000
    when 'lucky-potion-4' then 500000
    when 'speed-potion-1' then 100
    when 'speed-potion-2' then 40000
    when 'speed-potion-3' then 150000
    when 'speed-potion-4' then 500000
    when 'fortune-potion-1' then 100
    when 'fortune-potion-2' then 40000
    when 'fortune-potion-3' then 150000
    when 'fortune-potion-4' then 500000
    when 'mass-potion-1' then 100
    when 'mass-potion-2' then 40000
    when 'mass-potion-3' then 150000
    when 'mass-potion-4' then 500000
    when 'legendary-potion' then 3000000
    when 'mythic-potion' then 15000000
    when 'relic-potion' then 50000
    when 'seismic-potion' then 1750000
    when 'unstable-core' then 10000000
    when 'deepcore-catalyst' then 300000
    when 'pressurized-catalyst' then 2500000
    when 'deepcore-crate' then 3000000
    when 'diver' then 1000000
    when 'tidal-rush' then 1250000
    when 'pressure' then 12500000
    when 'offering' then 3000000
    when 'treasure-tonic' then 2500000
    when 'supply-crate' then 4000000
    when 'abyssal-potion' then 60000000
    when 'pet-luck-treat' then 500000
    when 'enchanted-pet-toy' then 2000000
    when 'celestial-pet-charm' then 7500000
    when 'mythic-pet-whistle' then 20000000
    when 'plastic-bag' then 0.10
    else null
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
  v_cid text; v_qty int; v_consumable_value numeric;
  v_reference_value numeric := 0; v_minimum_price numeric; v_maximum_price numeric;
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
      v_consumable_value := public._market_consumable_shop_value(v_cid);
      if v_consumable_value is null then raise exception 'consumable_not_market_priced:%', coalesce(v_cid, ''); end if;
      update public.player_consumables set quantity = quantity - v_qty, updated_at = now()
      where player_id = v_uid and consumable_id = v_cid and quantity >= v_qty;
      if not found then raise exception 'potion_unavailable'; end if;
      v_reference_value := v_reference_value + v_consumable_value * v_qty;
      v_lot := v_lot || jsonb_build_object('type', 'potion', 'consumable_id', v_cid, 'quantity', v_qty);
      v_count := v_count + v_qty;
    else
      delete from public.inventory_gems
      where id = (v_item->>'id')::bigint and player_id = v_uid and locked = false
      returning * into v_gem;
      if not found then raise exception 'gem_unavailable'; end if;
      v_reference_value := v_reference_value + greatest(0::numeric, coalesce(v_gem.value, 0)::numeric);
      v_lot := v_lot || (to_jsonb(v_gem) - 'id' - 'player_id' - 'created_at' || jsonb_build_object('type', 'gem'));
      v_count := v_count + 1; v_gemcount := v_gemcount + 1;
      if coalesce(v_gem.rarity, 0) > v_maxrarity then v_maxrarity := v_gem.rarity; end if;
      if v_headline is null then v_headline := v_gem.gem_name; end if;
    end if;
  end loop;

  v_minimum_price := greatest(1, ceil(v_reference_value * 0.25));
  v_maximum_price := floor(v_reference_value * 100);
  if p_start_price::numeric < v_minimum_price then raise exception 'price_below_lot_minimum:%', v_minimum_price; end if;
  if p_start_price::numeric > v_maximum_price then raise exception 'price_above_lot_maximum:%', v_maximum_price; end if;

  if not (v_count = 1 and v_gemcount = 1) then v_headline := 'Bundle'; end if;
  select username into v_username from public.players where id = v_uid;
  insert into public.auctions (seller_id, seller_name, gem, lot, item_count, gem_name, rarity, start_price, ends_at)
  values (v_uid, v_username, null, v_lot, v_count, v_headline, v_maxrarity, p_start_price, now() + make_interval(hours => v_hours))
  returning id into v_auction_id;
  return v_auction_id;
end; $function$;

revoke all on function public.create_auction_lot(jsonb, double precision, integer) from public, anon;
grant execute on function public.create_auction_lot(jsonb, double precision, integer) to authenticated;
