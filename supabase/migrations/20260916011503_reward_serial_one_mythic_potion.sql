begin;

-- Serial numbers are assigned by assign_inventory_gem_serial before this
-- trigger runs. A non-null roll_number marks a specimen created by the roll
-- pipeline; auction restores retain their old serial and non-roll grants do
-- not carry a roll number.
create or replace function public.reward_serial_one_roll()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.player_consumables (
    player_id,
    consumable_id,
    quantity,
    updated_at
  )
  values (
    new.player_id,
    'mythic-potion',
    1,
    now()
  )
  on conflict (player_id, consumable_id) do update
  set quantity = public.player_consumables.quantity + excluded.quantity,
      updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists reward_serial_one_roll_trg on public.inventory_gems;
create trigger reward_serial_one_roll_trg
  after insert on public.inventory_gems
  for each row
  when (new.serial_number = 1 and new.roll_number is not null)
  execute function public.reward_serial_one_roll();

revoke all on function public.reward_serial_one_roll() from public, anon, authenticated;

-- Breakneck creates its bonus specimen inside the equipment commit RPC. Pass
-- the parent roll number through so the same trigger rewards a serial #1 bonus
-- atomically with that insert while preserving the optimized single RPC.
create or replace function public.commit_equipment_roll(
  p_player_id uuid,
  p_lease_id uuid,
  p_genuine_roll bigint,
  p_state jsonb,
  p_loot text,
  p_bonus jsonb,
  p_capacity integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.players%rowtype;
  b public.inventory_gems%rowtype;
  n integer;
begin
  select * into p
  from public.players
  where id = p_player_id
  for update;

  if not found or p.roll_lease_id is distinct from p_lease_id then
    raise exception 'invalid_roll_lease';
  end if;
  if p.equipment_state_roll >= p_genuine_roll then
    return jsonb_build_object('duplicate', true);
  end if;
  if p_genuine_roll <> p.equipment_genuine_rolls + 1 then
    raise exception 'invalid_genuine_roll';
  end if;

  update public.players
  set equipment_state = p_state,
      equipment_state_roll = p_genuine_roll
  where id = p_player_id;

  if p_loot is not null then
    if p_loot not in (
      'lucky-potion-1', 'lucky-potion-2', 'lucky-potion-3', 'lucky-potion-4',
      'speed-potion-1', 'speed-potion-2', 'speed-potion-3', 'speed-potion-4',
      'fortune-potion-1', 'fortune-potion-2', 'fortune-potion-3', 'fortune-potion-4',
      'mass-potion-1', 'mass-potion-2', 'mass-potion-3', 'mass-potion-4',
      'legendary-potion', 'mythic-potion', 'relic-potion'
    ) then
      raise exception 'invalid_excavation_loot';
    end if;

    insert into public.player_consumables (
      player_id,
      consumable_id,
      quantity,
      updated_at
    )
    values (p_player_id, p_loot, 1, now())
    on conflict (player_id, consumable_id) do update
    set quantity = public.player_consumables.quantity + 1,
        updated_at = now();
  end if;

  if p_bonus is not null then
    select count(*) into n
    from public.inventory_gems
    where player_id = p_player_id;

    if n < p_capacity then
      insert into public.inventory_gems (
        player_id,
        gem_name,
        rarity,
        base_weight,
        value_per_gram,
        rolled_weight_multiplier,
        rolled_weight,
        final_weight,
        mutation_id,
        mutation_ids,
        mutation_multiplier,
        mutation_multipliers,
        mutation_chance_multiplier,
        value,
        luck_at_roll,
        locked,
        roll_number
      )
      values (
        p_player_id,
        p_bonus->>'gem_name',
        (p_bonus->>'rarity')::integer,
        (p_bonus->>'base_weight')::double precision,
        (p_bonus->>'value_per_gram')::double precision,
        (p_bonus->>'rolled_weight_multiplier')::double precision,
        (p_bonus->>'rolled_weight')::double precision,
        (p_bonus->>'final_weight')::double precision,
        p_bonus->>'mutation_id',
        array(select jsonb_array_elements_text(p_bonus->'mutation_ids')),
        (p_bonus->>'mutation_multiplier')::double precision,
        p_bonus->'mutation_multipliers',
        (p_bonus->>'mutation_chance_multiplier')::double precision,
        (p_bonus->>'value')::double precision,
        (p_bonus->>'luck_at_roll')::double precision,
        false,
        (p_bonus->>'roll_number')::bigint
      )
      returning * into b;
    end if;
  end if;

  return jsonb_build_object(
    'bonus', case when b.id is not null then to_jsonb(b) else null end,
    'loot', p_loot,
    'state', p_state
  );
end;
$$;

revoke all on function public.commit_equipment_roll(uuid, uuid, bigint, jsonb, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.commit_equipment_roll(uuid, uuid, bigint, jsonb, text, jsonb, integer)
  to service_role;

commit;
