-- Automatically close buy orders that remain unfilled for three days and
-- return their escrowed money to the buyer. The operation is idempotent and
-- locks each due order before issuing its refund.

create extension if not exists pg_cron;

alter table public.gem_orders
  drop constraint if exists gem_orders_status_check;

alter table public.gem_orders
  add constraint gem_orders_status_check
  check (status in ('open', 'filled', 'cancelled', 'expired'));

alter table public.gem_orders
  add column if not exists expired_at timestamptz;

create index if not exists gem_orders_expiry_idx
  on public.gem_orders (created_at)
  where status = 'open';

create or replace function public.expire_stale_gem_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.gem_orders%rowtype;
  v_expired integer := 0;
begin
  for v_order in
    select *
    from public.gem_orders
    where status = 'open'
      and created_at <= now() - interval '3 days'
    order by created_at
    for update skip locked
  loop
    update public.players
    set money = money + v_order.price
    where id = v_order.buyer_id;

    if not found then
      raise exception 'order_buyer_missing:%', v_order.id;
    end if;

    update public.gem_orders
    set status = 'expired', expired_at = now()
    where id = v_order.id
      and status = 'open';

    v_expired := v_expired + 1;
  end loop;

  return v_expired;
end;
$function$;

revoke all on function public.expire_stale_gem_orders() from public;
grant execute on function public.expire_stale_gem_orders() to anon, authenticated, service_role;

do $block$
begin
  perform cron.unschedule('expire-stale-gem-orders')
  where exists (
    select 1 from cron.job where jobname = 'expire-stale-gem-orders'
  );

  perform cron.schedule(
    'expire-stale-gem-orders',
    '7 * * * *',
    'select public.expire_stale_gem_orders();'
  );
end;
$block$;

-- Clean up anything already older than the new limit as soon as the
-- migration is installed.
select public.expire_stale_gem_orders();
