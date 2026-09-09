# Reality Shifter, Bedrock Pickaxe, and Max Luck

Prepared from `origin/main` at `3e6fd13`. The repository's single-file optimized `roll/index.ts` matched live project `igrddscmrdrrwtvyspbf`, roll version 149, apart from a trailing newline. No live data, migrations, or Edge Functions were changed.

## Manual deployment

1. Apply `supabase/migrations/20260909060453_reality_shifter_bedrock_max_luck.sql` in the Supabase SQL editor. It assumes the equipment overhaul, QoL settings, and five-item batch are already deployed, as verified in the live schema.
2. Deploy **roll** using `supabase/functions/roll/index.ts`. It remains the optimized single-file build; `equipmentRules.js` is its matching browser/test source. Retain the existing authentication configuration (`verify_jwt = false`; the handler validates the user).
3. Publish the frontend changes through your normal repository deployment process.

Deploy the migration and roll function together before exposing the new frontend recipes. No other Edge Function needs deployment: existing `manual-deposit` and `craft-recipe` call the updated SQL functions. No deploy command has been run or automated.

## Equipment behavior

Reality Shifter is a Toy in the existing pickaxe slot: 40× Luck, 0.4× speed, 0× ordinary mutation chance, 0.8× Weight Luck and weight multiplier. Its persisted equipped-roll count triggers Reality Shift on rolls 500, 1000, etc. The ×400 belongs to the authoritative special-Luck layer, before additive one-roll potion Luck and the world layer. Shifted independently rolls at 20% on that trigger and multiplies value by 35. Ordinary mutation chance remains zero even with additive admin bonuses. Existing relic immunity to mutations is retained.

Bedrock is a serious horizontal post-Celestial pickaxe: 25× Luck, 3.1× speed, 1.05× mutation chance, 5× Weight Luck, and 1.55× weight multiplier. Foundation gains use the live rarity boundaries: Common 1–9, Uncommon 10–49, Rare 50–99, Epic 100–999. At 100 Foundation the meter resets and the **following** ten genuine rolls get 37.5× pickaxe Luck, 6.25× pickaxe Weight Luck and 1.705× pickaxe weight multiplier before external layers. Those ten rolls do not gain Foundation.

Both reuse `players.equipment_state` and the existing claim/commit lease, preserving progress on equipment switches and protecting against duplicate commits. Bonus rolls do not advance counts, gain Foundation, or spend burst rolls. Bedrock also counts toward All-In's historical endgame ownership requirement and can supply its base stats to Toy Shovel's existing borrowing pool.

## Crafting

Reality Shifter: 1,000 Eternal Glowstone, 1,000 Nyx Obsidian, one Solarion, one Polaris, $125M, and 50,000 lifetime genuine rolls. Live canonical catalog is `private_feature_gems`:

| Gem | Canonical ID | Daily rarity |
| --- | --- | --- |
| Eternal Glowstone | `0dc2ff90-f76d-4574-b4f8-09e49a286e81` | 1/15,000 |
| Nyx Obsidian | `324f8f9f-801c-4236-b953-9482ccfc6d0f` | 1/15,000 |
| Solarion | `bfaa9e52-cc3c-4b8c-88d5-d48da502d198` | 1/125,000,000 |
| Polaris | `d62179aa-6450-407b-afb6-9ca78adc2abc` | 1/225,000,000 |

Recipes use canonical names because the existing crafting engine keys named gem requirements by name.

Bedrock consumes 10,000 Common + 7,500 Uncommon + 5,000 Rare + 2,500 Epic, $150M, and requires 250,000 lifetime genuine rolls. Both use the existing `equipment-history`/`genuineRolls` gate; history is not spent and no previous pickaxe is consumed.

Both recipes have a **Deposit all materials** button. A single request per material requirement consumes all eligible inventory specimens up to its remaining cost. Locked, museum-locked, and other players' specimens are excluded. Auto Craft uses the same existing per-roll planner. Materials for these two recipes are always consumed; Plastic Conservation is unchanged for existing recipes.

## Max Luck

A blank input stores null and disables the cap. Valid values are 1 through 9,007,199,254,740,991, including decimals. The settings RPC and a table trigger reject malformed, negative, or out-of-range values; the roll boundary also sanitizes saved settings.

Normal selection applies `min(final Luck, Max Luck)`, including after gem-specific Luck factors, and uses capped Luck for its rarity floor. Flat-gem checks, relic probabilities, All-In's separate 4× flat chance, and the other four equipment stats remain unchanged. The roll display shows capped Luck, cap, and uncapped Luck; Stats includes the cap and active equipment burst in its preview. Breakneck bonus selection also respects Max Luck.

## Verification

- `npm run test:reality-bedrock`: production-handler scenarios, pure roll boundaries, and PostgreSQL-compatible migration/crafting tests.
- `npm run test:equipment-overhaul`, `npm run test:five-items`, and `npm run test:qol`: existing systems and integration regressions.
- `tests/equipment-overhaul-ui-test.mjs` and `tests/qol-ui-test.mjs`: browser checks on desktop and 390px mobile, including recipe placement and saving/reloading/clearing Max Luck.
- Database tests consume all 25,000 specimens, test exact cash costs and historical gates, reject invalid settings, and verify switch persistence and idempotent leased commits.

Tests use local fixtures and mocked services. Live latency after deployment has not been measured; the roll change adds no network calls and retains the v149 hot path. Historical genuine-roll progress uses the existing canonical counter without backfilling or reinterpreting `total_rolls`.
