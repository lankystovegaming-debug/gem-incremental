-- =========================================================
-- BANK v1.1: SCALED LOAN TERMS + DEFAULT ASSET LIQUIDATION
--
-- Two tuning changes to the Bank system (see 20260904120000_bank_system_v1):
--
-- 1) Repayment term now scales with the loan size. A small loan still runs
--    7 days; larger loans get proportionally longer to repay (up to 30 days).
--    The term is anchored to the loan's original open time, so drawing more
--    onto an existing loan lengthens the term to match the bigger balance
--    without letting a player reset the clock by drawing repeatedly.
--
-- 2) Declaring bankruptcy no longer discharges a defaulted loan for free.
--    The bank first liquidates the player's assets to satisfy the debt, in
--    order:  savings -> wallet cash -> inventory gems (sold ignoring the
--    `locked` flag), selling only enough of the most valuable gems to cover
--    what is still owed; any change from the last gem sold returns to the
--    wallet.
--      * If seizure clears the debt in full, the loan simply settles: no
--        credit reset, no borrow freeze, no bankruptcy mark. The player
--        loses the seized assets but keeps their credit standing.
--      * If total assets fall short, the remaining balance is discharged as
--        a true bankruptcy (credit -> 300, borrowing frozen 14 days,
--        bankruptcy count +1) exactly as before.
--    Reachable once a loan has genuinely defaulted (past due now, or it has
--    missed at least one payment), so a fresh loan still cannot be borrowed
--    and instantly liquidated.
-- =========================================================

-- The base game schema (public.players, public.inventory_gems, etc.) is not
-- tracked in this repo; disable body validation for the SECURITY DEFINER
-- functions below. They only run on the real project where those tables exist.
set local check_function_bodies = off;


-- ── Loan term by size (shared by borrow logic and the client preview) ──
create or replace function public.bank_loan_term_days(p_amount double precision)
returns integer language sql immutable set search_path = '' as $$
  -- Bigger loans get more room to repay. Keep these tiers in sync with the
  -- loanTermDays() mirror in bank/bank.js.
  select case
    when coalesce(p_amount, 0) < 250000 then 7
    when p_amount < 1000000 then 10
    when p_amount < 2500000 then 14
    when p_amount < 5000000 then 21
    else 30
  end;
$$;


