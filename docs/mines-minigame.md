# Mines

Five independent rounds on a 5×5 board with 24 safe gems and one mine. Players may bank at any point, including zero reveals. A mine ends that round with zero; banked points from previous rounds stay safe. All 24 gems automatically bank 25,000 points. Results remain visible until Next round is pressed. The fifth result completes the run and submits its combined score (maximum 125,000) to the existing leaderboard, with the existing earliest-completion tiebreak.

The supplied score table is reproduced exactly by `round(25000 / (25 - safeReveals))`. Multiplier is `25 / (25 - safeReveals)` and next-mine probability is `1 / (25 - safeReveals)`. The score uses the exact ratio before rounding, rather than a rounded displayed multiplier. First reveal is not protected. The 24-reveal row shows the supplied 100% next-mine probability, but no further reveal is possible because the round banks automatically.

The idea did not specify MT rewards or costs. Mines therefore uses free, unlimited, score-only Practice: no ticket consumption, MT, cash or inventory rewards. Existing wallet and leaderboard behavior are reused. Closing and reopening resumes the persisted run.

Each round uses a fresh unbiased cryptographic draw. Active board responses omit the mine and contain no RNG seed. The ended board's mine is visible only after the round is over. Only server-validated actions update the existing versioned run; client-supplied scores and outcomes are rejected. Existing authentication, ownership, RLS, service-only RPC grants and atomic completion remain in use.

## Owner deployment

Nothing is deployed by this change. For project `igrddscmrdrrwtvyspbf`:

1. Apply only `supabase/migrations/20261029003138_mines_minigame.sql`. It extends the existing game allowlist; it does not change rewarded-game eligibility or RPC permissions. Do not blindly apply other pending migrations.
2. Deploy the existing `minigames` function from the full repository checkout, retaining JWT verification:

   ```sh
   supabase functions deploy minigames --project-ref igrddscmrdrrwtvyspbf --use-api
   ```

   Include `supabase/functions/minigames/mines.js` and its shared `minigames/mines.js` import in the bundle. Existing engine/handler source was compared to deployed version 4 before implementation; only the Mines integration changes the engine. The optimized roll function is untouched.
3. Publish the frontend including `minigames/mines/index.html`, `minigames/mines.js`, the catalog, app and stylesheet changes after the backend is ready.
4. Smoke test reveal, bank, mine hit, next round, reload/resume and five-round leaderboard completion. Confirm wallet tickets/MT do not change, and another account cannot access the run.

## Validation

```sh
node --test tests/mines-test.mjs tests/minigames-test.mjs tests/minigames-handler-test.mjs tests/gem-reels-test.mjs tests/minigames-movement-test.mjs
node tests/mines-database-test.mjs
node tests/minigames-database-test.mjs
MINIGAMES_PREVIEW_URL=http://127.0.0.1:5548/minigames/ MINIGAMES_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/mines-browser-test.mjs
```

The local database suites execute the actual migrations with PGlite; they cover retries and constraints but do not establish production concurrency. Browser tests use the real engine behind a mocked transport, with desktop/mobile, keyboard input, resuming and full completion. Production behavior awaits owner deployment and the smoke test above.
