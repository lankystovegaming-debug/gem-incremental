-- The market price now also responds to player CASH, not just invested capital:
--
--   price = price_scale * ((Invested + cash_weight * Cash) / 1e6) ^ price_exponent
--
-- Invested = sum(player_shares.total_invested); Cash = sum(players.money).
-- cash_weight (default 0.2) sets how much idle cash contributes, so earning /
-- spending cash nudges the price too, while trading still dominates. Buying
-- (cash -> invested) and selling (invested -> cash) both still move it.

alter table public.market_config add column if not exists cash_weight numeric not null default 0 check (cash_weight >= 0);

create or replace function public.share_index_price()
returns numeric language sql stable security definer set search_path to 'public' as $fn$
  select greatest(0.01,
    power(
      ( coalesce((select sum(total_invested) from public.player_shares), 0)
        + coalesce((select cash_weight from public.market_config where id = true), 0)
          * coalesce((select sum(money) from public.players), 0)
      ) / 1000000.0,
      coalesce((select price_exponent from public.market_config where id = true), 1))
    * coalesce((select price_scale from public.market_config where id = true), 1));
$fn$;

-- Set on prod: cash_weight = 0.2, price_scale recalibrated for continuity.