-- ── Borrow: fresh draws (and top-ups) use a size-scaled term ──
create or replace function public.bank_borrow(p_amount double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_amount double precision := floor(coalesce(p_amount, 0));
  v_acct public.bank_accounts%rowtype;
  v_limit double precision;
  v_available double precision;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if v_amount <= 0 then raise exception 'bank_invalid_amount'; end if;
  perform public.bank_touch(v_uid);

  select * into v_acct from public.bank_accounts where player_id = v_uid for update;
  -- Banks do not extend new credit to a frozen (post-bankruptcy) or defaulted account.
  if v_acct.borrow_frozen_until is not null and now() < v_acct.borrow_frozen_until then
    raise exception 'bank_borrow_frozen';
  end if;
  if (v_acct.loan_principal + v_acct.loan_interest_accrued) > 0
     and v_acct.loan_due_at is not null and now() > v_acct.loan_due_at then
    raise exception 'bank_in_default';
  end if;
  v_limit := public.bank_borrow_limit(v_acct.credit_score, v_acct.balance);
  v_available := v_limit - (v_acct.loan_principal + v_acct.loan_interest_accrued);
  if v_amount > v_available then raise exception 'bank_over_limit'; end if;

  update public.bank_accounts
     set loan_principal = loan_principal + v_amount,
         -- A fresh draw (from no debt) opens the loan now; top-ups keep the
         -- original open time.
         loan_opened_at = case when loan_principal <= 0 then now() else loan_opened_at end,
         -- Term scales with the resulting balance, measured from the loan's
         -- open time. A fresh draw opens now, so this is now + term; a top-up
         -- lengthens the term to fit the larger balance without resetting the
         -- clock to now().
         loan_due_at = case when loan_principal <= 0
                            then now() + make_interval(days => public.bank_loan_term_days(loan_principal + v_amount))
                            else coalesce(loan_opened_at, now())
                                 + make_interval(days => public.bank_loan_term_days(loan_principal + v_amount))
                       end,
         updated_at = now()
   where player_id = v_uid
   returning * into v_acct;

  update public.players set money = money + v_amount where id = v_uid;

  insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
  values (v_uid, 'borrow', v_amount, v_acct.balance,
          v_acct.loan_principal + v_acct.loan_interest_accrued, v_acct.credit_score, 'Loan drawn');
  return public.bank_dashboard_json(v_uid);
end;
$$;


-- ── Bankruptcy: seize assets to satisfy the debt, discharge only the gap ──
create or replace function public.bank_declare_bankruptcy()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_acct public.bank_accounts%rowtype;
  v_owed double precision;
  v_seize double precision;
  v_to_interest double precision;
  v_to_principal double precision;
  v_money double precision;
  v_take double precision;
  v_gem record;
  v_pay double precision;
  v_excess double precision;
  v_seized_savings double precision := 0;
  v_seized_wallet double precision := 0;
  v_gem_proceeds double precision := 0;
  v_gems_sold integer := 0;
  v_discharged boolean := false;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  perform public.bank_touch(v_uid);

  select * into v_acct from public.bank_accounts where player_id = v_uid for update;
  v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
  if v_owed <= 0 then raise exception 'bank_no_loan'; end if;
  -- Reachable only for a genuinely defaulted loan: currently past due, or it
  -- has already missed at least one payment. (bank_touch pushes the due date
  -- forward on each overdue settlement, so "past due right now" is a narrow
  -- window; missed_marks records that a default really happened.)
  if v_acct.missed_marks <= 0
     and (v_acct.loan_due_at is null or now() <= v_acct.loan_due_at) then
    raise exception 'bank_not_in_default';
  end if;

  -- (1) Savings offset (bank_touch usually took this already; grab anything
  --     deposited since the last settlement).
  v_seize := least(v_acct.balance, v_owed);
  if v_seize > 0 then
    v_to_interest := least(v_seize, v_acct.loan_interest_accrued);
    v_to_principal := v_seize - v_to_interest;
    update public.bank_accounts
       set balance = balance - v_seize,
           loan_interest_accrued = greatest(0, loan_interest_accrued - v_to_interest),
           loan_principal = greatest(0, loan_principal - v_to_principal),
           updated_at = now()
     where player_id = v_uid
     returning * into v_acct;
    v_seized_savings := v_seize;
    insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
    values (v_uid, 'seizure', v_seize, v_acct.balance,
            v_acct.loan_principal + v_acct.loan_interest_accrued, v_acct.credit_score,
            'Savings seized toward defaulted loan');
    v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
  end if;

  -- (2) Wallet cash.
  if v_owed > 0 then
    select money into v_money from public.players where id = v_uid for update;
    v_take := least(coalesce(v_money, 0), v_owed);
    if v_take > 0 then
      update public.players set money = money - v_take where id = v_uid;
      v_to_interest := least(v_take, v_acct.loan_interest_accrued);
      v_to_principal := v_take - v_to_interest;
      update public.bank_accounts
         set loan_interest_accrued = greatest(0, loan_interest_accrued - v_to_interest),
             loan_principal = greatest(0, loan_principal - v_to_principal),
             updated_at = now()
       where player_id = v_uid
       returning * into v_acct;
      v_seized_wallet := v_take;
      insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
      values (v_uid, 'seizure', v_take, v_acct.balance,
              v_acct.loan_principal + v_acct.loan_interest_accrued, v_acct.credit_score,
              'Wallet cash seized toward defaulted loan');
      v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
    end if;
  end if;

  -- (3) Sell inventory gems, most valuable first, only until the debt is
  --     cleared. The `locked` flag is deliberately ignored — a defaulted loan
  --     can seize locked gems too. Change from the final gem returns to the
  --     wallet so the bank never over-collects.
  if v_owed > 0 then
    for v_gem in
      select id, value from public.inventory_gems
       where player_id = v_uid
       order by value desc, id asc
       for update
    loop
      exit when v_owed <= 0.0001;
      v_pay := least(coalesce(v_gem.value, 0), v_owed);
      v_excess := coalesce(v_gem.value, 0) - v_pay;
      v_to_interest := least(v_pay, v_acct.loan_interest_accrued);
      v_to_principal := v_pay - v_to_interest;
      update public.bank_accounts
         set loan_interest_accrued = greatest(0, loan_interest_accrued - v_to_interest),
             loan_principal = greatest(0, loan_principal - v_to_principal),
             updated_at = now()
       where player_id = v_uid
       returning * into v_acct;
      delete from public.inventory_gems where id = v_gem.id and player_id = v_uid;
      if v_excess > 0 then
        update public.players set money = money + v_excess where id = v_uid;
      end if;
      v_gems_sold := v_gems_sold + 1;
      v_gem_proceeds := v_gem_proceeds + v_pay;
      v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
    end loop;
    if v_gems_sold > 0 then
      insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
      values (v_uid, 'liquidation', v_gem_proceeds, v_acct.balance,
              v_acct.loan_principal + v_acct.loan_interest_accrued, v_acct.credit_score,
              v_gems_sold || ' gem(s) liquidated toward defaulted loan');
    end if;
  end if;

  -- Settle vs. discharge.
  v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
  if v_owed <= 0.0001 then
    -- Assets covered the debt: the loan is satisfied and credit is untouched.
    update public.bank_accounts
       set loan_principal = 0,
           loan_interest_accrued = 0,
           loan_due_at = null,
           loan_opened_at = null,
           updated_at = now()
     where player_id = v_uid
     returning * into v_acct;
    insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
    values (v_uid, 'repay', v_seized_savings + v_seized_wallet + v_gem_proceeds, v_acct.balance, 0,
            v_acct.credit_score, 'Defaulted loan cleared by asset seizure');
  else
    -- Assets fell short: discharge the remainder as a true bankruptcy.
    v_discharged := true;
    update public.bank_accounts
       set loan_principal = 0,
           loan_interest_accrued = 0,
           loan_due_at = null,
           loan_opened_at = null,
           credit_score = 300,
           bankruptcies = bankruptcies + 1,
           borrow_frozen_until = now() + interval '14 days',
           updated_at = now()
     where player_id = v_uid
     returning * into v_acct;
    insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
    values (v_uid, 'bankruptcy', v_owed, v_acct.balance, 0, v_acct.credit_score,
            'Bankruptcy: assets seized, remaining debt discharged, credit reset, borrowing frozen 14 days');
  end if;

  -- The dashboard payload plus a one-shot summary of what this call did, so
  -- the client can report the outcome accurately.
  return public.bank_dashboard_json(v_uid) || jsonb_build_object(
    'liquidation_outcome', case when v_discharged then 'discharged' else 'cleared' end,
    'seized_savings', v_seized_savings,
    'seized_wallet', v_seized_wallet,
    'gems_sold', v_gems_sold,
    'gem_proceeds', v_gem_proceeds
  );
end;
$$;


-- Grants are unchanged (functions replaced in place keep their existing ACL),
-- but re-assert them so a fresh apply on a clean database is self-contained.
grant execute on function public.bank_loan_term_days(double precision) to authenticated;
grant execute on function public.bank_borrow(double precision) to authenticated;
grant execute on function public.bank_declare_bankruptcy() to authenticated;
