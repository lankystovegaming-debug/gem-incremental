-- =========================================================
-- Unreleased Expansion Features
--
-- Everything in this migration is seeded OFF.  Upcoming Features can
-- toggle the corresponding game_section_settings row when ready.
-- =========================================================

-- ---------------------------------------------------------
-- World Bosses
-- ---------------------------------------------------------
create table if not exists public.world_boss_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  enabled boolean not null default false,
  permanent boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  max_health numeric not null default 100000,
  attack numeric not null default 100,
  defense numeric not null default 0,
  enrage_at_percent numeric not null default 15,
  phase_data jsonb not null default '[]'::jsonb,
  attack_patterns jsonb not null default '[]'::jsonb,
  entry_requirements jsonb not null default '{}'::jsonb,
  loot jsonb not null default '[]'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.world_boss_runs (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references public.world_boss_definitions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  damage numeric not null default 0,
  attempts integer not null default 0,
  status text not null default 'active'
    check(status in ('active','defeated','expired','claimed')),
  contribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(boss_id, player_id)
);

create index if not exists world_boss_runs_boss_damage_idx
  on public.world_boss_runs(boss_id, damage desc);

alter table public.world_boss_definitions enable row level security;
alter table public.world_boss_runs enable row level security;
revoke all on public.world_boss_definitions, public.world_boss_runs from anon, authenticated;
grant all on public.world_boss_definitions, public.world_boss_runs to service_role;

insert into public.world_boss_definitions(
  name,description,max_health,attack,defense,enrage_at_percent,
  phase_data,attack_patterns,entry_requirements,loot,rewards,sort_order
)
values(
  'The Astral Devourer',
  'A colossal star-beast that changes attacks as its health collapses.',
  25000000, 1800, 250, 20,
  '[
    {"atPercent":100,"name":"Awakening","damageMultiplier":1,"speedMultiplier":1},
    {"atPercent":70,"name":"Starved","damageMultiplier":1.25,"speedMultiplier":1.1},
    {"atPercent":40,"name":"Collapse","damageMultiplier":1.7,"speedMultiplier":1.3},
    {"atPercent":20,"name":"Devouring Light","damageMultiplier":2.4,"speedMultiplier":1.6}
  ]'::jsonb,
  '[
    {"id":"starfall","name":"Starfall","damageMultiplier":1.0,"telegraph":1200,"cooldown":2.4},
    {"id":"gravity-crush","name":"Gravity Crush","damageMultiplier":1.8,"telegraph":1800,"cooldown":5.0},
    {"id":"void-roar","name":"Void Roar","damageMultiplier":2.4,"telegraph":2400,"cooldown":8.0}
  ]'::jsonb,
  '{"minimumRarity":1000}'::jsonb,
  '[
    {"type":"coins","amount":50,"chance":60},
    {"type":"money","amount":1000000,"chance":25},
    {"type":"gem","gemName":"Void Opal","chance":12},
    {"type":"custom","id":"devourer-core","label":"Devourer Core","chance":3}
  ]'::jsonb,
  '{"participationXp":250,"top1":{"coins":250},"top10":{"coins":75}}'::jsonb,
  10
)
on conflict(name) do nothing;

-- ---------------------------------------------------------
-- Relic Vault
-- ---------------------------------------------------------
create table if not exists public.relic_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  enabled boolean not null default false,
  rarity text not null default 'Rare',
  slot text not null default 'core',
  passive_stats jsonb not null default '{}'::jsonb,
  socket_count integer not null default 0,
  socket_rules jsonb not null default '{}'::jsonb,
  set_id text,
  acquisition_rules jsonb not null default '{}'::jsonb,
  salvage_rewards jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_relics (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  relic_id uuid not null references public.relic_definitions(id) on delete cascade,
  level integer not null default 1,
  experience numeric not null default 0,
  equipped boolean not null default false,
  sockets jsonb not null default '[]'::jsonb,
  rolled_stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_relics_player_idx
  on public.player_relics(player_id, equipped);

alter table public.relic_definitions enable row level security;
alter table public.player_relics enable row level security;
revoke all on public.relic_definitions, public.player_relics from anon, authenticated;
grant all on public.relic_definitions, public.player_relics to service_role;

insert into public.relic_definitions(
  name,description,rarity,slot,passive_stats,socket_count,socket_rules,set_id,acquisition_rules,salvage_rewards,sort_order
)
values(
  'Starforged Compass',
  'A relic that bends expedition luck toward rare outcomes.',
  'Legendary',
  'core',
  '{"luck":0.35,"weightLuck":0.2,"mutationLuck":0.1}'::jsonb,
  2,
  '{"allowedGemRarityGte":1000,"maxSockets":2}'::jsonb,
  'starforged',
  '{"source":"world_boss","boss":"The Astral Devourer"}'::jsonb,
  '{"coins":15}'::jsonb,
  10
)
on conflict(name) do nothing;

-- ---------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------
create table if not exists public.season_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  xp_per_roll numeric not null default 1,
  tier_xp numeric not null default 1000,
  tiers jsonb not null default '[]'::jsonb,
  challenges jsonb not null default '[]'::jsonb,
  modifiers jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_seasons (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season_definitions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  xp numeric not null default 0,
  claimed_tiers jsonb not null default '[]'::jsonb,
  challenge_progress jsonb not null default '{}'::jsonb,
  premium boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(season_id, player_id)
);

alter table public.season_definitions enable row level security;
alter table public.player_seasons enable row level security;
revoke all on public.season_definitions, public.player_seasons from anon, authenticated;
grant all on public.season_definitions, public.player_seasons to service_role;

insert into public.season_definitions(
  name,description,xp_per_roll,tier_xp,tiers,challenges,modifiers
)
values(
  'Season Zero — First Light',
  'The first experimental season track.',
  1,1000,
  '[
    {"tier":1,"xp":0,"free":[{"type":"coins","amount":5}],"premium":[{"type":"coins","amount":15}]},
    {"tier":2,"xp":1000,"free":[{"type":"potion","id":"lucky-potion-1","amount":1}],"premium":[{"type":"coins","amount":30}]},
    {"tier":3,"xp":2000,"free":[{"type":"money","amount":25000}],"premium":[{"type":"potion","id":"legendary-potion","amount":1}]}
  ]'::jsonb,
  '[
    {"id":"rolls","name":"Momentum","requirement":{"type":"rolls","amount":250},"xp":500},
    {"id":"rare","name":"Rare Air","requirement":{"type":"count","amount":10,"match":{"gemRarityGte":1000}},"xp":1000},
    {"id":"mutation","name":"Altered Matter","requirement":{"type":"count","amount":3,"match":{"mutationCountGte":1}},"xp":1500}
  ]'::jsonb,
  '{"luckBonus":0,"mutationLuckMultiplier":1}'::jsonb
)
on conflict(name) do nothing;

