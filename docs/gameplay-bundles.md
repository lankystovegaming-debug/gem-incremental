# Gameplay Bundles

Implements the locked **Designing Gem Bundles** specification in the existing Collection Hall (`/collection-hall/`). These are permanent specimen sacrifices, distinct from Museum registrations and auction lots. V1 awards no money, stats, items, or boosts.

## Source and catalogue

Prepared from GitHub/main commit `2f01a97`. On 7 September 2026, the deployed `roll` version 137 matched main's roll source apart from a trailing newline. The live gem catalogue, mutation IDs, inventory columns, and protection triggers were checked read-only on project `igrddscmrdrrwtvyspbf`.

The 104 requirements are backend-owned in `game_bundle_requirements`, seeded in `20260907023214_gameplay_bundles.sql`. The approved quantities are preserved, including Jeweller's Amethyst ×6,500 and Master’s revised quantities. There are no recalculated probabilities or changed roll formulas. Charged remains governed by the current backend's Mutation Storm event rule.

| Bundle | Rows | Access |
|---|---:|---|
| Jeweller’s Collection | 15 | Available immediately |
| Spectrum Collection | 21 | Available immediately |
| Deep Earth Collection | 12 | Available immediately |
| Heavyweight Collection | 8 | Available immediately |
| Mutated Collection | 24 | Available immediately |
| Cosmic Collection | 5 | Available immediately |
| Master Collection | 19 | All first six completed |

Master includes The Hoard, Perfect Specimens, Altered Perfection, Cosmic Sacrifice, and The Crown Jewel. The migration contains the complete quantities; `tests/fixtures/gameplay-bundles-catalog.json` checks them against the approved design. Colour and geological sections are presentation metadata.

## Contribution and integrity

- Manual requests contain a requirement ID and 1–50 explicit inventory specimen IDs. Filtering occurs in SQL **before** pagination; candidates are sorted by value, rarity, weight, and ID. IDs remain strings in the browser to preserve bigint precision.
- The authenticated edge derives the player ID from the verified session, not the request. It checks the section switch and the existing ban table. It exposes only a fixed RPC allowlist.
- Database transactions lock the player, then selected inventory rows in ID order. Ownership, all matching conditions, locks, Museum protection, remaining target, and Master access are checked before the transaction commits. A stale, duplicated, foreign, or ineligible selection rolls the entire batch back.
- Progress is capped at the requirement target. One consumed specimen advances one row only; a stacked mutation specimen cannot simultaneously fill the 2+, 3+, and 4+ rows.
- Weight means **stored final_weight / base_weight**, never the natural rolled multiplier. Mutation matching uses the actual stored IDs, including the legacy singular field, deduplicated. Locked and Museum specimens are excluded. The matcher also rejects `favorite`/`favorited` flags if provided; the current inventory schema has no separate favourite column.
- Completion is persisted only after all rows are full. Master settings and contributions are unavailable beforehand, and locked Master requirements are omitted from the state response. Existing inventory can be manually submitted after unlock; it does not earn pre-unlock progress.
- All new tables enable RLS and revoke direct client access. RPCs are security-invoker and executable only by `service_role`; clients cannot forge progress, completion, snapshots, or roll payloads. Public profile summaries expose completed Collection names and a limited Crown snapshot, not inventory or auto settings.

## Optimized roll integration

The existing optimized function retains its RNG, catalogue caches, parallel bookkeeping, background `EdgeRuntime.waitUntil` work, lease, and cooldown handling. One additional `bundle_route_roll` RPC starts alongside the existing crafting-state lookup. It uses the same matcher as manual contributions and a per-player lock.

Routing order:

1. A Crown-qualified specimen (base rarity ≥10,000,000, final weight ≥5×, at least two distinct mutations) is retained for manual consideration, even before Master unlocks.
2. Exactly one **enabled, unfinished, unlocked** auto requirement consumes the new specimen directly into progress, bypassing Auto Craft and inventory insertion.
3. Multiple matching enabled requirements retain the specimen in inventory, bypassing Auto Craft.
4. No match follows existing crafting/inventory handling. Relics do not qualify. Vein Hunter bonus specimens retain the existing separate inventory behavior.

