-- Amplify Exchange volatility: the price responds super-linearly to invested
-- capital via an exponent β, so real buying/selling produces big swings.
--
--   price = price_scale * (sum(total_invested) / 1e6) ^ price_exponent
--
-- With β = 2, a % change in invested capital moves the price ~2× as hard, so
-- large trades pump and dump the price sharply (big profits, big losses) — all
-- still driven by real player capital, no randomness.

alter table public.market_config add column if not exists price_exponent numeric not null default 1 check (price_exponent > 0);

create or replace function public.share_index_price()
returns numeric language sql stable security definer set search_path to 'public' as $fn$
  select greatest(0.01,
    power(coalesce((select sum(total_invested) from public.player_shares), 0) / 1000000.0,
          coalesce((select price_exponent from public.market_config where id = true), 1))
    * coalesce((select price_scale from public.market_config where id = true), 1));
$fn$;

-- Set on prod: price_exponent = 2, price_scale recalibrated for continuity.
