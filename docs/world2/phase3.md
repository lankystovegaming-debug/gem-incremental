# Phase 3 — Abyssal Laws and Inverse Resonance

Implemented against `e6db9fd` (main after weekly PR #526). Phase 1 is `dc011aa`;
Phase 2 is `b0ef591`. Weekly delivery: **weekly update 8 (7/11/26)**.

**World 2 remains disabled. Nothing was deployed.** The HTTP `worldId:2` dispatch
still returns 403 before context, claims, catalogue loading or RNG. All four
Phase 1 release flags, the private Phase 2 pipeline flag, World 1 active-world
constraint and locked-unlock constraint remain closed. No UI or unlock activation.

## Authority and scope

Read the Phase 1/2 implementations, actual commits, SQL fixtures, routing, claim,
commit and receipt code before implementation. Retrieved live optimized `roll`
**v179**, bundle SHA-256
`98db1737af0776854a7677f091be13c4dca68d112f1f10e876db6248bb3bf65a`.
Its source matches `authority/roll-v179.ts` exactly after trailing whitespace.
Current `roll/index.ts` is unchanged by Phase 3; stripping only the existing
Phase 2 disabled dispatch gives strict v179 source parity.

The repository's owner restriction was checked: GitHub connector and CLI both
identified `lankystovegaming-debug`, matching the repository owner; CLI reported
admin access. Automatic approval review nevertheless rejected the read-only live
SQL function inspection because it did not accept tool-output ownership evidence.
No alternative live database route was attempted. **Fresh deployed SQL parity,
current production flags and production database advisors were not verified.**
SQL audit/QA uses the checked-in deployed-function fixtures from Phase 2. Live Edge
source inspection succeeded and is the formula authority, not frontend formulas.

The Supabase changelog index and current function-security documentation were
consulted. CLI migration creation used its discovered local command, not a remote
schema operation. Privileged functions retain fixed search paths, postgres owner,
RLS and explicit service-only execution, consistent with
[Supabase function security](https://supabase.com/docs/guides/database/functions).

## Implementation and integration boundary

- `supabase/functions/roll/world2Laws.js`: server-only state machines, law stat and
  weight stages, final-winning mass transform and singleton mutation rerouting.
- `world2LawPipeline.js`: composes those stages with the **existing** serialized
  `executeWorld2Batch`, accepted epoch, committed state/history and RNG source.
  No new RPC, history query, scheduler, catalogue cache or alternate writer.
- `20261104235634_world2_abyss_phase3_laws.sql`: replaces only the three World 2
  context/begin/commit functions; fixes queue persistence/transport and records
  Austerity acquisition provenance. It changes no W1 function, player trigger or
  existing player's state, inventory, money, equipment or lifetime counter.
- `world2Pipeline.js`: distinguishes an uncertain commit+lookup outage from a
  confirmed failed prefix. Same request UUID must be retried for recovery.

**Production ordinary-engine binding is still absent.** Phase 2 deliberately
shipped no World 2 ordinary evaluator or speed pricer. The existing W1 handler is
a monolithic evaluator with its own side effects; calling it from the W2
transaction would perform writes outside the atomic boundary. This patch supplies
the law-stage composition API and verifies it with trusted ordinary-domain test
doubles. It does **not** claim a complete production W2 outcome engine or invent
an approved W2 catalogue, equipment adaptation, unlock flow or economic pipeline.
The checked-in manifest still explicitly says `catalogue.approved=false`.

Before an eventual gameplay release, extract/bind the existing optimized ordinary
calculation stages into this API with full equipment/event compatibility and the
approved catalogue. This remains a real integration blocker; passing these tests
is not permission to enable W2 or evidence that end-to-end W2 gameplay is ready.

The trusted ordinary evaluator receives four stage hooks:

1. `stats(partialStats)` after ordinary hard overrides, before the corresponding
   backend cap/probability calculation. Channels may be resolved separately at
   their existing positions. Each channel is applied once; hard zeros stay zero.
   All-In, Reality Shifter, Impossible, ordinary admin/event modifiers and cap
   ordering stay owned by the optimized backend.
2. `gem(orderedHazards,fallbackIdentity)` after eligibility, selection order,
   per-gem Luck and caps. Each row carries `id=gem.name`, canonical `rarity`,
   `hazard`, explicit `mutable`, `affectedByLuck` and `specialGem` classification.
   The real fallback receives residual survival probability. Only then normalize
   mutable final-winning mass within a canonical numeric tier. Never scale the
   sequential hazards or reapply a Luck cap to the transformed masses.
3. `mutations(natural,effectiveCatalog)` after ordinary independent natural trials,
   before equipment-exclusive/size identities, feedback and the ordinary combined
   value cap. Catalogue rows contain actual effective `rolledChance`, original
   chance and value multiplier. Persist the returned natural IDs, not all IDs.
4. `weight({baseWeight,ordinaryFinalWeight,rawWeight})` after ordinary equipment,
   size/masterwork/storage factors, before value calculation/filtering/equipment
   finish logic. The specimen uses the **actual** `final_weight` field. F0 and raw
   R are separately returned for the existing provenance contract.

The adapter rejects missing/duplicate ordinary stages and outcomes that discard
its selected gem, mutation identities or final weight. Early genuine loss/empty
branches need no fabricated gem/mutation/weight draw; all genuine positions still
advance temporary clocks once. Relics and losses occupy null gem history slots.
Extras do not advance law clocks or history. Only server code supplies the kernel
and pricer; the browser request remains limited to world/request/batch fields.

The ordinary pricer retains `2.5s / ordinaryFinalSpeed`, Slow Starter and existing
backend modifiers. Divide that ordinary single cooldown by the static law-speed
factor before the existing batch-size multiplication/DB clamp. No stochastic law
changes speed, so one accepted epoch prices the whole batch consistently.

## Law semantics

The existing v1 manifest remains the definition/selection authority: 11 A equal,
3 B equal, six ordinary C at 47/300 and Grace/Abundance at 9/300. No exclusions or
anti-repeat rules. One DB tuple per 12-hour epoch, at 08:00/20:00 SGT. Player
thresholds, durations, branch strengths and queues use the worker's independent
cryptographic RNG. Global epoch selection remains the Phase 1 DB initializer.

All eleven Type A and all eight Type C formulas are implemented. Key transition
rules are frozen as follows:

| Machine | Current position | State prepared for next position |
| --- | --- | --- |
| Impermanence / Unstable Fortune / Reversal waiting | Unaffected; decrement wait | At zero sample duration and held strength(s) |
| Active timed cycle | Apply held strength(s); decrement duration | At zero sample the next wait; no same-position restart |
| Aftershock / Inequality ready | Qualifying outcome itself unaffected | Arm held factor/duration for the next genuine position |
| Aftershock / Inequality active | Apply factor; ignore triggers | After final active position sample recovery |
| Recovery | No factor or triggering; decrement recovery | At zero refresh threshold; ready on next position |
| Fragility | Apply fresh per-qualifying-specimen factor if raw R is strictly above held threshold | Age held threshold for exactly 100–250 positions; refresh after the last position |
| Envy | Apply one held Luck factor if queue was positive | Consume one active position; add observed-tier duration; resample threshold after every trigger |

Inequality qualifies at **at least** its retained natural-count threshold. Its
1/2/3 thresholds use 90/9/1 weights. Aftershock uses strict raw `R > threshold`.
Recovery threshold is refreshed when recovery finishes. No triggers during either
active or recovery phases. Waiting/active/recovery positions include genuine W2
loss/relic outcomes. W1 and bonus specimens never call these state transitions.

Envy duration uses canonical observed raw gem tier, never effective mutation rarity
or the selected threshold. Legendary: 1–6 with 25/25/20/15/10/5; Mythic: 3–10 with
5/10/20/25/20/10/7/3; Exotic+: integer 25–75. Queue addition is uncapped, exact
integer arithmetic, with one strength per uninterrupted episode. A trigger on the
last active position keeps that strength because no unaffected position separates
the episodes. The next epoch discards the entire queue, even for repeated laws.
No reconnect, retry or world switch resets it within the same epoch.

Burden uses ordinary pre-law `F0`, then applies Type A Compression/Fragility.
Zero-base-weight outcomes have no F0 ratio. Exchange multiplies final weight .70;
Fragility samples .70–.80 separately for each qualifying genuine specimen.

Austerity records an immutable **.80 acquisition NPC factor** from the pinned DB
law, including immediately routed specimens. Other acquisitions remain neutral.
No historical values are rewritten and no P2P cash tax is added. **Actual economic
application and transfer propagation remain Phase 4**, including immediate sale
behavior. Austerity provenance alone does not reduce the current sale helper's
payout; this is another reason the gameplay gate must remain closed.

## Inverse Resonance and Distortion

The previous 250 genuine W2 positions include null loss/empty/relic positions;
extras occupy none. SQL already persists natural mutation identities continuously,
including when Distortion is absent. History survives epoch changes and visits.

Baseline gem suppression is `max(.75, exp(-.05*count))`. Repetition **replaces**
that pair with `.15/.60`, Stagnation with `.025/.75`; Distortion retains baseline.
Final-winning probabilities, including the real selector's fallback, are computed
first. Normalize only explicitly eligible numeric-tier mutable mass. Zero-probability
identities stay zero, singleton tiers retain their mass, and every flat/special or
otherwise protected outcome retains its own winning probability. Unknown numeric
bands fail closed for redistribution. v1 numeric bands stop below 1,000,000,000;
W1's separate global tier definitions remain untouched.

Distortion reroutes an observed eligible natural singleton within value bands
[1,10), [10,100), [100,1000), [1000,infinity), using k=.50/floor=.25. Its source
singleton mass is `p_i * product(1-p_j, j!=i)`, calculated with prefix/suffix
products (no division by zero at p=1). Rerouting is conditioned on that singleton's
band. Empty outcomes, natural multistacks, and Misty/Ancient/Enchanted identities
are unchanged. This preserves natural count, protected singleton probabilities and
band mass. Existing value caps are applied afterward by the ordinary backend.

## Independent Phase 2 audit and fixes

| Area | Audit/result |
| --- | --- |
| Atomic routing/state/history/receipt | Existing single player lock and transaction retained; rollback tests include insert, sale, deposit, provenance and extra failures |
| Lifetime counts | `players.total_rolls` increments once per accepted position; internal equipment sequence fencing is retained independently |
| Epoch pinning | Accepted epoch remains fixed through entire batch; stale pricing/boundary-crossing claim rolls back and reprices |
| Epoch reset defect | Phase 2 preserved Envy separately despite temporary reset; Phase 3 filters it by pinned epoch in both preclaim and begin, including repeated tuples |
| Integer/JSON defect | bigint had a storage ceiling; raw JSON numeric also broke freshness above 2^53. Exact integer numeric + decimal string transport fixes both; fractional/NaN queues abort |
| Idempotent receipts | Receipt lookup precedes RNG/lease/gate validation; committed prefix is replayed once; changed request payload is rejected |
| Uncertain retry defect | Commit response plus lookup failure now returns `in_flight, uncertain:true`; retry same UUID, never treat the result as definitely uncommitted |
| Partial batches | Previous committed positions survive; failed suffix is never rerolled under old identity; new UUID/claim for terminal remainder |
| Race safeguards | Original worker capability, contiguous index/revision, both internal sequences, equipment snapshot and lease checks remain; deadline rechecked after routing |
| W1 parity | Full v179 executable parity after original disabled dispatch, zero extra W1 RPC/RNG/history calls, unchanged W1 rows/triggers through migration |

Fresh hosted SQL comparison was blocked as above. Context freshness still uses
Phase 2's exact complete JSON comparison; it has not been relaxed to hide volatile
runtime differences. A hosted/staging audit of actual refresh payload volatility
and all external routing dependencies remains required before activation.

## Verification and limits

Run from the repository after `npm ci --ignore-scripts`:

```sh
npm run test:world2
npm run test:world2:phase2
npm run test:world2:phase3
WORLD2_POSTGRES_BIN=/path/to/postgres/bin npm run test:world2:phase3:concurrency
npm run test:roll-hot-path
npm run test:batch-rolling
node tests/server-authoritative-roll-lease-test.mjs
node tests/roll-lease-runtime-auth-test.mjs
```

Results: deterministic 264 triples × 550 positions; static law factors; exact
weighted tickets and Unstable Fortune 60/40; min/max wait/duration and recovery
boundaries; strict thresholds; per-specimen Fragility; Burden ordering; high-Luck
Envy, last-position retrigger, observed-tier durations, epoch expiry, exact queues
above 2^53 and 2^63; tier/scarcity/singleton conservation; protected flat/special
and protected mutation identities; independent singleton census including p=1;
missing/duplicate stage safeguards; unchanged W1 executable/handler behavior.

PGlite executes the actual migrations and existing deployed-function fixture,
with contract doubles for external ordinary/sale/crafting domains. It covers
law+SQL commits, replay, response/lookup loss, rollback, bounded histories, disabled
and unauthorized calls, precise numeric transport and Austerity provenance.
Controlled DB clocks cover both SGT rotations, repeated law tuple reset, pinned
batch continuation, claim crossing, exact lease deadline and late-sale rollback.

Real local PostgreSQL 18.1: 24 simultaneous claims give one worker; 24 commits give
one identical receipt/state/provenance/counter increment; 12 competing requests
fenced; lock-wait expiry, prefix replay, replacement lease and eight claim/switch
races pass. Actual law state was included in the Phase 3 concurrency rerun.
The original Phase 1 PostgreSQL concurrency suite also passed: 24 initializers
returned one global tuple, repeat tuples remained legal, reconnects retained state
and duplicate receipt inserts produced one identity. Temporary test-only binaries used `@embedded-postgres/darwin-arm64@18.1.0-beta.15`,
with the package's symlink hydration script; they are not repository dependencies.

Local performance checks: 100k law transitions under 0.5s in observed runs; law+SQL
1/4/20/100 batches under 5s (observed 100-position batches roughly 0.36–1.46s).
A separate 1000×1000-row/250-history transform benchmark took 0.31–0.40s
against a 5s budget. These
are local algorithm/transaction budgets, **not hosted latency, load/p95 evidence,
or real complete optimized-W2 evaluator measurements**. No production write,
migration, Edge deployment, gameplay roll, load test or feature activation occurred.
Full all-feature `npm test` was not run; the relevant optimized handler, cache,
request-budget, batch, All-In, Reality/Bedrock, Misty, mutation cap, Deep Sea,
biome, House Edge and lease regression suites passed.

## Owner deployment, verification and rollback

Apply only missing World 2 migrations in this order, after verifying your deployed
history; do not blindly run every unrelated pending repository migration:

1. `20261029002115_world2_abyss_phase1_foundations.sql`
2. `20261029010322_world2_abyss_phase2_pipeline.sql`
3. `20261104235634_world2_abyss_phase3_laws.sql`

No frontend update is required. The new JS modules are dormant source modules;
`roll/index.ts` does not import/bind them. **A roll redeploy alone does not activate
or complete World 2.** Keep live v179 until an explicitly reviewed full backend
composition is ready. At that point deploy the full roll directory with all
relative modules and the existing backend's authentication behavior; do not deploy
an isolated law file or replace the optimized function with a test evaluator.
All Supabase deployment remains with the owner.

After migration, the owner should verify: four release flags false; pipeline false;
active-world/unlock constraints intact; three replaced functions still postgres
owned/fixed-search-path/service-only; Envy column exact numeric with nonnegative,
finite integer checks; W1 test-account roll/cooldown and normal batch still work;
explicit W2 request still 403 without writes. Compare the current deployed claim,
refresh/routing/commit helpers to the authority fixtures before any later release.
Repeat isolated tests against full staging routing dependencies and representative
batches/concurrent equipment changes before enabling any new path.

Preferred rollback: retain the additive storage/functions with all gates closed,
revert the source commit if needed, and leave optimized v179 serving W1. No data
conversion or player rollback is required. Do not narrow the queue to bigint after
large values exist, delete immutable receipts/provenance or wipe resonance history.
For a schema downgrade, first back up state, inventory links and immutable audit
rows and plan a reviewed forward migration; do not drop the entire World 2 schema
or reapply the old bigint-casting commit routine over large queues.
