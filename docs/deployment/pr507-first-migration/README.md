# PR #507: smaller SQL-editor deployment files

These 18 files replace **only** `20261008000000_dungeon_workbench_full_rebalance.sql` when deploying manually through the Supabase SQL editor. Do not run the original 9 MB file as well. These are deployment helpers, not additional migrations: keep them outside `supabase/migrations`.

## Before starting

- Confirm the project is `igrddscmrdrrwtvyspbf`, and enable maintenance mode.
- Confirm a backup is available. The existing main-branch schema/migrations must already be installed.
- Do not start while the original migration is still running. A NULL table lookup alone does not rule out an uncommitted transaction. If unsure, inspect running queries in the dashboard before proceeding.
- Use a fresh SQL-editor tab for each file. Paste/run the **entire file**, with no partial selection. Wait for its success result before continuing. Never paste all files together.
- Each numbered write step commits independently; this is deliberately not one atomic deployment. Keep maintenance enabled throughout. RLS and access restrictions are applied in step 01, not deferred until the end.

## Run order

1. `01-schema-and-security.sql`
2. `02-rooms-0001-100.sql`
3. `03-rooms-0101-200.sql`
4. `04-rooms-0201-300.sql`
5. `05-rooms-0301-400.sql`
6. `06-rooms-0401-500.sql`
7. `07-rooms-0501-600.sql`
8. `08-rooms-0601-700.sql`
9. `09-rooms-0701-800.sql`
10. `10-rooms-0801-900.sql`
11. `11-rooms-0901-1000.sql`
12. `12-rooms-1001-1100.sql`
13. `13-rooms-1101-1200.sql`
14. `14-rooms-1201-1300.sql`
15. `15-rooms-1301-1400.sql`
16. `16-rooms-1401-1500.sql`
17. `17-catalogs-functions-and-permissions.sql`
18. `18-verify-first-migration.sql`

Every room batch should report `rooms_in_batch = 100`. Step 18 must report **FIRST migration complete**. It checks 1,500 rooms, 11 regions, 4 zones, 30 bosses, 198 forge materials, 66 mutations, 142 recipes, 26 crafting-chance rows, RPC existence, and RLS. An unexpected count requires investigation, not deleting existing data to make the check pass.

If a step errors, **stop**. Do not continue to the next file. Each write file is transactional, so its changes either commit together or roll back. If the editor reports an aborted transaction on a subsequent attempt, run `ROLLBACK;` first in that same session. If there is no response, do not blindly retry: check whether the query is still running and whether that batch committed. Once confirmed, a failed batch can be retried because imports use upserts.

## Then finish PR #507 deployment

Apply the four remaining original migrations in this exact order (skip only versions already confirmed as applied):

```text
20261008140000_dungeon_backend_fix.sql
20261011232956_prevent_parallel_dungeon_runs.sql
20261011234848_fix_dungeon_catalog_runtime.sql
20261012060602_dungeon_workbench_original_recipe_repairs.sql
```

Do not stop after the first migration: the later files contain required correctness/security fixes. If the parallel-run index fails because of duplicate active/won runs, resolve that condition before proceeding; do not skip the index.

Next deploy both `dungeons` (including `formulas.js` and `drop-data.json`) and `workbench` Edge Functions from PR #507, then deploy its website files. Test entry, combat, defeat/retry, refresh/resume, claims, and crafting before ending maintenance. The original SQL enables Dungeons/Workbench, so maintenance is essential until the full deployment is complete.

Manual SQL-editor execution does not automatically record Supabase CLI migration history. Reconcile that history before a future CLI migration push; do not blindly push the old first migration again after applying these helpers.

## Regeneration and verification

```sh
node scripts/build-dungeon-dashboard-sql.mjs
node scripts/build-dungeon-dashboard-sql.mjs --check
node tests/dungeon-dashboard-deployment-test.mjs
```

The generator extracts the exact room JSON and SQL from the original migration; no room formulas or probabilities are rewritten. The database test compares the split deployment's catalog, function, policy, and permission results with the original migration in isolated databases.
