-- =========================================================
-- BANK SYSTEM V1
--
-- A server-authoritative in-game bank: a savings account that earns
-- compounding interest, a credit score (300-850, FICO-style), and
-- collateralised borrowing with a credit-scaled APR, a repayment due
-- date, and overdue penalties.
--
-- Every balance-changing action is a SECURITY DEFINER RPC keyed to
-- auth.uid() — the client never passes a player id and can never move
-- another account's money. Interest and overdue penalties accrue
-- lazily (no cron): bank_touch() settles elapsed time at the start of
-- every action based on wall-clock timestamps, so an idle account is
-- brought current the moment its owner interacts with it.
--
-- Economy (documented so it stays tunable):
--   Savings   0.012%/day, compounded  (~4.48% APY)
--   Loan APR  6% (excellent credit) .. 24% (poor), accrued daily
--   Limit     $100K..$10M by credit score, plus 2x savings collateral
--   Term      7 days; overdue => 2% late fee + credit drop, due +3 days
-- =========================================================

-- The base game schema (public.players, etc.) is not tracked in this
-- repo, so disable body validation for the SECURITY DEFINER functions
-- below; they only ever run on the real project where those tables exist.
set local check_function_bodies = off;


-- ── Tables ───────────────────────────────────────────────
-- player_id references auth.users(id) (which is also players.id) so the
-- migration applies cleanly even on a database without the game tables.
create table if not exists public.bank_accounts (
  player_id uuid primary key references auth.users(id) on delete cascade,
  balance double precision not null default 0,
  credit_score integer not null default 600,
  loan_principal double precision not null default 0,
  loan_interest_accrued double precision not null default 0,
  loan_due_at timestamptz,
  on_time_repayments integer not null default 0,
  missed_marks integer not null default 0,
  last_interest_at timestamptz not null default now(),
  last_loan_accrual_at timestamptz not null default now(),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_balance_non_negative check (balance >= 0),
  constraint bank_loan_non_negative check (loan_principal >= 0 and loan_interest_accrued >= 0),
  constraint bank_credit_range check (credit_score between 300 and 850)
);
alter table public.bank_accounts enable row level security;
revoke all on public.bank_accounts from anon, authenticated;
grant select, insert, update, delete on public.bank_accounts to service_role;

