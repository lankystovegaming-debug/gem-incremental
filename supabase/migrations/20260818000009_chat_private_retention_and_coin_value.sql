-- =========================================================
-- Chat retention + coin price
-- =========================================================
-- Private messages older than the retention window are automatically
-- removed when a player opens chat. The function only deletes rows in
-- conversations involving the authenticated player.

create or replace function public.cleanup_private_messages(
  p_max_age_days integer default 30
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
  v_days integer := greatest(1, least(coalesce(p_max_age_days, 30), 3650));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.private_messages
  where created_at < now() - make_interval(days => v_days)
    and (sender_id = auth.uid() or recipient_id = auth.uid());

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.cleanup_private_messages(integer) to authenticated;

-- Current game economy: one loot-box coin costs $100,000.
create or replace function public.buy_coins_with_money(p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cost double precision;
  v_coins bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_count is null or p_count < 1 or p_count > 100000000 then
    raise exception 'invalid_count';
  end if;

  v_cost := p_count::double precision * 100000;

  update public.players
  set money = money - v_cost,
      coins = coins + p_count
  where id = v_uid
    and money >= v_cost
  returning coins into v_coins;

  if not found then
    raise exception 'not_enough_money';
  end if;

  return jsonb_build_object(
    'coins', v_coins,
    'spent', v_cost,
    'coin_value', 100000
  );
end;
$$;

grant execute on function public.buy_coins_with_money(integer) to authenticated;
