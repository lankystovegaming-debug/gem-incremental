-- =========================================================
-- Mutation Surge: replace the legacy admin_events_check1 rule
-- =========================================================
-- The old check constraint rejects the newer Mutation Surge row shape.
-- Remove only that legacy constraint and replace it with explicit rules
-- that describe the values supported by the current admin UI.

DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'admin_events'
      AND constraint_name = 'admin_events_check1'
      AND constraint_type = 'CHECK'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.admin_events DROP CONSTRAINT %I',
      constraint_record.constraint_name
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.admin_events') IS NOT NULL THEN
    ALTER TABLE public.admin_events
      DROP CONSTRAINT IF EXISTS admin_events_mutation_values_check;

    ALTER TABLE public.admin_events
      ADD CONSTRAINT admin_events_mutation_values_check
      CHECK (
        mutation_luck_bonus >= 0
        AND mutation_luck_multiplier > 0
      );

    ALTER TABLE public.admin_events
      DROP CONSTRAINT IF EXISTS admin_events_time_window_check;

    ALTER TABLE public.admin_events
      ADD CONSTRAINT admin_events_time_window_check
      CHECK (ends_at > starts_at);

    ALTER TABLE public.admin_events
      DROP CONSTRAINT IF EXISTS admin_events_modifier_values_check;

    ALTER TABLE public.admin_events
      ADD CONSTRAINT admin_events_modifier_values_check
      CHECK (
        luck_bonus >= 0
        AND roll_speed_bonus >= 0
        AND weight_luck_bonus >= 0
        AND weight_multiplier_bonus >= 0
        AND luck_multiplier > 0
        AND roll_speed_multiplier > 0
        AND weight_luck_multiplier > 0
        AND weight_multiplier_multiplier > 0
      );
  END IF;
END;
$$;

COMMENT ON CONSTRAINT admin_events_mutation_values_check ON public.admin_events IS
  'Mutation Surge bonus must be non-negative and its multiplier must be positive.';

COMMENT ON CONSTRAINT admin_events_time_window_check ON public.admin_events IS
  'Admin events must end after they start.';

COMMENT ON CONSTRAINT admin_events_modifier_values_check ON public.admin_events IS
  'Global event modifiers must be non-negative and their multipliers must be positive.';
