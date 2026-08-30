-- Duration-based listing fees and a fixed buy-order posting fee. Existing
-- charging timing, payer semantics, player modifiers, and fee ledger remain
-- unchanged.

alter table public.market_fee_transactions
  drop constraint if exists market_fee_transactions_rate_check;

alter table public.market_fee_transactions
  add constraint market_fee_transactions_rate_check
  check (rate >= 0 and rate <= 0.10);

create or replace function public._market_sale_fee_rate(p_price double precision, p_duration_hours integer)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select case p_duration_hours
    when 1 then 0.025
    when 6 then 0.035
    when 12 then 0.045
    when 24 then 0.06
    when 48 then 0.08
    when 72 then 0.10
    else 0.06
  end::numeric;
$function$;

create or replace function public._market_order_fee_rate(p_price double precision)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select 0.05::numeric;
$function$;

revoke all on function public._market_sale_fee_rate(double precision, integer) from public;
revoke all on function public._market_order_fee_rate(double precision) from public;
