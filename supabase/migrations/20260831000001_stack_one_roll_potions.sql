-- =========================================================
-- Let players stack one-roll potions (Legendary / Mythic).
--
-- Previously player_one_roll_boosts held at most one pending boost per
-- player and activate_one_roll_potion refused a second drink with
-- 'one_roll_boost_already_active'. Players asked to stack Mythic potions:
-- drinking N of the same potion should charge N successful rolls, each
-- consuming one charge at the potion's luck value.
--
-- We keep a single row per player (player_id stays the primary key) but
-- add a `charges` counter. Drinking the SAME one-roll potion again bumps
-- the charge count; the roll edge function decrements one charge per
-- successful roll and deletes the row when the last charge is spent.
-- Mixing a Legendary and a Mythic boost is still refused so a charge is
-- never applied at the wrong luck value.
-- =========================================================

alter table public.player_one_roll_boosts
  add column if not exists charges integer not null default 1
  check (charges > 0);


-- Drinking a one-roll potion now accumulates charges instead of being
-- blocked. Same locking discipline as before: lock the player row so two
-- concurrent activations cannot each spend an item without both counting.
create or replace function public.activate_one_roll_potion(p_consumable_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_effect numeric;
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
    when 'legendary-potion' then v_effect := 1000;
    when 'mythic-potion' then v_effect := 10000;
    else raise exception 'invalid_consumable';
  end case;

  perform 1
  from public.players
  where id = v_uid
  for update;

  if not found then
    raise exception 'player_not_found';
  end if;

  -- A pending boost of a DIFFERENT one-roll potion must be spent first so
  -- stacked charges always share a single luck value.
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

grant execute on function public.activate_one_roll_potion(text) to authenticated;


-- Spend exactly one charge of a player's pending one-roll boost. Called by
-- the roll edge function (service_role) after a successful roll commits, so
-- a failed roll never eats a charge. Deletes the row once the last charge is
-- gone. Returns the number of charges left (0 when the row was removed).
create or replace function public.spend_one_roll_charge(p_player_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charges integer;
begin
  update public.player_one_roll_boosts
  set charges = charges - 1
  where player_id = p_player_id
  returning charges into v_charges;

  if not found then
    return 0;
  end if;

  if v_charges <= 0 then
    delete from public.player_one_roll_boosts
    where player_id = p_player_id;
    return 0;
  end if;

  return v_charges;
end;
$$;

grant execute on function public.spend_one_roll_charge(uuid) to service_role;

grant select on table public.player_one_roll_boosts to authenticated;
