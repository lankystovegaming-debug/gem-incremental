# Deepcore Project 2026 deployment

Deepcore is prepared for Supabase project `igrddscmrdrrwtvyspbf`, but this branch intentionally does not deploy backend changes.

Deploy in this order:

1. Apply `supabase/migrations/20260916105437_deepcore_project_2026.sql`.
2. Apply `supabase/migrations/20260916125715_install_deepcore_hot_table_triggers.sql`.
3. Deploy the new `deepcore` Edge Function.
4. Deploy the updated `roll` Edge Function.
5. Publish the web application.

The second migration installs the `players` and `inventory_gems` triggers in two short, independent transactions. It uses a 10-second lock timeout so deployment fails quickly instead of waiting indefinitely when live roll traffic is holding either table. If it times out, retry only this second migration during a quieter traffic window; the first migration does not need to be rerun.

The Roll Function tolerates the migration being temporarily absent and continues ordinary rolling, but Deepcore gems and counters only become authoritative after the migration and updated Roll Function are both live. The page remains in its inert preview state until `2026-09-20T00:00:00Z` and automatically archives at `2026-10-04T00:00:00Z`.

After deployment, verify:

- `/limited-events/deepcore/` reports `PREVIEW` before launch.
- A normal roll still completes and increments `players.total_rolls`.
- `deepcore_track_rolls` exists on `public.players` and `deepcore_track_specimen` exists on `public.inventory_gems`.
- The `deepcore_get_roll_context` RPC is executable by `service_role` and not by `authenticated`.
- No Deepcore contribution, purchase, sacrifice, quest progression, or limited gem is accepted before launch.

Rollback should remove the updated web/Edge Function releases first. Do not drop Deepcore tables after the event has accepted live activity, because they are the permanent archive and claim ledger.
