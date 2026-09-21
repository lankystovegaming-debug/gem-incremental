# Phase 5 roll hot-path request budget

This change reduces Edge Function to PostgREST round trips. It does not move
RNG, gem selection, bundle routing, Auto Craft, or the complete roll into SQL.

The counts below describe an ordinary successful roll. Conditional calls such
as inventory inserts, bundle routing, Auto Craft, pet rewards, Deepcore, and
Deep Sea commits are deliberately shown separately because the chosen route
changes their count.

| Core operation | Before ×1 | Phase 5 ×1 | Before ×4 | Phase 5 ×4 |
|---|---:|---:|---:|---:|
| Full `roll_prepare_context` | 1 | 1 | 4 | 1 |
| Later subroll refresh/begin | 0 | 0 | 0 | 3 |
| `claim_equipment_roll_batch` | 1 | 1 | 1 | 1 |
| Standalone `claim_guild_mythic_surge` | 1 | 0 | 4 | 0 |
| `commit_equipment_roll` | 1 | 1 | 4 | 4 |
| Standalone critical bookkeeping | 1 | 0 | 4 | 0 |
| Standalone background bookkeeping | 1 | 1 | 4 | 0 |
| `release_server_roll` | 1 | 1 | 1 | 1 |
| **Core total** | **7** | **4** | **22** | **10** |

The later-subroll begin call refreshes player, inventory, equipment/enchant,
QoL/discoveries, active boosts, one-roll boost charges, Auto Craft selection,
and ban state while atomically claiming the guild-wide Mythic Surge step.
Catalogs and the remaining batch-stable modifiers continue to come from the
first context snapshot. Deep Sea still refreshes its event context per subroll.

The equipment commit now performs critical bookkeeping in the same serialized
transaction. For ×2–×4 batches it also performs background bookkeeping because
the Edge function already waited for that work before the next subroll. A ×1
roll still sends background bookkeeping through `EdgeRuntime.waitUntil`, so its
response-latency behavior is preserved.

At the observed weekly volume, eliminating the standalone surge and critical
bookkeeping endpoints removes about 7.0 million requests per week by itself.
Batch background consolidation and folded player-state writes add further
savings. Against the prior 41.5 million requests/week baseline, the expected
reduction is roughly 20–25% for a mixed workload and about 55% of the listed
core calls for ×4 batches. Actual billing impact should be checked in the API
Gateway report after deployment because conditional route mix matters.

## Deployment order

1. Apply `20260921052803_phase5_roll_hot_path_optimization.sql`.
2. Deploy the `roll` Edge Function with `verify_jwt=false`.

Do not deploy the Edge Function before the migration: it depends on the new
RPC signatures. Roll back the Edge Function before rolling back the migration.