-- ---------------------------------------------------------
-- Bounty Board
-- ---------------------------------------------------------
create table if not exists public.bounty_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  enabled boolean not null default false,
  permanent boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  requirements jsonb not null default '{}'::jsonb,
  rewards jsonb not null default '[]'::jsonb,
  target_type text not null default 'global'
    check(target_type in ('global','self','guild','gem','player')),
  max_claims integer not null default 1,
  claims integer not null default 0,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bounty_claims (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounty_definitions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  claimed boolean not null default false,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(bounty_id, player_id)
);

alter table public.bounty_definitions enable row level security;
alter table public.bounty_claims enable row level security;
revoke all on public.bounty_definitions, public.bounty_claims from anon, authenticated;
grant all on public.bounty_definitions, public.bounty_claims to service_role;

insert into public.bounty_definitions(
  name,description,requirements,rewards,target_type,max_claims,sort_order
)
values(
  'The Green Signal',
  'Find a Ja-ore or better before the bounty expires.',
  '{"single":{"gemName":"Ja-ore","gemRarityGte":6242026}}'::jsonb,
  '[{"type":"coins","amount":100},{"type":"money","amount":500000}]'::jsonb,
  'gem',1,10
);

-- ---------------------------------------------------------
-- Treasure Expeditions
-- ---------------------------------------------------------
create table if not exists public.treasure_expedition_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  enabled boolean not null default false,
  duration_seconds integer not null default 3600,
  entry_requirements jsonb not null default '{}'::jsonb,
  nodes jsonb not null default '[]'::jsonb,
  outcomes jsonb not null default '[]'::jsonb,
  boosts jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_treasure_expeditions (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references public.treasure_expedition_definitions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  state text not null default 'running'
    check(state in ('running','ready','claimed','cancelled')),
  current_node integer not null default 0,
  path jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finishes_at timestamptz not null,
  result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.treasure_expedition_definitions enable row level security;
alter table public.player_treasure_expeditions enable row level security;
revoke all on public.treasure_expedition_definitions, public.player_treasure_expeditions from anon, authenticated;
grant all on public.treasure_expedition_definitions, public.player_treasure_expeditions to service_role;

insert into public.treasure_expedition_definitions(
  name,description,duration_seconds,entry_requirements,nodes,outcomes,boosts,sort_order
)
values(
  'Sunset Ruins',
  'Choose a route through a ruined sky-city for increasingly risky rewards.',
  1800,
  '{"minimumRarity":100}'::jsonb,
  '[
    {"id":"gate","name":"Broken Gate","choices":[{"id":"left","risk":0.1,"multiplier":1.0},{"id":"right","risk":0.25,"multiplier":1.5}]},
    {"id":"archive","name":"Aether Archive","choices":[{"id":"search","risk":0.2,"multiplier":1.8},{"id":"leave","risk":0.02,"multiplier":1.1}]},
    {"id":"vault","name":"Final Vault","choices":[{"id":"open","risk":0.45,"multiplier":3.5},{"id":"seal","risk":0.05,"multiplier":1.4}]}
  ]'::jsonb,
  '[
    {"type":"coins","amount":25,"weight":40},
    {"type":"money","amount":250000,"weight":35},
    {"type":"potion","id":"lucky-potion-1","amount":2,"weight":20},
    {"type":"custom","id":"sunset-relic","weight":5}
  ]'::jsonb,
  '{"luck":0.1,"weightLuck":0.15}'::jsonb,
  10
)
on conflict(name) do nothing;

-- ---------------------------------------------------------
-- Site visibility switches
-- ---------------------------------------------------------
insert into public.game_section_settings(
  id,label,short_label,icon,description,enabled,sort_order
)
values
 ('world-bosses','World Bosses','Bosses','☄','Server-wide bosses with phases, damage races and custom loot.',false,90),
 ('relic-vault','Relic Vault','Relics','◈','Equipable relics with passive stats, sockets and sets.',false,100),
 ('seasons','Seasons','Season','✦','XP tracks, tiers, challenges and seasonal modifiers.',false,110),
 ('bounties','Bounty Board','Bounties','⚑','Custom contracts with requirements, targets and rewards.',false,120),
 ('treasure-expeditions','Treasure Expeditions','Expeditions','◇','Branching expeditions with risk, choices and weighted outcomes.',false,130)
on conflict(id) do nothing;

-- Helpful indexes.
create index if not exists bounty_claims_player_idx on public.bounty_claims(player_id, claimed);
create index if not exists player_seasons_player_idx on public.player_seasons(player_id, season_id);
create index if not exists player_treasure_expeditions_player_idx on public.player_treasure_expeditions(player_id, state);
