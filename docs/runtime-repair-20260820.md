# Gem Incremental runtime repair — 2026-08-20

## Workbench
- Workbench uses dedicated `workbench_sessions` and `workbench_items` runtime tables.
- Historical `forge_*` tables remain untouched for compatibility.
- The old `supabase/functions/forge` deployment was removed; deploy `supabase/functions/workbench`.
- Run migration `20260820000008_workbench_runtime_tables_and_guild_repair.sql`.

## Gem Index
- Default mutation view is now **No Mutation**.
- **All** is an explicit tab.
- Enabled admin-created gems are included in the live catalogue.
- Disabled/future private gems remain hidden.
- Admin-created gems use the same pure-CSS icon system.

## Guilds
- Guild creation now uses a transactional `create_guild_for_player` RPC.
- This prevents an owner guild row from being created without its owner member row.

## Analytics
- Admin Analytics first uses the dedicated `get_admin_analytics()` SECURITY DEFINER RPC.
- The old Admin Edge Function remains a compatibility fallback.
- Analytics is explicitly treated as a global action and never requires a player id.

## Sandbox
- Showcase gems orbit with multiple 3D silhouettes.
- Mutated showcase gems receive an additional orbiting ring and enhanced emissive animation.
- Showcase mutation ids are preserved in presence snapshots.

## Validation
- All JavaScript files pass `node --check`.
- All repository smoke tests pass.
