# Gem Reels v1

Implemented from main `77038b2` (2026-09-06). Read-only reference: Supabase project `igrddscmrdrrwtvyspbf`, deployed `minigames` v1 and live `minigame_start`, `minigame_commit`, `minigame_wallet`, `minigame_board`, table constraints. Current main also contains subsequent minigame UI/Perfect Strike fixes; these are retained. No normal roll function, formula, inventory, or boost code is changed.

## Manual deployment — nothing has been deployed

1. In the [project SQL Editor](https://supabase.com/dashboard/project/igrddscmrdrrwtvyspbf/sql/new), paste and run **only** `supabase/migrations/20260906141753_gem_reels_v1.sql`. The existing minigames v1 schema is already present on this project. This migration adds Gem Reels to two constraints and the rewarded-start allowlist; it preserves wallet locks, unique active-run indexes, service-role permissions, and atomic ticket consumption. Do not rerun the original minigames v1 migration or bulk-push the repository's historical migrations.
2. From the repository root, with your authenticated Supabase CLI, deploy only the minigames function:

   ```sh
   supabase functions deploy minigames --project-ref igrddscmrdrrwtvyspbf --use-api
   ```

   Keep JWT verification enabled (do not add `--no-verify-jwt`). The existing `supabase/functions/minigames/deno.json` is retained. Deploy from this complete checkout so its relative dependencies, including `minigames/reels.js` and `supabase/functions/minigames/reels.js`, are included. There are no new secrets. Do not deploy `roll` or any other function.
3. Publish the frontend files through the repository's usual hosting workflow after the backend steps. Open `/minigames/gem-reels/`.
4. Smoke-test a Practice run through all eight hands: hold/release gems, refresh during a hand, and finish. Confirm no ticket or MT change and a leaderboard entry. Then finish one Rewarded run: confirm exactly one shared ticket was consumed and one reward of 8–50 MT was added. Refresh during the run and check that the committed hand is resumed.

## Rules and edge cases

- Eight hands; explicit initial spin, hold 0–5 reels, then exactly one respin. Holding all five evaluates without drawing replacement symbols. No early cash-out; abandoning awards zero and does not refund the ticket. Closing resumes the saved run.
- Weights out of 10,000: each Common 1,485; Uncommon 990; Rare 594; Premium 231; Wild 100. Total 10,000 exactly. Independent crypto draws with rejection sampling avoid modulo bias; Gem Reels does not use the shared seeded PRNG.
- Each concrete interpretation uses the specified poker-style hierarchy. Wild substitution maximizes the resulting score (not the rank), with rank then lexicographically higher sorted gem progression as deterministic tiebreaks. Five Wilds therefore become five Sapphires, 16,000 points, no natural bonus. At most 4,368 wildcard multisets are evaluated.
- Natural means the final five symbols contain no Wild; a respin can earn the bonus, including after rerolling a Wild. Qualifying natural hands get ×1.5. No Cluster remains zero.
- Fractional points are retained exactly (quarter-point increments), including 843.75 for natural Common/Premium Two Pair. Bands use their lower thresholds, so 2,499.75 earns 14 MT and 2,500 earns 20 MT.
- Practice and Rewarded share gameplay and leaderboards. Final cumulative score ranks descending, with existing earliest achieved time then run ID conventions. Only completed eight-hand runs qualify; abandoned runs do not.

## Authority and telemetry

The authenticated Edge Function generates outcomes and computes all scores. Clients send only action type and held reel indices, alongside run ID/version. Unknown Gem Reels action fields, duplicate/out-of-range holds, and out-of-order actions are rejected. Identity comes from Auth, never the request body. Existing player ownership queries, suspension checks, private run tables, service-role-only RPCs, wallet locking, optimistic version checks and transactional commit protect state and one-time credits. Simultaneous stale requests return the winning committed version.

Existing `minigame_actions` records each committed action/version. Private `minigame_runs.state.history` records each hand number, initial/final symbols, held indices, Wild interpretation/count, category, multiplier, natural bonus, hand/cumulative score and server timestamps. The complete bounded history supports outcome and holding analysis. No future outcomes are generated or exposed. Client hold selections are provisional until the respin is committed; refreshing keeps the spin and lets the player reselect holds.

## Changed files

- `minigames/reels.js`: symbol/probability/scoring display constants and MT bands.
- `supabase/functions/minigames/reels.js`: authoritative crypto sampling, evaluation, Wild search and hand progression.
- `supabase/functions/minigames/engine.js`: Gem Reels state creation and step dispatch.
- `supabase/migrations/20260906141753_gem_reels_v1.sql`: game constraints and atomic rewarded-start registration.
- `minigames/gem-reels/index.html`, `minigames/catalog.js`, `minigames/app.js`, `minigames/reels-ui.js`, `minigames/minigames.css`: hub route, controls, accessible holds, exact scores, history, rules and responsive theme styling.
- `tests/gem-reels-test.mjs`, `tests/minigames-handler-test.mjs`, `tests/minigames-database-test.mjs`, `tests/minigames-test.mjs`, `tests/minigames-ui-test.mjs`, `package.json`: scoring, lifecycle, API, local database and browser coverage.

## Verification

- `npm run test:minigames`: 22 passing tests, including an ordered exhaustive oracle for two-Wild hands, all-Wild scoring, all Gem Run windows, all payout boundaries and forged request validation.
- `npm run test:minigames-db`: migrations executed in local PGlite; full Practice/Rewarded runs, repeated starts/actions, single credits, leaderboard recording, ownership and role permissions. This is local PostgreSQL-compatible coverage, not a production deployment or a multi-connection load test.
- `npm run test:minigames-ui`: twelve game screens, full Gem Reels run, holds, refresh/resume, mobile overflow checks, no browser errors. Browser tests mock the API using the actual game engine; live integration is covered by the manual smoke test above. Requires Playwright and Chrome (existing test supports `MINIGAMES_PLAYWRIGHT_MODULE`).
- `node tests/minigames-strike-latency-test.mjs`: existing Perfect Strike regression passes.
- `git diff --check`: clean.

The database tests require the existing pinned `@electric-sql/pglite` dependency (`npm ci`). Node 24 supports the handler's TypeScript import used in tests. No dependency changes.
