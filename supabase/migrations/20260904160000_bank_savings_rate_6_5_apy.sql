-- =========================================================
-- BANK SAVINGS RATE — 6.5% effective annual yield
--
-- Savings continue to accrue continuously and compound daily. The daily
-- rate is derived from the requested annual yield instead of treating
-- 6.5% as a nominal APR, so a balance held for a full year earns exactly
-- 6.5%: (1 + daily_rate)^365 - 1 = 0.065.
--
-- Existing unposted interest is settled at the outgoing 0.012% daily
-- rate before the new rate takes effect. This prevents the new rate from
-- being applied retroactively to time that elapsed before this migration.
-- =========================================================

-- Settle all existing savings through the cutover instant at the old rate.
do $$
declare
  v_acct public.bank_accounts%rowtype;
  v_days numeric;
  v_interest double precision;
begin
  for v_acct in
    select * from public.bank_accounts for update
  loop
    v_days := greatest(0, extract(epoch from (now() - v_acct.last_interest_at)) / 86400.0);
    if v_acct.balance > 0 and v_days > 0 then
      v_interest := v_acct.balance * (power(1 + 0.00012, v_days) - 1);
      if v_interest >= 0.005 then
        update public.bank_accounts
           set balance = balance + v_interest,
               last_interest_at = now(),
               updated_at = now()
         where player_id = v_acct.player_id;
        insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
        values (
          v_acct.player_id,
          'interest',
          v_interest,
          v_acct.balance + v_interest,
          v_acct.loan_principal + v_acct.loan_interest_accrued,
          v_acct.credit_score,
          'Savings interest before 6.5% APY change'
        );
      else
        update public.bank_accounts
           set last_interest_at = now()
         where player_id = v_acct.player_id;
      end if;
    else
      update public.bank_accounts
         set last_interest_at = now()
       where player_id = v_acct.player_id;
    end if;
  end loop;
end;
$$;


