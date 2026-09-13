# Roll hot-path v2

This change reduces Edge Function-to-Postgres round trips without moving random
selection or gameplay formulas out of the optimized `roll` Edge Function.
The deployed Supabase `roll` v152 implementation and live schema on project
`igrddscmrdrrwtvyspbf` were used as the source of truth.

## What changed

### Pre-roll context

`roll_prepare_context()` returns the player, research effects, ban state,
non-relic inventory count, equipment, Museum artifacts, QoL settings and
discoveries, timed boosts, one-roll potion, admin event, natural event snapshot,
crystal/expedition artifact effects, and guild/buff state in one service-role-only
call. A batch still uses its original shared request timestamp and snapshots its
timed boosts/events/guild state on the first result.

### Bookkeeping

`roll_finish_bookkeeping()` is the single database path for post-roll auxiliary
work. The Edge Function invokes its `critical` phase for response-visible lifetime
stats, mutation-index state, guild points, and global-event progress. Its
`background` phase performs the remaining best-effort updates. Jackpot Slot loss
bookkeeping uses the same RPC's `loss` phase.

The phases keep the previous response-latency boundary: ordinary single-roll
background work remains in `EdgeRuntime.waitUntil`, while each item of a batch
awaits its background phase before the next item so potion charges and state are
current.

### Catalog invalidation

`roll_catalog_versions` stores gem and mutation catalog generations. Statement
triggers increment a generation after an insert, update, delete, or truncate.
A warm Edge isolate sends the generations it already has to
`roll_prepare_context()`; unchanged catalogs are omitted from the response, and a
changed catalog is returned immediately.

The full enabled gem catalog is cached. Date-range and daily-window eligibility
are evaluated against the shared roll timestamp on every request, so a time
boundary cannot leave gameplay configuration stale. The active natural-event
snapshot is included in every pre-roll context and is therefore never dependent
on an isolate TTL.

### Weight history retention

The live dependency audit found these consumers of `roll_weight_history`:

- `get_most_weight_leaderboard()` (public top 100)
- the Month One recap capture/correction functions, whose cutoff was
  2026-09-07 16:00 UTC and which are now no-ops
- account alias merge maintenance
- the older `record_roll_effects()` function; live `pg_stat_statements` showed
  zero observed calls, and the deployed optimized roll function does not use it

New writes retain the 100 heaviest rows per player, ordered exactly like the
leaderboard. Existing excess history is pruned gradually, at no more than 1,000
rows for that player per successful roll, avoiding a multi-million-row delete in
the deployment transaction. This preserves an exact global top 100 under arbitrary
`leaderboard_hidden` combinations: no player can contribute more than 100 rows
to a 100-row result, and excess legacy rows cannot displace a heavier retained
row. Once a player has 100 retained rows, a roll below the player's cutoff is
not inserted at all, avoiding insert/delete WAL churn. Inactive players' legacy
rows remain until a separate offline cleanup is chosen; the hot path no longer
grows their history.

## Deployment order

No deployment is performed by this change.

1. Apply `supabase/migrations/20260913102618_optimize_roll_hot_path_v2.sql`.
2. Apply `supabase/migrations/20260913123601_fix_roll_prepare_context_admin_event_columns.sql`.
   This follow-up is required for databases where the first migration has
   already been applied; it removes a stale `admin_events` column reference.
3. Apply `supabase/migrations/20260913124716_fix_roll_service_role_secret_key_auth.sql`.
   This allows the service-role-only RPCs to work with opaque Supabase secret
   keys, which do not carry the legacy JWT role claim.
4. Deploy `supabase/functions/roll/index.ts` as the optimized `roll` function.
5. Smoke-test an ordinary roll, a four-roll batch, a stacked one-roll potion,
   a player with an active guild potion, an active natural/admin event, a banned
   player, and a player without enough free inventory slots for the batch.

The migration must be applied first because the updated Edge Function requires
both new RPCs.

## Local verification

Run:

```sh
npm run test:roll-hot-path
npm run test:batch-rolling
```

The PGlite contract test verifies service-role isolation, ordinary context data,
four-slot batch preflight wiring, potion charges, guild buffs, active events,
bans, inventory counts, catalog version invalidation, both bookkeeping phases,
and top-100-per-player retention.
