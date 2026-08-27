-- Exchange trading hours: open 07:30–21:30, closed 21:30–07:30 (Asia/Singapore,
-- the game's timezone). Trades are blocked server-side while closed; the client
-- reads `open` / `opensAt` / `closesAt` from get_share_market to show the state.

create or replace function public.share_market_is_open()
returns boolean language sql stable set search_path = public as $$
  select m >= (7*60 + 30) and m < (21*60 + 30)
  from (
    select extract(hour from n)::int * 60 + extract(minute from n)::int as m
    from (select (now() at time zone 'Asia/Singapore') as n) a
  ) b;
$$;
grant execute on function public.share_market_is_open() to anon, authenticated;

-- Block buying while the market is closed.
create or replace function public.buy_shares(p_amount numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_price numeric; v_money numeric; v_fee numeric := 0.01; v_shares numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.share_market_is_open() then raise exception 'market_closed'; end if;
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
end $function$;

-- Block selling while the market is closed.
create or replace function public.sell_shares(p_shares numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_price numeric; v_fee numeric := 0.01;
  v_have numeric; v_invested numeric; v_sell numeric; v_proceeds numeric; v_basis_out numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.share_market_is_open() then raise exception 'market_closed'; end if;
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
end $function$;

-- Expose open/closed status + the next open/close instant (as timestamptz;
-- the client renders it in the viewer's local time).
create or replace function public.get_share_market()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid(); v_price numeric; v_shares numeric; v_invested numeric;
  v_sgt timestamp; v_min int; v_open boolean;
  v_next_open timestamptz; v_next_close timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_price := public.share_index_price();
  select shares, total_invested into v_shares, v_invested
    from public.player_shares where player_id = v_uid;

  v_sgt := now() at time zone 'Asia/Singapore';
  v_min := extract(hour from v_sgt)::int * 60 + extract(minute from v_sgt)::int;
  v_open := v_min >= (7*60+30) and v_min < (21*60+30);
  -- Next 07:30 SGT (today if we're before it, else tomorrow).
  v_next_open := (case when v_min < (7*60+30)
                       then date_trunc('day', v_sgt) + interval '7 hours 30 minutes'
                       else date_trunc('day', v_sgt) + interval '1 day 7 hours 30 minutes' end)
                 at time zone 'Asia/Singapore';
  -- Next 21:30 SGT close (today if we're before it, else tomorrow).
  v_next_close := (case when v_min < (21*60+30)
                        then date_trunc('day', v_sgt) + interval '21 hours 30 minutes'
                        else date_trunc('day', v_sgt) + interval '1 day 21 hours 30 minutes' end)
                  at time zone 'Asia/Singapore';

  return jsonb_build_object(
    'price', v_price,
    'shares', coalesce(v_shares, 0),
    'invested', coalesce(v_invested, 0),
    'value', coalesce(v_shares, 0) * v_price,
    'money', coalesce((select money from public.players where id = v_uid), 0),
    'feePct', 1,
    'open', v_open,
    'opensAt', v_next_open,
    'closesAt', v_next_close,
    'hours', '07:30–21:30 SGT'
  );
end $function$;
