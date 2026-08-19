-- =========================================================
-- Islands + Forge [BETA] + Dungeons (disabled by default)
-- Everything is service-role managed from Upcoming Features.
-- =========================================================

create table if not exists public.island_definitions (
  id uuid primary key default gen_random_uuid(),
  island_number integer not null unique,
  name text not null,
  description text not null default '',
  enabled boolean not null default false,
  permanent boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  unlock_requirements jsonb not null default '{}'::jsonb,
  boosts jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_island_progress (
  player_id uuid not null references public.players(id) on delete cascade,
  island_id uuid not null references public.island_definitions(id) on delete cascade,
  unlocked boolean not null default false,
  unlocked_at timestamptz,
  primary key(player_id,island_id)
);

create table if not exists public.forge_config (
  id boolean primary key default true,
  enabled boolean not null default false,
  beta_label text not null default 'The Forge [BETA]',
  min_materials integer not null default 3,
  max_materials integer not null default 50,
  stage_time_seconds numeric not null default 8,
  quality_broken numeric not null default 0.65,
  quality_poor numeric not null default 0.8,
  quality_average numeric not null default 1,
  quality_good numeric not null default 1.1,
  quality_excellent numeric not null default 1.2,
  quality_masterwork numeric not null default 1.3,
  trait_threshold_minor numeric not null default 0.10,
  trait_threshold_full numeric not null default 0.30,
  ore_count_rules jsonb not null default '{"weapon":[{"min":3,"max":6,"class":"Dagger"},{"min":7,"max":14,"class":"Sword"},{"min":15,"max":29,"class":"Great Sword"},{"min":30,"max":9999,"class":"Colossal Sword"}],"armor":[{"min":3,"max":9,"class":"Light Helmet"},{"min":10,"max":19,"class":"Medium Helmet"},{"min":20,"max":9999,"class":"Heavy Helmet"}]}'::jsonb,
  trait_rules jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.forge_config(id) values(true) on conflict(id) do nothing;

create table if not exists public.forge_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  item_type text not null check(item_type in ('weapon','armor')),
  material_ids uuid[] not null,
  material_summary jsonb not null default '[]'::jsonb,
  stage integer not null default 1,
  stage_scores numeric[] not null default '{}',
  quality numeric not null default 1,
  result jsonb,
  status text not null default 'active' check(status in ('active','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_items (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  item_type text not null check(item_type in ('weapon','armor')),
  item_name text not null,
  rarity text not null default 'Common',
  quality numeric not null default 1,
  ore_count integer not null,
  multiplier numeric not null default 1,
  stats jsonb not null default '{}'::jsonb,
  traits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dungeon_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  enabled boolean not null default false,
  permanent boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  max_enemies integer not null default 5,
  entry_requirements jsonb not null default '{}'::jsonb,
  loot jsonb not null default '[]'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dungeon_enemies (
  id uuid primary key default gen_random_uuid(),
  dungeon_id uuid not null references public.dungeon_definitions(id) on delete cascade,
  name text not null,
  max_health numeric not null default 100,
  attack numeric not null default 10,
  defense numeric not null default 0,
  speed numeric not null default 1,
  crit_chance numeric not null default 0,
  stats jsonb not null default '{}'::jsonb,
  loot jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dungeon_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  dungeon_id uuid not null references public.dungeon_definitions(id) on delete cascade,
  enemy_ids uuid[] not null default '{}',
  enemy_index integer not null default 1,
  enemy_health numeric not null default 0,
  player_health numeric not null default 100,
  status text not null default 'active' check(status in ('active','won','lost','claimed')),
  loot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists island_enabled_idx on public.island_definitions(enabled,sort_order);
create index if not exists dungeon_enabled_idx on public.dungeon_definitions(enabled,sort_order);
create index if not exists dungeon_enemy_idx on public.dungeon_enemies(dungeon_id,sort_order);
create index if not exists dungeon_runs_player_idx on public.dungeon_runs(player_id,status);

alter table public.island_definitions enable row level security;
alter table public.player_island_progress enable row level security;
alter table public.forge_config enable row level security;
alter table public.forge_sessions enable row level security;
alter table public.forge_items enable row level security;
alter table public.dungeon_definitions enable row level security;
alter table public.dungeon_enemies enable row level security;
alter table public.dungeon_runs enable row level security;

revoke all on public.island_definitions,public.player_island_progress,public.forge_config,public.forge_sessions,public.forge_items,public.dungeon_definitions,public.dungeon_enemies,public.dungeon_runs from anon,authenticated;
grant select on public.island_definitions,public.dungeon_definitions to anon,authenticated;
grant all on public.island_definitions,public.player_island_progress,public.forge_config,public.forge_sessions,public.forge_items,public.dungeon_definitions,public.dungeon_enemies,public.dungeon_runs to service_role;

insert into public.island_definitions(island_number,name,description,enabled,unlock_requirements,boosts,sort_order)
values
(1,'Home Island','Your starting island. The heart of the game.',false,'{}','{}',10),
(2,'Crystal Frontier','A dangerous new island unlocked through equipment progression.',false,'{"minAllEquipmentTier":5}','{"money":1.1,"coins":1.1,"gems":1.1}',20),
(3,'Astral Expanse','A high-tier island for advanced players.',false,'{"minAllEquipmentTier":11}','{"money":1.25,"coins":1.25,"gems":1.25}',30)
on conflict(island_number) do nothing;

insert into public.dungeon_definitions(name,description,enabled,max_enemies,entry_requirements,loot,rewards,sort_order)
values
('The Shattered Cavern','A starter combat dungeon. Fully customizable from Upcoming Features.',false,5,'{}','[]','{}',10)
on conflict(name) do nothing;

insert into public.game_section_settings(id,label,description,enabled,sort_order)
values
('islands','Islands','World islands, unlock requirements and currency boosts.',false,80),
('forge','The Forge [BETA]','Three-stage precision forging minigame for weapons and armor.',false,90),
('dungeons','Dungeons','Customizable enemies, combat and loot.',false,100)
on conflict(id) do nothing;

-- Public read policies are intentionally limited to definitions only.
drop policy if exists island_definitions_public_read on public.island_definitions;
create policy island_definitions_public_read on public.island_definitions for select to anon,authenticated using (enabled=true);

drop policy if exists dungeon_definitions_public_read on public.dungeon_definitions;
create policy dungeon_definitions_public_read on public.dungeon_definitions for select to anon,authenticated using (enabled=true);

-- Guild points can be awarded from the server-side roll path.
create or replace function public.record_guild_roll_points(p_player_id uuid, p_points bigint default 1)
returns jsonb language plpgsql security definer set search_path=public as $$
declare gid uuid; new_points bigint;
begin
 select guild_id into gid from public.guild_members where player_id=p_player_id limit 1;
 if gid is null then return jsonb_build_object('guild',false,'points',0); end if;
 update public.guilds set points=points+greatest(1,coalesce(p_points,1)) where id=gid returning points into new_points;
 return jsonb_build_object('guild',true,'guildId',gid,'points',new_points);
end; $$;
revoke all on function public.record_guild_roll_points(uuid,bigint) from public;
grant execute on function public.record_guild_roll_points(uuid,bigint) to service_role;

-- Island player state helpers
alter table public.players add column if not exists current_island_id uuid references public.island_definitions(id) on delete set null;
alter table public.players add column if not exists max_equipment_tier integer not null default 0;
alter table public.players add column if not exists pickaxe_tier integer not null default 0;
alter table public.players add column if not exists bag_tier integer not null default 0;
