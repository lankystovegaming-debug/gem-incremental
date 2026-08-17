-- =========================================================
-- Fix Legendary/Mythic one-roll potions.
--
-- player_one_roll_boosts was created granting service_role only
-- TRUNCATE/REFERENCES/TRIGGER — NOT select/insert/update/delete. The
-- roll edge function runs as service_role and needs to READ the pending
-- boost (to add its luck to the roll) and DELETE it (to consume it).
-- Without these grants both silently failed: the potion was never
-- applied and never consumed, so it sat "pending" forever and blocked
-- the player from using another one-roll potion.
-- =========================================================

grant select, insert, update, delete
  on public.player_one_roll_boosts
  to service_role;
