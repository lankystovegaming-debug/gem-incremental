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
