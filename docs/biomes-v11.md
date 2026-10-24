# Biomes V1.1 implementation and owner deployment

Prepared against Supabase `igrddscmrdrrwtvyspbf`, optimized roll v178 (bundle hash `4f8f16d6bfe767273e59ae55186ac6b973dfc87f9d60cf736a43aa1b07be1e45`). The checked-in pre-change roll matches that deployment except trailing whitespace. Backend definitions were inspected read-only. Nothing is deployed or production-verified.

## Phase 1 — global authority

Ten definitions and all 69 relationships use the approved numeric contract in `biomes-v11-design.json`, including Thalassa 31,122,819, Glitched Gem 110,100,111 and finalized Telluric Heart. The existing Mantle Core artifact is untouched. A singleton row lock serializes a single categorical minute draw. Expiry is processed before activation; windows are half-open. `q_i = r_i/(1-U+R)` uses minutes. No player count, pity, queue, backlog or catch-up exists. Duplicate invocations within a minute do not draw again. An exclusion constraint also prevents overlapping intervals. Repeated identical states receive new occurrence IDs.

Scheduling starts disabled. The migration registers a minute cron job only if pg_cron exists; the owner must verify the job after deployment.

## Deployment order (owner only)

1. Apply `20261024043850_biomes_v11_global_scheduler.sql`.
2. Apply `20261024043851_biomes_v11_roll_and_catalog.sql`.
3. Apply `20261024043908_biomes_v11_discovery_index.sql`.
4. Deploy updated `roll/index.ts` with its existing availability helper. The pure biome rules are inlined to preserve single-file deployment. Deploy frontend assets.
5. Check the new functions, RLS/grants, cron job, disabled catalogue rows, and optimized roll smoke checks before activation.
6. Activate only after the updated function is deployed:

```sql
begin;
update public.private_feature_gems set enabled=true
where metadata->>'biomeKind' in ('native','exclusive');
update public.biome_scheduler set enabled=true,last_tick=null where singleton;
commit;
```

Rollback: set `biome_scheduler.enabled=false, occurrence_id=null` to stop scheduling and clear the active effect; disable the seven exclusive catalogue rows before rolling back to an older Edge Function. Existing inventory specimens and discoveries can remain. Native catalogue rows may also be disabled if desired. Do not remove shared artifacts or rewrite stored rarities.

## Verification status

Tests operate on isolated local fixtures. Owner deployment and production verification remain outstanding. See the completed local validation below.

## Phase 2 — selection and commit boundary

The first accepted database lease freezes occurrence, denominator rules and biome-neutral mode. Subsequent subrolls use that exact snapshot through expiry; rejected attempts receive none. The existing `commit_equipment_roll` transaction advances discovery with an AFTER trigger, so rollback, duplicated commits and bonus inventory writes cannot discover. Genuine Deep Sea/Abyssal winners and House Edge losses can discover independently of their selectors. No extra per-subroll RPC is introduced. Breakneck bonus selection shares the accepted eligibility snapshot without creating a second genuine commit.

Only the normal selector's check denominator and descending selection order change. Canonical rarity continues to drive floors, equipment eligibility, Fortune/research bands, stored specimens, reroll comparisons, value and progression. Effective ties use catalogue sort order, then canonical rarity descending, then name for a deterministic final tie. Saturation and marginal reversals are deliberate. Existing relic and special-pool routing remain untouched. Dedicated selectors receive their original catalogues.

Biome-neutral Tournament Mode is a new saved preference because no tournament subsystem existed in this repository. It excludes all seven required-biome gems and all biome denominator adjustments, preserving personal eligible buffs. It does not add tournament scoring, matchmaking or rewards. The mode and rules version accompany normal roll responses for auditing. Existing Enable Buffs still controls its separate four-stat behavior.

The four Native gems stay in the ordinary pool. Seven exclusives are optional prestige: excluded from ordinary Gem Index completion, Complete Index achievement requirements and Collector's Edge completion. All 11 descriptions are verbatim user-approved text. Damnation/Aberration have metadata and shared formatting overrides. No existing Mantle Core artifact changes.

## Phase 3 — index and announcements

