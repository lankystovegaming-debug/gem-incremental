-- =========================================================
-- Loot box rebalance.
--   - remove Starter Crate
--   - Prospector's Chest -> 1 coin
--   - Cosmic Vault -> 3 coins
--   - add Celestial Cache (10 coins, top-tier)
-- =========================================================

delete from public.game_loot_boxes where id = 'starter-crate';

update public.game_loot_boxes
  set box = jsonb_set(box, '{coin_cost}', '1'::jsonb), sort = 1
  where id = 'prospectors-chest';

update public.game_loot_boxes
  set box = jsonb_set(box, '{coin_cost}', '3'::jsonb), sort = 2
  where id = 'cosmic-vault';

insert into public.game_loot_boxes (id, box, sort) values
('celestial-cache', $$
{
  "id":"celestial-cache","name":"Celestial Cache","coin_cost":10,
  "blurb":"Top-tier gems, huge cash and a real shot at a Singularity Shard.",
  "pool":[
    {"type":"gem","label":"Emerald","gem":"Emerald","rarity":1800,"base_weight":525,"value_per_gram":3.06705,"weight":22},
    {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":550,"value_per_gram":3.8686,"weight":20},
    {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":475,"value_per_gram":2.05735,"weight":15},
    {"type":"money","label":"$1,000,000","amount":1000000,"weight":13},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":500,"value_per_gram":2.53,"weight":12},
    {"type":"slots","label":"+10 inventory slots","slots":10,"weight":8},
    {"type":"potion","label":"Lucky Potion III","consumable_id":"lucky-potion-3","quantity":1,"weight":6},
    {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":1550,"value_per_gram":76.5,"weight":3},
    {"type":"gem","label":"Singularity Shard","gem":"Singularity Shard","rarity":4000000,"base_weight":3600,"value_per_gram":472.5,"weight":1}
  ]
}
$$::jsonb, 3)
on conflict (id) do update set box = excluded.box, sort = excluded.sort;
