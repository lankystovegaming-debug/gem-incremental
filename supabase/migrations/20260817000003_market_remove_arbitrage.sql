-- =========================================================
-- Market no-arbitrage hardening.
--
-- A time-based drift toward a $10 baseline let a player buy a depressed
-- quote, wait, and sell into an artificial recovery. Prices must only
-- change when real trades move the shared curve. This migration also
-- reduces trade/holding limits and increases the two-way fee so the
-- market remains a social trading feature, never an income generator.
-- =========================================================

set local check_function_bodies = off;

create or replace function public.trade_shares(p_action text, p_qty integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_price numeric;
  v_new_price numeric;
  v_shares bigint;
  v_money double precision;
  v_last timestamptz;
  v_username text;
  v_cost numeric := 0;
  v_proceeds numeric := 0;
  v_fee numeric := 0.05;
  v_max_qty integer := 10000;
  v_hold_cap bigint := 50000;
  v_cooldown interval := interval '3 seconds';
  v_floor numeric := 1;
  v_ceiling numeric := 100;
  v_curve_depth numeric := 5000000;
  v_curve_factor numeric;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_action not in ('buy', 'sell') then
    raise exception 'invalid_action';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > v_max_qty then
    raise exception 'invalid_qty';
  end if;

  insert into public.player_shares(player_id, shares)
  values (v_uid, 0)
  on conflict (player_id) do nothing;

  select shares, last_trade_at
  into v_shares, v_last
  from public.player_shares
  where player_id = v_uid
  for update;

  if v_last is not null and now() - v_last < v_cooldown then
    raise exception 'too_fast';
  end if;

  select username into v_username
  from public.players
  where id = v_uid;

  -- Serialise all trades. Unlike the previous implementation, there is no
  -- timer-based price recovery: only an opposite real trade can change price.
  select price
  into v_price
  from public.market_state
  where id = 'coin'
  for update;

  v_curve_factor := exp(p_qty::numeric / v_curve_depth);

  if p_action = 'buy' then
    if v_shares + p_qty > v_hold_cap then
      raise exception 'holding_cap';
    end if;
    if v_price * v_curve_factor > v_ceiling then
      raise exception 'market_ceiling';
    end if;

    v_cost := v_price * v_curve_depth * (v_curve_factor - 1) * (1 + v_fee);
    select money into v_money
    from public.players
    where id = v_uid
    for update;
    if v_money < v_cost then
      raise exception 'not_enough_money';
    end if;

    update public.players
    set money = money - v_cost
    where id = v_uid
    returning money into v_money;

    update public.player_shares
    set shares = shares + p_qty, last_trade_at = now()
    where player_id = v_uid
    returning shares into v_shares;

    v_new_price := v_price * v_curve_factor;
  else
    if v_shares < p_qty then
      raise exception 'not_enough_shares';
    end if;
    if v_price / v_curve_factor < v_floor then
      raise exception 'market_floor';
    end if;

    v_proceeds := v_price * v_curve_depth * (1 - 1 / v_curve_factor) * (1 - v_fee);

    update public.players
    set money = money + v_proceeds,
        lifetime_earnings = greatest(0, lifetime_earnings + greatest(0, v_proceeds))
    where id = v_uid
    returning money into v_money;

    update public.player_shares
    set shares = shares - p_qty, last_trade_at = now()
    where player_id = v_uid
    returning shares into v_shares;

    v_new_price := v_price / v_curve_factor;
  end if;

  v_new_price := round(greatest(v_floor, least(v_ceiling, v_new_price)), 4);

  update public.market_state
  set price = v_new_price, updated_at = now()
  where id = 'coin';

  insert into public.market_history(asset, price, player_id, username, action, qty)
  values ('coin', v_new_price, v_uid, v_username, p_action, p_qty);

  return jsonb_build_object(
    'price', v_new_price,
    'shares', v_shares,
    'money', v_money,
    'action', p_action,
    'qty', p_qty,
    'total', round(case when p_action = 'buy' then v_cost else v_proceeds end, 2)
  );
end;
$$;

grant execute on function public.trade_shares(text, integer) to authenticated;

-- Start the safer market from a neutral, known quote.
update public.market_state
set price = 10, updated_at = now()
where id = 'coin';
