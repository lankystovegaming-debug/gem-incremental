-- =========================================================
-- Workbench rename + admin-only feature visibility
--
-- The public feature route is now /workbench/ and the Supabase
-- Edge Function slug is workbench. The underlying forge tables
-- remain unchanged so existing saved sessions/items are preserved.
-- =========================================================

alter table public.game_section_settings
  add column if not exists admin_only boolean not null default false;

-- Move the existing Forge section record to the Workbench id without
-- destroying its customized label, icon, sort order, or enabled state.
insert into public.game_section_settings
  (id, label, short_label, icon, description, enabled, sort_order, admin_only, updated_at)
select
  'workbench',
  coalesce(label, 'Workbench [BETA]'),
  coalesce(short_label, 'Workbench'),
  coalesce(icon, '⚒'),
  coalesce(description, 'Three-stage forging + top bar'),
  true,
  coalesce(sort_order, 120),
  true,
  now()
from public.game_section_settings
where id = 'forge'
on conflict (id) do update set
  label = excluded.label,
  short_label = excluded.short_label,
  icon = excluded.icon,
  description = excluded.description,
  enabled = true,
  admin_only = true,
  updated_at = now();

-- Fresh databases may not have had the old Forge row at all.
insert into public.game_section_settings
  (id, label, short_label, icon, description, enabled, sort_order, admin_only)
values
  ('workbench', 'Workbench [BETA]', 'Workbench', '⚒', 'Three-stage forging + top bar', true, 120, true)
on conflict (id) do update set
  admin_only = true,
  enabled = true,
  updated_at = now();

delete from public.game_section_settings where id = 'forge';

-- Individual achievements/quests can also be marked admin-only.
alter table public.private_feature_definitions
  add column if not exists admin_only boolean not null default false;

create index if not exists private_feature_definitions_admin_only_idx
  on public.private_feature_definitions(admin_only, enabled, sort_order);

-- Workbench is available for administrator testing, but never for ordinary users.
insert into public.forge_config (id, enabled, display_name, beta_label, icon, updated_at)
values (true, true, 'Workbench [BETA]', 'Workbench [BETA]', '⚒', now())
on conflict (id) do update set
  enabled = true,
  display_name = coalesce(nullif(public.forge_config.display_name, ''), 'Workbench [BETA]'),
  beta_label = coalesce(nullif(public.forge_config.beta_label, ''), 'Workbench [BETA]'),
  icon = coalesce(nullif(public.forge_config.icon, ''), '⚒'),
  updated_at = now();
