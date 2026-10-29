# Phase 2: serialized atomic outcome pipeline

Implemented on `dc011aa` in `weekly-update-7-2026-10-31` for weekly PR #526.
Phase 1 was present in the checkout and in hosted project `igrddscmrdrrwtvyspbf`
on 29 October 2026. All four hosted release flags were false, manifest version 1.
The live optimized `roll` remained v179 with bundle SHA-256
`98db1737af0776854a7677f091be13c4dca68d112f1f10e876db6248bb3bf65a`.
Read-only inspection also covered the actual claim, routing, inventory insertion,
commit, bookkeeping and batch functions, plus genuine-sequence player triggers.
No production write, migration, deployment or gameplay activation was performed.

## What executes, and what stays gated

The additive migration `20261029010322_world2_abyss_phase2_pipeline.sql` implements
five service-only RPCs. `roll/world2Pipeline.js` implements their sequential server
orchestration, request normalization/SHA-256 digest, independent cryptographic RNG
sources, lost-response recovery and partial-batch responses. It accepts only
`worldId`, UUID `requestId` and integer `batchSize` 1–100 as browser request fields.
Player identity comes from authenticated server context, never request JSON.

The existing authenticated roll handler explicitly returns `403 world2_disabled`
for World 2 before roll context, claims, catalogue lookup or RNG. Ordinary World 1
execution is byte-identical to deployed v179 after removing this exact dispatch;
no extra W1 RPC, catalogue/cache path or formula is added. The separate executor
is deliberately **not wired to an invented catalogue or law evaluator**. Phase 3
must supply server-owned speed pricing and outcome evaluation before a reviewed
activation can connect it. Do not accept either callback or outcome JSON from a
browser. This is the completed transport/transaction boundary for that evaluator,
not actual World 2 gameplay.

The private pipeline flag defaults false with `CHECK (NOT enabled)`; clients and
service role have no direct table access. Phase 1's false release flags, World 1
active-world constraint and locked unlock constraint are unchanged. Tests lift
constraints only inside disposable databases. No law effects, unlock quest,
adaptation benefit, catalogue, scheduler, Surge/Blessing or Momentum algorithm is
activated. Existing account resources and W1 equipment state are not copied.

## Claim and serial execution

| RPC | Behavior |
| --- | --- |
| `world2_roll_context(player)` | Disabled before new-state creation; otherwise locks player and reads DB epoch, world revision, equipped instances, bucket/law state and deployed runtime context. |
| `world2_claim_batch(player,request,digest,size,singleCooldown,context)` | Player lock first; replay/conflict lookup before gate or freshness checks. Revalidates server-priced context, actual batch unlock and DB epoch. Uses deployed `claim_server_roll`; cooldown remains single × batch size. Pins epoch/version, revision, equipment snapshot, sequence, lease/deadline and original worker capability. |
| `world2_begin_subroll(player,request,digest,index,worker)` | Receipt first; otherwise checks live/replaced/expired lease, world/unlock/revision, equipped instances, contiguous subroll and both internal genuine fences. Returns latest committed W2 state/history and accepted context. |
| `world2_commit_subroll(...,outcome)` | Repeats validation under the same player lock; commits all routing, cash, state, provenance and receipt in one transaction. Deadline checked again after routing locks. |
| `world2_switch_world(player,world)` | Same player lock and live-lease rejection; changes only world/revision after gate/unlock checks. Does not reset buckets, histories or shared timers. |

The caller first performs a replay-aware claim probe with null context. Only a
fresh context can accept new work; stale context is repriced up to three times.
A boundary crossed *inside* the deployed claim rolls that lease/cooldown back
before returning `stale_context`. No preclaim RNG is consumed. Pricing uses the
existing backend rules and the 2.5-second base; Phase 2 does not introduce a speed
formula. The DB retains the deployed claim's 10–300,000ms cooldown clamp and lease
formula. Batch entitlement is checked with live `roll_batch_unlock_status`.

Only the original accepted claim returns the worker token. Concurrent duplicates
receive `in_flight` plus already committed outcomes and cannot start another RNG
worker. Each subroll gets a fresh cryptographic source after begin validation;
the next subroll is evaluated only after the previous transaction commits.
All accepted subrolls retain the batch's epoch, including across 08:00/20:00 SGT.
Epoch-local state resets on the next accepted epoch identity, even for repeated
laws; the resonance ring, mutation history, equipment buckets and persistent envy
are retained. No law transition probabilities are implemented in Phase 2.

## Atomic outcome contract

The trusted evaluator returns `kind` (`ordinary`, `relic`, `empty`, `loss`), a
`primary` object or explicit null, `extras` array, next `bucket` and `lawState`
objects, optional persistent `envyRemaining`, and server-resolved filter decisions.
Specimen fields follow the existing `roll_insert_inventory_specimen` contract;
ordinary-final-weight ratio and raw rolled multiplier remain separate measurements.
`begin` supplies accepted gear/context, current W2 state and genuine history.

- Ordinary primary routing uses the **actual deployed** `roll_route_result`,
  with active Auto Craft from the authoritative refreshed context. KEEP, bundle
  deposits, Auto Craft and Conservation retain their existing precedence.