The authenticated discovery-aware index returns nine masked biome slots and no Phenomena entry until Distortion is discovered. Discovered entries expose their duration, mean start interval and gem conditions; these are random means, not countdowns to guaranteed appearances. Roll and Gem Index show the authoritative active state using server-clock offset and announce newly observed starts and discoveries. No remote chat messages are sent. Existing independent gem conditions remain visible in the Gem Index.

The widget pauses network polling while hidden, permits one request at a time, and keeps open disclosures/focus through unchanged refreshes. It has no canvas, particle system or continuous animation. Names and countdown text carry meaning independently of color. Countdown updates are excluded from live announcements to avoid screen-reader chatter. The compact status warns when the last accepted batch period exceeds the active occurrence duration and points to batch 1. The dedicated saved mode toggle is separate from Enable Buffs.

## Phase 4 — regression evidence and limits

- Fresh read-only live catalogue audit: 301 rows; no numeric or eligibility differences from the October 23 reference after normalizing numeric/timestamp representations. The regression fixture is refreshed from the current catalogue. No live rolls or data writes were used.
- `npm run test:biomes`: local PostgreSQL-compatible migration execution; exact scheduler calibration, 69 relationships/11 specimen definitions, verbatim descriptions, manual Anomalous tiers, acceptance snapshots, rollback and duplicate discovery, RLS/private rules, server-owned fields, overlap exclusion, same-tick expiry, masked nine-biome/hidden Phenomena index, and optional Complete Index requirements.
- Selector validation: 440 biome-neutral vectors across ten Luck values and four equipment profiles; actual canonical event-band checks; canonical floors; all seven exclusive gates; intentional zero-probability Void Pearl saturation; deterministic effective ties; isolated request catalogues; 150,000 seeded draws versus exact sequential marginals; unchanged dedicated Deep Sea selector at divisors 1/10/20. A base specimen-value calendar mixture checks unchanged weight/value products and identical tournament valuation across ambient states. This is not a new population cash forecast or a full rerun of the original first-acquisition simulation.
- Actual optimized handler: accepted four-subroll biome snapshot survives expiry, no retrospective gain, canonical stored rarity, unchanged personal Luck in biome-neutral mode, one claim per batch, existing one-roll charge consumption, equipment passives, House Edge, Deep Sea atomic sale/feed/crafting, mutation-value safeguards and Misty state. Existing Phase 5/6 request budgets, roll context/cache, batch database, special/one-roll Luck ordering and foundation/navigation/index regressions pass.
- Browser checks: Biome Index at 360/390/768/1440px, masking, hidden Phenomena, keyboard disclosures, disclosure persistence, long labels, compact mode and no horizontal overflow. Visually inspected phone capture. Existing actual Roll-controller presentation checks pass at 360/390/430/768/1366/2560px after merging current main's `/roll` route; primary controls remain before biome status. No animations or particles were introduced.
- `npm run test:biomes:concurrency` provides a separate-process PostgreSQL test for concurrent ticks, claims and discovery updates plus reconnect/cooldown behavior. **Not run here:** installed libpq tools have no PostgreSQL server binary, and Docker is not running. Run with `BIOMES_POSTGRES_BIN=/path/to/postgresql/bin` on a machine with server binaries. Local serialized migration tests do not certify production concurrency or cron reliability.
- Owner release checks: deploy in the order above; verify cron actually fires once/minute, outage recovery does not catch up, same-tick expiry/repeat activation, multi-session claims/rollback/partial batches, normal/Deep Sea/Abyssal discovery, independent daily windows, Global Event coexistence, and saved mode persistence. Existing SQL transaction boundaries and optimization are preserved, but production latency, actual Cron jitter, physical screen-reader/device behavior and realized economy remain owner verification.
- No migrations or Edge Functions deployed. No production verification claimed. Full all-feature `npm test` was not run.

Browser scripts support `BIOMES_PLAYWRIGHT_MODULE`, `BIOMES_CHROMIUM_PATH`, `ROLL_PLAYWRIGHT_MODULE`, `ROLL_CHROMIUM_PATH` and `ROLL_PREVIEW_URL` for existing local runtimes. Standard CI may use its installed Playwright and browser instead. Screenshots are local QA artifacts, not committed game assets.
