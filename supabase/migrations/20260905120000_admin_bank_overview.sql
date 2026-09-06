-- =========================================================
-- ADMIN — BANK OVERVIEW
--
-- Read-only admin view of every player's bank account: savings balance,
-- outstanding loan (principal + accrued interest), credit score/band,
-- and default/frozen status. Admin-gated the same way as the other
-- admin_* read RPCs (owner id or a row in public.admins); it never
-- mutates anything.
-- =========================================================

set local check_function_bodies = off;

create or replace function public.admin_get_bank_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_result jsonb;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;

  select jsonb_build_object(
    'accountCount', count(*),
    'totalDeposits', coalesce(sum(a.balance), 0),
    'totalOwed', coalesce(sum(a.loan_principal + a.loan_interest_accrued), 0),
    'activeLoans', count(*) filter (where (a.loan_principal + a.loan_interest_accrued) > 0),
    'inDefaultCount', count(*) filter (
      where (a.loan_principal + a.loan_interest_accrued) > 0
        and a.loan_due_at is not null and now() > a.loan_due_at),
    'avgCredit', coalesce(round(avg(a.credit_score)), 0),
    'accounts', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'playerId', a.player_id,
          'username', coalesce(nullif(p.username, ''), left(a.player_id::text, 8)),
          'balance', a.balance,
          'loanPrincipal', a.loan_principal,
          'loanInterest', a.loan_interest_accrued,
          'loanTotal', a.loan_principal + a.loan_interest_accrued,
          'creditScore', a.credit_score,
          'creditBand', public.bank_credit_band(a.credit_score),
          'loanDueAt', a.loan_due_at,
          'inDefault', (a.loan_principal + a.loan_interest_accrued) > 0
                       and a.loan_due_at is not null and now() > a.loan_due_at,
          'borrowFrozen', a.borrow_frozen_until is not null and a.borrow_frozen_until > now(),
          'onTimeRepayments', a.on_time_repayments,
          'missedMarks', a.missed_marks,
          'bankruptcies', a.bankruptcies
        )
        order by a.balance desc, (a.loan_principal + a.loan_interest_accrued) desc
      ),
      '[]'::jsonb)
  )
  into v_result
  from public.bank_accounts a
  left join public.players p on p.id = a.player_id;

  return v_result;
end;
$$;

revoke all on function public.admin_get_bank_overview() from public;
grant execute on function public.admin_get_bank_overview() to authenticated;
