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

Rollback: disable the scheduler; disable the seven exclusive catalogue rows before rolling back to an older Edge Function. Existing inventory specimens and discoveries can remain. Native catalogue rows may also be disabled if desired. Do not remove shared artifacts or rewrite stored rarities.

## Verification status

Work in progress; final validation and limitations are recorded below when complete. Tests operate on isolated local fixtures. Owner deployment and production verification remain outstanding.

## Phase 2 — selection and commit boundary

The first accepted database lease freezes occurrence, denominator rules and biome-neutral mode. Subsequent subrolls use that exact snapshot through expiry; rejected attempts receive none. The existing `commit_equipment_roll` transaction advances discovery with an AFTER trigger, so rollback, duplicated commits and bonus inventory writes cannot discover. Genuine Deep Sea/Abyssal winners and House Edge losses can discover independently of their selectors. No extra per-subroll RPC is introduced.

Only the normal selector's check denominator and descending selection order change. Canonical rarity continues to drive floors, equipment eligibility, Fortune/research bands, stored specimens, reroll comparisons, value and progression. Effective ties use catalogue sort order, then canonical rarity descending, then name for a deterministic final tie. Saturation and marginal reversals are deliberate. Existing relic and special-pool routing remain untouched. Dedicated selectors receive their original catalogues.

Biome-neutral Tournament Mode is a new saved preference because no tournament subsystem existed in this repository. It excludes all seven required-biome gems and all biome denominator adjustments, preserving personal eligible buffs. It does not add tournament scoring, matchmaking or rewards. The mode and rules version accompany normal roll responses for auditing. Existing Enable Buffs still controls its separate four-stat behavior.

The four Native gems stay in the ordinary pool. Seven exclusives are optional prestige: excluded from ordinary Gem Index completion, Complete Index achievement requirements and Collector's Edge completion. All 11 descriptions are verbatim user-approved text. Damnation/Aberration have metadata and shared formatting overrides. No existing Mantle Core artifact changes.
