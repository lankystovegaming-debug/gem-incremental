# Gem Incremental — 2026-08-20 reliability/UI pass

## Deploy order

1. Apply every migration in `supabase/migrations/`, including:
   - `20260820000008_workbench_runtime_tables_and_guild_repair.sql`
   - `20260820000009_analytics_presence_mutations_guilds.sql`
2. Deploy `supabase/functions/workbench/index.ts` as the `workbench` Edge Function.
3. Deploy the updated `admin`, `features`, and `roll` Edge Functions.
4. Upload the static site so `/workbench/` is the only Workbench frontend route.

## Workbench

The public frontend and Edge Function are now both named `workbench`. Historical `forge_*` database tables are deliberately retained so existing data remains compatible.

The Workbench has three server-authoritative stages. Stage 2 is a separate three-beat rhythm interaction instead of a duplicate of the Stage 1 timing interaction.

The server validates:

- administrator access,
- authenticated player ownership,
- selected inventory specimens,
- material count bounds,
- session ownership,
- session age,
- stage order,
- score bounds,
- completed-session state.

## Dynamic mutations

`game_mutations` is the authoritative editable mutation catalog. Administrators can create, edit, enable, disable, and delete mutation definitions from the Admin Panel.

Existing saved mutation IDs on old gems are not rewritten when a definition is deleted.

## Gem Index

Enabled `private_feature_gems` entries are merged into the Gem Index and the index subscribes to catalog changes so newly-created gems appear without requiring a hard reload.

## Analytics

The analytics migration adds server-recorded presence heartbeats and exposes:

- current online users,
- unique daily users,
- unique weekly users,
- D1 retention,
- D7 retention,
- hourly distinct-user activity for the last 24 hours.

Presence is observational only and never blocks gameplay.

## Auto Roll

When Auto Roll is enabled with Auto Sell, a full inventory now attempts to sell the lowest-rarity eligible specimen before stopping the automation loop. Auto Keep protection is respected.

If Auto Sell is disabled, Auto Roll stops cleanly and explains why instead of repeatedly hammering the Roll endpoint.

## Rare-roll announcements

Rare-roll announcements now preserve the effective luck multiplier used by the server. The player-facing message can therefore read like:

`Player rolled a rare Natural Moissanite 1 in 110,000 with luck of 67x!`

## Wallet

The compact wallet can be clicked or focused with the keyboard to expand its full numeric value on narrow layouts.

## Session Insights / Auto Keep

The site section switches for Session Insights and Auto Keep are enabled by the migration so the existing Roll-page controls are visible again.

## More menu

How to play, Contribute, Report a bug, Codes, Update log, and Support the game remain grouped under the top-bar More menu instead of consuming permanent navigation slots.
