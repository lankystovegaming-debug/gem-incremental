-- Keep the immutable cash ledger raw.  This private overlay records reviewed
-- exceptions whose original rows still need to reconcile to balance changes,
-- but must not be interpreted as gameplay sources, sinks, or transfers.
begin;

create table economy_private.cash_correction_annotations (
  ledger_id bigint primary key references public.economy_cash_ledger(id) on delete restrict,
  correction_type text not null,
  reason text not null,
  annotated_at timestamptz not null default statement_timestamp()
);
alter table economy_private.cash_correction_annotations enable row level security;
revoke all on economy_private.cash_correction_annotations from public,anon,authenticated,service_role;

-- The reviewed incident began with the first repeated loan draw and ended with
-- the explicit bank reset.  Select it by immutable ledger identity plus the
-- writer metadata, player, and time envelope; never by a rounded amount.
do $backfill$
declare
  v_rows integer;
begin
  if exists(select 1 from public.economy_cash_ledger where id in (450822,458823)) then
    if not exists (
      select 1 from public.economy_cash_ledger
      where id=450822
        and player_id='657b756e-c21e-40ab-b2b5-b13403f89039'::uuid
        and created_at='2026-09-11 12:51:11.439558+00'::timestamptz
        and category='bank_loans' and subcategory='bank_borrow'
        and reference='bank_borrow'
        and metadata->>'attribution'='database_function'
    ) or not exists (
      select 1 from public.economy_cash_ledger
      where id=458823
        and player_id='657b756e-c21e-40ab-b2b5-b13403f89039'::uuid
        and created_at='2026-09-11 13:28:04.04519+00'::timestamptz
        and category='unattributed' and account='bank'
        and metadata->>'operation'='UPDATE'
        and metadata->>'attribution'='balance_only'
    ) then
      raise exception 'Historical bank-bug ledger fingerprint changed; review before classifying.';
    end if;

    select count(*) into v_rows
    from public.economy_cash_ledger
    where id between 450822 and 458823
      and player_id='657b756e-c21e-40ab-b2b5-b13403f89039'::uuid
      and created_at between '2026-09-11 12:51:11.439558+00'::timestamptz
                         and '2026-09-11 13:28:04.04519+00'::timestamptz
      and category in ('bank_loans','bank_deposit','bank_interest','unattributed');
    if v_rows<>289 then
      raise exception 'Expected 289 reviewed bank-bug ledger rows, found %; review before classifying.',v_rows;
    end if;

    insert into economy_private.cash_correction_annotations(ledger_id,correction_type,reason)
    select id,'bank_bug_correction',
      'Historical repeated-loan and bank-balance bug; includes its loan, deposit, interest, and cleanup bookkeeping.'
    from public.economy_cash_ledger
    where id between 450822 and 458823
      and player_id='657b756e-c21e-40ab-b2b5-b13403f89039'::uuid
      and created_at between '2026-09-11 12:51:11.439558+00'::timestamptz
                         and '2026-09-11 13:28:04.04519+00'::timestamptz
      and category in ('bank_loans','bank_deposit','bank_interest','unattributed');
  end if;
end $backfill$;

