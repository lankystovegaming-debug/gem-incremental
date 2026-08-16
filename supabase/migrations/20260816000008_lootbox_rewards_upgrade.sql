-- =========================================================
-- Loot box reward upgrade.
--
-- Every box now pays out a little more often in premium rewards and
-- gives stronger versions of those rewards. The UI reads these tables
-- directly, so the displayed drop rates update with the server roll.
-- =========================================================

insert into public.game_loot_boxes (id, box, sort) values
('prospectors-chest', $$
{
  "id":"prospectors-chest","name":"Prospector's Chest","coin_cost":1,
  "blurb":"A generous starter chest with better cash, gems and double potions.",
  "pool":[
    {"type":"gem","label":"Amethyst","gem":"Amethyst","rarity":50,"base_weight":300,"value_per_gram":0.253,"weight":22},
    {"type":"gem","label":"Peridot","gem":"Peridot","rarity":100,"base_weight":375,"value_per_gram":0.36455,"weight":20},
    {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":425,"value_per_gram":0.47725,"weight":20},
    {"type":"money","label":"$150,000","amount":150000,"weight":18},
    {"type":"potion","label":"Lucky Potion III ×2","consumable_id":"lucky-potion-3","quantity":2,"weight":12},
    {"type":"slots","label":"+3 inventory slots","slots":3,"weight":5},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":650,"value_per_gram":2.53,"weight":3}
  ]
}
$$::jsonb, 1),
('cosmic-vault', $$
{
  "id":"cosmic-vault","name":"Cosmic Vault","coin_cost":3,
  "blurb":"Premium gems, richer cash drops and double Legendary Potions.",
  "pool":[
    {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":425,"value_per_gram":0.47725,"weight":20},
    {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":600,"value_per_gram":2.05735,"weight":20},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":650,"value_per_gram":2.53,"weight":17},
    {"type":"money","label":"$750,000","amount":750000,"weight":18},
    {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":700,"value_per_gram":3.8686,"weight":11},
    {"type":"slots","label":"+8 inventory slots","slots":8,"weight":7},
    {"type":"potion","label":"Legendary Potion ×2","consumable_id":"legendary-potion","quantity":2,"weight":5},
    {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":2000,"value_per_gram":76.5,"weight":2}
  ]
}
$$::jsonb, 2),
('celestial-cache', $$
{
  "id":"celestial-cache","name":"Celestial Cache","coin_cost":10,
  "blurb":"A top-tier cache with huge payouts and much better Mythic and Singularity odds.",
  "pool":[
    {"type":"gem","label":"Emerald","gem":"Emerald","rarity":1800,"base_weight":700,"value_per_gram":3.06705,"weight":18},
    {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":800,"value_per_gram":3.8686,"weight":17},
    {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":650,"value_per_gram":2.05735,"weight":13},
    {"type":"money","label":"$2,000,000","amount":2000000,"weight":17},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":750,"value_per_gram":2.53,"weight":10},
    {"type":"slots","label":"+15 inventory slots","slots":15,"weight":8},
    {"type":"potion","label":"Legendary Potion ×2","consumable_id":"legendary-potion","quantity":2,"weight":5},
    {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":2400,"value_per_gram":76.5,"weight":3},
    {"type":"potion","label":"Mythic Potion ×2","consumable_id":"mythic-potion","quantity":2,"weight":6},
    {"type":"gem","label":"Singularity Shard","gem":"Singularity Shard","rarity":4000000,"base_weight":5000,"value_per_gram":472.5,"weight":3}
  ]
}
$$::jsonb, 3)
on conflict (id) do update set box = excluded.box, sort = excluded.sort;
