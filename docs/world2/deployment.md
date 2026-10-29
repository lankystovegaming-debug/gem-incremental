# Manual deployment and rollback — owner only

**Nothing has been deployed. World 2 must stay disabled.**

## Deployment order

1. Review the immutable v1 manifest/registry and generated migration. Confirm the
   target is `igrddscmrdrrwtvyspbf` and existing migration history is reconciled.
   Recheck current `roll` version/hash before any later gameplay work; these
   foundations do not require replacing it.
2. Run `npm ci`, then `npm run test:world2`. Run the real concurrent test using a
   disposable PostgreSQL server distribution as described in verification.md.
   Rehearse in a disposable database first. Do not point fixture scripts at live.
3. As the database migration owner (`postgres`), apply only
   `supabase/migrations/20261029002115_world2_abyss_phase1_foundations.sql`
   through your normal reviewed migration process. It is one transaction,
   including seeds. Do not blindly push all older repository migrations where
   production history differs. A failed transaction must roll back completely.
4. Verify the queries below. No Edge Function build or deployment is required.
   No frontend publication, cron creation or flag enablement is required.

This migration intentionally fails on a previously created conflicting schema or
object. Resolve the conflict rather than using IF NOT EXISTS to hide drift.

## Read-only post-migration verification

Run as owner in the SQL editor; do not use the game client's credentials:

```sql
select * from abyss_private.release_config;
-- Exactly one row: v1 and all four flags false.
select category,count(*),sum(weight)
from public.world2_law_definitions group by category order by category;
-- A: 11/11, B: 3/3, C: 8/300.
select level,factor,qualifying_rolls from public.world2_adaptation_levels order by level;
select verification,count(*) from public.world2_equipment_registry group by verification;
-- verified 78, unverified 1.
select relname,relrowsecurity from pg_class
where relnamespace='public'::regnamespace and relname like 'world2_%' and relkind='r';
-- 15 rows, RLS true everywhere.
select has_function_privilege('anon','public.world2_initialize_current_epoch()','EXECUTE'),
       has_function_privilege('authenticated','public.world2_initialize_current_epoch()','EXECUTE'),
       has_function_privilege('service_role','public.world2_initialize_current_epoch()','EXECUTE');
-- false, false, true.
```

Optionally, **the owner** can initialize an inert tuple with
`select public.world2_initialize_current_epoch();` and verify repeated calls return
the same tuple. This writes only the new epoch table; it does not enable laws or
rolls. It was tested locally, not invoked against production by this implementation.
The owner status RPC can be smoke-tested with the designated testing account:
`world2_my_status()` must report World 1, locked and all gameplay flags false.
It must not create state rows. Compare normal W1 account/stat behavior to your
predeployment snapshot. Run Supabase security advisors and inspect all new grants
before considering later phases.

## Rollback

Preferred rollback is to leave these inert additive tables in place. No W1 code
or payout changed and the false CHECK constraints prevent gameplay activation.
Optionally revoke service-role execution of `world2_initialize_current_epoch()`
and authenticated execution of `world2_my_status()` while investigating.

If the migration fails, roll back its transaction; do not partially retry seeds.
If a later phase has populated receipts/provenance/crafting proof, preserve those
records. Do not delete provenance, reset world histories, refund or rewind
`total_rolls`, restore old RNG state, or modify existing W1 equipment/cash.

Full removal before any data exists is an owner-reviewed schema rollback: remove
the two new public RPCs, new tables in reverse FK order (provenance and quest first;
receipts/law state before epochs; configuration before manifests), then the private
trigger function and private schema. No `CASCADE` blanket drop is recommended.
Record migration-history reconciliation through your normal process. Once any
future gameplay data exists, use a forward repair migration instead of removing
these foundations.

## Phase 2 owner deployment (still disabled)

Phase 1 is now confirmed present in hosted `igrddscmrdrrwtvyspbf`, with all four
release flags false. Phase 2 was **not deployed**. Its transaction boundary and
isolated tests are described in [phase2.md](phase2.md).

1. Review PR #526's Phase 2 commit and rerun the tests in `phase2.md`. Reconcile
   migration history and rehearse on an isolated copy of the current schema. The
   captured claim/release/routing fixture is test evidence, never a deployment file.
2. Verify live `roll` is still the reviewed v179 or inspect newer differences.
   Recheck actual `claim_server_roll`, `roll_route_result`, inventory insertion,
   sale/relic helpers, `roll_refresh_context`, batch unlock and player triggers.
   This additive migration depends on their existing signatures. Resolve drift
   before applying; do not replace optimized functions with audit snapshots.
3. As postgres, apply **only**
   `supabase/migrations/20261029010322_world2_abyss_phase2_pipeline.sql` after the
   Phase 1 migration. It is one transaction; dependencies/conflicts must fail the
   whole migration. Do not blindly push other pending migrations.
4. Verify `abyss_private.pipeline_config.enabled = false` and its CHECK still
   forbids true. Keep `abyss_private.release_config`'s four flags false and the
   active-world/unlock constraints intact. New functions require both the private
   pipeline gate and the global gameplay gate. Replays remain read-only recoverable.
5. Optionally deploy the complete current optimized `roll` Edge Function bundle
   to include the explicit W2-disabled HTTP response. Preserve existing JWT/auth,
   cache, instrumentation, support files and deployment configuration. **Do not
   deploy a new W2 gameplay evaluator or connect the executor in Phase 2.** The
   migration is compatible with existing v179 and needs no frontend publication.
   The owner performs this step; it was not done by this implementation.
6. Check ordinary W1 ×1/entitled batches on the designated test account: cooldown,
   inventory, deposited/sold result and total_rolls increments. Explicit
   `{ "worldId": 2 }` must return `403 world2_disabled` if the edge update was
   deployed. No W2 batch, receipt, history or provenance row should be created.
   Review Supabase security advisors/grants before any later activation.

Read-only verification as database owner:

```sql
select * from abyss_private.pipeline_config; -- false
select * from abyss_private.release_config; -- all four flags false
select conname,pg_get_constraintdef(oid) from pg_constraint
where conrelid in ('abyss_private.pipeline_config'::regclass,
                  'public.world2_player_state'::regclass);
select proname,
 has_function_privilege('anon',oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',oid,'EXECUTE') as client_execute,
 has_function_privilege('service_role',oid,'EXECUTE') as service_execute
from pg_proc where pronamespace='public'::regnamespace
 and proname in ('world2_roll_context','world2_claim_batch',
   'world2_begin_subroll','world2_commit_subroll','world2_switch_world');
-- Exactly five functions; false, false, true.
select relname,relrowsecurity from pg_class
where relnamespace='abyss_private'::regnamespace and relkind='r';
-- pipeline_config, roll_batches and specimen_links all have RLS.
select count(*) from abyss_private.roll_batches; -- zero in Phase 2
```

Preferred rollback retains the inert migration and restores the previous reviewed
optimized Edge Function bundle if needed. Keep both false gates and all receipts,
provenance, links and history intact. Since no W2 execution is enabled, no player
backfill, value rewrite, economic refund, RNG restore or counter rewind is needed.
If an unexpected future activation has occurred, stop new claims by disabling the
pipeline through an owner-reviewed forward change, allow only persisted replay,
and investigate from immutable receipts. Do not remove provenance or decrement
`players.total_rolls`. Revoking service EXECUTE also stops replay, so prefer a
false gate when recovery reads are required. Never blanket DROP/CASCADE the new
private schema, which also contains Phase 1 release configuration and triggers.
