-- Pickaxe enchanting fields on player_equipment.
--
-- enchant_id    — which enchant is applied (nullable)
-- enchant_grade — 'normal' or 'ancient' (nullable)
-- enchant_state — per-roll counters/timers for the enchant (default {})
--
-- Assigned by the enchant-equipment function and advanced by the roll
-- function, both service_role. Players read them via the existing
-- player_equipment RLS select policy.
alter table public.player_equipment
  add column if not exists enchant_id text,
  add column if not exists enchant_grade text,
  add column if not exists enchant_state jsonb not null default '{}'::jsonb;