Both the main roll page and cross-page automation honor the routing result before Auto Sell. Session statistics distinguish Bundle contributions from kept specimens. Inventory capacity behavior is unchanged: the existing full-inventory check still applies before generating a roll.

A bounded receipt (one row per player) records the current roll lease and routing result atomically with progress. Repeating that lease returns the same result; invalid or expired leases are rejected. An uncertain RPC failure **does not fall back to inserting another copy**. The response reports a routing error and the existing lease expiry releases the account. Refresh Collections before retrying an uncertain manual submission; mutations are not automatically retried by the browser.

The additional production latency has not been measured, because nothing was deployed. Local tests verify correctness; the production ≤1-second goal requires a post-deployment latency check.

## Crown Jewel

No auto toggle or auto contribution exists for the Crown row. Submission requires one inventory specimen and `confirmCrown: true`, with a dedicated confirmation showing the gem, base rarity, final weight multiplier, mutations, and serial if present. The deletion, progress increment, and full stored specimen snapshot commit in the same transaction. The Collection Hall remembers the snapshot; the player's public profile shows its gem, rarity, final multiplier, and mutations.

## Deployment — user only

**No migration or edge function has been deployed.** Deploy in this order:

1. Apply `supabase/migrations/20260907023214_gameplay_bundles.sql` to project `igrddscmrdrrwtvyspbf`. It creates the tables/functions and enables the existing Collection Hall switch.
2. Deploy the new `bundles` edge function, including `handler.js`, using the same `npm:@supabase/server` runtime/auth setup as the other existing endpoints.
3. Deploy the updated optimized `roll` edge function together with its unchanged `eventRules.ts` dependency. The migration must be installed first: the updated roll requires `bundle_route_roll`.
4. Release the frontend changes together, including `main.js`, cross-page automation, session statistics, Collection Hall, and public profiles. Verify the new `bundles` endpoint is reachable using the project's publishable-key/session setup.

To keep the navigation hidden during a staged rollout, turn Collection Hall OFF in Upcoming Features until both functions and the frontend are ready. That switch stops new Bundle routing and endpoint actions. Existing progress and snapshots remain stored.

Do not revert/drop the Bundle tables to undo a frontend release: completed contributions are irreversible. Preserve progress and disable the section if investigating an issue. If reverting the roll source, use the verified pre-Bundle main version; do not substitute an old unoptimized roll function.

## Verification

- `npm run test:bundles`: executable Postgres/PGlite migration tests and endpoint/presentation tests. Covers all 104 definitions, thresholds, duplicate mutation IDs, protected/foreign/missing specimens, batch rollback, capped progress, explicit auto settings, ambiguity, lease replays/expiry, Master gating, Crown snapshot persistence, service grants, and denied client writes. PGlite executes the real SQL, but is not a multi-connection production concurrency/load test.
- `npm test`: existing regression suite, with Bundle tests included in pretest.
- `npm run test:bundles-ui`: Playwright with mocked backend responses; runs the actual page code. Start `PORT=5573 npm run dev`. Playwright/Chrome can be supplied separately with `BUNDLES_PLAYWRIGHT_MODULE`, `BUNDLES_BROWSER_CHANNEL`, and `BUNDLES_PREVIEW_URL`. Screenshots default to `/tmp/gameplay-bundles-{desktop,crown,mobile}.png`. It checks toggles, explicit batch selection, Master refresh/unlock, Crown confirmation, and mobile overflow without contacting Supabase.

After deployment, use a test account to verify a manual donation, a unique auto match, an ambiguous match, full targets, and the protected Crown path on both roll and non-roll pages. Run simultaneous requests against one account to verify live locking, check roll p50/p95 latency, and verify live endpoint authentication/CORS. Leave actual Crown sacrifices to deliberate user confirmation.
