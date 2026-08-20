-- =========================================================
-- Workbench runtime compatibility hotfix
--
-- Keeps the historical forge_* storage tables for compatibility,
-- while making the Workbench presentation/runtime columns explicit.
-- Safe to run after the previous Workbench migrations.
-- =========================================================

alter table public.forge_config
  add column if not exists display_name text not null default 'Workbench [BETA]',
  add column if not exists icon text not null default '⚒';

update public.forge_config
set display_name = coalesce(nullif(display_name, ''), nullif(beta_label, ''), 'Workbench [BETA]'),
    icon = coalesce(nullif(icon, ''), '⚒')
where id = true;

alter table public.game_section_settings
  add column if not exists admin_only boolean not null default false;

insert into public.game_section_settings
  (id, label, short_label, icon, description, enabled, sort_order, admin_only)
values
  (
    'workbench',
    'Workbench [BETA]',
    'Workbench',
    '⚒',
    'Three-stage precision forging for weapons and armor.',
    true,
    120,
    true
  )
on conflict (id) do update
set
  admin_only = true,
  label = coalesce(nullif(public.game_section_settings.label, ''), 'Workbench [BETA]'),
  short_label = coalesce(nullif(public.game_section_settings.short_label, ''), 'Workbench'),
  icon = coalesce(nullif(public.game_section_settings.icon, ''), '⚒'),
  updated_at = now();

delete from public.game_section_settings
where id = 'forge';

-- Helpful indexes for the admin-only Workbench runtime.
create index if not exists forge_sessions_player_status_idx
  on public.forge_sessions(player_id, status, updated_at desc);

create index if not exists forge_items_player_created_idx
  on public.forge_items(player_id, created_at desc);
