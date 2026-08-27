-- A tunable calibration factor for the Exchange index price. Lets the price
-- level be adjusted (e.g. to undo an overnight AFK-grind inflation spike)
-- WITHOUT touching any player's money — it only rescales the quoted price.
-- price = (sum(money) + sum(invested)) / 1e6 * price_scale.

create table if not exists public.market_config (
  id boolean primary key default true check (id),
  price_scale numeric not null default 1 check (price_scale > 0),
  updated_at timestamptz not null default now()
);
insert into public.market_config (id, price_scale) values (true, 1) on conflict (id) do nothing;

alter table public.market_config enable row level security;
-- No client access; only SECURITY DEFINER functions read it. Admins adjust it
-- via SQL (this migration).
revoke all on public.market_config from anon, authenticated;

create or replace function public.share_index_price()
returns numeric language sql stable security definer set search_path to 'public' as $function$
  select greatest(0.01,
    (coalesce((select sum(money) from public.players), 0)
     + coalesce((select sum(total_invested) from public.player_shares), 0)) / 1000000.0
    * coalesce((select price_scale from public.market_config where id = true), 1));
$function$;
