-- =========================================================
-- AUCTION HOUSE — TABLES
--
-- Players list an owned gem with a starting price; others bid.
-- The listed gem is escrowed (removed from the seller's
-- inventory into auctions.gem as a jsonb snapshot) and the top
-- bid's money is escrowed on players.money. Reads are public;
-- every write goes through the SECURITY DEFINER RPCs in the
-- companion migration, so clients get no direct DML here.
-- =========================================================

create table if not exists public.auctions (
  id                   bigint generated always as identity primary key,
  seller_id            uuid not null references auth.users(id) on delete cascade,
  seller_name          text,
  gem                  jsonb not null,               -- snapshot of the escrowed inventory_gems row
  gem_name             text not null,
  rarity               integer not null,
  start_price          double precision not null,
  current_bid          double precision,
  current_bidder_id    uuid references auth.users(id) on delete set null,
  current_bidder_name  text,
  bid_count            integer not null default 0,
  status               text not null default 'active'
                         check (status in ('active', 'sold', 'returned', 'cancelled')),
  ends_at              timestamptz not null,
  created_at           timestamptz not null default now(),
  settled_at           timestamptz
);

create index if not exists auctions_active_ends_idx
  on public.auctions (ends_at) where status = 'active';
create index if not exists auctions_seller_idx
  on public.auctions (seller_id, created_at desc);

create table if not exists public.auction_bids (
  id           bigint generated always as identity primary key,
  auction_id   bigint not null references public.auctions(id) on delete cascade,
  bidder_id    uuid not null references auth.users(id) on delete cascade,
  bidder_name  text,
  amount       double precision not null,
  created_at   timestamptz not null default now()
);

create index if not exists auction_bids_auction_idx
  on public.auction_bids (auction_id, created_at desc);

-- RLS: everyone may read the board; nobody writes directly (RPCs only).
alter table public.auctions enable row level security;
alter table public.auction_bids enable row level security;

drop policy if exists auctions_public_read on public.auctions;
create policy auctions_public_read on public.auctions
  for select using (true);

drop policy if exists auction_bids_public_read on public.auction_bids;
create policy auction_bids_public_read on public.auction_bids
  for select using (true);

grant select on public.auctions, public.auction_bids to anon, authenticated;
grant select, insert, update, delete on public.auctions, public.auction_bids to service_role;
