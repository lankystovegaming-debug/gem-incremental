-- Debuff loot-box loot: real (un-inflated) gem base weights, potions
-- cut from x2 to x1, fewer inventory slots, cash jackpots cut ~75%, and
-- the best rewards made rarer. Only the pool is replaced; each box keeps
-- its name, coin cost and blurb.

update public.game_loot_boxes set box = jsonb_set(box, '{pool}', $$[
  {"type":"gem","label":"Amethyst","gem":"Amethyst","rarity":50,"base_weight":250,"value_per_gram":0.253,"weight":34},
  {"type":"gem","label":"Peridot","gem":"Peridot","rarity":100,"base_weight":300,"value_per_gram":0.36455,"weight":26},
  {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":325,"value_per_gram":0.47725,"weight":20},
  {"type":"potion","label":"Lucky Potion III","consumable_id":"lucky-potion-3","quantity":1,"weight":10},
  {"type":"slots","label":"+2 inventory slots","slots":2,"weight":6},
  {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":500,"value_per_gram":2.1505,"weight":3},
  {"type":"money","label":"$100,000 cash","amount":100000,"weight":1}
]$$::jsonb) where id = 'prospectors-chest';

update public.game_loot_boxes set box = jsonb_set(box, '{pool}', $$[
  {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":325,"value_per_gram":0.47725,"weight":28},
  {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":475,"value_per_gram":1.7487475,"weight":22},
  {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":500,"value_per_gram":2.1505,"weight":18},
  {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":550,"value_per_gram":3.28831,"weight":13},
  {"type":"potion","label":"Legendary Potion","consumable_id":"legendary-potion","quantity":1,"weight":9},
  {"type":"slots","label":"+4 inventory slots","slots":4,"weight":6},
  {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":1550,"value_per_gram":61.2,"weight":3},
  {"type":"money","label":"$600,000 cash","amount":600000,"weight":0.5}
]$$::jsonb) where id = 'cosmic-vault';

update public.game_loot_boxes set box = jsonb_set(box, '{pool}', $$[
  {"type":"gem","label":"Emerald","gem":"Emerald","rarity":1800,"base_weight":525,"value_per_gram":2.6069925,"weight":22},
  {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":550,"value_per_gram":3.28831,"weight":20},
  {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":475,"value_per_gram":1.7487475,"weight":16},
  {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":500,"value_per_gram":2.1505,"weight":13},
  {"type":"slots","label":"+8 inventory slots","slots":8,"weight":8},
  {"type":"potion","label":"Legendary Potion","consumable_id":"legendary-potion","quantity":1,"weight":8},
  {"type":"potion","label":"Mythic Potion","consumable_id":"mythic-potion","quantity":1,"weight":5},
  {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":1550,"value_per_gram":61.2,"weight":5},
  {"type":"gem","label":"Singularity Shard","gem":"Singularity Shard","rarity":4000000,"base_weight":1200,"value_per_gram":378,"weight":2},
  {"type":"money","label":"$2,000,000 cash","amount":2000000,"weight":0.25}
]$$::jsonb) where id = 'celestial-cache';
