-- Economy Index shares: players invest their money to buy shares of the whole
-- economy. Share price = total liquid player wealth (wallet money + principal
-- already invested) / 1,000,000, computed live. Real market: price rises and
-- falls with the economy, so holdings gain or lose. A 1% commission on each
-- trade is the market spread and a small money sink. All money movement runs
-- through these SECURITY DEFINER RPCs (owner-run, so they bypass players_guard
-- and RLS the way every other economy RPC does).

create table if not exists public.player_shares (
  player_id      uuid primary key references public.players(id) on delete cascade,
  shares         numeric not null default 0,
  total_invested numeric not null default 0,
  updated_at     timestamptz not null default now()
);

alter table public.player_shares enable row level security;
drop policy if exists player_shares_self_read on public.player_shares;
create policy player_shares_self_read on public.player_shares
  for select to authenticated using (player_id = auth.uid());
grant select on public.player_shares to authenticated;

create or replace function public.share_index_price()
returns numeric language sql stable security definer set search_path = public as $$
  select greatest(0.01,
    (coalesce((select sum(money) from public.players), 0)
     + coalesce((select sum(total_invested) from public.player_shares), 0)) / 1000000.0);
$$;

create or replace function public.get_share_market()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_price numeric; v_shares numeric; v_invested numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_price := public.share_index_price();
  select shares, total_invested into v_shares, v_invested
    from public.player_shares where player_id = v_uid;
  return jsonb_build_object(
    'price', v_price,
    'shares', coalesce(v_shares, 0),
    'invested', coalesce(v_invested, 0),
    'value', coalesce(v_shares, 0) * v_price,
    'money', coalesce((select money from public.players where id = v_uid), 0),
    'feePct', 1
  );
end $$;

create or replace function public.buy_shares(p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_price numeric; v_money numeric; v_fee numeric := 0.01; v_shares numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1e15 then raise exception 'invalid_amount'; end if;
  select money into v_money from public.players where id = v_uid for update;
  if v_money is null then raise exception 'player_not_found'; end if;
  if p_amount > v_money then raise exception 'insufficient_funds'; end if;
  v_price := public.share_index_price();
  v_shares := p_amount / (v_price * (1 + v_fee));
  update public.players set money = money - p_amount where id = v_uid;
  insert into public.player_shares (player_id, shares, total_invested, updated_at)
    values (v_uid, v_shares, p_amount, now())
  on conflict (player_id) do update
    set shares = player_shares.shares + excluded.shares,
        total_invested = player_shares.total_invested + excluded.total_invested,
        updated_at = now();
  return public.get_share_market();
end $$;

create or replace function public.sell_shares(p_shares numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_price numeric; v_fee numeric := 0.01;
  v_have numeric; v_invested numeric; v_sell numeric; v_proceeds numeric; v_basis_out numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_shares is null or p_shares <= 0 then raise exception 'invalid_amount'; end if;
  select shares, total_invested into v_have, v_invested
    from public.player_shares where player_id = v_uid for update;
  if v_have is null or v_have <= 0 then raise exception 'no_shares'; end if;
  v_sell := least(p_shares, v_have);
  v_price := public.share_index_price();
  v_proceeds := v_sell * v_price * (1 - v_fee);
  v_basis_out := case when v_have > 0 then v_invested * (v_sell / v_have) else 0 end;
  update public.player_shares
    set shares = shares - v_sell,
        total_invested = greatest(0, total_invested - v_basis_out),
        updated_at = now()
    where player_id = v_uid;
  update public.players set money = money + v_proceeds where id = v_uid;
  return public.get_share_market();
end $$;

grant execute on function public.share_index_price() to authenticated;
grant execute on function public.get_share_market() to authenticated;
grant execute on function public.buy_shares(numeric) to authenticated;
grant execute on function public.sell_shares(numeric) to authenticated;
