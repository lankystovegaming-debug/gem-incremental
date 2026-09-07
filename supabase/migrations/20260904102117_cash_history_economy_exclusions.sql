-- Requires the existing production system_account_exclusions and bank schema.
-- Run the entire file together. No player/account balances are changed.
begin;

create or replace function public.snapshot_global_cash()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.global_cash_history (lifetime, money, bank)
  select
    coalesce(sum(p.lifetime_earnings), 0),
    coalesce(sum(p.money), 0),
    (select coalesce(sum(b.balance), 0)
     from public.bank_accounts b
     where not exists (
       select 1 from public.system_account_exclusions e
       where e.player_id = b.player_id and e.exclude_from_economy
     ))
  from public.players p
  where not exists (
    select 1 from public.system_account_exclusions e
    where e.player_id = p.id and e.exclude_from_economy
  );

  delete from public.global_cash_history
  where id <= (select max(id) - 2000 from public.global_cash_history);
end;
$$;

revoke execute on function public.snapshot_global_cash() from public, anon, authenticated;
grant execute on function public.snapshot_global_cash() to service_role;

-- A private archive preserves the original samples, including any extra columns.
-- Its existence is also the one-time reset marker: rerunning never clears new data.
lock table public.global_cash_history in access exclusive mode;
do $$
begin
  if to_regclass('public.global_cash_history_before_exclusions') is null then
    create table public.global_cash_history_before_exclusions
      as select * from public.global_cash_history;
    alter table public.global_cash_history_before_exclusions enable row level security;
    revoke all on public.global_cash_history_before_exclusions from public, anon, authenticated;
    delete from public.global_cash_history;
    perform public.snapshot_global_cash();
  end if;
end;
$$;

commit;
