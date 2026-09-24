-- Approved All-In Pickaxe rework. The optimized roll function is deployed
-- separately; this migration updates authoritative crafting data and existing
-- equipment rows without changing All-In's established restriction semantics.
begin;

insert into public.game_recipes(id,recipe) values(
  'all-in-pickaxe',
  $recipe${
    "id":"all-in-pickaxe","name":"All-In Pickaxe","category":"pickaxe",
    "craftingTab":"pickaxe","horizontal":true,"equipmentOverhaul":true,
    "moneyCost":500000000,
    "requirements":[
      {"id":"all-in-pickaxe-legendary","type":"gem-count","label":"Legendary","amount":7500,"minimumRarity":1000,"maximumRarity":9999},
      {"id":"all-in-pickaxe-mythic","type":"gem-count","label":"Mythic","amount":2000,"minimumRarity":10000,"maximumRarity":99999},
      {"id":"all-in-pickaxe-exotic","type":"gem-count","label":"Exotic","amount":150,"minimumRarity":100000,"maximumRarity":999999},
      {"id":"all-in-pickaxe-exalted","type":"gem-count","label":"Exalted","amount":20,"minimumRarity":1000000,"maximumRarity":9999999},
      {"id":"all-in-pickaxe-cosmic","type":"gem-count","label":"Cosmic","amount":3,"minimumRarity":10000000,"maximumRarity":99999999},
      {"type":"lifetime-rolls","rolls":100000},
      {"type":"equipment-history","metric":"endgamePickaxes","amount":5,"label":"Distinct post-Celestial endgame Pickaxes ever owned","consume":false},
      {"type":"equipment-history","metric":"raw10m","amount":3,"label":"Historical base-rarity ≥1/10M rolls","consume":false}
    ],
    "reward":{"id":"all-in-pickaxe","name":"All-In Pickaxe","category":"pickaxe","tier":15,
      "bonus":{"luck":499,"rollSpeed":-0.67,"mutationChance":-0.85,"weightLuck":-0.85,"weightMultiplier":-0.85}}
  }$recipe$::jsonb
)
on conflict(id) do update set recipe=excluded.recipe;

-- Equipment crafts snapshot their recipe on first deposit. Replace only the
-- All-In snapshot so the UI and server validate the same approved requirements;
-- deposited material counters remain intact in the surrounding progress object.
update public.crafting_progress progress_row
set progress=jsonb_set(
  progress_row.progress,
  '{_equipment_recipe}',
  (select recipe from public.game_recipes where id='all-in-pickaxe'),
  true
)
where progress_row.recipe_id='all-in-pickaxe'
  and progress_row.progress ? '_equipment_recipe';

update public.player_equipment
set luck_bonus=499,
    roll_speed_bonus=-0.67,
    mutation_chance_bonus=-0.85,
    weight_luck_bonus=-0.85,
    weight_multiplier_bonus=-0.85
where equipment_id='all-in-pickaxe';

commit;
