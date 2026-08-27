-- Replace the random-walk volatility with a CAPITAL-DRIVEN price: the index
-- price tracks the total capital players have invested in the market, so it
-- moves only from real buying and selling — not randomness, not idle grinding.
--
--   price = price_scale * (sum of player_shares.total_invested) / 1e6
--
-- Buying moves cash into the market (invested up) -> price rises.
-- Selling pulls capital back to cash (invested down) -> price falls.
-- Idle cash / AFK grinding doesn't touch invested -> price unchanged.
-- No trades (e.g. market closed) -> price frozen automatically.

-- Stop the old random-walk tick.
do $do$ begin perform cron.unschedule('market_volatility_tick'); exception when others then null; end $do$;

create or replace function public.share_index_price()
returns numeric language sql stable security definer set search_path to 'public' as $fn$
  select greatest(0.01,
    coalesce((select sum(total_invested) from public.player_shares), 0) / 1000000.0
    * coalesce((select price_scale from public.market_config where id = true), 1));
$fn$;

-- price_scale is now the calibration constant K (set on prod so the live price
-- was continuous at changeover). vol_factor is retained but unused (=1).
