-- Register timed Tier IV potions in the server catalog and permit Tier IV
-- timed boosts. Recipes are stored server-side because crafting reads
-- public.game_recipes rather than the client bundle.

alter table public.player_boosts
  drop constraint if exists player_boosts_tier_check;

alter table public.player_boosts
  add constraint player_boosts_tier_check check (tier between 1 and 4);

insert into public.game_consumables (
  id,
  name,
  family,
  tier,
  effect_value,
  duration_seconds
)
values
  ('lucky-potion-4', 'Lucky Potion IV', 'luck', 4, 0.75, 60),
  ('speed-potion-4', 'Speed Potion IV', 'rollSpeed', 4, 0.75, 60),
  ('fortune-potion-4', 'Fortune Potion IV', 'weightLuck', 4, 0.75, 60),
  ('mass-potion-4', 'Mass Potion IV', 'weightMultiplier', 4, 0.50, 60)
on conflict (id) do update
set name = excluded.name,
    family = excluded.family,
    tier = excluded.tier,
    effect_value = excluded.effect_value,
    duration_seconds = excluded.duration_seconds;

insert into public.game_recipes (id, recipe)
values
  (
    'lucky-potion-4',
    '{
      "id": "lucky-potion-4",
      "name": "Lucky Potion IV",
      "category": "potion",
      "requirements": [
        {"type": "consumable", "consumableId": "lucky-potion-3", "amount": 2},
        {"type": "gem-count", "gem": "Ruby", "amount": 2},
        {"type": "gem-count", "gem": "Emerald", "amount": 1},
        {"type": "gem-count", "gem": "Diamond", "amount": 1},
        {"type": "gem-count", "gem": "Black Diamond", "amount": 1}
      ],
      "moneyCost": 150000,
      "reward": {"type": "consumable", "id": "lucky-potion-4", "name": "Lucky Potion IV", "family": "luck", "tier": 4, "amount": 1, "effectValue": 0.75}
    }'::jsonb
  ),
  (
    'speed-potion-4',
    '{
      "id": "speed-potion-4",
      "name": "Speed Potion IV",
      "category": "potion",
      "requirements": [
        {"type": "consumable", "consumableId": "speed-potion-3", "amount": 2},
        {"type": "gem-count", "gem": "Sapphire", "amount": 2},
        {"type": "gem-count", "gem": "Tanzanite", "amount": 1},
        {"type": "gem-count", "gem": "Alexandrite", "amount": 1},
        {"type": "gem-count", "gem": "Aether Quartz", "amount": 1}
      ],
      "moneyCost": 150000,
      "reward": {"type": "consumable", "id": "speed-potion-4", "name": "Speed Potion IV", "family": "rollSpeed", "tier": 4, "amount": 1, "effectValue": 0.75}
    }'::jsonb
  ),
  (
    'fortune-potion-4',
    '{
      "id": "fortune-potion-4",
      "name": "Fortune Potion IV",
      "category": "potion",
      "requirements": [
        {"type": "consumable", "consumableId": "fortune-potion-3", "amount": 2},
        {"type": "gem-count", "gem": "Alexandrite", "amount": 2},
        {"type": "gem-count", "gem": "Emerald", "amount": 2},
        {"type": "gem-count", "gem": "Ruby", "amount": 1},
        {"id": "fortune-potion-4-heavy", "type": "specimen-condition", "label": "Any gem at 4.0x weight or more", "minimumWeightMultiplier": 4, "amount": 1},
        {"type": "gem-count", "gem": "Void Opal", "amount": 1}
      ],
      "moneyCost": 150000,
      "reward": {"type": "consumable", "id": "fortune-potion-4", "name": "Fortune Potion IV", "family": "weightLuck", "tier": 4, "amount": 1, "effectValue": 0.75}
    }'::jsonb
  ),
  (
    'mass-potion-4',
    '{
      "id": "mass-potion-4",
      "name": "Mass Potion IV",
      "category": "potion",
      "requirements": [
        {"type": "consumable", "consumableId": "mass-potion-3", "amount": 2},
        {"type": "gem-count", "gem": "Grandidierite", "amount": 2},
        {"type": "gem-count", "gem": "Taaffeite", "amount": 2},
        {"type": "gem-count", "gem": "Musgravite", "amount": 1},
        {"id": "mass-potion-4-weight", "type": "gem-total-weight", "label": "Additional sacrificed gem weight", "totalWeight": 50000},
        {"type": "gem-count", "gem": "Chronite", "amount": 1}
      ],
      "moneyCost": 200000,
      "reward": {"type": "consumable", "id": "mass-potion-4", "name": "Mass Potion IV", "family": "weightMultiplier", "tier": 4, "amount": 1, "effectValue": 0.50}
    }'::jsonb
  )
on conflict (id) do update
set recipe = excluded.recipe;