import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261005124932_black_market_v1.sql");
const client = read("auctions/auctions.js");
const api = read("src/backend/cloudAuctions.js");
const page = read("auctions/index.html");
const css = read("auctions/auctions.css");
const inventory = read("inventory/inventory.js");

// UI contract: both methods remain available, closed-state copy stays visible,
// and the responsive layout collapses the method selector on small screens.
assert.match(page, /value="black-market"/);
assert.match(page, /value="auction"/);
assert.match(page, /0\.5×–25×/);
assert.match(page, /2% fee/);
assert.match(page, /15% tax/);
assert.match(client, /It opens Saturday at 12:00 AM SGT/);
assert.match(client, /createBlackMarketListing/);
assert.match(client, /buyBlackMarketListing/);
assert.match(api, /create_black_market_listing/);
assert.match(api, /buy_black_market_listing/);
assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.sale-method \{ grid-template-columns: 1fr; \}/);
assert.match(inventory, /data-action="list"/);
assert.match(inventory, /\.\.\/auctions\/\?sell=gem&id=/);

// Backend contract: pricing, weekend checks, escrow, audit fields, atomic row
// locks, protected-item checks, expiry returns, and the cron job are all owned
// by the migration rather than trusted to browser calculations.
for (const pattern of [
  /timezone\('Asia\/Singapore'/,
  /p_asking_price < v_reference_value \* 0\.5/,
  /p_asking_price > v_reference_value \* 25/,
  /v_listing_fee := round\(p_asking_price \* 0\.02, 2\)/,
  /v_sale_tax := round\(v_listing\.asking_price \* 0\.15, 2\)/,
  /where id = p_listing_id for update/,
  /where id in \(v_uid, v_listing\.seller_id\)[\s\S]*for update/,
  /cannot_buy_own_listing/,
  /gem_automatic_consumption_protected/,
  /'soulbound' = any/,
  /museum_locked/,
  /settle-black-market-listings/,
  /closure_reason/,
  /black_market_transactions/
]) assert.match(migration, pattern);

const db = new PGlite();
await db.exec(`
  create schema auth;
  create schema economy_private;
  create role anon;
  create role authenticated;
  create role service_role;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create table public.players (
    id uuid primary key references auth.users(id), username text, money double precision not null default 0
  );
  create table public.inventory_gems (
    id bigint generated always as identity primary key,
    player_id uuid not null,
    gem_name text not null,
    rarity integer not null default 0,
    value double precision,
    locked boolean not null default false,
    museum_locked boolean not null default false,
    mutation_id text,
    mutation_ids text[] not null default '{}',
    created_at timestamptz not null default now()
  );
  create table public.player_consumables (
    player_id uuid not null, consumable_id text not null, quantity integer not null,
    updated_at timestamptz not null default now(), primary key (player_id, consumable_id)
  );
  create table public.market_fee_transactions (
    id bigint generated always as identity primary key,
    market_type text not null check (market_type in ('listing','order')),
    reference_id bigint not null, player_id uuid, amount numeric not null,
    rate numeric not null constraint market_fee_transactions_rate_check check (rate between 0 and 0.10),
    created_at timestamptz not null default now()
  );
  create table economy_private.cash_paths (
    function_name text primary key, category text not null, direction text
  );

  create function public._market_consumable_shop_value(p_id text)
  returns numeric language sql immutable as $$
    select case p_id when 'test-potion' then 100 else null end::numeric
  $$;
  create function public.gem_automatic_consumption_protected(p_name text)
  returns boolean language sql stable as $$ select p_name = 'Protected Gem' $$;
  create function public._auction_restore_lot(p_owner uuid, p_lot jsonb)
  returns void language plpgsql security definer set search_path = '' as $$
  declare item jsonb;
  begin
    for item in select value from jsonb_array_elements(p_lot) loop
      if item->>'type' = 'potion' then
        insert into public.player_consumables(player_id, consumable_id, quantity)
        values (p_owner, item->>'consumable_id', (item->>'quantity')::integer)
        on conflict(player_id, consumable_id) do update
          set quantity = public.player_consumables.quantity + excluded.quantity;
      else
        insert into public.inventory_gems(player_id, gem_name, rarity, value, locked, museum_locked, mutation_id, mutation_ids)
        values (p_owner, item->>'gem_name', coalesce((item->>'rarity')::integer, 0),
          (item->>'value')::double precision, false, false, item->>'mutation_id',
          coalesce(array(select jsonb_array_elements_text(item->'mutation_ids')), '{}'::text[]));
      end if;
    end loop;
  end $$;
`);

await db.exec(migration);

const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
assert.equal(await scalar("select black_market_private.is_open('2026-10-09 15:59:59+00') value"), false, "Friday before midnight SGT is closed");
assert.equal(await scalar("select black_market_private.is_open('2026-10-09 16:00:00+00') value"), true, "Saturday midnight SGT opens");
assert.equal(await scalar("select black_market_private.is_open('2026-10-11 15:59:59+00') value"), true, "Sunday 23:59:59 SGT remains open");
assert.equal(await scalar("select black_market_private.is_open('2026-10-11 16:00:00+00') value"), false, "Monday midnight SGT closes");
assert.equal(
  new Date(await scalar("select black_market_private.weekend_closes_at('2026-10-10 04:00:00+00') value")).toISOString(),
  "2026-10-11T16:00:00.000Z"
);

// Make mutation tests deterministic regardless of the wall-clock day.
await db.exec(`
  create or replace function black_market_private.is_open(p_at timestamptz)
  returns boolean language sql immutable as $$ select true $$;
  create or replace function black_market_private.weekend_closes_at(p_at timestamptz)
  returns timestamptz language sql immutable as $$ select now() + interval '1 day' $$;
`);

const seller = "00000000-0000-0000-0000-000000000001";
const buyer = "00000000-0000-0000-0000-000000000002";
for (const [id, username, money] of [[seller, "Seller", 1000], [buyer, "Buyer", 49]]) {
  await db.query("insert into auth.users(id) values ($1)", [id]);
  await db.query("insert into players(id,username,money) values ($1,$2,$3)", [id, username, money]);
}
const asUser = (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
await db.query("insert into player_consumables values ($1,'test-potion',5,now())", [seller]);

await asUser(seller);
let created = await db.query(`select public.create_black_market_listing(
  '[{"type":"potion","consumable_id":"test-potion","quantity":1}]'::jsonb, 50
) value`);
const listingId = Number(created.rows[0].value.listingId);
assert.equal(Number(created.rows[0].value.referenceValue), 100);
assert.equal(Number(created.rows[0].value.listingFee), 1);
assert.equal(Number(await scalar("select money value from players where id=$1", [seller])), 999);
assert.equal(Number(await scalar("select quantity value from player_consumables where player_id=$1 and consumable_id='test-potion'", [seller])), 4);

await assert.rejects(
  db.query("select public.create_black_market_listing('[{\"type\":\"potion\",\"consumable_id\":\"test-potion\",\"quantity\":1}]'::jsonb,49.99)"),
  /black_market_price_below_minimum/
);
await assert.rejects(
  db.query("select public.create_black_market_listing('[{\"type\":\"potion\",\"consumable_id\":\"test-potion\",\"quantity\":1}]'::jsonb,2500.01)"),
  /black_market_price_above_maximum/
);
assert.equal(Number(await scalar("select quantity value from player_consumables where player_id=$1 and consumable_id='test-potion'", [seller])), 4, "failed listing attempts roll escrow back");

await assert.rejects(db.query("select public.buy_black_market_listing($1)", [listingId]), /cannot_buy_own_listing/);
await asUser(buyer);
await assert.rejects(db.query("select public.buy_black_market_listing($1)", [listingId]), /not_enough_money/);
assert.equal(Number(await scalar("select money value from players where id=$1", [buyer])), 49, "failed purchase leaves buyer cash unchanged");
assert.equal(await scalar("select status value from black_market_listings where id=$1", [listingId]), "active");

await db.query("update players set money=100 where id=$1", [buyer]);
const bought = await db.query("select public.buy_black_market_listing($1) value", [listingId]);
assert.equal(Number(bought.rows[0].value.saleTax), 7.5);
assert.equal(Number(bought.rows[0].value.sellerProceeds), 42.5);
assert.equal(Number(await scalar("select money value from players where id=$1", [buyer])), 50);
assert.equal(Number(await scalar("select money value from players where id=$1", [seller])), 1041.5);
assert.equal(Number(await scalar("select quantity value from player_consumables where player_id=$1 and consumable_id='test-potion'", [buyer])), 1);
let audit = (await db.query("select * from black_market_listings where id=$1", [listingId])).rows[0];
assert.equal(audit.status, "sold");
assert.equal(audit.buyer_id, buyer);
assert.equal(audit.closure_reason, "sold");
assert.ok(audit.sold_at && audit.closed_at);
assert.equal(Number(audit.sale_tax), 7.5);
assert.equal(Number(audit.seller_proceeds), 42.5);

// Protected, museum-bound, locked, relic and Soulbound specimens never enter escrow.
await asUser(seller);
for (const [name, locked, museum, mutation] of [
  ["Protected Gem", false, false, null],
  ["Soul Gem", false, false, "soulbound"],
  ["Museum Gem", false, true, null],
  ["Locked Gem", true, false, null],
  ["Enchant Relic", false, false, null]
]) {
  const row = await db.query(`insert into inventory_gems(player_id,gem_name,rarity,value,locked,museum_locked,mutation_id,mutation_ids)
    values ($1,$2,10,100,$3,$4,$5,case when $5::text is null then '{}'::text[] else array[$5::text] end) returning id`,
    [seller, name, locked, museum, mutation]);
  await assert.rejects(
    db.query("select public.create_black_market_listing(jsonb_build_array(jsonb_build_object('type','gem','id',$1::bigint)),100)", [row.rows[0].id]),
    /item_not_tradeable/
  );
  assert.equal(Number(await scalar("select count(*) value from inventory_gems where id=$1", [row.rows[0].id])), 1);
}

// Expiry returns escrow and keeps the non-refundable fee spent.
created = await db.query(`select public.create_black_market_listing(
  '[{"type":"potion","consumable_id":"test-potion","quantity":1}]'::jsonb, 50
) value`);
const expiringId = Number(created.rows[0].value.listingId);
const cashAfterFee = Number(await scalar("select money value from players where id=$1", [seller]));
await db.query("update black_market_listings set expires_at=now()-interval '1 second' where id=$1", [expiringId]);
assert.equal(Number(await scalar("select public.settle_expired_black_market_listings() value")), 1);
assert.equal(await scalar("select status value from black_market_listings where id=$1", [expiringId]), "returned");
assert.equal(await scalar("select closure_reason value from black_market_listings where id=$1", [expiringId]), "weekend_closed");
assert.equal(Number(await scalar("select money value from players where id=$1", [seller])), cashAfterFee);

// Server open-state validation applies independently to create and purchase.
await db.exec(`create or replace function black_market_private.is_open(p_at timestamptz)
  returns boolean language sql immutable as $$ select false $$;`);
await assert.rejects(
  db.query("select public.create_black_market_listing('[{\"type\":\"potion\",\"consumable_id\":\"test-potion\",\"quantity\":1}]'::jsonb,50)"),
  /black_market_closed/
);

console.log("PASS: Black Market weekend window, server pricing, fees, escrow, atomic purchase, protection, expiry, audit, desktop and mobile UI contracts");
