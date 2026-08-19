-- Mutation Surge event identity fix.
-- The existing admin_events schema requires created_by, so the admin Edge Function
-- must populate it from the authenticated administrator instead of inserting NULL.

DO $$
BEGIN
  IF to_regclass('public.admin_events') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_events TO service_role;
    ALTER TABLE public.admin_events NO FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

COMMENT ON COLUMN public.admin_events.created_by IS
  'Administrator auth.users UUID that created the event.';
