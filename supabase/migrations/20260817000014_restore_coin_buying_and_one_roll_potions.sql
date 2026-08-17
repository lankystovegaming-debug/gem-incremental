-- =========================================================
-- Restore fixed-price loot-box coin purchases and make
-- Legendary/Mythic potions usable as soon as a player owns one.
-- =========================================================

-- The retired stock-market migration replaced this function with an
-- exception. Loot-box coins are now bought directly for $10,000 each.
create or replace function public.buy_coins_with_money(p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cost double precision;
  v_money double precision;
  v_coins bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_count is null or p_count < 1 or p_count > 100000000 then
    raise exception 'invalid_count';
  end if;

  v_cost := p_count::double precision * 10000;

  select money
  into v_money
  from public.players
  where id = v_uid
  for update;

  if not found then
    raise exception 'player_not_found';
  end if;

  if v_money < v_cost then
    raise exception 'not_enough_money';
  end if;

  update public.players
  set money = money - v_cost,
      coins = coins + p_count
  where id = v_uid
  returning coins into v_coins;

  return jsonb_build_object('coins', v_coins, 'spent', v_cost);
end;
$$;

grant execute on function public.buy_coins_with_money(integer) to authenticated;


-- Keep a single pending one-roll boost per player. The client can read it to
-- show its state; activation and consumption remain server-authoritative.
create table if not exists public.player_one_roll_boosts (
  player_id uuid primary key references public.players(id) on delete cascade,
  consumable_id text not null check (consumable_id in ('legendary-potion', 'mythic-potion')),
  effect_value numeric not null check (effect_value > 0),
  activated_at timestamptz not null default now()
);

alter table public.player_one_roll_boosts enable row level security;

drop policy if exists "Players can read their pending one-roll boost"
  on public.player_one_roll_boosts;

create policy "Players can read their pending one-roll boost"
  on public.player_one_roll_boosts
  for select
  to authenticated
  using (auth.uid() = player_id);

revoke all on table public.player_one_roll_boosts from anon, authenticated;
grant select on table public.player_one_roll_boosts to authenticated;


-- Potions from loot boxes and crafting should be usable immediately. Lock the
-- player row first so concurrent activation attempts cannot consume two items
-- or leave multiple pending boosts.
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
  v_activated_at timestamptz;
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

  if exists (
    select 1
    from public.player_one_roll_boosts
    where player_id = v_uid
  ) then
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
    effect_value
  )
  values (
    v_uid,
    p_consumable_id,
    v_effect
  )
  returning activated_at into v_activated_at;

  return jsonb_build_object(
    'success', true,
    'quantity', v_quantity,
    'boost', jsonb_build_object(
      'family', 'luck',
      'effectValue', v_effect,
      'oneRoll', true,
      'activatedAt', v_activated_at
    )
  );
end;
$$;

grant execute on function public.activate_one_roll_potion(text) to authenticated;
