-- =========================================================
-- Referral LAUNCH PROMO (limited time, ends Sept 5 2026).
--
-- Supersedes the standing rebalance (20260831030943) for the duration of
-- the launch. While the promo is live the qualification rewards are:
--   * Referrer (who invited):  $2,000,000 + 10 Mythic Potions
--   * Referred friend (joined):  $250,000 +  5 Legendary Potions
--
-- Keeps the safety shape of the rebalance: the referral row is locked
-- first and marked qualified only after both grants succeed; a failed
-- statement rolls the whole call back, so retries are safe. Settlement
-- after the cutoff no longer pays (the pending row is left as-is), so the
-- standing reward tier resumes simply by letting the promo lapse — or by a
-- follow-up migration.
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
  v_referrer_reward numeric := 2000000;
  v_referred_reward numeric := 250000;
  v_referrer_mythic integer := 10;
  v_referred_legendary integer := 5;
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

  -- Limited-time offer: once it closes, pending referrals no longer pay.
  if now() >= v_promo_ends then
    return jsonb_build_object('settled', false, 'promoEnded', true);
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
  values (v_referrer, 'mythic-potion', v_referrer_mythic, now())
  on conflict (player_id, consumable_id) do update
  set quantity = public.player_consumables.quantity + excluded.quantity, updated_at = now();

  insert into public.player_consumables (player_id, consumable_id, quantity, updated_at)
  values (v_uid, 'legendary-potion', v_referred_legendary, now())
  on conflict (player_id, consumable_id) do update
  set quantity = public.player_consumables.quantity + excluded.quantity, updated_at = now();

  update public.player_referrals
  set status = 'qualified', qualified_at = now(), reward_amount = v_referrer_reward
  where referred_id = v_uid and status = 'pending';

  return jsonb_build_object(
    'settled', true,
    'referrerReward', v_referrer_reward,
    'referrerMythicPotions', v_referrer_mythic,
    'referredReward', v_referred_reward,
    'referredLegendaryPotions', v_referred_legendary
  );
end;
$$;

revoke execute on function public.settle_my_referral() from public, anon;
grant execute on function public.settle_my_referral() to authenticated;
