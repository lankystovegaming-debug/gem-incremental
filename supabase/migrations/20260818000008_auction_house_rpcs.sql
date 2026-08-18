-- =========================================================
-- AUCTION HOUSE — RPCs
--
-- All SECURITY DEFINER so they can move money + gems past the
-- players_guard trigger, while still re-checking ownership,
-- funds and timing themselves. Settlement is lazy: any read or
-- bid first drains expired auctions, so no cron is required.
-- =========================================================

-- Restore a snapshotted gem into a player's inventory (used when an
-- auction settles to the winner, or returns to the seller).
create or replace function public._auction_restore_gem(p_owner uuid, p_gem jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_gems (
    player_id, gem_name, rarity, base_weight, value_per_gram,
    rolled_weight_multiplier, rolled_weight, final_weight, value, locked,
    roll_number, luck_at_roll, mutation_id, mutation_multiplier,
    mutation_ids, mutation_multipliers
  )
  select
    p_owner, r.gem_name, r.rarity, r.base_weight, r.value_per_gram,
    r.rolled_weight_multiplier, r.rolled_weight, r.final_weight, r.value, false,
    r.roll_number, r.luck_at_roll, r.mutation_id, r.mutation_multiplier,
    r.mutation_ids, r.mutation_multipliers
  from jsonb_populate_record(null::public.inventory_gems, p_gem) r;
end; $$;

-- Settle every auction whose timer has expired. Idempotent + safe for
-- anyone to trigger (lazy settlement, no cron needed).
create or replace function public.settle_due_auctions()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_a record; v_count int := 0;
begin
  for v_a in
    select * from public.auctions
    where status = 'active' and ends_at <= now()
    for update skip locked
  loop
    if v_a.current_bidder_id is not null then
      perform public._auction_restore_gem(v_a.current_bidder_id, v_a.gem);
      update public.players set money = money + v_a.current_bid where id = v_a.seller_id;
      update public.auctions set status = 'sold', settled_at = now() where id = v_a.id;
    else
      perform public._auction_restore_gem(v_a.seller_id, v_a.gem);
      update public.auctions set status = 'returned', settled_at = now() where id = v_a.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
grant execute on function public.settle_due_auctions() to anon, authenticated;

-- List an owned, unlocked gem for auction (escrows the gem).
create or replace function public.create_auction(p_specimen_id bigint, p_start_price double precision, p_duration_hours integer)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_gem public.inventory_gems%rowtype;
  v_username text; v_auction_id bigint;
  v_hours int := coalesce(p_duration_hours, 24);
  v_active int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_start_price is null or p_start_price < 1 or p_start_price > 1e15 then raise exception 'invalid_price'; end if;
  if v_hours not in (1, 6, 24) then v_hours := 24; end if;

  select count(*) into v_active from public.auctions where seller_id = v_uid and status = 'active';
  if v_active >= 10 then raise exception 'too_many_listings'; end if;

  -- Claim the gem: owned + unlocked. Deleting escrows it (rolled back if we raise).
  delete from public.inventory_gems
  where id = p_specimen_id and player_id = v_uid and locked = false
  returning * into v_gem;
  if not found then raise exception 'gem_unavailable'; end if;

  if v_gem.gem_name in ('Enchant Relic', 'Ancient Relic') then
    raise exception 'not_auctionable';  -- rolls back the delete
  end if;

  select username into v_username from public.players where id = v_uid;

  insert into public.auctions (seller_id, seller_name, gem, gem_name, rarity, start_price, ends_at)
  values (
    v_uid, v_username,
    to_jsonb(v_gem) - 'id' - 'player_id' - 'created_at',
    v_gem.gem_name, v_gem.rarity, p_start_price,
    now() + make_interval(hours => v_hours)
  )
  returning id into v_auction_id;

  return v_auction_id;
end; $$;
grant execute on function public.create_auction(bigint, double precision, integer) to authenticated;

-- Place a bid (escrows the money, refunds the previous top bidder).
create or replace function public.place_bid(p_auction_id bigint, p_amount double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_a public.auctions%rowtype;
  v_money double precision; v_username text; v_min double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  perform public.settle_due_auctions();

  select * into v_a from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_a.status <> 'active' or v_a.ends_at <= now() then raise exception 'auction_closed'; end if;
  if v_a.seller_id = v_uid then raise exception 'cannot_bid_own'; end if;
  if v_a.current_bidder_id = v_uid then raise exception 'already_highest'; end if;

  v_min := case
    when v_a.current_bid is null then v_a.start_price
    else v_a.current_bid + greatest(1, v_a.current_bid * 0.05)
  end;
  if p_amount is null or p_amount < v_min then raise exception 'bid_too_low'; end if;

  select money into v_money from public.players where id = v_uid for update;
  if v_money < p_amount then raise exception 'not_enough_money'; end if;

  if v_a.current_bidder_id is not null then
    update public.players set money = money + v_a.current_bid where id = v_a.current_bidder_id;
  end if;
  update public.players set money = money - p_amount where id = v_uid;

  select username into v_username from public.players where id = v_uid;

  update public.auctions set
    current_bid = p_amount,
    current_bidder_id = v_uid,
    current_bidder_name = v_username,
    bid_count = bid_count + 1,
    ends_at = case when ends_at - now() < interval '2 minutes'
                   then now() + interval '2 minutes' else ends_at end
  where id = p_auction_id;

  insert into public.auction_bids (auction_id, bidder_id, bidder_name, amount)
  values (p_auction_id, v_uid, v_username, p_amount);

  return jsonb_build_object('auctionId', p_auction_id, 'amount', p_amount, 'money', v_money - p_amount);
end; $$;
grant execute on function public.place_bid(bigint, double precision) to authenticated;

-- Cancel your own auction if it has no bids (returns the gem).
create or replace function public.cancel_auction(p_auction_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_a public.auctions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_a from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_a.seller_id <> v_uid then raise exception 'not_your_auction'; end if;
  if v_a.status <> 'active' then raise exception 'auction_closed'; end if;
  if v_a.bid_count > 0 then raise exception 'has_bids'; end if;

  perform public._auction_restore_gem(v_uid, v_a.gem);
  update public.auctions set status = 'cancelled', settled_at = now() where id = p_auction_id;
  return jsonb_build_object('cancelled', p_auction_id);
end; $$;
grant execute on function public.cancel_auction(bigint) to authenticated;
