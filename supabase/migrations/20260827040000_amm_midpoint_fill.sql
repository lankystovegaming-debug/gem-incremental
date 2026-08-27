-- Make solo pump-and-dump unprofitable while keeping the price volatile.
--
-- Before: a trade filled the WHOLE block at the pre-impact spot price, so a
-- player could buy (pump the quoted price), then sell their block at that
-- pumped price before it dropped — extracting a risk-free profit from other
-- holders. Fix: fill each trade at the AVERAGE of its own pre- and post-impact
-- price (the fair bonding-curve fill). A round trip then nets ~0 (just fees),
-- so pumping your own position doesn't pay — but the QUOTED price still swings
-- hard on capital flows, so the market stays volatile and you can still profit
-- or lose from other players' trades and from timing.

create or replace function public.share_price_at(p_invested numeric)
returns numeric language sql stable security definer set search_path to 'public' as $fn$
  select greatest(0.01,
    power(greatest(0, p_invested) / 1000000.0,
          coalesce((select price_exponent from public.market_config where id = true), 1))
    * coalesce((select price_scale from public.market_config where id = true), 1));
$fn$;

create or replace function public.share_index_price()
returns numeric language sql stable security definer set search_path to 'public' as $fn$
  select public.share_price_at(coalesce((select sum(total_invested) from public.player_shares), 0));
$fn$;

create or replace function public.buy_shares(p_amount numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_money numeric; v_fee numeric := 0.01; v_shares numeric; v_i numeric; v_eff numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.share_market_is_open() then raise exception 'market_closed'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1e15 then raise exception 'invalid_amount'; end if;
  select money into v_money from public.players where id = v_uid for update;
  if v_money is null then raise exception 'player_not_found'; end if;
  if p_amount > v_money then raise exception 'insufficient_funds'; end if;
  -- Fill at the midpoint of this buy's own price impact (pre + post)/2.
  v_i := coalesce((select sum(total_invested) from public.player_shares), 0);
  v_eff := (public.share_price_at(v_i) + public.share_price_at(v_i + p_amount)) / 2.0;
  v_shares := p_amount / (v_eff * (1 + v_fee));
  update public.players set money = money - p_amount where id = v_uid;
  insert into public.player_shares (player_id, shares, total_invested, updated_at)
    values (v_uid, v_shares, p_amount, now())
  on conflict (player_id) do update
    set shares = player_shares.shares + excluded.shares,
        total_invested = player_shares.total_invested + excluded.total_invested,
        updated_at = now();
  return public.get_share_market();
end $function$;

create or replace function public.sell_shares(p_shares numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_fee numeric := 0.01;
  v_have numeric; v_invested numeric; v_sell numeric; v_proceeds numeric; v_basis_out numeric; v_i numeric; v_eff numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.share_market_is_open() then raise exception 'market_closed'; end if;
  if p_shares is null or p_shares <= 0 then raise exception 'invalid_amount'; end if;
  select shares, total_invested into v_have, v_invested
    from public.player_shares where player_id = v_uid for update;
  if v_have is null or v_have <= 0 then raise exception 'no_shares'; end if;
  v_sell := least(p_shares, v_have);
  v_basis_out := case when v_have > 0 then v_invested * (v_sell / v_have) else 0 end;
  -- Fill at the midpoint of this sell's own price impact — dumping a big block
  -- crashes your own average fill, so it can't extract the pump.
  v_i := coalesce((select sum(total_invested) from public.player_shares), 0);
  v_eff := (public.share_price_at(v_i) + public.share_price_at(greatest(0, v_i - v_basis_out))) / 2.0;
  v_proceeds := v_sell * v_eff * (1 - v_fee);
  update public.player_shares
    set shares = shares - v_sell,
        total_invested = greatest(0, total_invested - v_basis_out),
        updated_at = now()
    where player_id = v_uid;
  update public.players set money = money + v_proceeds where id = v_uid;
  return public.get_share_market();
end $function$;
