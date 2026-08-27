-- Manual market close override: a `closed_until` timestamp can force the
-- Exchange closed (on top of the daily 07:30–21:30 schedule) — e.g. to end a
-- session early. share_market_is_open() and get_share_market() both respect it.

alter table public.market_config add column if not exists closed_until timestamptz;

create or replace function public.share_market_is_open()
returns boolean language sql stable set search_path = public as $fn$
  select (m >= (7*60+30) and m < (21*60+30))
     and (cu is null or now() >= cu)
  from (select extract(hour from n)::int*60 + extract(minute from n)::int as m
        from (select (now() at time zone 'Asia/Singapore') as n) a) b,
       (select closed_until as cu from public.market_config where id = true) c;
$fn$;
grant execute on function public.share_market_is_open() to anon, authenticated;

-- get_share_market() already recomputes `open` and `opensAt`; it now also
-- honours closed_until (applied on prod). See function body in the repo history.
