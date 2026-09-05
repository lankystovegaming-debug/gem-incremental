insert into public.game_consumables (
  id,
  name,
  family,
  tier,
  effect_value,
  duration_seconds
)
values
  ('money-up-potion-1', 'Money Up Potion I', 'moneyUp', 1, 0.25, 60),
  ('money-up-potion-2', 'Money Up Potion II', 'moneyUp', 2, 0.50, 60)
on conflict (id) do update
set name = excluded.name,
    family = excluded.family,
    tier = excluded.tier,
    effect_value = excluded.effect_value,
    duration_seconds = excluded.duration_seconds;

insert into public.game_recipes (id, recipe)
values (
  'money-up-potion-2',
  '{
    "id": "money-up-potion-2",
    "name": "Money Up Potion II",
    "category": "potion",
    "requirements": [
      {"type": "consumable", "consumableId": "money-up-potion-1", "amount": 2},
      {"type": "gem-count", "gem": "Pyrite", "amount": 3},
      {"type": "gem-count", "gem": "random rock i found outside", "amount": 3},
      {"type": "gem-count", "gem": "focus.", "amount": 1}
    ],
    "moneyCost": 100000,
    "reward": {"type": "consumable", "id": "money-up-potion-2", "name": "Money Up Potion II", "family": "moneyUp", "tier": 2, "amount": 1, "effectValue": 0.50}
  }'::jsonb
)
on conflict (id) do update
set recipe = excluded.recipe;

create or replace function public.sell_inventory_gem(
  p_player_id uuid,
  p_specimen_id bigint,
  p_auto_sell boolean
)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare
  v_value double precision;
  v_locked boolean;
  v_new_money double precision;
  v_gem_name text;
  v_name text;
  v_money_multiplier double precision := 1;
begin
  select value, locked, gem_name
    into v_value, v_locked, v_gem_name
  from public.inventory_gems
  where id = p_specimen_id and player_id = p_player_id
  for update;

  if not found then raise exception 'gem_not_found'; end if;
  if v_locked then raise exception 'gem_locked'; end if;
  if public.player_has_mine_artifact(p_player_id, 'foreman-seal') then
    v_value := v_value * 1.03;
  end if;
  if p_auto_sell then
    select 1 + coalesce(sum(effect_value), 0)
      into v_money_multiplier
    from public.player_boosts
    where player_id = p_player_id
      and family = 'moneyUp'
      and expires_at > now();
    v_value := v_value * greatest(1, v_money_multiplier);
  end if;
  update public.players
  set money = money + v_value,
      lifetime_earnings = lifetime_earnings + v_value
  where id = p_player_id
  returning money into v_new_money;
  delete from public.inventory_gems where id = p_specimen_id and player_id = p_player_id;
  begin
    select username into v_name from public.players where id = p_player_id;
    insert into public.global_cash_events(player_name, gem_name, amount)
    values (v_name, v_gem_name, v_value);
  exception when others then null;
  end;
  return jsonb_build_object('money', v_new_money, 'sold_value', v_value);
end $$;

create or replace function public.sell_inventory_gem(p_player_id uuid, p_specimen_id bigint)
returns double precision language sql security definer set search_path='public' as $$
  select (public.sell_inventory_gem(p_player_id, p_specimen_id, false)->>'money')::double precision;
$$;
