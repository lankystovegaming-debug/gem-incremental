# Equipment overhaul: manual deployment

Prepared on branch `codex/equipment-overhaul` from `origin/main` (`4e7b76a`). Backend reference: Supabase project `igrddscmrdrrwtvyspbf`, live optimized roll v137 and live crafting/lease functions inspected on 2026-09-07. **Nothing has been deployed.**

## Release order

Schedule a short maintenance window so old clients/roll handlers do not run against a partly updated release. Take a database backup first. The migration also stores original equipment, recipes and crafting progress in service-only `equipment_overhaul_archive`; this is a data archive, not an automatic rollback.

1. Apply the incoming `20260908000000_lantern_mutation_luck.sql` migration first if it is not already applied, then review and apply `supabase/migrations/20260908000001_equipment_overhaul.sql` to the specified project. It is one transaction, with a live ingredient guard that aborts if any named ingredient is missing, disabled or no longer always available. Do not blindly replay the repository's historical migrations onto the existing live project.
2. Deploy the following Edge Function folders, keeping the project's existing authentication/configuration settings:
   - `supabase/functions/roll/` (include `index.ts`, `eventRules.ts`, **and `equipmentRules.js`**)
   - `supabase/functions/craft-recipe/`
   - `supabase/functions/manual-deposit/`
   - `supabase/functions/unequip-equipment/`
3. Release the frontend from the same branch. Its shared equipment rules import `supabase/functions/roll/equipmentRules.js`; this static JavaScript module must be served along with `src/`, `crafting/`, `inventory/` and `debug/`. It contains public game rules and no credentials.
4. Verify a normal roll, Auto Roll, equipment switching, a manual specimen deposit, Auto Craft, a potion use, and the Clover/Lantern/Toys tabs. Inspect `luckBreakdown` and `equipmentPassives` in a roll response. Then reopen play.

The migration updates SQL crafting, deposit, masterwork and equipment-switch functions; those changes do not require separate Edge Function deployments. It adds service-only lease/state commits, explicit special-gem tags, Relic Potion and authenticated preview/progress helpers. Future special gems must explicitly set `special_gem=true`; rarity alone does not classify them.

## Data preservation

- Existing redesigned items retain their row IDs, ownership, enchants and stored masterwork data wherever possible. Normal secondary effects and masterwork upgrades are disabled; Pickaxe masterwork passives remain. Plastic Shopping Bag retains its existing masterwork behavior.
- Retired Boots T13–T15 map to Gravitational Boots. Retired normal Bags T12–T15 map to Dimensional Vault. When multiple owned rows collapse onto one ID, the equipped row is preferred, then the strongest masterwork/tier. Full original rows remain archived. Retired recipes are removed; their deposits remain stored and archived, and retired Auto Craft targets are cleared.
- Already-started, still-supported secondary crafts keep their original materials/costs and progress under server-owned `_equipment_recipe` metadata. They award the redesigned item. Once finished, subsequent crafts use the new recipe. This avoids inventing exchange rates between unrelated deposited gems.
- Empyrean/Eternity retain their published recipes and progress keys, with only the previous-pickaxe requirement removed and rewards redesigned.
- Plastic Shopping Bag's stored recipe changes only by adding the Toys display tab. Dimensional Vault satisfies its retired Omnidimensional Vault ownership prerequisite without being consumed. Plastic's stats, conservation, Bagged cosmetic, cost and remaining requirements stay intact.
- Independent specimen buckets consume one deposited gem into one bucket; Auto Craft chooses the highest eligible incomplete weight threshold. Manual deposits can target a bucket. Plastic retains its original included-specimen semantics.

## Explicit balancing choices

- Ascended value is configurable as `ASCENDED_VALUE = 2` in `equipmentRules.js`.
- Eternity uses exactly 1.10× base mutation chance. Its burst adds 50 to the fully calculated normal mutation multiplier. Empyrean adds exactly 50 to the enchant component before additive personal stacking.
- Burst counters are genuine rolls made with that specific pickaxe and survive switching. Accelerator spool alone resets on switching. The roll after reaching a burst threshold starts the burst; Crushing Depth similarly affects the next five rolls.
- Focused is an explicit Luck-layer input with baseline 1. The only existing Focused source was retired Lantern Focused Beam. A future valid source can populate that input. World effects apply last, including to one-roll potions; the old additive admin Luck setting is converted into an equivalent final world factor for debugging.
- Specialist/Toy printed totals are fixed. Conventional Pickaxes retain their existing masterwork stat scaling. Stored secondary masterwork data is preserved but does not inflate their new single-stat multipliers. Plastic keeps its old additive weight contribution and masterwork scaling instead of being converted into a normal secondary multiplier.
- Archaeology always procs at 1/40. The spec leaves milestone loot distributions open; the configurable rows below improve quality only. A successful excavation increases mastery after choosing that drop's table. Random standard tiers choose equally among the four potion families.

| Prior successes | I | II | III | IV | Legendary | Relic | Mythic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0–24 | 34% | 27% | 20% | 10% | 6% | 2% | 1% |
| 25–99 | 29% | 29% | 22% | 11% | 6% | 2% | 1% |
| 100–249 | 24% | 28% | 25% | 13% | 7% | 2% | 1% |
| 250–499 | 19% | 26% | 28% | 16% | 8% | 2% | 1% |
| 500+ | 14% | 24% | 30% | 19% | 9% | 2% | 2% |

- Breakneck creates an independent extra specimen without reusing a consumed one-roll potion, incrementing genuine-roll mechanics or triggering itself. It records the specimen as a discovery. If the primary specimen fills inventory, no extra specimen is inserted. Existing genuine-roll history/counters advance once.
- Silly's two effects have separate internal IDs so both named “Silly” effects can coexist permanently with Happy and ordinary mutations. They are not added to the ordinary global mutation lottery.
- `TEMU LOADOUT` is cosmetic. The suggested optional achievement was not added to the live achievement catalog.

## Validation and maintenance

`npm test` includes the new pure-rule, PGlite migration and actual optimized-handler suites. Run the narrower suite with `npm run test:equipment-overhaul`. Tests exercise formula ordering, burst boundaries, pressure, stacking, all nine builds, generated-roll guards, loot, ownership remapping, grandfathered crafting, independent/manual buckets, potion aggregation and rollback, discovery eligibility, lease locking and commit permissions/idempotency.

`npm run test:equipment-ui` is an optional isolated Chrome smoke test, requiring Playwright (or `EQUIPMENT_PLAYWRIGHT_MODULE` pointing to its module). It mocks account data, blocks all external requests, checks the new crafting tabs and mobile width, and saves screenshots in the OS temporary directory.

The optimized handler retains catalog/event caching and deferred background work, removes a redundant mutation-catalog query, and adds one serialized state/loot commit. No production latency benchmark was performed; the roughly one-second target still needs verification after your deployment.

The migration is generated deterministically from `src/data/equipmentOverhaul.js`, `scripts/equipment-overhaul-schema.sql`, and `scripts/equipment-overhaul-functions.sql`. After editing those sources, run `node scripts/build-equipment-overhaul-migration.mjs` and rerun tests. Treat an applied migration as immutable; use a new migration for later changes.

After merging main `5924c94`, the undeployed overhaul migration was retimestamped to `20260908000001` so it runs after the earlier Lantern change. The consolidated overhaul recipes supersede that change’s Lantern values and tier-5 gate; minimum-tier requirement support remains available for grandfathered recipes. The legacy `mutation_luck_bonus` column is retained, while overhaul rolls use `mutation_chance_bonus` exclusively to prevent double-counting.
