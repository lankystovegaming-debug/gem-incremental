-- Make the Exchange price VOLATILE instead of monotonically rising.
--
-- A mean-reverting random-walk factor (vol_factor) multiplies the price and is
-- nudged every minute by pg_cron. It mean-reverts toward 1 (so it doesn't
-- trend) but takes random ±steps (so the price genuinely wanders up and down).
-- These swings (~±10% typical, bounded) dominate the slow money-supply drift,
-- so the chart fluctuates like a real stock rather than only climbing.
--   price = (money + invested)/1e6 * price_scale * vol_factor

alter table public.market_config add column if not exists vol_factor numeric not null default 1 check (vol_factor > 0);

create or replace function public.share_index_price()
returns numeric language sql stable security definer set search_path to 'public' as $function$
  select greatest(0.01,
    (coalesce((select sum(money) from public.players), 0)
     + coalesce((select sum(total_invested) from public.player_shares), 0)) / 1000000.0
    * coalesce((select price_scale from public.market_config where id = true), 1)
    * coalesce((select vol_factor from public.market_config where id = true), 1));
$function$;

-- One tick of the random walk: pull vol_factor 10% back toward 1 (mean
-- reversion) and add a random ±8% shock, clamped to [0.55, 1.60].
create or replace function public.market_tick_volatility()
returns numeric language sql security definer set search_path to 'public' as $function$
  update public.market_config
  set vol_factor = greatest(0.55, least(1.60,
        1 + (vol_factor - 1) * 0.90 + (random() - 0.5) * 0.16)),
      updated_at = now()
  where id = true
  returning vol_factor;
$function$;
revoke all on function public.market_tick_volatility() from public;

do $$ begin perform cron.unschedule('market_volatility_tick'); exception when others then null; end $$;
select cron.schedule('market_volatility_tick', '* * * * *', $$select public.market_tick_volatility();$$);
