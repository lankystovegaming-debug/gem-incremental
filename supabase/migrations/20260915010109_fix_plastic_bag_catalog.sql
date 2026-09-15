-- Make the Plastic Bag a first-class backend consumable. The original late-game
-- migration added it to Daily Shop rewards and the client catalog only, so
-- generic server-side validation and admin tooling could not resolve the item.
begin;

insert into public.game_consumables (
  id,
  name,
  family,
  tier,
  effect_value,
  duration_seconds,
  purchasable,
  shop_price
)
values (
  'plastic-bag',
  'Plastic Bag',
  'material',
  1,
  1,
  1,
  false,
  null
)
on conflict (id) do update
set name = excluded.name,
    family = excluded.family,
    tier = excluded.tier,
    effect_value = excluded.effect_value,
    duration_seconds = excluded.duration_seconds,
    purchasable = false,
    shop_price = null;

-- Keep the rotating offer canonical if an earlier manual deployment edited it.
update public.daily_shop_catalog
set name = 'Plastic Bag',
    description = 'Costs 10¢. Does absolutely nothing. Collect 67 for the Plastic Shopping Bag.',
    price = 0.10,
    stock_min = 67,
    stock_max = 67,
    contents = '[{"type":"consumable","id":"plastic-bag","quantity":1}]'::jsonb
where id = 'plastic-bag';

commit;

notify pgrst, 'reload schema';
