-- Fix the Exchange showing profits/proceeds you can't actually realize.
--
-- 1) share_price_at was missing the cash term that share_index_price has, so
--    sell/buy FILLS were priced lower than the displayed price. Make it
--    consistent (include cash_weight * total cash).
-- 2) get_share_market now reports the honest LIQUIDATION value of your position
--    (what you'd receive selling it all now, via the midpoint fill, minus fee)
--    as `value`, and exposes the price-curve params so the client can quote the
--    real fill for any buy/sell size instead of naive spot-price math.

create or replace function public.share_price_at(p_invested numeric)
returns numeric language sql stable security definer set search_path to 'public' as $fn$
  select greatest(0.01,
    power(
      ( greatest(0, p_invested)
        + coalesce((select cash_weight from public.market_config where id = true), 0)
          * coalesce((select sum(money) from public.players), 0)
      ) / 1000000.0,
      coalesce((select price_exponent from public.market_config where id = true), 1))
    * coalesce((select price_scale from public.market_config where id = true), 1));
$fn$;

create or replace function public.get_share_market()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid(); v_price numeric; v_shares numeric; v_invested numeric;
  v_sgt timestamp; v_min int; v_open boolean; v_next_open timestamptz; v_next_close timestamptz;
  v_tot_i numeric; v_liq numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_price := public.share_index_price();
  select shares, total_invested into v_shares, v_invested from public.player_shares where player_id = v_uid;
  v_shares := coalesce(v_shares, 0); v_invested := coalesce(v_invested, 0);
  v_tot_i := coalesce((select sum(total_invested) from public.player_shares), 0);
  v_liq := case when v_shares > 0
    then v_shares * (public.share_price_at(v_tot_i) + public.share_price_at(greatest(0, v_tot_i - v_invested))) / 2.0 * 0.99
    else 0 end;
  v_sgt := now() at time zone 'Asia/Singapore';
  v_min := extract(hour from v_sgt)::int * 60 + extract(minute from v_sgt)::int;
  v_open := v_min >= (7*60+30) and v_min < (21*60+30);
  v_next_open := (case when v_min < (7*60+30) then date_trunc('day', v_sgt) + interval '7 hours 30 minutes'
                       else date_trunc('day', v_sgt) + interval '1 day 7 hours 30 minutes' end) at time zone 'Asia/Singapore';
  v_next_close := (case when v_min < (21*60+30) then date_trunc('day', v_sgt) + interval '21 hours 30 minutes'
                        else date_trunc('day', v_sgt) + interval '1 day 21 hours 30 minutes' end) at time zone 'Asia/Singapore';
  return jsonb_build_object(
    'price', v_price, 'shares', v_shares, 'invested', v_invested,
    'value', v_liq, 'spotValue', v_shares * v_price,
    'money', coalesce((select money from public.players where id = v_uid), 0), 'feePct', 1,
    'open', v_open, 'opensAt', v_next_open, 'closesAt', v_next_close, 'hours', '07:30–21:30 SGT',
    'totalInvested', v_tot_i, 'cash', coalesce((select sum(money) from public.players), 0),
    'cashWeight', coalesce((select cash_weight from public.market_config where id=true), 0),
    'priceScale', coalesce((select price_scale from public.market_config where id=true), 1),
    'priceExponent', coalesce((select price_exponent from public.market_config where id=true), 1));
end $function$;
