-- =========================================================
-- Loot box potion upgrade — the old Fortune/Lucky I potions were
-- too weak. Prospector's -> Lucky Potion III, Cosmic Vault ->
-- Legendary Potion, Celestial Cache -> Legendary + a rare Mythic.
-- =========================================================

insert into public.game_loot_boxes (id, box, sort) values
('prospectors-chest', $$
{
  "id":"prospectors-chest","name":"Prospector's Chest","coin_cost":1,
  "blurb":"Better gems, cash and a proper potion.",
  "pool":[
    {"type":"gem","label":"Amethyst","gem":"Amethyst","rarity":50,"base_weight":250,"value_per_gram":0.253,"weight":28},
    {"type":"gem","label":"Peridot","gem":"Peridot","rarity":100,"base_weight":300,"value_per_gram":0.36455,"weight":22},
    {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":325,"value_per_gram":0.47725,"weight":18},
    {"type":"money","label":"$100,000","amount":100000,"weight":15},
    {"type":"potion","label":"Lucky Potion III","consumable_id":"lucky-potion-3","quantity":1,"weight":10},
    {"type":"slots","label":"+2 inventory slots","slots":2,"weight":5},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":500,"value_per_gram":2.53,"weight":2}
  ]
}
$$::jsonb, 1),
('cosmic-vault', $$
{
  "id":"cosmic-vault","name":"Cosmic Vault","coin_cost":3,
  "blurb":"Rare gems, a shot at the cosmos and a Legendary Potion.",
  "pool":[
    {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":325,"value_per_gram":0.47725,"weight":25},
    {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":475,"value_per_gram":2.05735,"weight":22},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":500,"value_per_gram":2.53,"weight":18},
    {"type":"money","label":"$500,000","amount":500000,"weight":15},
    {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":550,"value_per_gram":3.8686,"weight":10},
    {"type":"slots","label":"+5 inventory slots","slots":5,"weight":6},
    {"type":"potion","label":"Legendary Potion","consumable_id":"legendary-potion","quantity":1,"weight":3},
    {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":1550,"value_per_gram":76.5,"weight":1}
  ]
}
$$::jsonb, 2),
('celestial-cache', $$
{
  "id":"celestial-cache","name":"Celestial Cache","coin_cost":10,
  "blurb":"Top-tier gems, huge cash, and a shot at a Mythic Potion or Singularity Shard.",
  "pool":[
    {"type":"gem","label":"Emerald","gem":"Emerald","rarity":1800,"base_weight":525,"value_per_gram":3.06705,"weight":22},
    {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":550,"value_per_gram":3.8686,"weight":20},
    {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":475,"value_per_gram":2.05735,"weight":15},
    {"type":"money","label":"$1,000,000","amount":1000000,"weight":13},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":500,"value_per_gram":2.53,"weight":12},
    {"type":"slots","label":"+10 inventory slots","slots":10,"weight":8},
    {"type":"potion","label":"Legendary Potion","consumable_id":"legendary-potion","quantity":1,"weight":4},
    {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":1550,"value_per_gram":76.5,"weight":3},
    {"type":"potion","label":"Mythic Potion","consumable_id":"mythic-potion","quantity":1,"weight":2},
    {"type":"gem","label":"Singularity Shard","gem":"Singularity Shard","rarity":4000000,"base_weight":3600,"value_per_gram":472.5,"weight":1}
  ]
}
$$::jsonb, 3)
on conflict (id) do update set box = excluded.box, sort = excluded.sort;
