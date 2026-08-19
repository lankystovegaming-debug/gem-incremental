-- =========================================================
-- AUCTION HOUSE — LOTS (bundles of gems + potions + relics)
--
-- A listing can now hold many items instead of a single gem:
--   - gem items   (any inventory_gems row, relics included)
--   - potion items (a quantity from player_consumables)
-- stored as a jsonb array in auctions.lot. Legacy single-gem
-- auctions (auctions.gem) still settle correctly.
-- =========================================================

alter table public.auctions
  add column if not exists lot jsonb,
  add column if not exists item_count integer not null default 1;

alter table public.auctions alter column gem drop not null;

create or replace function public._auction_restore_lot(p_owner uuid, p_lot jsonb)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_lot, '[]'::jsonb))
  loop
    if v_item->>'type' = 'potion' then
      insert into public.player_consumables (player_id, consumable_id, quantity, updated_at)
      values (p_owner, v_item->>'consumable_id', greatest(1, (v_item->>'quantity')::int), now())
      on conflict (player_id, consumable_id) do update
        set quantity = public.player_consumables.quantity + excluded.quantity, updated_at = now();
    else
      perform public._auction_restore_gem(p_owner, v_item - 'type');
    end if;
  end loop;
end; $function$;

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
  if v_hours not in (1, 6, 24) then v_hours := 24; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_lot';
  end if;
  if jsonb_array_length(p_items) > 25 then raise exception 'lot_too_large'; end if;

  select count(*) into v_active from public.auctions where seller_id = v_uid and status = 'active';
  if v_active >= 3 then raise exception 'too_many_listings'; end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if v_item->>'type' = 'potion' then
      v_cid := v_item->>'consumable_id';
      v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));
      update public.player_consumables
        set quantity = quantity - v_qty, updated_at = now()
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
  values (v_uid, v_username, null, v_lot, v_count, v_headline, v_maxrarity, p_start_price,
          now() + make_interval(hours => v_hours))
  returning id into v_auction_id;

  return v_auction_id;
end; $function$;
grant execute on function public.create_auction_lot(jsonb, double precision, integer) to authenticated;

create or replace function public.settle_due_auctions()
returns integer language plpgsql security definer set search_path = '' as $function$
declare v_a record; v_count int := 0;
begin
  for v_a in
    select * from public.auctions where status = 'active' and ends_at <= now()
    for update skip locked
  loop
    if v_a.current_bidder_id is not null then
      if v_a.lot is not null then perform public._auction_restore_lot(v_a.current_bidder_id, v_a.lot);
      else perform public._auction_restore_gem(v_a.current_bidder_id, v_a.gem); end if;
      update public.players set money = money + v_a.current_bid where id = v_a.seller_id;
      update public.auctions set status = 'sold', settled_at = now() where id = v_a.id;
    else
      if v_a.lot is not null then perform public._auction_restore_lot(v_a.seller_id, v_a.lot);
      else perform public._auction_restore_gem(v_a.seller_id, v_a.gem); end if;
      update public.auctions set status = 'returned', settled_at = now() where id = v_a.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $function$;

create or replace function public.cancel_auction(p_auction_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_a public.auctions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_a from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_a.seller_id <> v_uid then raise exception 'not_your_auction'; end if;
  if v_a.status <> 'active' then raise exception 'auction_closed'; end if;
  if v_a.bid_count > 0 then raise exception 'has_bids'; end if;

  if v_a.lot is not null then perform public._auction_restore_lot(v_uid, v_a.lot);
  else perform public._auction_restore_gem(v_uid, v_a.gem); end if;
  update public.auctions set status = 'cancelled', settled_at = now() where id = p_auction_id;
  return jsonb_build_object('cancelled', p_auction_id);
end; $function$;
