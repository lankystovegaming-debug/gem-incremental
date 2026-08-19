-- =========================================================
-- Expansion Feature Lab v2
--
-- Seven additional, non-PvP-heavy systems. Every system is seeded OFF.
-- Definitions are intentionally JSONB-backed so the Upcoming Features
-- workspace can add arbitrary stats, costs, effects, loot and metadata
-- without another migration.
-- =========================================================

create table if not exists public.expansion_feature_definitions (
  id uuid primary key default gen_random_uuid(),
  feature_type text not null,
  name text not null,
  description text not null default '',
  enabled boolean not null default false,
  permanent boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(feature_type, name)
);

create index if not exists expansion_feature_type_idx
  on public.expansion_feature_definitions(feature_type, enabled, sort_order);

alter table public.expansion_feature_definitions enable row level security;
revoke all on public.expansion_feature_definitions from anon, authenticated;
grant select on public.expansion_feature_definitions to service_role;
grant all on public.expansion_feature_definitions to service_role;

-- Player state is kept generic for future activation. No public writes.
create table if not exists public.player_expansion_feature_state (
  player_id uuid not null references public.players(id) on delete cascade,
  feature_type text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(player_id, feature_type)
);

alter table public.player_expansion_feature_state enable row level security;
revoke all on public.player_expansion_feature_state from anon, authenticated;
grant all on public.player_expansion_feature_state to service_role;

-- Site switches: all new systems are OFF.
insert into public.game_section_settings
  (id,label,short_label,icon,description,enabled,sort_order)
values
 ('artifact-archives','Artifact Archives','Artifacts','◈','Collect, upgrade, socket and salvage customizable artifacts.',false,140),
 ('gem-fusion','Gem Fusion Lab','Fusion','✧','Combine gems through customizable recipes, catalysts and outcomes.',false,150),
 ('enchanting-lab','Enchanting Lab','Enchant','✦','Build enchantment blueprints with custom gem costs and equipment effects.',false,160),
 ('collection-hall','Collection Hall','Collections','▦','Long-term collection sets with milestones, bonuses and rewards.',false,170),
 ('mining-events','Mining Events','Events','⛏','Timed mining phenomena with spawn rules, boosts and custom loot.',false,180),
 ('merchant-caravan','Merchant Caravan','Caravan','◇','Rotating merchants with custom inventories, prices and currencies.',false,190),
 ('research-tree','Research Tree','Research','⌬','Branching research nodes with costs, prerequisites and permanent effects.',false,200)
on conflict(id) do nothing;

-- Seed one disabled definition per system. These are examples, not live content.
insert into public.expansion_feature_definitions
  (feature_type,name,description,enabled,config,sort_order)
values
 ('artifact-archives','Astral Artifact Archive',
  'A disabled artifact catalogue template.',
  false,
  '{"slots":["core","lens","sigil"],"sets":[{"id":"starforged","name":"Starforged","pieces":3,"bonus":{"luck":0.15}}],"salvage":[{"type":"coins","amount":5}],"artifacts":[{"name":"Starforged Compass","rarity":"Legendary","slot":"core","stats":{"luck":0.35,"mutationLuck":0.1},"sockets":2}]}',
  10),
 ('gem-fusion','Prismatic Fusion Chamber',
  'A disabled gem fusion recipe library template.',
  false,
  '{"catalysts":[],"recipes":[{"name":"Prismatic Heart","inputs":[{"gem":"Amethyst","amount":3},{"gem":"Aquamarine","amount":2}],"successChance":0.25,"onSuccess":{"type":"gem","gemName":"Prismatic Heart"},"onFailure":{"type":"refund","percent":0.35}}]}',
  10),
 ('enchanting-lab','Runic Enchanting Bench',
  'A disabled equipment enchantment blueprint template.',
  false,
  '{"equipmentTypes":["pickaxe","bag","weapon","armor"],"effects":["vitalityPercent","attackPercent","attackSpeedPercent","luckPercent","mutationLuckPercent"],"blueprints":[{"name":"Astral Edge","requiredGems":[{"gem":"Sapphire","amount":2},{"gem":"Diamond","amount":1}],"effects":{"attackPercent":0.12,"attackSpeedPercent":0.05},"cost":{"coins":25}}]}',
  10),
 ('collection-hall','Hall of Endless Facets',
  'A disabled collection milestone template.',
  false,
  '{"sets":[{"id":"rare-spectrum","name":"Rare Spectrum","requirements":[{"type":"uniqueGemCount","amount":10},{"type":"rarityAtLeast","rarity":1000}],"rewards":[{"type":"coins","amount":100}],"bonus":{"luck":0.05}}]}',
  10),
 ('mining-events','Aether Storm',
  'A disabled timed mining event template.',
  false,
  '{"durationMinutes":30,"spawnWeight":1,"boosts":{"luck":0.2,"weightLuck":0.15,"mutationLuckMultiplier":1.5},"phases":[{"name":"Build-up","seconds":600,"multiplier":1},{"name":"Peak","seconds":900,"multiplier":2},{"name":"Fade","seconds":300,"multiplier":1.2}],"loot":[{"type":"coins","amount":20,"weight":50},{"type":"gem","gemName":"Aether Quartz","weight":5}]}',
  10),
 ('merchant-caravan','The Astral Caravan',
  'A disabled rotating merchant template.',
  false,
  '{"rotationHours":12,"currencies":["money","coins"],"merchants":[{"name":"The Facet Trader","inventory":[{"itemType":"potion","itemId":"legendary-potion","price":250,"currency":"coins","stock":2},{"itemType":"gem","itemId":"Moonstone","price":100000,"currency":"money","stock":1}]}]}',
  10),
 ('research-tree','The Celestial Research Array',
  'A disabled branching research tree template.',
  false,
  '{"nodes":[{"id":"ore-analysis","name":"Ore Analysis","cost":{"coins":25},"requires":[],"effects":{"luck":0.05}},{"id":"mutation-theory","name":"Mutation Theory","cost":{"coins":100},"requires":["ore-analysis"],"effects":{"mutationLuckMultiplier":1.1}},{"id":"weight-labs","name":"Weight Laboratories","cost":{"coins":250},"requires":["ore-analysis"],"effects":{"weightLuck":0.1}}]}',
  10)
on conflict(feature_type,name) do nothing;

-- Public pages only see enabled definitions through their Edge Function.
-- No direct table policy is granted to normal users.
