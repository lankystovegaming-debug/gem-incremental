-- T1-T15 pickaxe roll-speed curve and persistent Celestial resonance.
alter table public.players
  add column if not exists rarity_resonance integer not null default 0;

alter table public.players
  drop constraint if exists players_rarity_resonance_range;
alter table public.players
  add constraint players_rarity_resonance_range
  check (rarity_resonance between 0 and 100);

with speed(id, bonus) as (values
  ('crude-pickaxe', 0.05::numeric),
  ('reinforced-pickaxe', 0.10::numeric),
  ('polished-pickaxe', 0.20::numeric),
  ('refined-pickaxe', 0.30::numeric),
  ('masterwork-pickaxe', 0.45::numeric),
  ('mythic-pickaxe', 0.60::numeric),
  ('aether-pickaxe', 0.80::numeric),
  ('voidbreaker-pickaxe', 1.00::numeric),
  ('veteran-pickaxe', 1.15::numeric),
  ('ascendant-pickaxe', 1.30::numeric),
  ('eclipse-pickaxe', 1.40::numeric),
  ('singularity-pickaxe', 1.50::numeric),
  ('transcendent-pickaxe', 1.60::numeric)
)
update public.game_recipes r
set recipe = jsonb_set(r.recipe, '{reward,bonus,rollSpeed}', to_jsonb(speed.bonus), true)
from speed
where r.id = speed.id;

-- Existing owned pickaxes store their granted stats, so rebalance those too.
with speed(equipment_id, bonus) as (values
  ('crude-pickaxe', 0.05::double precision),
  ('reinforced-pickaxe', 0.10::double precision),
  ('polished-pickaxe', 0.20::double precision),
  ('refined-pickaxe', 0.30::double precision),
  ('masterwork-pickaxe', 0.45::double precision),
  ('mythic-pickaxe', 0.60::double precision),
  ('aether-pickaxe', 0.80::double precision),
  ('voidbreaker-pickaxe', 1.00::double precision),
  ('veteran-pickaxe', 1.15::double precision),
  ('ascendant-pickaxe', 1.30::double precision),
  ('eclipse-pickaxe', 1.40::double precision),
  ('singularity-pickaxe', 1.50::double precision),
  ('transcendent-pickaxe', 1.60::double precision)
)
update public.player_equipment e
set roll_speed_bonus = speed.bonus
from speed
where e.equipment_id = speed.equipment_id;

insert into public.game_recipes(id, recipe) values
('astral-pickaxe', '{"id":"astral-pickaxe","name":"Astral Pickaxe","category":"pickaxe","requirements":[{"type":"equipment","equipmentId":"transcendent-pickaxe"},{"type":"gem-count","gem":"Peridot","amount":750},{"type":"gem-count","gem":"Topaz","amount":500},{"type":"gem-count","gem":"Tourmaline","amount":250},{"type":"gem-count","gem":"Antimatter Crystal","amount":1},{"type":"lifetime-rolls","rolls":40000}],"moneyCost":50000000,"reward":{"id":"astral-pickaxe","name":"Astral Pickaxe","category":"pickaxe","tier":14,"bonus":{"luck":23,"rollSpeed":1.70}}}'::jsonb),
('celestial-pickaxe', '{"id":"celestial-pickaxe","name":"Celestial Pickaxe","category":"pickaxe","requirements":[{"type":"equipment","equipmentId":"astral-pickaxe"},{"type":"gem-count","gem":"Opal","amount":300},{"type":"gem-count","gem":"Zircon","amount":200},{"type":"gem-count","gem":"Moonstone","amount":150},{"type":"gem-count","gem":"Lunar Diamond","amount":1},{"type":"gem-count","gem":"Singularity Shard","amount":1},{"type":"lifetime-rolls","rolls":60000}],"moneyCost":125000000,"reward":{"id":"celestial-pickaxe","name":"Celestial Pickaxe","category":"pickaxe","tier":15,"bonus":{"luck":25,"rollSpeed":1.80}}}'::jsonb)
on conflict (id) do update set recipe = excluded.recipe;

