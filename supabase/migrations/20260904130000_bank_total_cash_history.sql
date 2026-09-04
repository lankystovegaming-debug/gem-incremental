-- =========================================================
-- BANK TOTAL — global cash history series
--
-- Adds a third series to the Cash Market graph: total money currently
-- deposited across every player's bank savings account. Extends the
-- existing 10-minute economy snapshot (see 20260823000002) rather than
-- adding a second cron job, so the bank total lines up on the same
-- timeline as global and player cash.
--
-- Depends on public.bank_accounts (20260904120000), which sorts earlier.
-- =========================================================

set local check_function_bodies = off;

alter table public.global_cash_history
  add column if not exists bank double precision not null default 0;

-- Redefine the snapshot to also record total bank deposits.
create or replace function public.snapshot_global_cash()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.global_cash_history (lifetime, money, bank)
  select
    coalesce(sum(lifetime_earnings), 0),
    coalesce(sum(money), 0),
    coalesce((select sum(balance) from public.bank_accounts), 0)
  from public.players;

  delete from public.global_cash_history
  where id <= (
    select max(id) - 2000 from public.global_cash_history
  );
end;
$$;

grant execute on function public.snapshot_global_cash() to service_role;

-- Redefine the read RPC to return the bank series alongside the others:
-- [{ at, lifetime, money, bank }, ...], oldest first.
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
    select at, lifetime, money, bank
    from public.global_cash_history
    where at >= now() - make_interval(hours => greatest(1, p_hours))
  ) h;
$$;

grant execute on function public.get_global_cash_history(int) to anon, authenticated;

-- Seed one point immediately so the new series is never empty.
select public.snapshot_global_cash();
