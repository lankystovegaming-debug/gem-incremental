-- =========================================================
--   - 1 coin now costs $10,000 (was $100,000)
--   - Coin share market: a single tradeable "coin" asset priced
--     in in-game money. Anti-pump: 2% spread each way, a 3s trade
--     cooldown, 100-share per-trade cap, 10k holding cap, and — most
--     importantly — MEAN REVERSION toward a $10 baseline plus a hard
--     $3–$30 band, so no crowd can pump it far or keep it pumped.
--   - Gem shop: buy any gem for 10x–20x its retail value by rarity
--     (Lanky Gem fixed at $125,000,000).
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
  v_shares bigint; v_money double precision; v_last timestamptz;
  v_impact numeric; v_cost numeric := 0; v_proceeds numeric := 0;
  v_fee numeric := 0.02;
  v_max_qty int := 100; v_hold_cap bigint := 10000;
  v_cooldown interval := interval '3 seconds';
  v_baseline numeric := 10; v_band_lo numeric := 3; v_band_hi numeric := 30;
  v_impact_per numeric := 0.001; v_revert numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_action not in ('buy','sell') then raise exception 'invalid_action'; end if;
  if p_qty is null or p_qty < 1 or p_qty > v_max_qty then raise exception 'invalid_qty'; end if;

  insert into public.player_shares(player_id, shares) values (v_uid, 0) on conflict (player_id) do nothing;
  select shares, last_trade_at into v_shares, v_last from public.player_shares where player_id = v_uid for update;
  if v_last is not null and now() - v_last < v_cooldown then raise exception 'too_fast'; end if;

  select price, updated_at into v_price, v_updated from public.market_state where id = 'coin' for update;

  -- Mean reversion toward baseline (half-life 15 min), clamped to the band.
  v_revert := power(0.5, extract(epoch from (now() - v_updated)) / (15 * 60));
  v_price := v_baseline + (v_price - v_baseline) * v_revert;
  v_price := least(v_band_hi, greatest(v_band_lo, v_price));

  v_impact := p_qty * v_impact_per;

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
    update public.players set money = money + v_proceeds where id = v_uid returning money into v_money;
    update public.player_shares set shares = shares - p_qty, last_trade_at = now() where player_id = v_uid returning shares into v_shares;
    v_new_price := v_price * (1 - v_impact);
  end if;

  v_new_price := round(least(v_band_hi, greatest(v_band_lo, v_new_price)), 4);
  update public.market_state set price = v_new_price, updated_at = now() where id = 'coin';
  insert into public.market_history(asset, price) values ('coin', v_new_price);

  return jsonb_build_object('price', v_new_price, 'shares', v_shares, 'money', v_money,
    'action', p_action, 'qty', p_qty, 'total', round(case when p_action='buy' then v_cost else v_proceeds end, 2));
end; $$;
grant execute on function public.trade_shares(text, integer) to authenticated;


-- ===== Gem shop =====
create table if not exists public.game_gems (
  name text primary key, rarity integer not null,
  base_weight double precision not null, value_per_gram double precision not null,
  shop_price numeric not null default 0, sort integer not null default 0
);
alter table public.game_gems enable row level security;
drop policy if exists "Public can read gems" on public.game_gems;
create policy "Public can read gems" on public.game_gems for select to anon, authenticated using (true);
revoke insert, update, delete on public.game_gems from anon, authenticated;
grant select on public.game_gems to anon, authenticated;

insert into public.game_gems (name, rarity, base_weight, value_per_gram, sort) values
('Quartz',2,100,0.0575,1),('Calcite',3,110,0.0736,2),('Feldspar',5,125,0.092,3),
('Fluorite',8,140,0.115,4),('Hematite',12,160,0.13685,5),('Obsidian',18,180,0.15985,6),
('Agate',25,200,0.184,7),('Jasper',35,225,0.2093,8),('Amethyst',50,250,0.253,9),
('Garnet',70,275,0.3013,10),('Citrine',90,290,0.34,11),('Peridot',100,300,0.36455,12),
('Topaz',150,325,0.47725,13),('Aquamarine',225,350,0.60835,14),('Tourmaline',325,375,0.76705,15),
('Opal',475,400,1.035,16),('Zircon',650,425,1.2719,17),('Moonstone',750,440,1.43,18),
('Spinel',850,450,1.59735,19),('Sapphire',1100,475,2.05735,20),('Ruby',1400,500,2.53,21),
('Emerald',1800,525,3.06705,22),('Diamond',2300,550,3.8686,23),('Tanzanite',2900,575,4.09975,24),
('Alexandrite',3600,600,5.07955,25),('Benitoite',4400,625,5.52,26),('Red Beryl',5300,650,6.3687,27),
('Black Opal',6300,675,7.3255,28),('Demantoid',6800,690,7.6,29),('Grandidierite',7400,700,7.88555,30),
('Taaffeite',8500,725,8.7239,31),('Musgravite',9300,750,9.2,32),('Painite',10000,800,9.34375,33),
('Jeremejevite',14000,850,12,34),('Poudretteite',22000,925,16,35),('Serendibite',35000,1000,22,36),
('Blue Garnet',55000,1100,30,37),('Kyawthuite',85000,1200,42,38),('Aether Quartz',140000,1350,54,39),
('Void Opal',250000,1550,76.5,40),('Chronite',480000,1800,112.5,41),('Neutron Crystal',800000,2200,157.5,42),
('Dark Matter',1000000,2500,200,43),('Antimatter Crystal',1800000,2900,270,44),
('Singularity Shard',4000000,3600,472.5,45),('Lanky Gem',10000000,40500,111.1111,46)
on conflict (name) do update set rarity=excluded.rarity, base_weight=excluded.base_weight,
  value_per_gram=excluded.value_per_gram, sort=excluded.sort;

update public.game_gems set shop_price = round(base_weight * value_per_gram * case
    when rarity < 10 then 10 when rarity < 50 then 11 when rarity < 100 then 12
    when rarity < 1000 then 14 when rarity < 10000 then 16 when rarity < 100000 then 18
    when rarity < 1000000 then 19 else 20 end);
update public.game_gems set shop_price = 125000000 where name = 'Lanky Gem';

create or replace function public.buy_gem(p_gem_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_gem public.game_gems%rowtype;
  v_money double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_gem from public.game_gems where name = p_gem_name;
  if not found then raise exception 'gem_not_found'; end if;
  select money into v_money from public.players where id = v_uid for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_money < v_gem.shop_price then raise exception 'not_enough_money'; end if;
  update public.players set money = money - v_gem.shop_price where id = v_uid returning money into v_money;
  insert into public.inventory_gems (
    player_id, gem_name, rarity, base_weight, value_per_gram,
    rolled_weight_multiplier, rolled_weight, final_weight, value, locked
  ) values (
    v_uid, v_gem.name, v_gem.rarity, v_gem.base_weight, v_gem.value_per_gram,
    1, v_gem.base_weight, v_gem.base_weight, v_gem.base_weight * v_gem.value_per_gram, false
  );
  insert into public.gem_index (player_id, gem_name, total_rolled, heaviest_weight)
  values (v_uid, v_gem.name, 1, v_gem.base_weight)
  on conflict (player_id, gem_name) do update
    set total_rolled = public.gem_index.total_rolled + 1,
        heaviest_weight = greatest(public.gem_index.heaviest_weight, v_gem.base_weight),
        updated_at = now();
  return jsonb_build_object('gem', v_gem.name, 'price', v_gem.shop_price, 'money', v_money);
end; $$;
grant execute on function public.buy_gem(text) to authenticated;
