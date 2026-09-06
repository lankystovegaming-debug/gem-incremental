# Gemdle V1

Prepared for Supabase project `igrddscmrdrrwtvyspbf`. No migration or function was deployed during implementation. Normal rolling and its optimized Edge Function are unchanged.

## Manual deployment

1. Apply **only** `supabase/migrations/20260904145142_gemdle_daily_results.sql` in the project's SQL Editor (or your usual migration workflow). It depends on existing `players` and `user_roll_luck_rarity_mult` tables. Do not blindly push all historical migrations from this repository.
2. From the repository root, deploy the new function:

   ```sh
   supabase functions deploy gemdle --project-ref igrddscmrdrrwtvyspbf --no-verify-jwt
   ```

   The function explicitly validates the bearer token through Supabase Auth `getUser()` on every request. `--no-verify-jwt` skips the legacy gateway verifier, allowing the project's current key setup; it does **not** permit unauthenticated Gemdle requests. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; no browser secrets or new custom secrets are required.

   For dashboard deployment, include all files in `supabase/functions/gemdle/` plus the unchanged imported `supabase/functions/roll/eventRules.ts`. Deploying Gemdle does not redeploy `roll`.
3. Publish the frontend files and updated `src/ui/shell.js` through the existing site deployment workflow. Gemdle appears in Explore and is available at `/gemdle/`.
4. Sign in, roll once, then refresh and open another tab/device. All should show the same result. Confirm a signed-out request is rejected and history/leaderboard load. A first test roll consumes that account's daily Gemdle; there is no production reset endpoint.

## Model and decisions

- Live `private_feature_gems` and enabled `game_mutations` are loaded with pagination; catalog failures fail closed. No inventory, currency, progression, serial or normal roll state is changed.
- Singapore date and daily windows use the server's clock. Start boundaries are inclusive; end boundaries are exclusive. Overnight windows and date-range limits are retained.
- Gems below normal 1/10 and serial-dependent gems are excluded. `Seriali Copenhageni` is excluded by name, with `serialDependent`, `requiresSerial`, and `serial_dependent` metadata flags also supported.
- Gem selection is exactly the rarest-first sequential distribution with square-root compression, including all-failed probability assigned to the normal game's fallback (the commonest non-flat gem, or commonest gem when all are flat). Stable ties use catalog sort order and name.
- Event eligibility reuses existing event rules. Random event states, including Totality, are integrated into actual selection probabilities. Event **stat bonuses** do not affect Gemdle. Charged is available only during Mutation Storm, at its compressed base chance.
- Mutations follow catalog sort order (ID breaks ties). Every mutation after the first success gets the same ×0.35 chance factor; it is not compounded once per success. Only successful checks contribute to rarity. The live catalog has no mutual-exclusion columns today; explicit `eligible_gems`, `required_event_key`, and symmetric `excludes` rules are supported if added.
- Weight is a baseline port of `src/logic/weight.js`, with no boosts. For `w >= 2`, the rarity factor is `16 * 2^(floor(w)-2) / (1 - fractional(w)/2)`; below 2 it is 1. Raw precision is stored; display rounding never changes rankings.
- Highest tier/weight/stack badges follow the final design. The unspecified “Rare Mutation” cutoff is set to normal rarity ≥1/10,000. Troll is a flavor badge when catalog `metadata.troll` is true.
- History stores immutable specimen snapshots so future balancing/catalog changes do not rewrite old scores. History is paginated in batches of 30 and retained for the account's lifetime.
- Equal scores share a rank. The visible board contains 50 entries, with a separate own-rank lookup. Existing leaderboard-hidden settings and active suspensions are respected. Share text uses the Singapore date rather than inventing a launch-day numbering epoch.

## Security

The browser sends only an action and optional history cursor. Client-supplied player IDs, dates, gems, scores and stats are ignored. Authenticated users can directly read only their own history through RLS. Neither anonymous nor authenticated roles have INSERT/UPDATE/DELETE access, or access to the save/board RPCs. The service role has SELECT/INSERT on results, with no UPDATE/DELETE grant. Both RPCs are security invoker with an empty search path and service-only execution.

`UNIQUE(player_id, gemdle_date)` plus `INSERT ... ON CONFLICT DO NOTHING` makes the first committed specimen authoritative. A retry returns the stored specimen; it cannot overwrite it. The leaderboard reads those rows, without a separate score submission. Its response contains names, ranks and specimens, not account IDs or emails.

## Verification

Run with Node 24+:

```sh
npm run test:gemdle
deno check --config supabase/functions/gemdle/deno.json supabase/functions/gemdle/index.ts
```

Optional local PostgreSQL-compatible integration test (install `@electric-sql/pglite@0.3.14` separately, or set `GEMDLE_PGLITE_MODULE` to its entry path):

```sh
node tests/gemdle-database-test.mjs
```

Browser test uses a mocked API and shell, and does not contact live Supabase. Start the normal development server and point `GEMDLE_PREVIEW_URL` to `/gemdle/`. Install Playwright separately, or set `GEMDLE_PLAYWRIGHT_MODULE`; `GEMDLE_BROWSER_CHANNEL=chrome` uses installed Chrome.

```sh
node tests/gemdle-ui-test.mjs
```

Validated locally:

- 12 RNG/API/format tests, including 10,000 identical-sequence comparisons with the original weight source and a 200,000-roll weight-band simulation.
- Migration executes; RLS and grants block client writes/service RPCs, preserve duplicate results, honor the SGT date boundary, ties, privacy settings, and own rank outside the top 50. PGlite serializes database calls, so a real multi-connection race remains a post-deployment smoke check.
- Desktop/mobile browser reveal, saved-result reload, history dialog, rank, escaped usernames and no horizontal overflow; light-theme card contrast visually checked.
- All 216 currently enabled live catalog entries inspected read-only. Hourly non-event probability averaging gives approximately 24.79% ≥1/10K, 7.42% ≥1/100K, 2.33% ≥1M, 0.533% ≥10M, 0.137% ≥100M, and 0.00301% ≥1B. Event days vary as designed.

Live end-to-end verification is pending your manual deployment. No sub-second latency guarantee is claimed for Gemdle; the existing optimized normal roll function remains untouched.
