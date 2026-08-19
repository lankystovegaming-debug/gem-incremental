-- =========================================================
-- Admin / Upcoming overhaul
-- 3-part private feature lab, editable gem catalog, main-page
-- section switches, mutation-luck events, and audit-log privileges.
-- =========================================================

create table if not exists public.private_feature_gems (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  rarity numeric not null check (rarity > 0),
  base_weight numeric not null check (base_weight > 0),
  value_per_gram numeric not null check (value_per_gram >= 0),
  sort_order integer not null default 0,
  enabled boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.private_feature_gems enable row level security;
revoke all on public.private_feature_gems from anon, authenticated;
grant select, insert, update, delete on public.private_feature_gems to service_role;

insert into public.private_feature_gems
  (name, rarity, base_weight, value_per_gram, enabled, sort_order)
values
('Quartz', 2, 100, 0.0575, true, 0),
('Calcite', 3, 110, 0.0736, true, 1),
('Feldspar', 5, 125, 0.092, true, 2),
('Fluorite', 8, 140, 0.115, true, 3),
('Hematite', 12, 160, 0.13685, true, 4),
('Obsidian', 18, 180, 0.15985, true, 5),
('Agate', 25, 200, 0.184, true, 6),
('Jasper', 35, 225, 0.2093, true, 7),
('Amethyst', 50, 250, 0.253, true, 8),
('Garnet', 70, 275, 0.3013, true, 9),
('Peridot', 100, 300, 0.36455, true, 10),
('Topaz', 150, 325, 0.47725, true, 11),
('Aquamarine', 225, 350, 0.60835, true, 12),
('Tourmaline', 325, 375, 0.76705, true, 13),
('Opal', 475, 400, 1.035, true, 14),
('Zircon', 650, 425, 1.2719, true, 15),
('Spinel', 850, 450, 1.59735, true, 16),
('Sapphire', 1100, 475, 1.74875, true, 17),
('Ruby', 1400, 500, 2.1505, true, 18),
('Emerald', 1800, 525, 2.60699, true, 19),
('Diamond', 2300, 550, 3.28831, true, 20),
('Tanzanite', 2900, 575, 3.48479, true, 21),
('Alexandrite', 3600, 600, 4.31762, true, 22),
('Benitoite', 4400, 625, 4.692, true, 23),
('Red Beryl', 5300, 650, 5.4134, true, 24),
('Black Opal', 6300, 675, 6.22668, true, 25),
('Grandidierite', 7400, 700, 6.70272, true, 26),
('Taaffeite', 8500, 725, 7.41531, true, 27),
('Musgravite', 9300, 750, 7.82, true, 28),
('Painite', 10000, 800, 7.5, true, 29),
('Dark Matter', 1e+06, 2500, 160, true, 30),
('Citrine', 90, 290, 0.34, true, 31),
('Moonstone', 750, 440, 1.43, true, 32),
('Demantoid', 6800, 690, 6.46, true, 33),
('Jeremejevite', 14000, 850, 9, true, 34),
('Poudretteite', 22000, 925, 12, true, 35),
('Serendibite', 35000, 1000, 16.5, true, 36),
('Blue Garnet', 55000, 1100, 22.5, true, 37),
('Kyawthuite', 85000, 1200, 31.5, true, 38),
('Aether Quartz', 140000, 1350, 43.2, true, 39),
('Void Opal', 250000, 1550, 61.2, true, 40),
('Chronite', 480000, 1800, 90, true, 41),
('Neutron Crystal', 800000, 2200, 126, true, 42),
('Antimatter Crystal', 1.8e+06, 2900, 216, true, 43),
('Singularity Shard', 4e+06, 3600, 378, true, 44),
('Pezzottaite', 12000, 825, 8.5, true, 45),
('Clinohumite', 18000, 875, 10, true, 46),
('Tsavorite', 28000, 960, 14, true, 47),
('Paraíba Tourmaline', 45000, 1050, 19, true, 48),
('Red Diamond', 70000, 1150, 27, true, 49),
('Natural Moissanite', 110000, 1275, 36, true, 50),
('Black Diamond', 190000, 1450, 51, true, 51),
('Tugtupite', 350000, 1650, 74, true, 52),
('Meteorite Peridot', 620000, 1950, 105, true, 53),
('Ringwoodite', 900000, 2350, 145, true, 54),
('Pallasite Crystal', 1.3e+06, 2700, 185, true, 55),
('Lunar Diamond', 2.5e+06, 3100, 270, true, 56),
('Martian Opal', 6e+06, 4000, 420, true, 57),
('Ja-ore', 6.24203e+06, 90000, 20, true, 58),
('Presolar Moissanite', 8e+06, 4800, 560, true, 59),
('Lanky Gem', 1e+07, 40500, 111.111, true, 60),
('Heart of Xy', 1e+08, 6500, 2000, true, 61),
('Carmeltazite', 5e+07, 6000, 1250, true, 62)
on conflict (name) do nothing;

create index if not exists private_feature_gems_active_idx
  on public.private_feature_gems(enabled, starts_at, ends_at, sort_order);

create table if not exists public.game_section_settings (
  id text primary key,
  label text not null,
  description text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.game_section_settings enable row level security;
revoke all on public.game_section_settings from anon, authenticated;
grant select on public.game_section_settings to anon, authenticated;
grant select, insert, update, delete on public.game_section_settings to service_role;

insert into public.game_section_settings (id,label,description,enabled,sort_order)
values
 ('roll-stage','Roll Stage','The main gem rolling stage.',true,10),
 ('summary','Player Summary','Money, inventory and total roll summary.',true,20),
 ('automation','Automation','Auto-roll and auto-sell controls.',true,30),
 ('session-history','Session History','Recent rolls shown below the main stage.',true,40)
on conflict (id) do nothing;

alter table if exists public.admin_events
  add column if not exists mutation_luck_bonus numeric not null default 0,
  add column if not exists mutation_luck_multiplier numeric not null default 1;

create table if not exists public.admin_audit_log (
  id bigint generated by default as identity primary key,
  admin_id uuid not null references auth.users(id) on delete restrict,
  target_player_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log(created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;
grant usage, select on sequence public.admin_audit_log_id_seq to service_role;

drop policy if exists game_section_settings_public_read on public.game_section_settings;
create policy game_section_settings_public_read
  on public.game_section_settings
  for select
  to anon, authenticated
  using (true);