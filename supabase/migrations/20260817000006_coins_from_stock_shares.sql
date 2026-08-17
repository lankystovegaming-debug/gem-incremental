-- =========================================================
-- Loot-box coins now come only from stock shares.
--
-- Players buy shares through the existing market, then burn 10,000
-- shares to redeem one loot-box coin. Burning the shares prevents a
-- buy -> coin -> sell loop. Direct money purchases are disabled.
-- The market price is reset to its $10 baseline.
-- =========================================================

set local check_function_bodies = off;

create or replace function public.buy_coins_with_money(p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  raise exception 'coins_from_shares_only';
end;
$$;

grant execute on function public.buy_coins_with_money(integer) to authenticated;


create or replace function public.redeem_shares_for_coin()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shares bigint;
  v_coins bigint;
  v_required_shares constant bigint := 10000;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.player_shares(player_id, shares)
  values (v_uid, 0)
  on conflict (player_id) do nothing;

  select shares
  into v_shares
  from public.player_shares
  where player_id = v_uid
  for update;

  if v_shares < v_required_shares then
    raise exception 'not_enough_shares_for_coin';
  end if;

  update public.player_shares
  set shares = shares - v_required_shares
  where player_id = v_uid
  returning shares into v_shares;

  update public.players
  set coins = coins + 1
  where id = v_uid
  returning coins into v_coins;

  if v_coins is null then
    raise exception 'player_not_found';
  end if;

  return jsonb_build_object('shares', v_shares, 'coins', v_coins);
end;
$$;

grant execute on function public.redeem_shares_for_coin() to authenticated;


insert into public.market_state (id, price, updated_at)
values ('coin', 10, now())
on conflict (id) do update
set price = excluded.price,
    updated_at = excluded.updated_at;

-- Show the reset as a chart point without adding a fake player trade.
insert into public.market_history (asset, price)
values ('coin', 10);
