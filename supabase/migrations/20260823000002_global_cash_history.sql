-- =========================================================
-- GLOBAL CASH HISTORY
--
-- Time series behind the optional "Cash Market" graph page. A
-- scheduled snapshot records the whole economy every 10 minutes:
--   • lifetime = sum of every player's lifetime earnings ("global cash")
--   • money    = sum of every player's current wallet ("player cash")
--
-- The table is capped so it never grows without bound, and the read
-- path is a single SECURITY DEFINER RPC returning a compact JSON array
-- the client can plot directly.
-- =========================================================

create extension if not exists pg_cron;

create table if not exists public.global_cash_history (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  lifetime double precision not null default 0,
  money    double precision not null default 0
);

create index if not exists global_cash_history_at_idx
  on public.global_cash_history (at);

alter table public.global_cash_history enable row level security;

drop policy if exists global_cash_history_read on public.global_cash_history;
create policy global_cash_history_read
  on public.global_cash_history
  for select
  to anon, authenticated
  using (true);

grant select on public.global_cash_history to anon, authenticated;

-- Records one snapshot of the economy and trims history to the most
-- recent 2000 rows (~2 weeks at one every 10 minutes).
create or replace function public.snapshot_global_cash()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.global_cash_history (lifetime, money)
  select
    coalesce(sum(lifetime_earnings), 0),
    coalesce(sum(money), 0)
  from public.players;

  delete from public.global_cash_history
  where id <= (
    select max(id) - 2000 from public.global_cash_history
  );
end;
$$;

grant execute on function public.snapshot_global_cash() to service_role;

-- Returns the last p_hours of snapshots as a JSON array ordered oldest
-- first: [{ at, lifetime, money }, ...].
create or replace function public.get_global_cash_history(p_hours int default 24)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(row_to_json(h) order by h.at),
    '[]'::jsonb
  )
  from (
    select at, lifetime, money
    from public.global_cash_history
    where at >= now() - make_interval(hours => greatest(1, p_hours))
  ) h;
$$;

grant execute on function public.get_global_cash_history(int) to anon, authenticated;

-- Snapshot every 10 minutes. Re-scheduling with the same name replaces
-- any existing job, so this migration is safe to re-run.
do $$
begin
  perform cron.unschedule('global-cash-snapshot')
  where exists (
    select 1 from cron.job where jobname = 'global-cash-snapshot'
  );
  perform cron.schedule(
    'global-cash-snapshot',
    '*/10 * * * *',
    'select public.snapshot_global_cash();'
  );
end;
$$;

-- Seed one point immediately so the graph is never empty.
select public.snapshot_global_cash();