-- Apply the new daily savings rate to all future lazy settlements.
create or replace function public.bank_touch(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct public.bank_accounts%rowtype;
  v_days numeric;
  v_interest double precision;
  v_loan_interest double precision;
  v_late_fee double precision;
  v_owed double precision;
  v_seize double precision;
  v_seize_interest double precision;
  v_seize_principal double precision;
  v_savings_daily_rate constant numeric := power(1.065::numeric, 1::numeric / 365) - 1;
begin
  insert into public.bank_accounts (player_id)
  values (p_uid)
  on conflict (player_id) do nothing;

  select * into v_acct from public.bank_accounts where player_id = p_uid for update;

  -- Savings interest: 6.5% effective annual yield, compounded daily.
  v_days := greatest(0, extract(epoch from (now() - v_acct.last_interest_at)) / 86400.0);
  if v_acct.balance > 0 and v_days > 0 then
    v_interest := v_acct.balance * (power(1 + v_savings_daily_rate, v_days) - 1);
    if v_interest >= 0.005 then
      update public.bank_accounts
         set balance = balance + v_interest,
             last_interest_at = now(),
             updated_at = now()
       where player_id = p_uid;
      insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
      values (p_uid, 'interest', v_interest, v_acct.balance + v_interest,
              v_acct.loan_principal + v_acct.loan_interest_accrued, v_acct.credit_score, 'Savings interest');
      select * into v_acct from public.bank_accounts where player_id = p_uid for update;
    else
      update public.bank_accounts set last_interest_at = now() where player_id = p_uid;
    end if;
  else
    update public.bank_accounts set last_interest_at = now() where player_id = p_uid;
  end if;

  -- Loan interest: compound the credit-scaled daily rate on the principal.
  v_days := greatest(0, extract(epoch from (now() - v_acct.last_loan_accrual_at)) / 86400.0);
  if v_acct.loan_principal > 0 and v_days > 0 then
    v_loan_interest := v_acct.loan_principal * (power(1 + public.bank_loan_daily_rate(v_acct.credit_score), v_days) - 1);
    if v_loan_interest >= 0.005 then
      update public.bank_accounts
         set loan_interest_accrued = loan_interest_accrued + v_loan_interest,
             last_loan_accrual_at = now(),
             updated_at = now()
       where player_id = p_uid;
      insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
      values (p_uid, 'loan_interest', v_loan_interest, v_acct.balance,
              v_acct.loan_principal + v_acct.loan_interest_accrued + v_loan_interest, v_acct.credit_score, 'Loan interest');
      select * into v_acct from public.bank_accounts where player_id = p_uid for update;
    else
      update public.bank_accounts set last_loan_accrual_at = now() where player_id = p_uid;
    end if;
  else
    update public.bank_accounts set last_loan_accrual_at = now() where player_id = p_uid;
  end if;

  -- Default handling. Read fresh values first (interest may have moved them).
  select * into v_acct from public.bank_accounts where player_id = p_uid for update;
  if (v_acct.loan_principal + v_acct.loan_interest_accrued) > 0
     and v_acct.loan_due_at is not null
     and now() > v_acct.loan_due_at then

    -- (1) Right of offset: seize savings to service the defaulted loan,
    -- interest first then principal, capped at what is owed.
    v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
    v_seize := least(v_acct.balance, v_owed);
    if v_seize > 0 then
      v_seize_interest := least(v_seize, v_acct.loan_interest_accrued);
      v_seize_principal := v_seize - v_seize_interest;
      update public.bank_accounts
         set balance = balance - v_seize,
             loan_interest_accrued = greatest(0, loan_interest_accrued - v_seize_interest),
             loan_principal = greatest(0, loan_principal - v_seize_principal),
             updated_at = now()
       where player_id = p_uid
       returning * into v_acct;
      insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
      values (p_uid, 'seizure', v_seize, v_acct.balance,
              v_acct.loan_principal + v_acct.loan_interest_accrued, v_acct.credit_score,
              'Savings seized to cover overdue loan');
    end if;

    v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
    if v_owed <= 0.0001 then
      -- Offset cleared the debt outright; the loan is settled.
      update public.bank_accounts set loan_due_at = null, updated_at = now()
       where player_id = p_uid;
    else
      -- (2) Still in default: one 2% late fee + credit hit, push the due date.
      v_late_fee := v_acct.loan_principal * 0.02;
      update public.bank_accounts
         set loan_interest_accrued = loan_interest_accrued + v_late_fee,
             credit_score = greatest(300, credit_score - 40),
             missed_marks = missed_marks + 1,
             loan_due_at = now() + interval '3 days',
             updated_at = now()
       where player_id = p_uid;
      insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
      values (p_uid, 'penalty', v_late_fee, v_acct.balance,
              v_acct.loan_principal + v_acct.loan_interest_accrued + v_late_fee,
              greatest(300, v_acct.credit_score - 40), 'Missed payment: 2% late fee and credit penalty');
    end if;
  end if;
end;
$$;


-- Return the new rate to the page so the player-facing terms stay accurate.
create or replace function public.bank_dashboard_json(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct public.bank_accounts%rowtype;
  v_money double precision;
  v_limit double precision;
  v_owed double precision;
  v_frozen boolean;
  v_in_default boolean;
  v_savings_daily_rate constant numeric := power(1.065::numeric, 1::numeric / 365) - 1;
begin
  select * into v_acct from public.bank_accounts where player_id = p_uid;
  select money into v_money from public.players where id = p_uid;
  v_limit := public.bank_borrow_limit(v_acct.credit_score, v_acct.balance);
  v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
  v_frozen := v_acct.borrow_frozen_until is not null and v_acct.borrow_frozen_until > now();
  v_in_default := v_owed > 0 and v_acct.loan_due_at is not null and now() > v_acct.loan_due_at;
  return jsonb_build_object(
    'money', coalesce(v_money, 0),
    'balance', v_acct.balance,
    'credit_score', v_acct.credit_score,
    'credit_band', public.bank_credit_band(v_acct.credit_score),
    'loan_principal', v_acct.loan_principal,
    'loan_interest', v_acct.loan_interest_accrued,
    'loan_total', v_owed,
    'loan_due_at', v_acct.loan_due_at,
    'borrow_limit', v_limit,
    'available_credit', case when v_frozen or v_in_default then 0 else greatest(0, v_limit - v_owed) end,
    'in_default', v_in_default,
    'borrow_frozen', v_frozen,
    'borrow_frozen_until', v_acct.borrow_frozen_until,
    'bankruptcies', v_acct.bankruptcies,
    'savings_daily_rate', v_savings_daily_rate,
    'savings_apy', power(1 + v_savings_daily_rate, 365) - 1,
    'loan_apr', public.bank_loan_daily_rate(v_acct.credit_score) * 365,
    'on_time_repayments', v_acct.on_time_repayments,
    'missed_marks', v_acct.missed_marks,
    'transactions', coalesce((
      select jsonb_agg(t)
      from (
        select kind, amount, balance_after, loan_after, credit_after, memo, created_at
        from public.bank_transactions
        where player_id = p_uid
        order by created_at desc
        limit 15
      ) t
    ), '[]'::jsonb)
  );
end;
$$;
