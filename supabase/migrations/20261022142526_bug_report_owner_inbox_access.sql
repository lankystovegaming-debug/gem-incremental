-- The old policy queried public.admins as the caller, but authenticated
-- clients cannot SELECT that private allow-list. Use the existing, hardened
-- membership helper; do not grant browser access to the admins table.
-- public.admins contains the owner only; admin_viewers/event managers do not
-- gain access to reports, which may contain private contact details.
drop policy if exists "Admins can read bug reports" on public.bug_reports;
create policy "Admins can read bug reports"
  on public.bug_reports for select to authenticated
  using ((select public.am_i_admin()));

grant select on public.bug_reports to authenticated;
