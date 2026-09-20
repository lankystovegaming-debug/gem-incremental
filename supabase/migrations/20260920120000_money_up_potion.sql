-- Adds the Money Up Potion line: tier-1 (x1.5) and tier-2 (x2) gemValue
-- boosts that multiply Auto Sell proceeds for 60 seconds. Manual sales
-- are unaffected. The multiplier is read from player_boosts.effect_value
-- so future tiers need no SQL change.

begin;

alter table public.player_boosts
  drop constraint if exists player_boosts_family_check;
alter table public.player_boosts
  add constraint player_boosts_family_check check (
    family in ('luck','rollSpeed','weightLuck','weightMultiplier','relic','petLuck','gemValue')
  );

alter table public.game_consumables
  drop constraint if exists game_consumables_family_check;
alter table public.game_consumables
  add constraint game_consumables_family_check check (
    family in ('luck','rollSpeed','weightLuck','weightMultiplier','relic','petLuck','material','gemValue')
  );

insert into public.game_consumables
  (id, name, family, tier, effect_value, duration_seconds, purchasable, shop_price)
values
  ('money-up-potion','Money Up Potion','gemValue',1,1.5,60,false,null),
  ('money-up-potion-2','Money Up Potion II','gemValue',2,2,60,false,null)
on conflict (id) do update set
  family           = excluded.family,
  tier             = excluded.tier,
  effect_value     = excluded.effect_value,
  duration_seconds = excluded.duration_seconds,
  purchasable      = false,
  shop_price       = null;

drop function if exists public.sell_inventory_gem(uuid, bigint);

create or replace function public.sell_inventory_gem(
  p_player_id   uuid,
  p_specimen_id bigint,
  p_source      text default 'manual'
)
returns double precision
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_value      double precision;
  v_locked     boolean;
  v_new_money  double precision;
  v_gem_name   text;
  v_name       text;
  v_gem_value_mult double precision;
begin
  select value, locked, gem_name
    into v_value, v_locked, v_gem_name
    from public.inventory_gems
    where id = p_specimen_id and player_id = p_player_id
    for update;

  if not found then raise exception 'gem_not_found'; end if;
  if v_locked then raise exception 'gem_locked'; end if;

  v_value := v_value * public.equipment_gem_sell_multiplier(p_player_id);

  if p_source = 'auto' then
    select effect_value
      into v_gem_value_mult
      from public.player_boosts
      where player_id = p_player_id
        and family    = 'gemValue'
        and expires_at > now()
      limit 1;
    if v_gem_value_mult is not null and v_gem_value_mult > 1 then
      v_value := v_value * v_gem_value_mult;
    end if;
  end if;

  update public.players
    set money = money + v_value,
        lifetime_earnings = lifetime_earnings + v_value
    where id = p_player_id
    returning money into v_new_money;

  delete from public.inventory_gems
    where id = p_specimen_id and player_id = p_player_id;

  begin
    select username into v_name from public.players where id = p_player_id;
    insert into public.global_cash_events(player_name, gem_name, amount)
      values (v_name, v_gem_name, v_value);
  exception when others then null; end;

  return v_new_money;
end $$;

revoke all on function public.sell_inventory_gem(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.sell_inventory_gem(uuid, bigint, text)
  to service_role;


insert into public.game_recipes(id, recipe) values
  ('money-up-potion', '{
    "id":"money-up-potion",
    "name":"Money Up Potion",
    "category":"potion",
    "requirements":[
      {"type":"consumable","consumableId":"lucky-potion-1","amount":5},
      {"type":"consumable","consumableId":"fortune-potion-1","amount":5}
    ],
    "moneyCost":5000,
    "reward":{"type":"consumable","id":"money-up-potion","name":"Money Up Potion","family":"gemValue","tier":1,"amount":1,"effectValue":1.5}
  }'::jsonb)
on conflict (id) do update set recipe = excluded.recipe;

insert into public.game_recipes(id, recipe) values
  ('money-up-potion-2', '{
    "id":"money-up-potion-2",
    "name":"Money Up Potion II",
    "category":"potion",
    "requirements":[
      {"type":"consumable","consumableId":"lucky-potion-2","amount":5},
      {"type":"consumable","consumableId":"fortune-potion-2","amount":5}
    ],
    "moneyCost":25000,
    "reward":{"type":"consumable","id":"money-up-potion-2","name":"Money Up Potion II","family":"gemValue","tier":2,"amount":1,"effectValue":2}
  }'::jsonb)
on conflict (id) do update set recipe = excluded.recipe;

notify pgrst, 'reload schema';

commit;