# Five-item equipment batch

Prepared from `origin/main` at `b4bc30b` and live Supabase project `igrddscmrdrrwtvyspbf` on 2026-09-09. The starting roll source matches deployed optimized roll v147 (apart from a trailing newline). No Supabase changes have been deployed.

## Manual deployment

1. Apply `supabase/migrations/20260909023444_five_item_equipment_batch.sql`.
2. Deploy the updated `supabase/functions/roll/index.ts` to the existing `roll` function, preserving its existing authentication configuration (`verify_jwt = false`; the handler authenticates requests).
3. Publish the frontend changes together. No other Edge Function needs redeployment.

The roll entry point remains self-contained, with the same catalog caches, parallel reads, lease guard and background bookkeeping as v147. Shared browser rules are mirrored in the consolidated entry point. There is no new database call on the ordinary successful-roll path. House Edge uses a separate atomic commit and schedules progression bookkeeping in the background.

## Implemented behavior

- Fortune Pickaxe: 33 / 2.7 / 0.95 / 4 / 1.40 total multipliers, no intrinsic passive; finalized material, cash and historical raw-rarity gates.
- All-In Pickaxe: 250 / 0.20 / 0.10 / 0.10 / 0.10. Admin Event modifiers remain; personal stats, secondaries, enchants, masterwork passives, research, guild, potions, artifacts and temporary mutation buffs do not affect the roll. Equipment stays equipped; wall-clock potion expiry continues. Ignored one-roll charges are retained. Flat-luck gems get 4× their normal check probability, independent of ordinary Luck.
- All Rounder Toy: 2× all five stats. Balanced is an independent 1/20 genuine-roll proc with 1.2× value. Catalog metadata supports rarity calculations and displays; the ordinary mutation selector explicitly excludes Balanced.
- Jackpot Slot: finalized stats and all four independent multiplicative Luck effects. Periodic effects use the accepted account-wide genuine-roll number, including losses. A 0.77% loss gives no specimen, sale, deposit or bonus reward, but advances genuine/lifetime/equipment counters, progression, one-roll charges and temporary-effect/enchant durations. Loss receipts cannot double-increment counters.
- Money Pickaxe: finalized stats and recipe. Selection and fallback pools are restricted to rarity <100 before RNG, including with buffs disabled or arbitrarily large buffs. Relics cannot bypass Cheap Taste.

Crafting bulk tiers follow current boundaries: Common 1–9, Rare 50–99, Epic 100–999, Legendary 1,000–9,999, Mythic 10,000–99,999, Exotic 100,000–999,999, Exalted 1,000,000–9,999,999. Cheap Taste uses the explicitly requested <100 ceiling. Named ingredients are separate consumable requirements.

Normal secondary behavior and Plastic Shopping Bag are unchanged. New Toys occupy the pickaxe slot and appear in Toys. Historical requirements have progress displays and no Deposit button. Backend crafting validates them under the player lock and never consumes historical progress or prerequisite pickaxes.

## Historical progress

- Raw-rarity counts backfill from distinct genuine roll numbers in retained `best_roll_history`, using raw rarity rather than mutations/effective rarity.
- Natural-weight counts backfill only from retained specimens matched to the genuine history entry by player, roll number, gem name and final weight. The source is `rolled_weight_multiplier`, not final weight divided by base weight.
- Previously owned endgame pickaxes backfill from current ownership and the existing overhaul archive, then persist in a protected ownership history table. Celestial and Toys are excluded; Fortune counts.
- Lifetime earnings and genuine rolls use the existing backend fields.
- Future rare-roll and natural-weight counters are saved with the existing equipment commit. Bonus/recursive rolls and House Edge losses cannot increment specimen counters.

The backend does not retain a complete natural-weight history for sold/deleted specimens. Those older specimens cannot be reconstructed reliably, and are not fabricated by the backfill. Likewise, ownership and raw-roll history already deleted before available records cannot be recovered. Future qualifying history is permanent.

## Verification

Run `npm run test:five-items` for deterministic production-selector, optimized-handler and local PostgreSQL tests. These cover exact stats, 7/777 boundaries and stacking, 0.77% loss boundary, 4× flat checks, Balanced exclusivity, no recursive procs, historical crafting, ownership retention, permission denial, and atomic/idempotent losses.

The crafting browser smoke test covers all new items, historical progress text, mobile width and page errors:
`node tests/equipment-overhaul-ui-test.mjs` (requires Playwright/Chrome).

Final regression run: 93 commands passed; the crafting browser smoke test also passed.

Two existing tests also fail on unchanged `b4bc30b`: `gem-builder-code-serials-test.mjs` expects a removed `mutation-tab__custom` class, and `live-mutation-chance-test.mjs` expects a different existing chance-label fallback order. Neither failure was introduced by this batch.
