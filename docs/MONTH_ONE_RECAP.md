# Month One recap — deployment handoff

Branch: `codex/month-one-recap`. Route: `/recap/month-1/` (personal tab: `#you`).
Supabase source of truth: `igrddscmrdrrwtvyspbf`.

## Deployment order

1. Review and apply **only** `supabase/migrations/20260907070950_month_one_recap.sql` to the target project **before September 8, 2026, 00:00 Asia/Singapore** (`2026-09-07 16:00:00 UTC`). Check migration history first; do not blindly apply unrelated pending migrations from this repository.
2. The baseline reads the historical tables and briefly blocks writes to its six source tables to install capture without a gap. On this project each roll-history table has approximately 2.8 million rows. A five-second lock-acquisition timeout fails safely if the sources are busy. Allow a maintenance window, run with an appropriate SQL execution timeout, and do not wait until the cutoff. Benchmark on a database copy first if possible; production installation time and added trigger overhead have not been measured.
3. Verify `select public.get_month_one_recap();` returns `status: live` and sensible eligible-player totals. Call through an authenticated client to verify its own `personal` result; anonymous callers receive only Global Month One.
4. Deploy the static frontend through the normal repository release process. No Edge Function deployment is required. The deployed optimized `roll` implementation remains unchanged.
5. After cutoff, call the same RPC. It must return `status: final`, `refreshSeconds: null`, and `asOf: 2026-09-07T16:00:00+00:00` (equivalent timestamp formatting is fine). Repeated calls and later gameplay must preserve both public and personal results.

Nothing was applied or deployed to Supabase during development.

The migration intentionally fails and rolls back if it starts or finishes after cutoff. Seeding current counters after the deadline cannot recreate the Month One boundary. Late installation requires a verified cutoff backup/PITR restore and a separately reviewed import; do not remove the guard or quietly label late current data as final.

## How the freeze works

The private capture tables are the recap source even while live. Lightweight triggers mirror player counters, bank balances, exclusions, and completed minigame scores. Roll inserts compare five per-player record candidates; only winners are retained, rather than copying millions of historical rolls. Weight records are retained separately. Corrections/deletions of historical records rebuild only the affected player's category set before cutoff.

Every trigger uses `clock_timestamp()` and stops capturing at the fixed cutoff. A shared transaction advisory lock coordinates in-flight writes with finalization. Consequently the first request **after** midnight can finalize safely even if it arrives hours later: it never queries mutable current player tables. It waits for admitted captures to commit, builds the final payload once, and persists it forever. Final snapshots have no foreign keys to live player accounts. Later renames, account deletion, exclusions, balance changes, or catalog changes cannot alter the archive. No browser clock or cron availability is needed for the freeze.

Global and all eligible personal summaries are cached together in a private, unexposed schema, rebuilt at most once per 45 seconds while live. Public RPC results contain the global recap plus only `auth.uid()`'s personal object. There is no caller-supplied player ID. Private schema/table/function access is revoked from public clients; RLS is enabled as defense in depth. Concurrent cache rebuilds serialize. An anonymous request can populate the private cache but cannot retrieve other players' personal data.

An optional existing scheduler can call `select public.get_month_one_recap();` at/after the cutoff to eagerly finalize. It is unnecessary for correctness. Do not run the admin-only `rebuild_records` helper after cutoff: final reads do not use it. Capture triggers become clock-check-only no-ops after cutoff and can be removed later in a separately reviewed cleanup migration.

## Data semantics and verified backend sources

Inspected on September 7, 2026: deployed `roll` v137, `leaderboards` v15, `get_raw_rare_roll_leaderboard`, `record_roll_leaderboard_entry`, actual table columns/indexes and record coverage, and the deployed `minigame_board` ordering. The recap does not use repository gem formulas or recompute current luck.

- **Highest Displayed Rarity:** `players.rarest_gem_rarity/name` lifetime discovery counter. Roll-time luck is shown only when the matching recorded highest displayed discovery exists; otherwise it explicitly says not recorded. Detailed discovery cards are the top five recorded per-player discoveries.
- **Raw Rare Roll:** exactly `greatest(1::numeric, rarity / greatest(0.000001::numeric, coalesce(raw_luck, 1::numeric)))`. Tie order: score, base rarity, creation timestamp, history ID, all descending, matching the deployed leaderboard. Mutations and `base_luck` do not enter the score. `raw_luck` is the recorded total luck passed by optimized roll. Missing source luck displays unknown even though the backend score uses its existing fallback.
- **Eligibility:** exclude `leaderboard_hidden` and every ID present in `system_account_exclusions` consistently across every section and the ranking denominator. Only named accounts created before cutoff enter the recap. Exclusions are snapshotted too. This deliberately uses the union of existing exclusion mechanisms, so test activity cannot win an unrelated section.
- **Headline economy/grind:** captured lifetime counters. All currently eligible accounts were created after launch (earliest verified August 12). These are Month One totals for this first-month feature, not a reusable month-to-month delta calculation. Earnings may include rewards beyond gem sales. Cash/bank balances are capture-time holdings.
- **Weight:** source coverage starts August 18, 2026, 12:14:49 UTC. The weight table does not store roll luck; the UI says so rather than guessing a join to another roll.
- **Detailed roll records:** coverage starts August 24, 2026, 09:35:49 UTC. Raw odds, value, mutation combinations and record discoveries are labeled **recorded**. Mutation-combination denominator uses stored `effective_rarity / rarity`, preserving the backend value at capture. No full-month mutation count is invented.
- **Minigames:** completed score rows within the period. Minesweeper has different scoring semantics and does not advertise a naive maximum. Other games show best recorded score and global record holder using descending score/tie values and earliest achievement time. These are submitted score records, not every started/abandoned session.
- **Rankings:** competition rank (ties share a rank), over all eligible accounts including zero-roll players. Top percentage is `ceil(100 * rank / population)`. Join order is by account creation time then UUID among eligible accounts; it is not a claimed original sign-up order before account migration.
- **Share:** compact text, native share with copy fallback, and standalone downloadable SVG. The link opens the public recap; it does not expose personal profiles. Live cards are marked LIVE.

Omitted unsupported claims: full-month playtime, total historical kept/sold gems, accidental sales, absolute full-month mutation totals, and an exclusion-correct economy time series. An economy chart cannot safely use an unfiltered historical aggregate. Weight multiplier is not reconstructed from today's mutable base-weight catalog.

## Validation

`npm run test:month-one` executes the migration in isolated PGlite/Postgres fixtures and checks baseline capture, updates, late finalization, immutable frozen data, anonymous vs. authenticated access, denied private-schema access, exclusions, tied rankings, raw-luck semantics, null mutation arrays, missing luck, minigame semantics and escaped share output. The test replaces only the fixed cutoff in its isolated fixture so it remains runnable after the real deadline.

The frontend has no build step. Its modules receive a syntax check; Global and personal pages are visually checked with synthetic data, not production personal data. Production migration/trigger performance and a deployed end-to-end RPC are intentionally not claimed as tested.

Development verification: the complete `npm test` suite passed. Added client state tests cover 45-second scheduling, a deliberately incorrect browser clock, in-flight responses during sign-out, final polling shutdown and transient errors. Desktop and 390px mobile views and SVG download were checked with synthetic fixtures.
