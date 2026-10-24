# Owner bug-report inbox

The contact number is now **96818819** in `/legal/` and `/bugs/`, including SMS links.

Sign in with the owner game account, then open `/bugs/` or use **Bug reports &
feedback** in `/admin/`. The inbox appears above the existing report form. It shows
all submitted categories, newest first, in batches of 25. Use the category filter,
Refresh reports or Load older reports. Each report shows its ID, submission date,
message, status, reporter account ID, optional reply contact and referring page.
Reports are read-only; the existing form still submits through `submit_bug_report`.

## Deployment — owner action required

Apply `supabase/migrations/20261022142526_bug_report_owner_inbox_access.sql`, then
release the frontend from this branch. No Edge Function deployment is needed.
No live schema changes or deployments were performed by this task.

The existing report SELECT policy directly queries `public.admins`, but
`authenticated` has no SELECT privilege on that private table. The migration uses
`public.am_i_admin()`, the existing SECURITY DEFINER membership helper with an empty
search path, instead. It grants no access to the private admin allow-list and adds
no mutation privileges. `public.admins` is the existing owner-only boundary;
`admin_viewers` and event managers are not included. Until the migration is applied,
the owner sees a load-error message explaining the required migration.

## Security and validation

- Live read-only inspection confirmed 64 existing reports, the exact report schema,
  helper definition/EXECUTE privilege, enabled RLS and the inaccessible admin table.
  No live report messages or contact values were retrieved.
- Database test reproduces the old owner permission failure, applies the migration
  locally, then verifies owner reads, rejection of public admin-table access, no
  report access for ordinary reporters/missing identities/anonymous visitors and
  no new UPDATE privilege. Reapplying the migration is safe.
- Browser test runs the actual bugs controller and inbox with isolated backend
  fixtures. Phone/desktop checks cover hidden inbox/no reads for a non-owner,
  25+2 pagination, category filtering, load failure and retry, safe literal rendering
  of malicious HTML/URLs, clearing private data on sign-out (including a delayed
  response), no page overflow and the original report-submission form.
- Syntax, whitespace and existing admin read-only/tab checks pass.

Run `npm run test:bug-reports` and `npm run test:bug-reports:browser` with the usual
PGlite and Playwright dependencies. The browser suite uses Chrome and the local
preview at `http://127.0.0.1:5586` by default; `BUGS_PREVIEW_URL` overrides it.
`PGLITE_MODULE` / `PLAYWRIGHT_MODULE` can select existing dependency installations.