- Capacity uses player capacity plus the first research-effect row's nonnegative
  inventory bonus, matching v179. Routing/deposit errors abort the W2 transaction.
- Saved ordinary primaries use deployed inventory insertion. Autosell uses the
  deployed sale function and records actual money delta. Unlike W1's deliberate
  soft fallback, W2 sale errors abort; a retry never saves or sells a second copy.
- Relics call the existing relic grant and have provenance without an inventory
  gem. Empty/loss have no specimen/routing and still consume one genuine position.
- Astral/Breakneck/Convergence extras have distinct immutable UUIDs linked to the
  primary receipt, are forced non-genuine, and add no lifetime/history position.
  Missing capacity or any extra insertion error aborts the whole subroll rather
  than silently lose a promised bonus. Phase 3 decides when extras are earned.
- Every acquired primary/extra gets provenance, including immediate deposits or
  sales. Private UUID-to-inventory links support initial transport; later transfers
  still require Phase 4 propagation. NPC factor remains neutral 1. No Austerity
  economics, retrospective relabeling, sale quest credit or market tax is added.
- `players.total_rolls` increments once for every genuine outcome. The internal
  `equipment_genuine_rolls` and `equipment_state_roll` fences advance together,
  without replacing W1 `equipment_state`. W2 counters/queues use their own bucket.
- One world ordinal/revision, one 250-slot history position, next law state and
  append-only receipt commit together. Relic/empty/loss occupy null-identity slots;
  ordinary slots contain natural mutation IDs; extras never age the ring.

The SQL is SECURITY DEFINER with a fixed search path, postgres ownership and
explicit revocation from PUBLIC/anon/authenticated; only service_role executes.
The new private tables have RLS and no client/service direct grants. Existing
immutable provenance/receipt triggers remain enforced. No foreign key or trigger
is installed on an existing W1 table. These privileges follow the official
[database function security guidance](https://supabase.com/docs/guides/database/functions).

## Replay, failure and rollback semantics

The durable identity is `(player, request UUID, subroll)`. A reused UUID with a
changed canonical request/size is a conflict. A receipt is returned before RNG,
lease, active-world or gate checks, so it remains recoverable after switching,
lease expiry or release rollback. There is no alternate fallback writer.

A lost commit response triggers receipt lookup, not another evaluation. A
committed prefix survives exactly once. An incomplete request reports
`in_flight` until its lease expires or is replaced; then `partial` is terminal.
**A new request UUID is required for the remaining suffix**, with a fresh context
and cooldown claim. The abandoned suffix is never resumed, implicitly rerolled,
refunded or attached to a replacement lease. Old delayed releases are fenced by
lease UUID and cannot clear a replacement claim. Complete retries return stored
outcomes without RNG or counter changes. Failed routing/lease/deadline checks
roll back the entire current subroll, preserving earlier committed subrolls.

## Verification

Commands from the repository root after `npm ci`:

```sh
npm run test:world2
npm run test:world2:phase2
WORLD2_POSTGRES_BIN=/path/to/postgres/bin npm run test:world2:phase2:concurrency
npm run test:batch-rolling
npm run test:roll-hot-path
node tests/server-authoritative-roll-lease-test.mjs
node tests/roll-lease-runtime-auth-test.mjs
```

The isolated PGlite suites execute the actual Phase 1/2 migrations and freshly
captured deployed claim/release/routing definitions; external inventory/crafting/
sale domains use explicit contract doubles. Real PostgreSQL 18.1 runs 24
multi-connection claims/commits, 12 competing requests, lock-wait expiry and lease
replacement and eight simultaneous claim/world-switch races. It confirms one worker, identical receipts and exactly one specimen,
provenance and counter increment. Duplicate requests cannot receive a worker token.

Controlled DB-clock tests substitute only the clock call in the real SQL, covering
both 08:00 and 20:00 SGT boundaries, pricing that crosses a boundary inside claim,
whole-batch pinning, next-epoch temporary reset, persistent history/bucket/envy,
exact deadline and a sale transaction that crosses its lease deadline. All writes
in that late sale roll back. Other tests cover partial batches, lost responses,
conflicts, invalid state/gear/worker, empty/loss/relic, all extra kinds, 260-position
ring eviction, capacity exhaustion, Conservation, sale/deposit faults, disabled
replay, switch persistence, client privilege rejection and unchanged W1 data and
triggers during migration. The actual optimized HTTP handler rejects W2 with zero
roll RPCs/writes. Existing hot-path/cache/batch/request-budget tests pass.

A local 20-subroll SQL/orchestration budget must stay below five seconds; observed
runs were 28–93ms. This measures local transaction overhead with contract doubles,
**not production network latency or p95**. W1 has zero added backend calls. Before
any later activation, require staging fault-injection against complete production
routing/trigger dependencies, representative 1/4/20/100 batches, concurrent
world/equipment changes and tail latency safely inside the accepted lease. Full
all-feature `npm test`, production load tests and actual W2 law/gameplay validation
are outside this disabled pipeline verification. Existing Phase 1 baseline
failures are documented in `verification.md`; no deployment was used as a test.
