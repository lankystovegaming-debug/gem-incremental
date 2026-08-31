-- Repair the stackable Legendary/Mythic potion rollout.
--
-- The original migration was timestamped before a migration that had already
-- reached production, so it was never recorded or applied there. The client
-- consequently rendered a fallback charge count while the database continued
-- to reject every second potion. Keep this migration self-contained and
-- idempotent so environments that did apply the original remain correct.

alter table public.player_one_roll_boosts
  add column if not exists charges integer not null default 1
  check (charges > 0);

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

create or replace function public.spend_one_roll_charge(p_player_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charges integer;
begin
  select charges
  into v_charges
  from public.player_one_roll_boosts
  where player_id = p_player_id
  for update;

  if not found then
    return 0;
  end if;

  -- Delete the final charge directly. Updating it to zero first would violate
  -- the table's charges > 0 check before the following delete could run.
  if v_charges <= 1 then
    delete from public.player_one_roll_boosts
    where player_id = p_player_id;
    return 0;
  end if;

  update public.player_one_roll_boosts
  set charges = charges - 1
  where player_id = p_player_id
  returning charges into v_charges;

  return v_charges;
end;
$$;

revoke execute on function public.spend_one_roll_charge(uuid) from public, anon, authenticated;
grant execute on function public.spend_one_roll_charge(uuid) to service_role;

grant select on table public.player_one_roll_boosts to authenticated;
