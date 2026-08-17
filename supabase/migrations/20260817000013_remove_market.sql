-- =========================================================
-- Remove the coin stock market entirely.
--
-- The market (buy/sell coin shares) is being retired. This drops
-- every market object; loot-box coins keep their fixed $10,000 value.
-- `buy_coins_with_money` (used to buy coins for loot boxes) is left
-- intact on purpose.
-- =========================================================

drop function if exists public.trade_shares(text, integer);
drop function if exists public.redeem_shares_for_coin();
drop table if exists public.market_history cascade;
drop table if exists public.player_shares cascade;
drop table if exists public.market_state cascade;
