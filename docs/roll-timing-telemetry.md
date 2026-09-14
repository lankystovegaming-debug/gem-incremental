# Roll Edge timing telemetry

The optimized `roll` Edge Function emits sampled, structured console logs to
explain wall-clock execution time without adding a database write. Gameplay
inputs, formulas, RNG decisions, lease behavior, and response fields are
unchanged.

## Sampling

Set the Edge Function secret `ROLL_TIMING_SAMPLE_RATE` to a number from `0` to
`1`. The default is `0.05` (5% of non-CORS invocations). Use `0` to disable the
logs or `1` temporarily while smoke-testing. Values outside the range are
clamped. Sampling uses one independent cryptographic draw before gameplay RNG
begins.

Each sampled record starts with `[ROLL_TIMING]` followed by compact JSON. The
record does not contain a player ID, username, email, lease ID, gem result, or
request body. It creates no telemetry table row or other database write.

## Records

A successful single roll normally produces two records:

1. `segment: "response"` reports `response_path_ms`, lease release, and the
   response-path phases for the subroll. Its `whole_invocation_ms` is `null`
   because background bookkeeping may still be running.
2. `segment: "waitUntil"` is emitted only after both the response path and the
   registered background work have finished. Its `whole_invocation_ms` is the
   comparable total Edge invocation wall time, while `wait_until_ms` measures
   from background registration until that completion boundary.

A batch produces one `segment: "response"` record. `subrolls` contains one item
per requested roll in execution order. Every item has `background_awaited: true`
because background bookkeeping is awaited before the next item so potion and
other authoritative state are current. For a batch, `response_path_ms` and
`whole_invocation_ms` are equal at the application boundary.

Rejected requests that never register background work report their completed
response duration as `whole_invocation_ms` in the response record.

## Phase fields

All durations are wall-clock milliseconds rounded to two decimal places:

- `roll_prepare_context_ms`: authoritative pre-roll snapshot RPC.
- `lease_claim_ms`: batch lease claim. Later subrolls show a very small local
  reuse duration and `flags.lease_claim: "batch_reuse"`; only the first uses the
  claim RPC.
- `rng_js_ms`: synchronous catalog filtering, formulas, random draws, and
  specimen construction. A conditional player-state persistence await is
  excluded, so this remains a useful measure of JavaScript/RNG work.
- `bundle_route_roll_ms`: bundle routing await; inspect
  `flags.bundle_route_roll_used` because KEEP-filtered rolls use a resolved
  local promise instead of the RPC.
- `roll_autocraft_deposit_ms`: present only when Auto Craft is eligible and the
  RPC is used.
- `inventory_insert_ms`: sum of inventory insert wall time for the primary and,
  when applicable, Vein Hunter duplicate specimen.
- `commit_equipment_roll_ms`: authoritative equipment state/bonus commit.
- `roll_finish_bookkeeping_critical_ms`: response-visible bookkeeping RPC.
- `roll_finish_bookkeeping_background_ms`: best-effort bookkeeping RPC. It is in
  the batch subroll or the single-roll `waitUntil.background_phases` record.
- `roll_finish_bookkeeping_loss_ms`: Jackpot Slot House Edge loss bookkeeping.
- `lease_release_ms`: invocation-level lease release RPC.
- `total_ms`: each subroll's time inside `executeSingleRoll`. On a single roll
  this is response-path time; in a batch it includes the background bookkeeping
  awaited before the next item.

## Interpreting a regression

Compare like with like: group records by `batch_size` first. A four-roll batch is
sequential and should not be compared directly with a single-roll invocation.

- High `roll_prepare_context_ms`, routing, insert, commit, or bookkeeping time
  points to Edge-to-PostgREST/database latency for that operation.
- High `rng_js_ms` with normal RPC phases points to local computation, catalog
  filtering, or random generation work.
- Normal single-roll `response_path_ms` but high `whole_invocation_ms` in the
  paired `waitUntil` record means background bookkeeping extended billed Edge
  execution without delaying the player's response by the same amount.
- Batch totals should approximately reflect the sum of each subroll, including
  each awaited background phase, plus one lease release and small handler/JSON
  overhead. One slow subroll is visible instead of being hidden by the batch
  average.

Console logging itself is sampled, but it is still work. Raise the sample rate
only for a bounded investigation, then return it to a low value or zero.