create or replace function public.admin_get_economy_breakdown(p_period text default '24H') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_started timestamptz; v_from timestamptz; v_now timestamptz:=statement_timestamp(); v_result jsonb;
begin
  if auth.uid() is null or not (auth.uid()='38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists(select 1 from public.admins where user_id=auth.uid())) then
    raise exception 'not_admin' using errcode='42501';
  end if;
  if p_period is null or p_period not in ('1H','6H','24H','7D','All') then
    raise exception 'invalid_economy_period';
  end if;
  select started_at into v_started from economy_private.tracking where singleton;
  v_from:=greatest(v_started,case p_period when '1H' then v_now-interval '1 hour'
    when '6H' then v_now-interval '6 hours' when '24H' then v_now-interval '24 hours'
    when '7D' then v_now-interval '7 days' else v_started end);

  with classified as materialized (
    select l.*,
      case when a.ledger_id is not null or l.category='account_removal' then 'correction'
           when l.category='unattributed' then 'unclassified' else l.direction end as report_direction,
      case when a.ledger_id is not null then a.correction_type
           when l.category='account_removal' then 'account_removal'
           when l.category='unattributed' then 'unclassified' else l.category end as report_category,
      case when a.ledger_id is not null then l.category else l.subcategory end as report_subcategory,
      case when a.ledger_id is not null then a.reason
           when l.category='account_removal' then
             'Account deletion or administrative cleanup; preserved for supply reconciliation, not gameplay destruction.'
           else null end as correction_reason
    from public.economy_cash_ledger l
    left join economy_private.cash_correction_annotations a on a.ledger_id=l.id
    where l.created_at>=v_from and l.created_at<=v_now
      and not exists (
        select 1 from public.system_account_exclusions e
        where e.player_id=l.player_id and e.exclude_from_economy
      )
  ), grouped as materialized (
    select report_direction direction,report_category category,report_subcategory subcategory,
      direction original_direction,category original_category,correction_reason,account,
      sum(amount) amount,count(*) entries,
      coalesce(sum(amount) filter(where amount>0),0) credited,
      coalesce(-sum(amount) filter(where amount<0),0) debited
    from classified
    group by report_direction,report_category,report_subcategory,direction,category,correction_reason,account
  ), totals as (
    select coalesce(sum(amount) filter(where direction='source'),0) created,
      coalesce(-sum(amount) filter(where direction='sink'),0) destroyed,
      coalesce(-sum(amount) filter(where direction='transfer' and category='bank_deposit' and account='wallet'),0) deposited,
      coalesce(sum(amount) filter(where direction='transfer' and category='bank_withdrawal' and account='wallet'),0) withdrawn,
      coalesce(sum(amount) filter(where direction='transfer'),0) transfer_net,
      coalesce(sum(amount) filter(where direction='correction'),0) correction_net,
      coalesce(sum(entries) filter(where direction='correction'),0) correction_entries,
      coalesce(sum(amount) filter(where direction='unclassified'),0) unclassified_net,
      coalesce(sum(entries) filter(where direction='unclassified'),0) unclassified_entries,
      coalesce(sum(amount) filter(where account<>'clearing'),0) balance_change,
      coalesce(sum(entries) filter(where account<>'clearing'),0) balance_events
    from grouped
  ), breakdown as (
    select direction,category,subcategory,original_direction,original_category,correction_reason,
      sum(amount) amount,sum(entries) entries,sum(credited) credited,sum(debited) debited
    from grouped where direction<>'unclassified'
    group by direction,category,subcategory,original_direction,original_category,correction_reason
  ), supply as (
    select (select coalesce(sum(p.money::numeric),0) from public.players p where not exists(
      select 1 from public.system_account_exclusions e where e.player_id=p.id and e.exclude_from_economy)) wallets,
      (select coalesce(sum(b.balance::numeric),0) from public.bank_accounts b where not exists(
      select 1 from public.system_account_exclusions e where e.player_id=b.player_id and e.exclude_from_economy)) deposits
  )
  select jsonb_build_object(
    'period',p_period,'trackingSince',v_started,'periodStart',v_from,'generatedAt',v_now,
    'cashCreated',t.created,'cashDestroyed',t.destroyed,'netCreation',t.created-t.destroyed,
    'walletToBank',t.deposited,'bankToWallet',t.withdrawn,'transferNet',t.transfer_net,
    'correctionNet',t.correction_net,'correctionEntries',t.correction_entries,
    'unclassifiedNet',t.unclassified_net,'unclassifiedEntries',t.unclassified_entries,
    'balanceChange',t.balance_change,'balanceEvents',t.balance_events,
    'reconciliationDifference',t.balance_change-
      ((t.created-t.destroyed)+t.transfer_net+t.correction_net+t.unclassified_net),
    'walletCash',s.wallets,'bankDeposits',s.deposits,'totalMoneySupply',s.wallets+s.deposits,
    'breakdown',coalesce((select jsonb_agg(jsonb_build_object(
      'direction',direction,'category',category,'subcategory',subcategory,
      'originalDirection',original_direction,'originalCategory',original_category,
      'correctionReason',correction_reason,'amount',amount,'entries',entries,
      'credited',credited,'debited',debited) order by direction,category,subcategory,original_category)
      from breakdown),'[]'::jsonb)
  ) into v_result from totals t cross join supply s;
  return v_result;
end $$;
revoke all on function public.admin_get_economy_breakdown(text) from public,anon;
grant execute on function public.admin_get_economy_breakdown(text) to authenticated;

commit;
