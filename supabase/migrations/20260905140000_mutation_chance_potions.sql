-- Add timed mutation chance potions to the server catalogue.
insert into public.game_consumables (
  id,
  name,
  family,
  tier,
  effect_value,
  duration_seconds
)
values
  ('mutation-chance-potion-1', 'Mutation Chance Potion I', 'mutationChance', 1, 0.50, 60),
  ('mutation-chance-potion-2', 'Mutation Chance Potion II', 'mutationChance', 2, 1.00, 60)
on conflict (id) do update
set name = excluded.name,
    family = excluded.family,
    tier = excluded.tier,
    effect_value = excluded.effect_value,
    duration_seconds = excluded.duration_seconds;

insert into public.game_recipes (id, recipe)
values (
  'mutation-chance-potion-2',
  '{
    "id": "mutation-chance-potion-2",
    "name": "Mutation Chance Potion II",
    "category": "potion",
    "requirements": [
      {"type": "consumable", "consumableId": "mutation-chance-potion-1", "amount": 2},
      {"type": "gem-count", "gem": "Amethyst", "amount": 3},
      {"type": "gem-count", "gem": "Chronite", "amount": 1}
    ],
    "moneyCost": 50000,
    "reward": {"type": "consumable", "id": "mutation-chance-potion-2", "name": "Mutation Chance Potion II", "family": "mutationChance", "tier": 2, "amount": 1, "effectValue": 1.00}
  }'::jsonb
)
on conflict (id) do update
set recipe = excluded.recipe;