-- Enforce progression gates when activating one-roll potions.
-- The check happens while the player row is locked and before inventory is
-- touched, so a rejected activation cannot consume a potion.

create or replace function public.activate_one_roll_potion(p_consumable_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_effect numeric;
  v_required_rolls bigint;
  v_total_rolls bigint;
  v_owned integer;
  v_quantity integer;
  v_existing_id text;
  v_activated_at timestamptz;
  v_charges integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  case p_consumable_id
    when 'legendary-potion' then
      v_effect := 1000;
      v_required_rolls := 1000;
    when 'mythic-potion' then
      v_effect := 10000;
      v_required_rolls := 2500;
    else
      raise exception 'invalid_consumable';
  end case;

  select total_rolls
  into v_total_rolls
  from public.players
  where id = v_uid
  for update;

  if not found then
    raise exception 'player_not_found';
  end if;

  if coalesce(v_total_rolls, 0) < v_required_rolls then
    raise exception 'lifetime_rolls_required:%', v_required_rolls;
  end if;

  select consumable_id
  into v_existing_id
  from public.player_one_roll_boosts
  where player_id = v_uid
  for update;

  if found and v_existing_id is distinct from p_consumable_id then
    raise exception 'one_roll_boost_already_active';
  end if;

  select quantity
  into v_owned
  from public.player_consumables
  where player_id = v_uid
    and consumable_id = p_consumable_id
  for update;

  if not found or v_owned < 1 then
    raise exception 'consumable_not_owned';
  end if;

  update public.player_consumables
  set quantity = quantity - 1,
      updated_at = now()
  where player_id = v_uid
    and consumable_id = p_consumable_id
  returning quantity into v_quantity;

  insert into public.player_one_roll_boosts (
    player_id,
    consumable_id,
    effect_value,
    charges
  )
  values (
    v_uid,
    p_consumable_id,
    v_effect,
    1
  )
  on conflict (player_id) do update
    set charges = public.player_one_roll_boosts.charges + 1,
        activated_at = now()
  returning activated_at, charges into v_activated_at, v_charges;

  return jsonb_build_object(
    'success', true,
    'quantity', v_quantity,
    'boost', jsonb_build_object(
      'family', 'luck',
      'effectValue', v_effect,
      'oneRoll', true,
      'charges', v_charges,
      'activatedAt', v_activated_at
    )
  );
end;
$$;

revoke execute on function public.activate_one_roll_potion(text) from public, anon;
grant execute on function public.activate_one_roll_potion(text) to authenticated;
