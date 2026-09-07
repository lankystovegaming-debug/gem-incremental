# Late-game equipment expansion — deployment handoff

Implementation branch: `feat/late-game-equipment-expansion`.

No Supabase migration or Edge Function has been deployed. The implementation is based on repository commit `4fed279` and live Supabase project `igrddscmrdrrwtvyspbf`, inspected on September 6, 2026. The optimized `roll` v135 matched the repository's source apart from trailing whitespace. Live crafting, Masterwork, roll-lease, roll-recording, equipment triggers, schema columns, and rarity bands were also checked.

## User deployment order

1. Apply `supabase/migrations/20260906070703_late_game_equipment_expansion.sql` to the specified project.
2. Deploy the changed `roll`, `manual-deposit`, and `craft-recipe` Edge Functions from this branch. Keep the existing function configuration, including `roll`'s authentication configuration and `eventRules.ts` companion file. The migration must precede the new roll function because lease claims now return the genuine-roll counter.
3. Publish the frontend changes from this branch.

The existing `masterwork-equipment` function delegates to the modified database function and needs no source deployment. No seed/reset operation is required. Do not run older recipe seeds over the migrated recipes.

## Equipment and stats

| Equipment | Cash | Lifetime rolls | Equipment stat |
|---|---:|---:|---|
| T13 Bottomless Singularity Bag | $200,000,000 | 200,000 | 2.20× total Weight Multiplier |
| T14 Event Horizon Vault | $325,000,000 | 325,000 | 2.35× total Weight Multiplier |
| T15 Omnidimensional Vault | $500,000,000 | 425,000 | 2.50× total Weight Multiplier |
| T16 Plastic Shopping Bag | **$500,000,000.10** | 1,000,000 | 2.55× total Weight Multiplier |
| T13 Neutron Boots | $100,000,000 | 200,000 | **+8×** Weight Luck |
| T14 Spacetime Walkers | $200,000,000 | 325,000 | **+8.75×** Weight Luck |
| T15 Reality Breakers | $350,000,000 | 425,000 | **+9.5×** Weight Luck |
| T16 Empyrean Pickaxe | $350,000,000 | 350,000 | 27× total Luck / 2.90× total Roll Speed |
| T17 Eternity Pickaxe | $500,000,000 | 425,000 | 28× total Luck / 3× total Roll Speed |

Totals mean the base 1× plus that equipment alone, before Masterwork and other buffs. The user explicitly confirmed that Boots retain the existing additive bonus convention, so their totals before other buffs are 9× / 9.75× / 10.5×. This avoids making Neutron Boots weaker than current T12 Boots (+7.25×).

All locked material counts and specimen thresholds are in `src/data/lateGameEquipment.js`, mirrored exactly by the migration and checked against its installed database recipes. The eight normal upgrades total 18,350 Legendary, 7,225 Mythic, 495 Exotic, 12 Exalted, and 5 Cosmic materials.

The Plastic Shopping Bag also requires 67 Plastic Bags. These are inert Daily Shop materials costing $0.10 each, with 67 available when their specialist offer appears. Inventory displays them as materials without a potion-use action. The equipment recipe always shows the full $500,000,000.10.

## Specimen and Conservation behavior

- Bulk counts use exact base-rarity bands. Specimens use final weight divided by base weight and allow higher rarity only where `+` is shown.
- One deposited gem advances its own rarity's bulk count and at most one heavy-specimen slot. Specimens must fit a rarity band present in the recipe's bulk totals.
- The strictest eligible specimen slot is filled first. Remaining bulk space is reserved for unmet specimens, preventing ordinary deposits from making completion impossible. This is why a nearly full bulk requirement can stop accepting lightweight gems.
- Both manual and automatic deposits allocate progress inside one database transaction. Manual selection checks ownership and locks, searches beyond the first 1,000 inventory rows, and locks the chosen specimen.
- Conservation preserves an ordinary count-deposit gem with 10% probability while T15 Bag is equipped, or 12.5% while the Plastic Shopping Bag is equipped. An auto-deposit preserved gem is saved to inventory and skips Auto Sell for that roll.
- Heavy specimens, mutation/weight/serial requirements, and other special requirements receive no Conservation. Masterwork relics are unchanged.
- Previously unlocked prerequisite equipment stays stored, with its enchant and Masterwork state preserved, matching the live crafting function. Only the new item is equipped.

