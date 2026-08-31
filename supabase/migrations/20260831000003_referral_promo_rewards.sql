-- =========================================================
-- Referral launch promo (limited time, ends Sept 5 2026).
--
-- Replaces the flat cash payout in settle_my_referral with the promo
-- reward tier:
--   * Referrer (who invited):  $2,000,000 + 10 Mythic Potions
--   * Referred friend (joined):  $250,000 +  5 Legendary Potions
--
-- The promo only pays while it is live: settlement after the cutoff no
-- longer qualifies (the pending row is simply left as-is). Rewards are
-- still computed entirely from server state and paid once via the status
-- guard, so a client can trigger settlement without inflating anything.
-- =========================================================

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
  -- Inclusive of all of Sept 5 (UTC); the offer closes at this instant.
  v_promo_ends timestamptz := '2026-09-06 00:00:00+00';
  v_referrer_cash numeric := 2000000;
  v_referred_cash numeric := 250000;
  v_referrer_mythic integer := 10;
  v_referred_legendary integer := 5;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select referrer_id into v_referrer
  from public.player_referrals
  where referred_id = v_uid
    and status = 'pending'
  for update;

  if v_referrer is null then
    return jsonb_build_object('settled', false);
  end if;

  -- Limited-time offer: once it closes, pending referrals no longer pay.
  if now() >= v_promo_ends then
    return jsonb_build_object('settled', false, 'promoEnded', true);
  end if;

  select total_rolls into v_rolls
  from public.players
  where id = v_uid;

  if coalesce(v_rolls, 0) < v_qualify_rolls then
    return jsonb_build_object(
      'settled', false,
      'progress', coalesce(v_rolls, 0),
      'goal', v_qualify_rolls
    );
  end if;

  -- Referrer: cash + Mythic Potions. Potions are only granted when the
  -- referrer has a players row (the consumables FK requires it); the cash
  -- update is a harmless no-op otherwise.
  update public.players
  set money = coalesce(money, 0) + v_referrer_cash
  where id = v_referrer;

  if exists (select 1 from public.players where id = v_referrer) then
    insert into public.player_consumables (player_id, consumable_id, quantity, updated_at)
    values (v_referrer, 'mythic-potion', v_referrer_mythic, now())
    on conflict (player_id, consumable_id) do update
      set quantity = player_consumables.quantity + excluded.quantity,
          updated_at = now();
  end if;

  -- Referred friend: cash + Legendary Potions (their players row exists
  -- because they have reached the rolls milestone).
  update public.players
  set money = coalesce(money, 0) + v_referred_cash
  where id = v_uid;

  insert into public.player_consumables (player_id, consumable_id, quantity, updated_at)
  values (v_uid, 'legendary-potion', v_referred_legendary, now())
  on conflict (player_id, consumable_id) do update
    set quantity = player_consumables.quantity + excluded.quantity,
        updated_at = now();

  update public.player_referrals
  set status = 'qualified',
      qualified_at = now(),
      reward_amount = v_referrer_cash
  where referred_id = v_uid;

  return jsonb_build_object(
    'settled', true,
    'referrerReward', v_referrer_cash,
    'referrerMythicPotions', v_referrer_mythic,
    'referredReward', v_referred_cash,
    'referredLegendaryPotions', v_referred_legendary
  );
end;
$$;

grant execute on function public.settle_my_referral() to authenticated;
