# Playtime Upgrades Removed

This build completely removes Playtime Upgrades from the frontend, Roll logic, leaderboard calculations, equipment preview, and database.

Run `supabase/migrations/20260908000012_remove_playtime_upgrades_completely.sql` on an existing database.

Redeploy the `roll` Edge Function because its server-side luck/mutation/roll-speed logic was updated.
