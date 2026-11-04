# Phase 1 verification — 29 October 2026

All database tests use disposable local databases. Production was accessed only
for catalogue, metadata and function-source reads; no production gameplay or
state-changing RPC was called. No deployment occurred.

## New suites

`npm run test:world2` passes:

- Exact A/B/C counts, integer weights, all 264 triples, exhaustive categorical
  tickets in both JavaScript and the actual PostgreSQL cumulative-selection query.
- Both UTC/SGT rotation boundaries, six adaptation factors/milestones, preserved
  penalties/zero, additive/opportunity/replacement arithmetic, composed Bedrock
  and joint Supersizer size behavior, and strict quest weight/activation predicates.
- Complete coverage of the live recipe-equipment and distinct owned-ID snapshots,
  including Neptune, all 35 pickaxes, secondary contracts and blocked Evergrowth.
- Transactional migration rehearsal on PGlite (PostgreSQL), unchanged legacy
  account/inventory/equipment rows and old function signatures, neutral absence
  defaults, all disabled gates, owner isolation and complete client mutation ACL
  checks with deliberately broad Supabase-like default privileges.
- Immutable tuple/receipt/provenance records, dual research/bucket independence,
  single activation record, persistent 250-position history, no new legacy-table
  trigger and no execution-file change relative to the weekly baseline.

`npm run test:world2:concurrency` passes on real isolated PostgreSQL 18.1:

- 24 simultaneous initializers return exactly one persisted current-epoch tuple.
- The same tuple is legal in consecutive epochs.
- 24 initialize-if-absent calls preserve an existing bucket charge.
- 24 competing receipt INSERTs yield one accepted identity and 23 uniqueness
  rejections. W1 lifetime totals stay unchanged.

This demonstrates schema/concurrency foundations, not a completed HTTP replay,
atomic routing or World 2 roll implementation. Those belong to Phase 2.

## Existing regressions

Passed without changes:

- `server-authoritative-roll-lease-test.mjs`
- `batch-rolling-test.mjs`
- `batch-rolling-database-test.mjs`
- `roll-hot-path-v2-test.mjs`
- `phase6-roll-request-amplification-test.mjs`

Three existing tests fail identically on the untouched weekly baseline
`e49a6ca732c3038973e9b1a33b4d8ad17a789ab1`, reproduced from a separate baseline
archive. Their tested execution files are unchanged by this work:

| Existing test | Baseline failure |
|---|---|
| lifetime-roll-index-consistency | Existing recipes still contain the old genuineRolls history requirement |
| roll-final-weight-multiplier-display | Obsolete renderRoll source-slice assertion obtains an empty string |
| mutation-safeguards | Static helper-reference count expects four; source contains five |

These failures were not repaired in Phase 1 because that would expand the change
into existing W1 recipes/presentation/roll source. The full `npm test`, production
performance tests and end-to-end future W2 gameplay were not run. Unchanged hot
paths provide the disabled execution parity guarantee; no measured p95 latency
claim is made.

## Reproduce locally

```sh
npm ci
npm run test:world2
WORLD2_POSTGRES_BIN=/path/to/postgres/bin npm run test:world2:concurrency
```

The real suite requires `postgres`, `initdb` and `pg_ctl` in that directory, plus
`psql` on PATH (or `WORLD2_PSQL=/absolute/path/to/psql`). It creates a fresh temporary
cluster with Unix socket only, stops it and removes it in a finally block. No
database connection URL or Supabase key is accepted by the runner. PGlite may be
loaded from an external pinned installation via `PGLITE_MODULE_PATH`.

For this run the temporary dependencies were `@electric-sql/pglite@0.3.14`
(matching the repository lock) and `@embedded-postgres/darwin-arm64@18.1.0-beta.15`
(PostgreSQL 18.1). They are test infrastructure, not production dependencies.

Generate/check the migration with:

```sh
node world2/build-migration.mjs
node world2/build-migration.mjs --check
git diff --check
```

The migration filename was created with the installed Supabase CLI. Future
manifest versions need a new CLI-created migration; do not rewrite a deployed v1.
Current Supabase RLS/function-grant documentation was checked through the docs
connector. The markdown changelog could not be retrieved through the available
web/local network paths; this implementation uses standard PostgreSQL primitives
and introduces no new SDK/platform dependency.
