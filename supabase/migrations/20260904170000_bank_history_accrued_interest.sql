-- =========================================================
-- BANK HISTORY — include accrued savings interest
--
-- The Cash Market bank series represents the value across all player
-- savings accounts. Savings is settled lazily when a player uses the bank,
-- so add each account's accrued (but not yet ledger-posted) interest to the
-- snapshot. This makes the graph rise with earned interest and fall when
-- money is withdrawn, without generating a transaction for every account
-- on every ten-minute economy snapshot.
-- =========================================================

-- Repair the first deployed copy of the rate migration, which used the
-- wrong variable name in the savings-interest ledger insert. Clean
-- environments already have the corrected source migration, so this is a
-- harmless no-op there.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.bank_touch(uuid)'::regprocedure)
    into v_definition;

  if position('values (v_uid, ''interest''' in lower(v_definition)) > 0 then
    v_definition := replace(
      v_definition,
      'values (v_uid, ''interest''',
      'values (p_uid, ''interest'''
    );
    execute v_definition;
  end if;
end;
$$;


create or replace function public.snapshot_global_cash()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_savings_daily_rate constant numeric := power(1.065::numeric, 1::numeric / 365) - 1;
begin
  insert into public.global_cash_history (lifetime, money, bank)
  select
    coalesce(sum(p.lifetime_earnings), 0),
    coalesce(sum(p.money), 0),
    coalesce((
      select sum(
        b.balance * power(
          1 + v_savings_daily_rate,
          greatest(0, extract(epoch from (now() - b.last_interest_at)) / 86400.0)
        )
      )
      from public.bank_accounts b
      where not exists (
        select 1
        from public.system_account_exclusions e
        where e.player_id = b.player_id
          and e.exclude_from_economy
      )
    ), 0)
  from public.players p
  where not exists (
    select 1
    from public.system_account_exclusions e
    where e.player_id = p.id
      and e.exclude_from_economy
  );

  delete from public.global_cash_history
  where id <= (
    select max(id) - 2000 from public.global_cash_history
  );
end;
$$;

grant execute on function public.snapshot_global_cash() to service_role;

-- Add a fresh point using the accrued-interest calculation immediately.
select public.snapshot_global_cash();
