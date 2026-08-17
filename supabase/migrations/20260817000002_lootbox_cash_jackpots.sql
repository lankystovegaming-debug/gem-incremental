-- =========================================================
-- Loot box cash jackpots.
--
-- Coins are bought with in-game money only (100,000 per coin). Each
-- box has one explicitly shown cash jackpot worth substantially more
-- than its purchase price, but the chance stays small: 2%, 1%, and
-- 0.5% respectively. The expected cash-only return remains below the
-- price of a box, avoiding a new money-printing loop.
-- =========================================================

insert into public.game_loot_boxes (id, box, sort) values
('prospectors-chest', $$
{
  "id":"prospectors-chest","name":"Prospector's Chest","coin_cost":1,
  "blurb":"A 2% chance at a $3,000,000 cash jackpot, plus useful starter rewards.",
  "pool":[
    {"type":"gem","label":"Amethyst","gem":"Amethyst","rarity":50,"base_weight":300,"value_per_gram":0.253,"weight":26},
    {"type":"gem","label":"Peridot","gem":"Peridot","rarity":100,"base_weight":375,"value_per_gram":0.36455,"weight":23},
    {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":425,"value_per_gram":0.47725,"weight":20},
    {"type":"potion","label":"Lucky Potion III ×2","consumable_id":"lucky-potion-3","quantity":2,"weight":14},
    {"type":"slots","label":"+3 inventory slots","slots":3,"weight":10},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":650,"value_per_gram":2.53,"weight":5},
    {"type":"money","label":"$3,000,000 cash jackpot","amount":3000000,"weight":2}
  ]
}
$$::jsonb, 1),
('cosmic-vault', $$
{
  "id":"cosmic-vault","name":"Cosmic Vault","coin_cost":3,
  "blurb":"A 1% chance at a $20,000,000 cash jackpot, with premium rewards otherwise.",
  "pool":[
    {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":425,"value_per_gram":0.47725,"weight":23},
    {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":600,"value_per_gram":2.05735,"weight":21},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":650,"value_per_gram":2.53,"weight":18},
    {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":700,"value_per_gram":3.8686,"weight":15},
    {"type":"potion","label":"Legendary Potion ×2","consumable_id":"legendary-potion","quantity":2,"weight":11},
    {"type":"slots","label":"+8 inventory slots","slots":8,"weight":7},
    {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":2000,"value_per_gram":76.5,"weight":4},
    {"type":"money","label":"$20,000,000 cash jackpot","amount":20000000,"weight":1}
  ]
}
$$::jsonb, 2),
('celestial-cache', $$
{
  "id":"celestial-cache","name":"Celestial Cache","coin_cost":10,
  "blurb":"A 0.5% chance at a $100,000,000 cash jackpot, with elite rewards otherwise.",
  "pool":[
    {"type":"gem","label":"Emerald","gem":"Emerald","rarity":1800,"base_weight":700,"value_per_gram":3.06705,"weight":19},
    {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":800,"value_per_gram":3.8686,"weight":18},
    {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":650,"value_per_gram":2.05735,"weight":15},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":750,"value_per_gram":2.53,"weight":12},
    {"type":"slots","label":"+15 inventory slots","slots":15,"weight":9},
    {"type":"potion","label":"Legendary Potion ×2","consumable_id":"legendary-potion","quantity":2,"weight":10},
    {"type":"potion","label":"Mythic Potion ×2","consumable_id":"mythic-potion","quantity":2,"weight":7},
    {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":5000,"value_per_gram":76.5,"weight":6},
    {"type":"gem","label":"Singularity Shard","gem":"Singularity Shard","rarity":4000000,"base_weight":1000,"value_per_gram":472.5,"weight":3.5},
    {"type":"money","label":"$100,000,000 cash jackpot","amount":100000000,"weight":0.5}
  ]
}
$$::jsonb, 3)
on conflict (id) do update set box = excluded.box, sort = excluded.sort;