create table if not exists public.bank_transactions (
  id bigint generated always as identity primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  amount double precision not null default 0,
  balance_after double precision not null default 0,
  loan_after double precision not null default 0,
  credit_after integer not null default 600,
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists bank_transactions_player_idx
  on public.bank_transactions (player_id, created_at desc);
alter table public.bank_transactions enable row level security;
revoke all on public.bank_transactions from anon, authenticated;
grant select, insert, update, delete on public.bank_transactions to service_role;


-- ── Pure helpers (credit -> derived economy) ─────────────
-- Kept as small IMMUTABLE functions so both the settlement logic and the
-- dashboard payload compute identical numbers.
create or replace function public.bank_credit_factor(p_score integer)
returns numeric language sql immutable set search_path = '' as $$
  select greatest(0::numeric, least(1::numeric, (p_score - 300)::numeric / 550));
$$;

create or replace function public.bank_loan_daily_rate(p_score integer)
returns numeric language sql immutable set search_path = '' as $$
  -- APR 24% (poor) down to 6% (excellent), spread over 365 days.
  select ((0.24 - public.bank_credit_factor(p_score) * 0.18) / 365);
$$;

create or replace function public.bank_borrow_limit(p_score integer, p_balance double precision)
returns double precision language sql immutable set search_path = '' as $$
  -- Base capacity by credit, plus savings acting as collateral (2x).
  select (100000 + public.bank_credit_factor(p_score) * 9900000 + 2 * greatest(0, p_balance))::double precision;
$$;

create or replace function public.bank_credit_band(p_score integer)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_score >= 800 then 'Excellent'
    when p_score >= 740 then 'Very Good'
    when p_score >= 670 then 'Good'
    when p_score >= 580 then 'Fair'
    else 'Poor'
  end;
$$;


-- ── Settlement: bring an account current (lazy accrual) ──
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
begin
  insert into public.bank_accounts (player_id)
  values (p_uid)
  on conflict (player_id) do nothing;

  select * into v_acct from public.bank_accounts where player_id = p_uid for update;

  -- Savings interest: compound 0.012%/day over the elapsed fraction.
  v_days := greatest(0, extract(epoch from (now() - v_acct.last_interest_at)) / 86400.0);
  if v_acct.balance > 0 and v_days > 0 then
    v_interest := v_acct.balance * (power(1 + 0.00012, v_days) - 1);
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

  -- Overdue: one 2% late fee + credit hit per lapse, and push the due date.
  if (v_acct.loan_principal + v_acct.loan_interest_accrued) > 0
     and v_acct.loan_due_at is not null
     and now() > v_acct.loan_due_at then
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
end;
$$;


-- ── Dashboard payload (shared by every RPC) ──────────────
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
begin
  select * into v_acct from public.bank_accounts where player_id = p_uid;
  select money into v_money from public.players where id = p_uid;
  v_limit := public.bank_borrow_limit(v_acct.credit_score, v_acct.balance);
  v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
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
    'available_credit', greatest(0, v_limit - v_owed),
    'savings_daily_rate', 0.00012,
    'savings_apy', power(1 + 0.00012, 365) - 1,
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


-- ── Actions ──────────────────────────────────────────────
create or replace function public.bank_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  perform public.bank_touch(v_uid);
  return public.bank_dashboard_json(v_uid);
end;
$$;

create or replace function public.bank_deposit(p_amount double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_amount double precision := floor(coalesce(p_amount, 0));
  v_money double precision;
  v_acct public.bank_accounts%rowtype;
  v_credit_gain integer;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if v_amount <= 0 then raise exception 'bank_invalid_amount'; end if;
  perform public.bank_touch(v_uid);

  update public.players set money = money - v_amount
   where id = v_uid and money >= v_amount
   returning money into v_money;
  if v_money is null then raise exception 'bank_insufficient_wallet'; end if;

  -- Regular saving gently builds credit history (capped by the 850 ceiling).
  v_credit_gain := case when v_amount >= 25000 then 2 else 1 end;
  update public.bank_accounts
     set balance = balance + v_amount,
         credit_score = least(850, credit_score + v_credit_gain),
         updated_at = now()
   where player_id = v_uid
   returning * into v_acct;

  insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
  values (v_uid, 'deposit', v_amount, v_acct.balance,
          v_acct.loan_principal + v_acct.loan_interest_accrued, v_acct.credit_score, 'Deposit to savings');
  return public.bank_dashboard_json(v_uid);
end;
$$;

create or replace function public.bank_withdraw(p_amount double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_amount double precision := floor(coalesce(p_amount, 0));
  v_acct public.bank_accounts%rowtype;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if v_amount <= 0 then raise exception 'bank_invalid_amount'; end if;
  perform public.bank_touch(v_uid);

  update public.bank_accounts
     set balance = balance - v_amount,
         updated_at = now()
   where player_id = v_uid and balance >= v_amount
   returning * into v_acct;
  if v_acct.player_id is null then raise exception 'bank_insufficient_balance'; end if;

  update public.players set money = money + v_amount where id = v_uid;

  insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
  values (v_uid, 'withdraw', v_amount, v_acct.balance,
          v_acct.loan_principal + v_acct.loan_interest_accrued, v_acct.credit_score, 'Withdraw from savings');
  return public.bank_dashboard_json(v_uid);
end;
$$;

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
  v_limit := public.bank_borrow_limit(v_acct.credit_score, v_acct.balance);
  v_available := v_limit - (v_acct.loan_principal + v_acct.loan_interest_accrued);
  if v_amount > v_available then raise exception 'bank_over_limit'; end if;

  update public.bank_accounts
     set loan_principal = loan_principal + v_amount,
         -- A fresh draw (from no debt) starts a new 7-day term.
         loan_due_at = case when loan_principal <= 0 then now() + interval '7 days' else loan_due_at end,
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

create or replace function public.bank_repay(p_amount double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_amount double precision := floor(coalesce(p_amount, 0));
  v_acct public.bank_accounts%rowtype;
  v_owed double precision;
  v_pay double precision;
  v_money double precision;
  v_to_interest double precision;
  v_to_principal double precision;
  v_on_time boolean;
  v_credit_gain integer;
  v_cleared boolean;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if v_amount <= 0 then raise exception 'bank_invalid_amount'; end if;
  perform public.bank_touch(v_uid);

  select * into v_acct from public.bank_accounts where player_id = v_uid for update;
  v_owed := v_acct.loan_principal + v_acct.loan_interest_accrued;
  if v_owed <= 0 then raise exception 'bank_no_loan'; end if;

  -- Never take more than what is owed, or more than the wallet holds.
  v_pay := least(v_amount, v_owed);
  update public.players set money = money - v_pay
   where id = v_uid and money >= v_pay
   returning money into v_money;
  if v_money is null then raise exception 'bank_insufficient_wallet'; end if;

  -- Interest is paid before principal, like a real amortised payment.
  v_to_interest := least(v_pay, v_acct.loan_interest_accrued);
  v_to_principal := v_pay - v_to_interest;
  v_cleared := (v_acct.loan_principal - v_to_principal) <= 0.0001
               and (v_acct.loan_interest_accrued - v_to_interest) <= 0.0001;
  v_on_time := v_acct.loan_due_at is null or now() <= v_acct.loan_due_at;

  -- On-time full payoff rebuilds credit strongly; any repayment helps a little.
  if v_cleared then
    v_credit_gain := case when v_on_time then 15 else 8 end;
  else
    v_credit_gain := 3;
  end if;

  update public.bank_accounts
     set loan_interest_accrued = greatest(0, loan_interest_accrued - v_to_interest),
         loan_principal = greatest(0, loan_principal - v_to_principal),
         credit_score = least(850, credit_score + v_credit_gain),
         on_time_repayments = on_time_repayments + case when v_cleared and v_on_time then 1 else 0 end,
         loan_due_at = case when v_cleared then null else loan_due_at end,
         updated_at = now()
   where player_id = v_uid
   returning * into v_acct;

  insert into public.bank_transactions (player_id, kind, amount, balance_after, loan_after, credit_after, memo)
  values (v_uid, 'repay', v_pay, v_acct.balance,
          v_acct.loan_principal + v_acct.loan_interest_accrued, v_acct.credit_score,
          case when v_cleared then 'Loan repaid in full' else 'Loan repayment' end);
  return public.bank_dashboard_json(v_uid);
end;
$$;


-- ── Grants: per-user actions are safe for the browser role ─
-- (Unlike the leaderboard board RPCs, these are cheap single-row
--  operations gated to auth.uid(), so authenticated execute is correct.)
grant execute on function public.bank_get_dashboard() to authenticated;
grant execute on function public.bank_deposit(double precision) to authenticated;
grant execute on function public.bank_withdraw(double precision) to authenticated;
grant execute on function public.bank_borrow(double precision) to authenticated;
grant execute on function public.bank_repay(double precision) to authenticated;


-- ── Feature flag: ships OFF, enabled from the Admin Feature Lab ─
insert into public.game_section_settings (id, label, short_label, icon, description, enabled, sort_order)
values ('bank', 'Bank', 'Bank', 'coins',
        'Savings with compounding interest, a credit score, and credit-scaled borrowing.',
        false, 320)
on conflict (id) do nothing;
