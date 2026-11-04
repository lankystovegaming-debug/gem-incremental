> Phase 2 now adds a disabled serialized outcome pipeline on these foundations.
> See [Phase 2 implementation and verification](phase2.md) and the Phase 2
> section of [deployment/rollback](deployment.md). The Phase 1 description below
> remains the original foundation audit; gameplay still cannot be enabled here.

# The Abyss — Phase 1 disabled backend foundations

Implemented against the owner's recovered Phase 1 handoff, with read-only Supabase
authority checked on **29 October 2026**. Nothing in this change enables World 2.
No migration, Edge Function, gameplay call or production write was executed.

## What is included

- `world2/manifest.v1.json`: readable, versioned identity, unlock/quest contract,
  numeric rarity bands, all 22 law definitions, histories, adaptation milestones,
  atomic-outcome/replay and provenance contracts.
- `world2/equipment.v1.json`: 79 registry records: **78 verified equipment IDs**
  (35 pickaxes including Neptune, 41 clovers/lanterns/boots/bags, two pet-gear
  records) and one explicitly unverified/unimplemented Evergrowth record.
  Attached enchants/masterwork have separate typed contracts. Pet-odds gameplay
  is blocked pending its separate contract. No equipment benefit is applied here.
- `world2/contracts.js`: isolated reference arithmetic and specimen predicates.
  No frontend or Edge Function imports this module.
- `world2/schema.sql` and its generated additive migration
  `20261029002115_world2_abyss_phase1_foundations.sql`: 15 new public tables,
  a private release configuration, one owner-only status read, and a service-only
  database-clock epoch initializer. No existing table, function or trigger is
  replaced, altered or backfilled.
- Three focused suites cover configuration/arithmetic, a PostgreSQL migration
  rehearsal/security/defaults, and genuine multi-session PostgreSQL concurrency.
- `authority/`: the fresh deployed roll entrypoint, equipment recipe catalogue,
  distinct equipment IDs, relevant crafting/deposit/sale function definitions and
  hash manifest. These contain no player-account export or credentials.

## Disabled means no gameplay entry point

All four release flags have database CHECK constraints requiring false. Player
active world is constrained to 1, unlock to false, and quest stage to 0. A later
reviewed migration must deliberately lift those constraints. No switch, unlock,
quest action, roll, research purchase or law-application endpoint is added.
`world2_my_status()` has no player-ID argument and reads only the caller's state;
missing state reads as World 1, locked, revision/counters zero. Reads never insert
or reset state. Existing World 1 endpoints continue using their existing schema.

The epoch initializer can populate inert global tuples while gameplay is off.
It has no player input or timestamp argument, uses the database clock, takes a
transaction-scoped per-epoch advisory lock, and returns the existing tuple on
repeat calls. Slots begin at 00:00/12:00 UTC (08:00/20:00 SGT). Each category uses
one independent categorical draw: A 11 tickets, B three tickets, C 300 tickets.
Six ordinary C laws have 47 tickets each; Grace/Abundance have nine each. All 264
triples are legal, including repeats in consecutive epochs. No scheduler, cron,
per-player/global roll lock or additional W1 RPC is introduced.

## Explicit measurements and progression

Stage 1's `ordinaryFinalWeightRatio` means ordinary `finalWeight/baseWeight`
**before Abyssal Laws**, including ordinary final equipment/size/masterwork
factors. It must be strictly below 1; zero-base-weight outcomes are ineligible.
It is distinct from Stage 2's raw rolled multiplier `R`, which must be strictly
above 5. The pure predicate requires an accepted genuine primary after the stage
activation sequence, World 1, and no mutation IDs for Stage 1. Stage 3 requires
Black Opal with Glossy; additional mutations do not disqualify it. None of these
predicates advances a quest in Phase 1.

Prerequisites use `players.total_rolls >= 250000` and verified historical crafting
of a tier-12+ pickaxe. Ownership alone is never crafting proof. The inspected
`craft_equipment_recipe` creates/updates equipment and deletes crafting progress;
it does not itself retain durable crafting proof. The new append-only
`world2_craft_evidence` ledger can later receive successful server craft events or
verified historical transaction evidence. It is not automatically populated and
never backfilled from equipment ownership. The quest remains locked without proof.

Adaptation progress has two independent source/destination keys. Its dedicated
genuine counters are not inferred from lifetime totals or specimen counts. Levels
0–5 use .50/.55/.60/.65/.70/.75 and provisional cumulative gates
0/2500/7500/20000/45000/100000. Milestone changes require a new immutable manifest
version. Native equipment remains native; negative/zero benefits are preserved.
Typed passives retain their native calculation layers, thresholds and cadence.
The Supersizer size rule attenuates joint value once. All-In, Reality Shifter,
Neptune, Plastic, Convergence packages and sale effects have explicit exceptions.

## Persistent state and future outcome boundary

