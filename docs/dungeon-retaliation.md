# Dungeon retaliation — 19 October 2026

Standalone change following the merged dungeon balance in PR #514. Implements
the recommended `balanced` retaliation candidate from the completed simulation.
Nothing in this PR deploys or changes production state automatically.

## Rules

Retaliation happens once after the attacked mob survives the player's hit. No
counterattack occurs on a killing blow, and the next enemy does not attack during
that same turn. No timers or simultaneous attacks from all mobs are introduced.

Use the existing **fixed** 1,500-room attack reference A, not entering-player HP:

```text
expectedHealth = 100 + floor(2 * max(0, A - 10))
counterDamage = max(0.25,
  expectedHealth * rate * difficulty * sqrt(clamp(role, 0.5, 2)) * mutation)
```

| Enemy | Base rate |
|---|---:|
| Normal | 1.5% |
| Elite | 2.5% |
| Champion+, including Cursed | 3% |
| Boss | 3% |

- Difficulty damage factors: Easy 0.75, Normal 1, Hard 1.3, Brutal 1.6. Bosses
  use their catalog's effective difficulty rating.
- Extract the role/archetype from catalog damage by removing the existing
  region/difficulty/boss/repeat factors. Use the existing runtime role for rows
  without parsed damage, including Mimic. Clamp and square-root it.
- Mutation damage factors are Common 1.05, Uncommon 1.15, Rare 1.35, and 1.6
  maximum for Epic/Legendary. Mutation HP is unchanged.
- Rank damage is already represented in rate. Do not multiply by legacy rank
  damage again. Boss repeats still increase HP but do not double-scale damage.
- Counter damage is the actual HP removed: **do not multiply it by 0.08 again**.
  Keep full numeric precision server-side; display up to two decimal places.

The lower boss rate is intentional: bosses take longer to kill, can appear
multiple times and have adds. A Brutal Legendary boss already reaches 7.68% of
fixed expected health per counter before role adjustment.

## Saved fights and rollout compatibility

New enemies store `retaliationDamage` and `retaliationVersion: "2026-10-19"` in
their existing server-written JSON snapshot. New room state records the version
too. Existing `damage` retains its legacy meaning for compatibility.

Attack reads only those saved enemy fields, not current gear, catalogs, client
damage inputs or player max health. Unversioned existing runs retain exactly
`damage * 0.08`. A malformed current-version snapshot errors without persisting
an attack rather than silently producing free or arbitrary damage.

The response reports `retaliationDamage` (0 on a kill) and `retaliationEnemy`.
The UI shows fractional HP, explicit counterattacks and killing-blow feedback.
It can infer old-backend counter damage from the returned health delta, allowing
a frontend-first rollout. A page-scoped hidden rule keeps Claim hidden on lost
runs; feedback wraps on narrow screens. Won/lost enemy displays refresh too.

No changes to loot, spawn/mutation odds, mob HP/defense, player GP/health/attack,
Workbench costs/powers, database schema, RLS, authentication, or optimized roll.

## Simulation and risk

The completed analysis used deployed dungeons v5, all 1,500 live room snapshots,
142 enabled recipes, 66 mutations, 30 bosses and 11 regions. Main, pilot, stress
and holdout sweeps covered 4,970 seeded trajectories and 8,345,553 room attempts.
Attempts share players/seeds and are not independent live observations.

Recommended-curve main sweep: 200 profiles per cohort; independent holdout: 100
per cohort. All five crafting-enabled cohorts eventually cleared all 1,500 rooms
in both sweeps, with retries/farming, not without deaths.

| Cohort | Completed, main + holdout | Main forward-attempt death rate |
|---|---:|---:|
| Normal + Workbench | 300/300 | 2.33% |
| Low luck + Workbench | 300/300 | 4.15% |
| Tier-13 veteran | 300/300 | 1.97% |
| Chocolate jackpot at room 449 | 300/300 | 2.21% |
| Aether jackpot at room 449 | 300/300 | 2.18% |

Normal boss-room attempt deaths (including boss farming) rose from 0.06% to
9.68%. Median normal forward-room health loss rose from 0.84% to 6.81%; p90 was
42.23%. Median extra farming attempts: 132 normal, 244 low luck. No-crafting
control finished 0/100 (live damage 2/100); Workbench remains essential late-game.
Rooms 1,331–1,400 deserve explicit staging checks due to concentrated risk.

Profiles are synthetic: main-game tier stays at 0 or 13; low luck suppresses gear
mutation combat benefit, not enemy/loot randomness. Jackpot controls guarantee
the historical room-449 Fine +3 drop once, not its probability. Farming/crafting
use sampled resources with a greedy policy, four farming attempts after a forward
death, at most 40 tries per room and 12,000 farming attempts per profile. These
budgets/policy affect outcomes; they are not a proof of universal clearability.
No healing items or regen were invented; health resets at room start as deployed.

The implemented backend is replayed through the same 1,000-profile main sweep
and compared with the approved model results. See the checked-in summary for
the exact comparison and inputs. This replay is a parity check, not independent
additional evidence about live player behavior.

## Verification

- `npm run test:dungeons`: existing formulas, 142-recipe database crafts and
  backfills, all-room HP regression, progress/unlocks and new retaliation tests.
- 324,000 damage cases span 1,500 references, all ranks, four difficulties and
  all mutation factors. Tests cover boss repeat normalization, role fallback,
  cap, saved legacy/new damage, no counter on kill, no immediate next-mob attack,
  lethal responses and optimistic-update conflicts.
- `npm run test:dungeons:browser`: mobile/desktop counterattack logs, fractional
  health, legacy-response fallback, killing blows, lethal counters, correct
  attack/claim controls and layout, plus existing catalog/Workbench regressions.
- Source baseline verified byte-for-byte (trimmed) against deployed dungeons v5.

## Owner deployment — no migration

1. Publish the frontend, including `dungeons/combat-feedback.js` and CSS. It is
   compatible with the old backend response.
2. Deploy **only the canonical `dungeons` Edge Function**, including its imported
   `retaliation.js`, balance reference and other existing shared files. Preserve
   the current deployed `verify_jwt=false` setting and existing
   `withSupabase({ auth: "user" })` authentication middleware. Do not deploy roll,
   Workbench or unrelated functions; no SQL migration is required.
3. Smoke-test a saved legacy fight and fresh Normal/Elite/boss/mutated fights on
   staging. Check a surviving hit, a kill and a lethal counter, then publish to
   players using the owner's normal release process.
4. Monitor deaths, failed-room/farming counts and late-region stalls. Simulation
   outcomes are not a live guarantee. Tune forward if needed rather than wiping
   runs or inventory. A rollback to the previous function uses its weaker legacy
   damage rule, including on newly versioned fights; it does not rewrite records.

No production account, database, configuration or Edge Function was modified
during implementation or tests. Deployment remains with the owner.
