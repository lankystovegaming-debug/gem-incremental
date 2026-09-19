# Admin / Navigation / Workbench patch

## Required deployment
1. Apply `supabase/migrations/20260919000001_admin_navigation_workbench_limited_events.sql` to the same Supabase project used by the game.
2. Deploy the updated frontend files.
3. No existing files need to be deleted.

## Fixed
- Admin Pets no longer directly selects `game_pets`; it uses an admin-only RPC, avoiding the 403 caused by the admin RLS policy.
- Admin Equipment uses the same admin-only RPC pattern.
- Achievement Points leaderboard no longer passes the mutation array as the `escapeHtml` argument to `gemNameHtml`.
- Workbench configuration is now a main Admin Panel tab instead of Feature Lab.
- Workbench remains disabled for ordinary players and is seeded OFF.
- Equipment tabs support admin enable/disable; existing tabs stay enabled, Limited Time stays enabled, Armory and Weapons start disabled.
- Player navigation can be customized from Settings. Existing navigation is the default; Limited Time is always in Explore and cannot be moved to the main top bar. Admin is included for administrators.
- Added a Limited Time admin tab with event scheduling, activation, presentation, currencies, equipment/crafting JSON and full event configuration.
- Seeded Deep Sea as a disabled limited event with the supplied ladder, Neptune, TT, Depths Demand, Abyssal Potion, Legacy and consumable design data.
- Limited Events reads active event definitions through a public RPC and has a generic event renderer.
- Workbench minigames get clearer stage names/grades, variable rhythm timing, faster precision variation, and keyboard activation.

## Important scope note
The Deep Sea seed is deliberately disabled. Its configuration is stored and editable, but this patch does not silently enable the complete Deep Sea gameplay loop. Enable it only after the event runtime/edge cases are ready.