The ring has exactly 250 possible slots per player, each tied to its genuine
ordinal modulo 250. Loss/empty/relic positions can age the window without a gem
identity. Mutation history is stored continuously. Neither extras nor a reconnect
create genuine positions. Future atomic writers must evict the oldest slot and
update state/revision in the same outcome transaction; Phase 1 supplies storage,
not a new writer.

World equipment buckets contain roll counters/queues, including per-instance
enchant state when integrated later. Existing `players.equipment_state`, enchant
state and internal genuine sequences are not copied, overwritten or reset.
Convergence Momentum remains solely in its deployed account-wide ledger. Surge
and Blessing each have one activation record with an activation world; Blessing
expires after five real-time minutes and Surge retains its world-specific
remaining genuine duration. Adaptation is resolved when an effect is applied.

Receipts reserve `(player,request,subroll)` and both internal and world genuine
ordinals. They store request digest, lease, pinned epoch, revisions and the whole
outcome. Uniqueness is a foundation for replay, **not a working replay endpoint**.
Phase 2 must return the persisted outcome before consuming RNG or making any
mutation, reject changed payloads/stale context/expired leases, and atomically
commit routing, actual cash, lifetime increment, internal fence, history, law
state and receipt. Committed partial-batch prefixes must survive once. World
switching must serialize with the player lock and reject an active roll lease.
No claimed batch may mix epochs; preclaim speed must be recomputed if context
crossed a boundary. See the manifest's `outcomeContract` for the complete boundary.

## Acquisition provenance and access

The sidecar uses immutable specimen UUIDs and acquisition identity independent of
current inventory ownership. Roll lineage references a receipt and its exact
pinned epoch; reward/admin/shop/legacy origins can reference their own external
receipt. Existing specimens have no sidecar and explicitly retain neutral World 1
origin/factor 1. No old weight or value is rewritten and no NPC or market payout
changes here. Austerity's future .8 factor is acquisition-bound; P2P market cash
receives no additional tax. Every inventory/transfer/market/order/museum/reward
reconstruction must carry the UUID before Phase 4 can enable economic effects.

Every new public table has RLS. Public contract/tuple reads are separate from
owner-only player state. Clients have no INSERT/UPDATE/DELETE/TRUNCATE grants.
Only the service role can write the new player storage; receipts, crafting proof
and provenance are append-only even for that role. Immutable triggers also reject
UPDATE/DELETE by the migration owner. Provenance is service-only because the
acquirer is not necessarily the current owner; future inventory reads must check
current ownership before joining provenance. No client claims or user metadata
authorize a mutation. Security-definer epoch initialization has a fixed search
path, explicit owner and no PUBLIC/anon/authenticated execution grant.

Player existence is checked by triggers on the new storage tables only. There
are deliberately no new foreign keys referencing `players`: those would install
internal triggers on the W1 player write path. Existing-table trigger definitions,
including internal triggers, are compared before/after rehearsal. Account deletion
and cleanup of retained W2 sidecars must be designed explicitly in a later phase;
this schema does not attach an automatic cleanup trigger to existing accounts.

## Authority and World 1 parity

Fresh deployed `roll` remains v179, bundle SHA-256
`98db1737af0776854a7677f091be13c4dca68d112f1f10e876db6248bb3bf65a`;
entrypoint SHA-256
`6921873aaef65246a1aedec55d93056f2b236f5880aaf8ebd504ba04ffe227a7`.
The weekly checkout's roll entrypoint matches that live source except for one
trailing blank line. Both are preserved: the live file is evidence only, and the
weekly executable is untouched.
The checked-in audit copy omits that one trailing blank line for clean whitespace
checks; `authority/snapshot.json` records the normalization and both hashes. Its
exact deployed bytes are reconstructed and hash-checked by appending one LF.
Do not deploy the audit snapshot or replace the optimized entrypoint with it.

The Phase 1 diff has no existing execution-file changes, new imports, reads,
triggers or writes in the World 1 path. Its RNG consumption, stat calculation,
2.5-second base cooldown, batch pricing, serial subroll commits, catalogue caching,
lease fencing, internal genuine sequence and transaction architecture remain as
they were. Disabled parity is established by unchanged execution sources and
unchanged legacy schema/data in rehearsal, not a production load experiment.

## Validation and remaining release gates

See [verification.md](verification.md) for results and reproducible commands, and
[deployment.md](deployment.md) for owner-run deployment and rollback.

No unresolved Phase 1 schema/security failure remains in the isolated tests.
Later gameplay is still blocked on the approved W2 catalogue, historical crafting
evidence availability, pet odds, exact inclusive stochastic transition tables,
Stage 4 eligible sale-channel policy and non-primary law/economic attribution.
The handoff does not settle all of those details; the manifest marks them as
pending instead of silently enabling assumptions. Later phases also need complete
atomic-routing/fault-injection, real replay, sale/transfer provenance and workload
performance tests. No production concurrency or full-game browser test was run.
