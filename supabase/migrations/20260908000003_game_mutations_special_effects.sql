-- ============================================================
-- GAME MUTATIONS: EXPANDED CATALOG + TEMPORARY MUTATION EFFECTS
-- ============================================================
-- Adds the requested mutations and server-authoritative state used by:
--   Misty     -> ×2.5 mutation chance for next 10 rolls, stacks/refreshes
--   Ancient   -> ×1.3 Ancient Relic chance for next 3 rolls
--   Enchanted -> ×1.1 chance for all relics for next 5 rolls
-- Safe to run once on an existing production database.

alter table public.players
  add column if not exists misty_mutation_boost_rolls integer not null default 0,
  add column if not exists misty_mutation_boost_stacks integer not null default 0,
  add column if not exists ancient_relic_boost_rolls integer not null default 0,
  add column if not exists enchanted_relic_boost_rolls integer not null default 0;

alter table public.players
  drop constraint if exists players_misty_mutation_boost_rolls_nonnegative,
  drop constraint if exists players_misty_mutation_boost_stacks_nonnegative,
  drop constraint if exists players_ancient_relic_boost_rolls_nonnegative,
  drop constraint if exists players_enchanted_relic_boost_rolls_nonnegative;

alter table public.players
  add constraint players_misty_mutation_boost_rolls_nonnegative check (misty_mutation_boost_rolls >= 0),
  add constraint players_misty_mutation_boost_stacks_nonnegative check (misty_mutation_boost_stacks >= 0),
  add constraint players_ancient_relic_boost_rolls_nonnegative check (ancient_relic_boost_rolls >= 0),
  add constraint players_enchanted_relic_boost_rolls_nonnegative check (enchanted_relic_boost_rolls >= 0);

-- Balance notes:
-- * Withered/Blazing were raised from ×70 to ×320 so their ~1 in 1.05m
--   rarity fits between the existing ~1m ×250-400 mutations.
-- * Lanked was adjusted slightly to ×750 for its 1 in 3m rarity.
-- * "67" and Aether are marked as easy future rebalance targets by editing
--   only these catalog values; the roll worker reads this table live.

insert into public.game_mutations
  (id,name,chance,multiplier,description,icon,color,enabled,sort_order,updated_at)
values
  ('soulbound','Soulbound',1050000,305,'This gem has been locked to a soul on Earth. Once the soul dies it will explode and lock to another soul.','🫁','#ff79b0',true,260,now()),
  ('heated','Heated',33000,28,'This gem has been forever heated in its core and may burn you slightly if you touch it.','🔥','#ff8a24',true,261,now()),
  ('discombobulated','Discombobulated',121000,56,'This gem''s shape has been severely mutated, different for all Discombobulated gems.','😵‍💫','#ffd83d',true,262,now()),
  ('kawaii','Kawaii',77000,41,'This gem has been in Japan for ONE second and is already feeling kawaii.','💝','#ff8fc4',true,263,now()),
  ('edible','Edible',79000,43,'This gem can be somewhat eaten, although the taste might be horrible.','🎂','#ffd83d',true,264,now()),
  ('lanked','Lanked',3000000,750,'This gem has been blessed by lanky.','👒','#f4d03f',true,265,now()),
  ('translucent','Translucent',70777,38,'A translucent gem, kind of like a window but foggy.','🪟','#f7f7ff',true,266,now()),
  ('acidic','Acidic',223000,70,'It''s both sour and can dissolve stuff!','🍋‍🟩','#72e36b',true,267,now()),
  ('chaotic','Chaotic',34000,23.5,'A rare form of gem that even reality failed to make sense of. Mutated beyond compare, this gem is now a shell of what it once was.','🫟','#a855f7',true,268,now()),
  ('aurora','Aurora',555000,110,'The magnificent aurora borealis was witnessed by this gem ages ago.','🌌','#9b6cff',true,269,now()),
  ('withered','Withered',1050000,320,'Within shadowy depths is the isolated domain of this gem, altered by phenomenal circumstances.','🥀','#66606d',true,270,now()),
  ('blazing','Blazing',1050000,320,'This gem holds the heated core of the sun itself.','☀️','#ff5b24',true,271,now()),
  ('aether','Aether',1000000000,1500,'Who designed this…','✨','#c9b6ff',true,272,now()),
  ('sixty_seven','67',676767,135,'67.','6️⃣','#ffcf5c',true,273,now()),
  ('moldy','Moldy',1000,2.75,'After being left in the dark and in a humid place, mould started growing on it.','🌱','#55c96b',true,274,now()),
  ('habitable','Habitable',4000,6,'A whole ecosystem is living inside the gem somehow!','🥬','#74c365',true,275,now()),
  ('carved','Carved',160000,61,'This gem has been carved somewhere in the gem by the gods with a message to the world.','💬','#f3f4f6',true,276,now()),
  ('cosmic','Cosmic',276000,77,'A cosmic event happened near the gem and was so powerful it mutated everything around it.','🌌','#9c6bff',true,277,now()),
  ('mysterious','Mysterious',177000,64.5,'It was only a few days ago that this gem had been found, like it had been invisible until this point.','👤','#9a7bff',true,278,now()),
  ('lit','Lit',5300,8.5,'This gem could be like a lantern, but not with powers like the ones we have.','💡','#ffe45c',true,279,now()),
  ('amalgamated','Amalgamated',12345,13.7,'After multiple rare events happened, it formed an amalgamation.','🕸️','#62d77b',true,280,now()),
  ('misty','Misty',5000,7,'The gem''s surface is smooth to the touch, yet it seems to hold many secrets. Grants ×2.5 mutation chance for the next 10 rolls; stacks and refreshes if another Misty gem is pulled.','🌫️','#bfe9ff',true,281,now()),
  ('ancient','Ancient',123450,56,'One of the first gems formed. Grants ×1.3 Ancient Relic chance for the next 3 rolls.','🏚️','#8aa57b',true,282,now()),
  ('enchanted','Enchanted',5250,9.5,'Was enchanted naturally with a relic. Grants ×1.1 chance for all relics for the next 5 rolls.','📖','#ff86c8',true,283,now())
on conflict (id) do update set
  name = excluded.name,
  chance = excluded.chance,
  multiplier = excluded.multiplier,
  description = excluded.description,
  icon = excluded.icon,
  color = excluded.color,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Reload PostgREST so direct catalog/RPC consumers immediately see the schema.
notify pgrst, 'reload schema';