Existing T13 owners receive the revamped bonus while retaining their legacy flag. New T13 crafts do not receive that historical flag. Old named-gem T13 progress receives capped credit in the new rarity totals using live rarity bands; ten Legendary spaces remain reserved for new heavy specimens because old count-only deposits contain no individual weight evidence. Original progress keys remain available for audit.

## Passive timing and weight behavior

The new account-wide `equipment_genuine_rolls` counter begins at zero when the migration is applied. It advances with completed server rolls, persists across sessions, and does not reset when equipment is switched. Rejected requests, purchases, crafting, and Vein Hunter copies do not advance it. The currently equipped item receives its effect at the applicable 50 / 67 / 100 / 250 boundary. One-roll potions are still genuine rolls.

The live diminishing Weight Luck calculation and 1/3 ordinary continuation are retained. Heavy Step adds ten percentage points to the unconditional tail-entry probability after that calculation. Reality Collapse guarantees the tail and uses 40% continuation. Neutron Boots use at least 36% continuation when entering the tail. Existing event behavior is preserved outside these new effects.

Gravitational Storage modifies final weight before value calculation, persistence, and deposit eligibility. Event Horizon applies +10% value at final weight ≥5×. Alignment and Eternity multiply effective Luck; Eternity's mutation multiplier applies after other mutation modifiers. Periodic boots and bag effects are not copied onto Vein Hunter bonus specimens.

Bag for Life checks every 67th genuine roll, with a 1/67 cosmetic chance. Its `bagged` marker is persisted in existing event metadata and displayed on the roll and inventory gem. It has no stat, mutation, rarity, or value effect.

The optimized roll function retains its cached catalogs and background bookkeeping. Production latency has not been benchmarked because these changes are intentionally undeployed.

## Masterwork

The five levels, passive pools, imprint multiplier, insight behavior, and existing equipment-category eligibility remain unchanged. Bags do not gain a new Masterwork passive pool. No Legendary/Mythic materials are added.

Cash/Enchant/Ancient level multipliers for T10–T17 are respectively:
`1/1/1`, `1.2/1.15/1`, `1.4/1.3/1.2`, `1.65/1.5/1.4`, `1.9/1.65/1.55`, `2.2/1.8/1.7`, `2.5/2/1.85`, `3/2.25/2`.

Passive reroll cash uses the tier cash multiplier capped at 2×; relic scaling retains existing behavior with the expanded tier multipliers. T17 normal rerolls cost $4M / $7M / $12M / $20M / $30M for 1st / 2nd / 3rd / 4th / 5th and later. T17 reaches MW V for $148.5M total cash. Frontend cash rounding matches Postgres exactly.

## Validation

Run `npm ci` and `npm run test:late-game` for the new checks. They include:

- The actual roll weight sampler, with 200,000 samples per configuration.
- The entire new migration in local PGlite/Postgres using a fixture of the relevant live schema columns, without player data.
- All nine database recipes matching the frontend; unique specimen allocation and reserved bulk space.
- Locked specimens, large inventories, consumed inventory rows, retained prerequisites, and old T13 progress credit.
- Exact cash charging and transaction rollback for insufficient funds.
- Genuine-roll claim rejection and completed-roll counting.
- All five actual SQL Masterwork upgrades and six rerolls for every tier T10–T17, compared with frontend prices.
- Statistical Conservation checks and direct browser-role denial for service-only deposit helpers.

Relevant existing crafting, equipment, event, and roll-lease tests pass, as do syntax and whitespace checks. `npm test` reaches the final existing `tests/admin-panel-tabs-test.mjs` and fails its outdated `community` panel-list assertion. The identical failure was reproduced on untouched base commit `4fed279`; no unrelated admin code was changed.
