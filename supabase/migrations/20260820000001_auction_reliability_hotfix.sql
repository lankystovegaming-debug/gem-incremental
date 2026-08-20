-- Auction House reliability hotfix
-- Preserves roll metadata, verifies balance transfers, and records escrow events.

create table if not exists public.auction_transactions (
  id bigint generated always as identity primary key,
  auction_id bigint references public.auctions(id) on delete set null,
  player_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'bid_escrowed', 'bid_refunded', 'seller_paid',
    'lot_delivered', 'lot_returned'
  )),
  amount numeric,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auction_transactions_auction_idx
  on public.auction_transactions (auction_id, created_at);
create index if not exists auction_transactions_player_idx
  on public.auction_transactions (player_id, created_at desc);

alter table public.auction_transactions enable row level security;
grant select, insert, update, delete on public.auction_transactions to service_role;

create or replace function public._auction_restore_gem(p_owner uuid, p_gem jsonb)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  insert into public.inventory_gems (
    player_id, gem_name, rarity, base_weight, value_per_gram,
    rolled_weight_multiplier, rolled_weight, final_weight, value, locked,
    roll_number, luck_at_roll, mutation_id, mutation_multiplier,
    mutation_ids, mutation_multipliers, mutation_chance_multiplier
  )
  select
    p_owner, r.gem_name, r.rarity, r.base_weight, r.value_per_gram,
    r.rolled_weight_multiplier, r.rolled_weight, r.final_weight, r.value, false,
    r.roll_number, r.luck_at_roll, r.mutation_id, r.mutation_multiplier,
    r.mutation_ids, r.mutation_multipliers,
    coalesce((p_gem->>'mutation_chance_multiplier')::numeric, 1)
  from jsonb_populate_record(null::public.inventory_gems, p_gem) r;
end; $function$;

create or replace function public.settle_due_auctions()
returns integer language plpgsql security definer set search_path = '' as $function$
declare
  v_a record;
  v_count int := 0;
begin
  for v_a in
    select * from public.auctions
    where status = 'active' and ends_at <= now()
    for update skip locked
  loop
    if v_a.current_bidder_id is not null then
      if v_a.lot is not null then
        perform public._auction_restore_lot(v_a.current_bidder_id, v_a.lot);
      else
        perform public._auction_restore_gem(v_a.current_bidder_id, v_a.gem);
      end if;

      update public.players
      set money = money + v_a.current_bid
      where id = v_a.seller_id;
      if not found then
        raise exception 'auction_seller_player_missing:%', v_a.id;
      end if;

      insert into public.auction_transactions
        (auction_id, player_id, event_type, amount, details)
      values
        (v_a.id, v_a.current_bidder_id, 'lot_delivered', null,
         jsonb_build_object('item_count', v_a.item_count)),
        (v_a.id, v_a.seller_id, 'seller_paid', v_a.current_bid, '{}'::jsonb);

      update public.auctions
      set status = 'sold', settled_at = now()
      where id = v_a.id;
    else
      if v_a.lot is not null then
        perform public._auction_restore_lot(v_a.seller_id, v_a.lot);
      else
        perform public._auction_restore_gem(v_a.seller_id, v_a.gem);
      end if;

      insert into public.auction_transactions
        (auction_id, player_id, event_type, details)
      values
        (v_a.id, v_a.seller_id, 'lot_returned',
         jsonb_build_object('item_count', v_a.item_count));

      update public.auctions
      set status = 'returned', settled_at = now()
      where id = v_a.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $function$;

grant execute on function public.settle_due_auctions() to anon, authenticated;

create or replace function public.place_bid(p_auction_id bigint, p_amount double precision)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_a public.auctions%rowtype;
  v_money double precision;
  v_username text;
  v_min double precision;
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

  select money, username into v_money, v_username
  from public.players where id = v_uid for update;
  if not found then raise exception 'bidder_player_missing'; end if;
  if v_money < p_amount then raise exception 'not_enough_money'; end if;

  if v_a.current_bidder_id is not null then
    update public.players
    set money = money + v_a.current_bid
    where id = v_a.current_bidder_id;
    if not found then raise exception 'previous_bidder_player_missing'; end if;

    insert into public.auction_transactions
      (auction_id, player_id, event_type, amount)
    values
      (v_a.id, v_a.current_bidder_id, 'bid_refunded', v_a.current_bid);
  end if;

  update public.players set money = money - p_amount where id = v_uid;

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

  insert into public.auction_transactions
    (auction_id, player_id, event_type, amount)
  values
    (p_auction_id, v_uid, 'bid_escrowed', p_amount);

  return jsonb_build_object(
    'auctionId', p_auction_id,
    'amount', p_amount,
    'money', v_money - p_amount
  );
end; $function$;

grant execute on function public.place_bid(bigint, double precision) to authenticated;

create or replace function public.cancel_auction(p_auction_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_a public.auctions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_a from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_a.seller_id <> v_uid then raise exception 'not_your_auction'; end if;
  if v_a.status <> 'active' then raise exception 'auction_closed'; end if;
  if v_a.bid_count > 0 then raise exception 'has_bids'; end if;

  if v_a.lot is not null then
    perform public._auction_restore_lot(v_uid, v_a.lot);
  else
    perform public._auction_restore_gem(v_uid, v_a.gem);
  end if;

  insert into public.auction_transactions
    (auction_id, player_id, event_type, details)
  values
    (v_a.id, v_uid, 'lot_returned',
     jsonb_build_object('reason', 'cancelled', 'item_count', v_a.item_count));

  update public.auctions
  set status = 'cancelled', settled_at = now()
  where id = p_auction_id;

  return jsonb_build_object('cancelled', p_auction_id);
end; $function$;

grant execute on function public.cancel_auction(bigint) to authenticated;
