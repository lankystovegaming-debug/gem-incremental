-- Price-over-time history for the Exchange "Show stock" chart.
--   * share_price_history: (at, price) snapshots of the live index price.
--   * A pg_cron job appends the true index price every 5 minutes.
--   * One-time backfill from global_cash_history so the chart isn't empty:
--     historical price is reconstructed as wallet_money * (1 + r) where
--     r = current invested/wallet ratio. This SCALES old points (small
--     economy -> low price) rather than flat-shifting them, and is exact at
--     "now". Going forward, every point is a real measured snapshot.
--   * get_share_price_history(hours): read the recent window (public-safe).

create table if not exists public.share_price_history (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  price double precision not null
);
create index if not exists share_price_history_at_idx on public.share_price_history (at desc);

alter table public.share_price_history enable row level security;
drop policy if exists "price history readable" on public.share_price_history;
create policy "price history readable" on public.share_price_history for select using (true);
revoke insert, update, delete on public.share_price_history from anon, authenticated;
grant select on public.share_price_history to anon, authenticated;

-- One-time backfill (only if the table is still empty).
insert into public.share_price_history (at, price)
select gch.at, greatest(0.01, gch.money * (1 + r.ratio) / 1000000.0)
from public.global_cash_history gch
cross join lateral (
  select case
           when (select coalesce(sum(money), 0) from public.players) > 0
           then (select coalesce(sum(total_invested), 0) from public.player_shares)
                / (select sum(money) from public.players)
           else 0
         end as ratio
) r
where not exists (select 1 from public.share_price_history)
order by gch.at asc;

-- Always append a precise "now" point so the tail is exact.
insert into public.share_price_history (at, price)
values (now(), public.share_index_price());

-- Read the recent window; clamp 1h..30d. Public-safe (aggregate data only).
create or replace function public.get_share_price_history(p_hours integer default 24)
returns table(at timestamptz, price double precision)
language sql stable security definer set search_path = public as $$
  select at, price
  from public.share_price_history
  where at >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 24 * 30)))
  order by at asc;
$$;
revoke all on function public.get_share_price_history(integer) from public;
grant execute on function public.get_share_price_history(integer) to anon, authenticated;

-- Snapshot the true index price every 5 minutes.
do $$
begin
  perform cron.unschedule('snapshot_share_price');
exception when others then null;
end $$;
select cron.schedule(
  'snapshot_share_price',
  '*/5 * * * *',
  $$insert into public.share_price_history (at, price) values (now(), public.share_index_price());$$
);
