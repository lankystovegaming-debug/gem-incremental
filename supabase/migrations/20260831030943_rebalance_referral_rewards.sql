-- Rebalance referral qualification rewards. The referral row is locked before
-- any grant and marked qualified only after both players receive every item.
-- A failed statement rolls the entire function call back, making retries safe.

create or replace function public.settle_my_referral()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid;
  v_rolls integer;
  v_qualify_rolls integer := 200;
  v_referrer_reward numeric := 500000;
  v_referred_reward numeric := 100000;
  v_updated_rows integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select referrer_id into v_referrer
  from public.player_referrals
  where referred_id = v_uid and status = 'pending'
  for update;

  if v_referrer is null then
    return jsonb_build_object('settled', false);
  end if;

  select total_rolls into v_rolls from public.players where id = v_uid;
  if coalesce(v_rolls, 0) < v_qualify_rolls then
    return jsonb_build_object('settled', false, 'progress', coalesce(v_rolls, 0), 'goal', v_qualify_rolls);
  end if;

  update public.players set money = coalesce(money, 0) + v_referrer_reward where id = v_referrer;
  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then raise exception 'referrer_player_not_found'; end if;

  update public.players set money = coalesce(money, 0) + v_referred_reward where id = v_uid;
  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then raise exception 'referred_player_not_found'; end if;

  insert into public.player_consumables (player_id, consumable_id, quantity, updated_at)
  select v_referrer, reward.consumable_id, reward.quantity, now()
  from (values
    ('lucky-potion-3', 2), ('speed-potion-3', 2),
    ('fortune-potion-2', 1), ('mass-potion-2', 1),
    ('legendary-potion', 3), ('mythic-potion', 1)
  ) as reward(consumable_id, quantity)
  on conflict (player_id, consumable_id) do update
  set quantity = public.player_consumables.quantity + excluded.quantity, updated_at = now();

  insert into public.player_consumables (player_id, consumable_id, quantity, updated_at)
  select v_uid, reward.consumable_id, reward.quantity, now()
  from (values
    ('lucky-potion-2', 2), ('speed-potion-2', 2),
    ('fortune-potion-1', 2), ('mass-potion-1', 1),
    ('legendary-potion', 1), ('mythic-potion', 1)
  ) as reward(consumable_id, quantity)
  on conflict (player_id, consumable_id) do update
  set quantity = public.player_consumables.quantity + excluded.quantity, updated_at = now();

  update public.player_referrals
  set status = 'qualified', qualified_at = now(), reward_amount = v_referrer_reward
  where referred_id = v_uid and status = 'pending';

  return jsonb_build_object(
    'settled', true,
    'referrerReward', v_referrer_reward,
    'referredReward', v_referred_reward
  );
end;
$$;

revoke execute on function public.settle_my_referral() from public, anon;
grant execute on function public.settle_my_referral() to authenticated;
