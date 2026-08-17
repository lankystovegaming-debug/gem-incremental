-- =========================================================
--   - 1 coin now costs $10,000 (was $100,000)
--   - Coin share market: a single tradeable "coin" asset priced
--     in in-game money. Anti-pump: 2% spread each way, a 3s trade
--     cooldown, and — most importantly — MEAN REVERSION toward a $10
--     baseline (15-min half-life) plus a $1 floor, so no crowd can
--     pump it far or keep it pumped. Up to 100,000 shares per order;
--     the per-trade price impact is capped so a huge order can't blow
--     the price up in one go, and the mean reversion drags it back.
--   - Selling shares credits lifetime_earnings, so trading profits
--     show up on the leaderboard (same as selling gems).
--   - market_history logs who traded (username, action, qty) so the
--     market page can show a live "recent trades" feed.
-- =========================================================

set local check_function_bodies = off;

create or replace function public.buy_coins_with_money(p_count integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cost double precision;
  v_money double precision;
  v_coins bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_count is null or p_count < 1 or p_count > 100000000 then raise exception 'invalid_count'; end if;
  v_cost := p_count::double precision * 10000;
  select money into v_money from public.players where id = v_uid for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_money < v_cost then raise exception 'not_enough_money'; end if;
  update public.players set money = money - v_cost, coins = coins + p_count
  where id = v_uid returning coins into v_coins;
  return jsonb_build_object('coins', v_coins, 'spent', v_cost);
end; $$;
grant execute on function public.buy_coins_with_money(integer) to authenticated;


-- ===== Coin share market =====
create table if not exists public.market_state (
  id text primary key, price numeric not null, updated_at timestamptz not null default now()
);
alter table public.market_state enable row level security;
drop policy if exists "Public can read market" on public.market_state;
create policy "Public can read market" on public.market_state for select to anon, authenticated using (true);
revoke insert, update, delete on public.market_state from anon, authenticated;
grant select on public.market_state to anon, authenticated;
insert into public.market_state(id, price) values ('coin', 10) on conflict (id) do nothing;

create table if not exists public.player_shares (
  player_id uuid primary key references auth.users(id) on delete cascade,
  shares bigint not null default 0, last_trade_at timestamptz
);
alter table public.player_shares enable row level security;
drop policy if exists "Players read own shares" on public.player_shares;
create policy "Players read own shares" on public.player_shares for select to authenticated using (auth.uid() = player_id);
revoke insert, update, delete on public.player_shares from anon, authenticated;
grant select on public.player_shares to authenticated;

create table if not exists public.market_history (
  id bigint generated always as identity primary key,
  asset text not null default 'coin', price numeric not null, at timestamptz not null default now()
);
-- Trade attribution for the "recent trades" feed.
alter table public.market_history add column if not exists player_id uuid;
alter table public.market_history add column if not exists username text;
alter table public.market_history add column if not exists action text;
alter table public.market_history add column if not exists qty integer;
alter table public.market_history enable row level security;
drop policy if exists "Public can read history" on public.market_history;
create policy "Public can read history" on public.market_history for select to anon, authenticated using (true);
revoke insert, update, delete on public.market_history from anon, authenticated;
grant select on public.market_history to anon, authenticated;

create or replace function public.trade_shares(p_action text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_price numeric; v_updated timestamptz; v_new_price numeric;
  v_shares bigint; v_money double precision; v_last timestamptz; v_username text;
  v_impact numeric; v_cost numeric := 0; v_proceeds numeric := 0;
  v_fee numeric := 0.02;
  v_max_qty int := 100000;              -- per-order cap
  v_hold_cap bigint := 1000000000000;
  v_cooldown interval := interval '3 seconds';
  v_baseline numeric := 10; v_floor numeric := 1;   -- no upper cap
  v_impact_per numeric := 0.00005; v_max_impact numeric := 2.0;  -- <= +200%/trade
  v_revert numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_action not in ('buy','sell') then raise exception 'invalid_action'; end if;
  if p_qty is null or p_qty < 1 or p_qty > v_max_qty then raise exception 'invalid_qty'; end if;

  insert into public.player_shares(player_id, shares) values (v_uid, 0) on conflict (player_id) do nothing;
  select shares, last_trade_at into v_shares, v_last from public.player_shares where player_id = v_uid for update;
  if v_last is not null and now() - v_last < v_cooldown then raise exception 'too_fast'; end if;

  select username into v_username from public.players where id = v_uid;

  select price, updated_at into v_price, v_updated from public.market_state where id = 'coin' for update;

  -- Mean reversion toward baseline (half-life 15 min), floored at $1, no ceiling.
  v_revert := power(0.5, extract(epoch from (now() - v_updated)) / (15 * 60));
  v_price := greatest(v_floor, v_baseline + (v_price - v_baseline) * v_revert);

  -- Per-trade impact grows with size but is capped, so a whale can't
  -- blow the price up in one order (and mean reversion drags it back).
  v_impact := least(p_qty * v_impact_per, v_max_impact);

  if p_action = 'buy' then
    v_cost := p_qty * v_price * (1 + v_fee);
    select money into v_money from public.players where id = v_uid for update;
    if v_money < v_cost then raise exception 'not_enough_money'; end if;
    if v_shares + p_qty > v_hold_cap then raise exception 'holding_cap'; end if;
    update public.players set money = money - v_cost where id = v_uid returning money into v_money;
    update public.player_shares set shares = shares + p_qty, last_trade_at = now() where player_id = v_uid returning shares into v_shares;
    v_new_price := v_price * (1 + v_impact);
  else
    if v_shares < p_qty then raise exception 'not_enough_shares'; end if;
    v_proceeds := p_qty * v_price * (1 - v_fee);
    -- Money earned by selling counts toward the lifetime-earnings leaderboard,
    -- exactly like selling gems does.
    update public.players
       set money = money + v_proceeds,
           lifetime_earnings = greatest(0, lifetime_earnings + greatest(0, v_proceeds))
     where id = v_uid returning money into v_money;
    update public.player_shares set shares = shares - p_qty, last_trade_at = now() where player_id = v_uid returning shares into v_shares;
    v_new_price := v_price * (1 - v_impact);
  end if;

  v_new_price := round(greatest(v_floor, v_new_price), 4);
  update public.market_state set price = v_new_price, updated_at = now() where id = 'coin';
  insert into public.market_history(asset, price, player_id, username, action, qty)
  values ('coin', v_new_price, v_uid, v_username, p_action, p_qty);

  return jsonb_build_object('price', v_new_price, 'shares', v_shares, 'money', v_money,
    'action', p_action, 'qty', p_qty, 'total', round(case when p_action='buy' then v_cost else v_proceeds end, 2));
end; $$;
grant execute on function public.trade_shares(text, integer) to authenticated;
