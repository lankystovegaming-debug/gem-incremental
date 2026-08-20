-- =========================================================
-- Sandbox mode [ADMIN ONLY]
--
-- Registers the Sandbox nav entry the same way Workbench is
-- registered: a game_section_settings row with admin_only = true.
-- The /features "sections" action (supabase/functions/features)
-- already filters admin_only rows server-side, so non-admins never
-- see the section in the nav even if the client were tampered with.
-- =========================================================

insert into public.game_section_settings
  (id, label, short_label, icon, description, enabled, sort_order, admin_only)
values
  (
    'sandbox',
    'Sandbox [BETA]',
    'Sandbox',
    '🧊',
    'A live 3D hangout — pinned showcase gems orbit your character on a shared baseplate.',
    true,
    130,
    true
  )
on conflict (id) do update
set
  admin_only = true,
  label = coalesce(nullif(public.game_section_settings.label, ''), 'Sandbox [BETA]'),
  short_label = coalesce(nullif(public.game_section_settings.short_label, ''), 'Sandbox'),
  icon = coalesce(nullif(public.game_section_settings.icon, ''), '🧊'),
  updated_at = now();
