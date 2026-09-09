# Serious post-Celestial pickaxe rebalance

Prepared against Supabase project `igrddscmrdrrwtvyspbf`, deployed `roll` version 150 (SHA-256 `2724df307ddbd91eca3af896ff5093113bc05cef8f89462e67660e472c7c80b1`). Its optimized consolidated source matched the repository at `34a0126` apart from a trailing newline. Live recipe rows and crafting, equipment normalization, special discovery, deposit planning, and roll commit functions were inspected read-only.

## User deployment

Nothing has been deployed. Apply `supabase/migrations/20260909100058_serious_pickaxe_desirability_rebalance.sql`, then deploy the optimized single-file `supabase/functions/roll/index.ts` as `roll`, retaining the existing `verify_jwt = false` configuration and in-function authentication. Publish the frontend changes with this backend update so displayed and enforced values agree. No other Edge Function needs deployment.

The migration updates exactly eight existing recipes and refreshes their owned equipment bonuses through the existing normalization trigger. It retains requirement IDs, deposits, ownership, equipped status, enchant state, and persistent passive counters. Reapplying it is safe. Previously spent materials are not refunded; existing deposits remain credited even when they exceed a reduced requirement.

Celestial stats/passive, All-In, and Toy recipes/stats/passives remain unchanged. Toy Shovel's borrowed specialist stats are explicitly pinned to their pre-rebalance values so these buffs do not indirectly change a Toy. Reality Shifter and Max Luck remain intact. Fortune's per-gem boost is applied before the final Max Luck cap, excludes flat-luck gems, and respects disabled buffs.

Empyrean/Eternity retain the backend's included-in-bulk, final-weight specimen semantics. Tectonic keeps independent specimen buckets with highest eligible incomplete threshold first. The new genuine-roll gates use existing non-consuming `equipment-history/genuineRolls`, since legacy `lifetime-rolls` intentionally counts total rolls. No crafting or progression system was duplicated.

Existing Ascension, additive Mutation Surge, Deep Pressure, Velocity/Breakneck, canonical Special Gem classification, Archaeology quality tables, and exclusive 60-second Relic Potion implementation are retained. Equipment cards display Archaeology level/next milestone and per-gem Resonance with effective Special Gem Chance.

## Validation

- `npm run test:pickaxe-rebalance`: rule boundaries, optimized handler execution, Max Luck/Reality Shifter/All-In regressions, exact recipes, genuine gates, transaction rollback, migration idempotency, state preservation, material consumption, and excluded recipes.
- `node tests/equipment-overhaul-database-test.mjs`: independent specimen buckets, potion consumption, special discovery exclusions, atomic roll commits.
- `node tests/qol-rules-test.mjs`: filter rules.
- `node tests/equipment-overhaul-ui-test.mjs` with the bundled Playwright module: all nine specialty/generalist labels, desktop/mobile layout, Toy separation, four-request Bedrock bulk deposit, no page errors.

All passed locally. No live write, live roll, migration deployment, or Edge Function deployment was used for testing. Runtime latency is not re-benchmarked against production; the optimized hot path is preserved and Fortune adds only an in-memory per-candidate multiplier.
