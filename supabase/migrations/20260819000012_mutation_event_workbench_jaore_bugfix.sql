-- =========================================================
-- Mutation Surge + Workbench reliability + JA-ore replay bugfixes
-- Safe to run after the existing admin/upcoming/forge migrations.
-- =========================================================

-- The admin Edge Function uses the service-role client. Some projects
-- inherited restrictive table grants, which caused mutation-event stop
-- to fail with: permission denied for table admin_events.
DO $$
BEGIN
  IF to_regclass('public.admin_events') IS NOT NULL THEN
    ALTER TABLE public.admin_events NO FORCE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_events TO service_role;
    ALTER TABLE public.admin_events
      ADD COLUMN IF NOT EXISTS mutation_luck_bonus numeric NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mutation_luck_multiplier numeric NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Make sure the Workbench config can always be read/written by the
-- service-role Edge Function even if an older migration used stricter grants.
DO $$
BEGIN
  IF to_regclass('public.forge_config') IS NOT NULL THEN
    ALTER TABLE public.forge_config NO FORCE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.forge_config TO service_role;
    INSERT INTO public.forge_config(id, enabled, beta_label, display_name, icon)
      VALUES (true, false, 'Workbench [BETA]', 'Workbench [BETA]', '⚒')
      ON CONFLICT (id) DO NOTHING;
  END IF;
  IF to_regclass('public.forge_sessions') IS NOT NULL THEN
    ALTER TABLE public.forge_sessions NO FORCE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.forge_sessions TO service_role;
  END IF;
  IF to_regclass('public.forge_items') IS NOT NULL THEN
    ALTER TABLE public.forge_items NO FORCE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.forge_items TO service_role;
  END IF;
END $$;

-- Keep the public section identity synchronized with the Workbench config.
UPDATE public.game_section_settings
SET label = COALESCE(NULLIF(label, 'The Forge [BETA]'), label),
    short_label = COALESCE(NULLIF(short_label, 'The Forge'), short_label),
    icon = COALESCE(NULLIF(icon, '◆'), icon),
    updated_at = now()
WHERE id = 'forge';

COMMENT ON TABLE public.admin_events IS 'Server-side admin events, including Mutation Surge mutation-luck modifiers.';
COMMENT ON TABLE public.forge_config IS 'Server-side Workbench configuration; managed through Upcoming Features.';
