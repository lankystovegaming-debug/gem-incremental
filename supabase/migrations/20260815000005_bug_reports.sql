-- =========================================================
-- Bug reports.
--
-- Players submit through the Report a bug page. The row is
-- written by a SECURITY DEFINER function (with validation and a
-- light per-reporter rate limit) so players never touch the
-- table directly. Admins can read the table for triage.
-- =========================================================

create table if not exists public.bug_reports (
  id bigint generated always as identity primary key,
  reporter uuid references auth.users(id) on delete set null,
  category text,
  body text not null,
  contact text,
  page text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from anon, authenticated;

-- Admins may read reports (dashboard triage).
drop policy if exists "Admins can read bug reports" on public.bug_reports;
create policy "Admins can read bug reports"
  on public.bug_reports
  for select
  to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));


create or replace function public.submit_bug_report(
  p_body text,
  p_category text default null,
  p_contact text default null,
  p_page text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_recent integer;
begin
  if p_body is null or btrim(p_body) = '' then
    raise exception 'empty_body';
  end if;

  if length(p_body) > 4000 then
    raise exception 'body_too_long';
  end if;

  -- Light rate limit: at most 5 reports from one signed-in
  -- reporter per 10 minutes.
  if auth.uid() is not null then
    select count(*) into v_recent
    from public.bug_reports
    where reporter = auth.uid()
      and created_at > now() - interval '10 minutes';

    if v_recent >= 5 then
      raise exception 'rate_limited';
    end if;
  end if;

  insert into public.bug_reports (reporter, category, body, contact, page)
  values (
    auth.uid(),
    nullif(btrim(coalesce(p_category, '')), ''),
    btrim(p_body),
    nullif(btrim(coalesce(p_contact, '')), ''),
    nullif(btrim(coalesce(p_page, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_bug_report(text, text, text, text) to anon, authenticated;
