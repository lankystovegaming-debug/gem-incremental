# Dungeon combat balance — 17 October 2026

Implements the final Workbench-adjusted simulation candidate on weekly PR #514.
Source of truth: deployed `dungeons` version 4 (confirmed identical to the weekly
baseline), live catalog snapshots, and the completed balance simulation.

## Fixed rules

- Stored dropped gear GP and existing drop/mutation/material/essence odds stay unchanged.
- Mutation combat multiplier: `min(12, 1 + log2(value_multiplier))`. Combat GP is
  rounded once after scaling the pre-mutation item power. Canonical drops are
  reconstructed from room/components/quality/upgrade to avoid double rounding.
  Customized/legacy GP uses its actual stored GP divided by the catalog mutation
  value multiplier, then multiplied by the combat multiplier. Unknown legacy
  mutation names retain their raw power rather than losing an item.
- Select the highest **combat** GP across every owned dungeon item, including
  armor. Do not sum items or restrict it to weapons. Keyset pages of 500 avoid
  the Data API row cap; `(player_id,id)` supports those pages. Selection runs only
  at room start, not on each attack. Exceptionally large inventories still cost
  proportionally more reads; consider a transactional aggregate/cache if needed.
- Attack = `10 + 2*max_equipment_tier + floor(bestCombatGP/10000)`;
  starting health = `100 + floor(bestCombatGP/5000)`.
- Workbench boosts: the exact 73 Tier 2–9 values in
  [dungeon-balance-recipes.json](dungeon-balance-recipes.json). Tier 1, Tier 10+,
  all ingredient quantities and essence costs are unchanged. Recipe and existing
  craft updates require matching old GP, preserving custom values. The migration
  is safe to reapply. Enemy drops are not backfilled or rewritten.
- Fixed room reference: `supabase/functions/dungeons/balance-reference.json`,
  exactly the final simulation's 1,500 full-precision attack values. SHA-256 of
  its compact JSON array:
  `037163e443d2762712a782526c7ff00277f06845e1c6e56ace528b90b35b4cc6`.
  The calibration's log smoothing (0.08) and maximum 2% room-to-room increase are
  already baked into it. Never recalibrate from the entering player's gear.
- Base Normal HP = `reference*3.25`; boss HP = `reference*10.5`. Apply role,
  difficulty, repeats, rank and mob mutation once, then round. Catalog HP already
  contains region/difficulty/boss/repeat factors; normalize before reuse.
  Elite HP multiplier is 1.8 (was 2.5). Non-boss combined rank/mutation HP is capped
  at 12; bosses keep mutation and repeat scaling. Defense = `floor(.25*sqrt(HP))`.
- Enemy damage, its rank/mutation multipliers, retaliation factor 0.08 and level
  behavior remain unchanged. Optimized `roll` is untouched.

Existing active/won runs keep their saved attack, health and combatants. No fight
is reset or recalculated mid-run. Newly started runs save the balance version,
starting health and combat GP in `room_state`. Claims keep existing semantics.
Workbench shows raw/combat GP separately; dungeon fights display saved attack
and health. Older snapshots are labelled as previous-balance fights.

## Expected balance and limits

The final candidate simulated 1,750 trajectories with seeded drops, farming and
crafts. Normal 500/500, low-luck 250/250 and both jackpot cohorts 250/250 finished;
normal median hits were 3 on Normal mobs, 7 on Elites and 12 on bosses. These are
model outcomes, not a guarantee for live players. Only 2/250 no-crafting profiles
finished: **Workbench use is deliberately important late-game**. Farming policy,
future loot/catalog edits and real player behavior can change those outcomes.

The room-449 Chocolate Fine +3 example keeps 104,560,875 raw GP but contributes
3,216,578 combat GP: 331 attack and 743 health at main-game equipment tier 0.
The lucky advantage is temporary, not a permanent dungeon bypass.

## Verification

`npm run test:dungeons` covers existing regressions plus 72,000 room/rank/mutation
checks, the jackpot example, 1,201-item best-gear pagination, all 1,500 actual
catalog rooms, 73 recipe/backfill changes, 142 exact-cost crafts, custom/drop
preservation and migration reapplication in an isolated PostgreSQL engine.
`npm run test:dungeons:browser` checks mobile/desktop layout and raw/combat labels.
Both Edge Function entrypoints must also bundle successfully with shared imports.

## Owner deployment order — nothing deployed by this change

1. Use existing controls to temporarily disable Dungeons and Workbench while
   deploying. Let in-flight requests settle. Do not delete or reset active runs.
2. Ensure the five earlier dungeon migrations through
   `20261012060602_dungeon_workbench_original_recipe_repairs.sql` are already
   applied. Then apply **only**
   `20261017022655_dungeon_combat_balance.sql` for this balance change.
   Inspect any customized recipes intentionally skipped by the old-GP guards.
3. Deploy canonical **dungeons** and **workbench**, including their shared
   `dungeons/balance.js`, `formulas.js` and reference JSON imports. Preserve
   existing authentication/verify-JWT settings. Do not deploy `roll`.
4. Publish the frontend. Check the Workbench raw/combat GP labels, a fresh low
   room, a mutated item, a boss and a saved pre-update run on staging first.
5. Re-enable both sections and monitor deaths, attack counts, recipe usage and
   room-boundary dropoffs. No live account or backend was modified during tests.

Do not bulk-deploy unrelated weekly migrations/functions: other weekly work has
its own rollout order and may remain release-disabled. Prefer a forward tuning
fix over destructive inventory rollback; raw dropped GP is preserved throughout.
