# Minigames v1

This change adds `/minigames/`, eleven game views at `/minigames/?game=<id>`, and the existing `/gemdle/` daily game. The shared shell includes Minigames in the permanent desktop navigation and mobile tabs. Equipment, inventory, normal roll, and optimized roll code are not modified.

## Manual deployment — owner only

No migration or Edge Function has been deployed by this implementation.

1. In the Supabase SQL Editor for **igrddscmrdrrwtvyspbf**, run `supabase/migrations/20260905031842_minigames_v1.sql` once. This is the only new migration for this change. The existing Gemdle migration is already present in the referenced backend; do not run it again.
2. From the repository root, deploy only the new function:

   ```sh
   supabase functions deploy minigames --project-ref igrddscmrdrrwtvyspbf --use-api
   ```

   Keep JWT verification enabled. The handler additionally verifies the bearer token with Auth and checks the existing profile and suspension convention. It uses the automatically supplied `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; no service key belongs in the frontend. The bundle imports the shared `minigames/catalog.js`, `minigames/stack.js`, and `src/data/gems.js` files, so run from the full checkout.
3. Publish the static frontend with the existing website workflow after the backend is ready. Include the entire `minigames/` directory and `src/ui/shell.js`. Do not deploy the normal roll function or redeploy Gemdle for this change.
4. Smoke test a rewarded run, reload halfway, complete it, and confirm the wallet credits once. Repeat in Practice and confirm no MT change. Verify a second account cannot read private runs or mutate wallets.

If using migration history rather than SQL Editor, inspect first:

```sh
supabase db push --project-ref igrddscmrdrrwtvyspbf --dry-run --skip-vault
```

Only if the output contains exactly the migrations you intend, the corresponding manual apply command is:

```sh
supabase db push --project-ref igrddscmrdrrwtvyspbf --skip-vault
```

Do not blindly apply unrelated outstanding migrations.

## Architecture and validation

- `minigame_wallets`: server-managed five-ticket wallet, hourly regeneration, MT and lifetime MT.
- `minigame_runs`: private seed and full state, versioned updates, active/completed status. One rewarded run per account and one resumable practice run per game.
- `minigame_actions`: ordered accepted inputs and server receive times for replay and balancing.
- `minigame_scores`: only results derived by the server engine. Boards select each player's best run, respect existing leaderboard visibility, and return top 50 plus own rank without exposing account IDs.
- All public tables enable RLS. Only the own-wallet read is granted to authenticated clients. Hidden runs, action logs, and scores are accessible only to the service role. All privileged RPCs explicitly revoke PUBLIC, anon and authenticated execution.
- Start locks the wallet before creating a run and consuming its ticket in one transaction. Commit locks wallet then run, checks the version, records the action, finishes the run, credits MT and records ranking in one transaction. Stale retries return the persisted state; they do not rerun rewards.
- Every practice and rewarded action passes through the same engine. Board/puzzle games are incrementally replayed on the server, retaining the full ordered action log. Arcade games validate recent timestamped coordinates and collision paths; no claimed score, tile, gem find, rating, payout or final value is trusted.
- Timing games use server clocks. Perfect Strike checks reported elapsed time against the issued timestamp with a 350 ms network tolerance, then computes the rating itself. This is plausibility validation, not protection against bots automating valid inputs. Offline time continues for timed games; untimed rewarded runs resume indefinitely without another ticket.
- Gemdle remains isolated in its original function, migration, weight RNG, UI and tests. Its locked exponents and mutation factor are unchanged.

## Concrete v1 choices

- Mine Sweeper difficulty labels refer to the count of MT mines; Easy is practice only. Perfect Expert is the only ranked Mines result.
- Prospector's fixed six specimens are Quartz, Malachite, Opal, Moonstone, Mythril and Sapphire, worth 100/200/400/750/1250/2000. These are minigame tiers, not normal gem rarity odds.
- Explosive Mining boards have 3,900–4,249 total gem points. This is a bounded common budget, without solving an optimum.
- Crystal Bags uses explicit integer tables. The five-round expected total is approximately 23 MT (Safe is 23.55). Per-round option EV spread is at most 0.3 MT. Choice and actual outcomes are retained; lifetime statistics aggregate every completed run.
- Price Is Right uses the backend gem value-per-gram and mutation multipliers, with fictional weights and no player modifiers. Questions span ten catalog rarity bands and zero to two mutations. Feedback is shown before the player explicitly starts the next timed question.
- Perfect Strike gives a 2.5 second preparation countdown before each strike, with no random offset. Ten quick Perfects take about 33 seconds.
- Gem Stack uses seven-bag, Hold, next three, basic clockwise rotation and spawn-failure game over. No advanced wall-kick system or lock-delay mechanic was specified.
- Abandoning forfeits pending rewards and does not create a leaderboard result. Ordinary completion and Tower collapse produce their specified validated result. Practice is unlimited but a saved practice run must finish or be abandoned before another of the same game begins.
- No Double-or-Nothing endpoint, MT shop purchases, ticket purchase, inventory payout or cash conversion is implemented.

## Tests

```sh
npm test
npm run test:gemdle
npm run test:minigames
```

Local database tests need `@electric-sql/pglite@0.3.14`; browser tests need Playwright and Chrome plus `npm run dev` on port 5539 (or set `MINIGAMES_PREVIEW_URL`). Dependencies may live outside the checkout:

```sh
MINIGAMES_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js npm run test:minigames-db
GEMDLE_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/gemdle-database-test.mjs
MINIGAMES_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:minigames-ui
```

Database tests run the actual migration locally, including RLS, RPC grants, regeneration, duplicate starts and credit idempotency. PGlite serializes queries; this checks retry behavior and database constraints but is not a multi-connection production load test. Browser tests use the real engine behind a mocked transport, not the undeployed live endpoint. Run the post-deployment smoke test above on the real backend.
