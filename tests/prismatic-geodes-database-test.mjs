import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

process.on('uncaughtException', error => { console.error(error.message, error.detail || '', error.where || ''); process.exit(1); });
const db = new PGlite();
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const uid = '00000000-0000-4000-8000-000000000011';
const poor = '00000000-0000-4000-8000-000000000012';
const voucherUser = '00000000-0000-4000-8000-000000000013';
const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.result;

await db.exec(read('./fixtures/cosmetics-live-schema.sql'));
await db.exec(read('./fixtures/cosmetics-live-functions.sql'));
await db.exec(`
create table public.game_consumables(
 id text primary key,name text not null,family text not null,tier integer not null,
 effect_value numeric not null,duration_seconds integer not null,purchasable boolean default false,shop_price numeric
);
create table public.player_consumables(
 player_id uuid references public.players(id),consumable_id text references public.game_consumables(id),
 quantity integer not null default 0,updated_at timestamptz default now(),primary key(player_id,consumable_id)
);
create table public.player_one_roll_boosts(
 player_id uuid primary key references public.players(id),consumable_id text not null,
 effect_value numeric not null,charges integer not null default 1,activated_at timestamptz not null default now()
);
create table public.economy_cash_ledger(
 id bigint generated always as identity primary key,created_at timestamptz default now(),transaction_id bigint default 1,
 player_id uuid,account text not null,amount numeric not null,direction text not null,category text not null,
 subcategory text not null,reference text,metadata jsonb not null default '{}'
);
insert into public.game_consumables(id,name,family,tier,effect_value,duration_seconds) values
 ('lucky-potion-4','Lucky Potion IV','luck',4,.75,60),('fortune-potion-4','Fortune Potion IV','weightLuck',4,.75,60),
 ('speed-potion-4','Speed Potion IV','rollSpeed',4,.75,60),('mass-potion-4','Mass Potion IV','weightMultiplier',4,.5,60),
 ('money-up-potion-2','Money Up Potion II','gemValue',2,2,60),('relic-potion','Relic Potion','relic',1,1.5,60),
 ('legendary-potion','Legendary Potion','luck',4,1000,1),('mythic-potion','Mythic Potion','luck',4,10000,1);
alter role service_role bypassrls;
create schema extensions;
create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$select decode(substr(repeat(md5(random()::text),8),1,n*2),'hex')$$;
create function extensions.digest(value bytea, algorithm text) returns bytea language sql immutable as $$select decode(md5(encode(value,'hex')),'hex')$$;
grant usage on schema extensions to authenticated,service_role;
grant execute on all functions in schema extensions to authenticated,service_role;
`);
await db.query('insert into players(id,username,money,total_rolls) values($1,\'Geode Player\',10000000,0),($2,\'Poor Player\',0,5000),($3,\'Voucher Player\',10000000,5000)', [uid, poor, voucherUser]);
await db.exec(read('../supabase/migrations/20260908075320_player_profiles_cosmetics_v1.sql'));
await db.exec(read('../supabase/migrations/20261004030718_facets_store_v1.sql'));
await db.exec(read('../supabase/migrations/20261005001849_prismatic_geodes.sql'));

assert.equal(await value("select effect_value::int result from game_consumables where id='exotic-potion'"), 100000);
assert.equal(await value("select duration_seconds result from game_consumables where id='exotic-potion'"), 1);
assert.equal(await value("select purchasable result from game_consumables where id='exotic-potion'"), false);
assert.doesNotMatch(read('../supabase/migrations/20260930094319_auction_market_redesign.sql'), /when 'exotic-potion'/, 'Exotic Potion has no market value and cannot be listed');
assert.equal(await value("select count(*)::int result from cosmetic_store_items where cosmetic_id like 'prismatic-%'"), 0, 'Prismatic cosmetics cannot be bought with Facets or vouchers');

await db.query("insert into player_consumables(player_id,consumable_id,quantity) values($1,'exotic-potion',1)", [uid]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
await db.exec('set role authenticated');
const boost = await value("select activate_one_roll_potion('exotic-potion') result");
assert.equal(boost.boost.effectValue, 100000);
await db.exec('reset role');
assert.equal(await value("select effect_value::int result from player_one_roll_boosts where player_id=$1", [uid]), 100000);

await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
await db.exec('set role authenticated');
const initial = await value('select get_prismatic_store() result');
assert.ok([1, 2].includes(initial.stock.total));
await db.exec('reset role');
await db.query("update prismatic_daily_stock set stock=2 where player_id=$1", [uid]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
await db.exec('set role authenticated');
const requestOne = '20000000-0000-4000-8000-000000000001';
const first = await value('select open_prismatic_geode($1) result', [requestOne]);
assert.equal(first.duplicate, false);
assert.ok(first.opening.chamber_count >= 1 && first.opening.chamber_count <= 10);
assert.equal(first.opening.rewards.length, first.opening.chamber_count);
const allowed = new Set(['cash-50000','cash-150000','cash-500000','lucky-potion-4','fortune-potion-4','speed-potion-4','mass-potion-4','money-up-potion-2','relic-potion','prismatic-shard','legendary-potion','mythic-potion','exotic-potion','cosmetic-voucher','ultimate-cosmetic-voucher']);
assert.ok(first.opening.rewards.every(reward => allowed.has(reward.id)));
const retry = await value('select open_prismatic_geode($1) result', [requestOne]);
assert.equal(retry.duplicate, true);
assert.equal(retry.opening.id, first.opening.id);
await value('select open_prismatic_geode($1) result', ['20000000-0000-4000-8000-000000000002']);
await assert.rejects(() => value('select open_prismatic_geode($1) result', ['20000000-0000-4000-8000-000000000003']), /stock_exhausted/);
assert.equal(await value('select count(*)::int result from prismatic_geode_openings where player_id=$1', [uid]), 2);
await db.exec('reset role');
assert.equal(await value("select count(*)::int result from economy_cash_ledger where player_id=$1 and category='prismatic_geode' and subcategory='purchase'", [uid]), 2);

await db.query("select set_config('request.jwt.claim.sub',$1,false)", [poor]);
await db.exec('set role authenticated');
await assert.rejects(() => value('select open_prismatic_geode($1) result', ['20000000-0000-4000-8000-000000000004']), /insufficient_funds/);
assert.equal(await value('select count(*)::int result from prismatic_geode_openings where player_id=$1', [poor]), 0);
await db.exec('reset role');

await db.query('insert into prismatic_wallets(player_id,shards) values($1,100) on conflict(player_id) do update set shards=100', [uid]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
await db.exec('set role authenticated');
const titleOrder = await value("select purchase_prismatic_exchange_item('item','prismatic-title',$1) result", ['30000000-0000-4000-8000-000000000001']);
assert.equal(titleOrder.price, 10);
assert.equal(titleOrder.collectionPrice, 43, 'partial collection pricing applies 50/65 only to the unowned 55 shards');
const collectionOrder = await value("select purchase_prismatic_exchange_item('collection','prismatic',$1) result", ['30000000-0000-4000-8000-000000000002']);
assert.equal(collectionOrder.price, 43);
assert.equal(collectionOrder.granted.length, 3);
const duplicateOrder = await value("select purchase_prismatic_exchange_item('collection','prismatic',$1) result", ['30000000-0000-4000-8000-000000000002']);
assert.equal(duplicateOrder.duplicate, true);
await db.exec('reset role');

await db.query('insert into prismatic_wallets(player_id,cosmetic_vouchers,ultimate_vouchers) values($1,1,1) on conflict(player_id) do update set cosmetic_vouchers=1,ultimate_vouchers=1', [voucherUser]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [voucherUser]);
await db.exec('set role authenticated');
const itemRedemption = await value("select redeem_cosmetic_voucher('cosmetic','item','glitched-title',$1) result", ['40000000-0000-4000-8000-000000000001']);
assert.equal(itemRedemption.duplicate, false);
const itemRetry = await value("select redeem_cosmetic_voucher('cosmetic','item','glitched-title',$1) result", ['40000000-0000-4000-8000-000000000001']);
assert.equal(itemRetry.duplicate, true);
await assert.rejects(() => value("select redeem_cosmetic_voucher('cosmetic','collection','celestial',$1) result", ['40000000-0000-4000-8000-000000000002']), /cannot redeem collections/);
const collectionRedemption = await value("select redeem_cosmetic_voucher('ultimate','collection','celestial',$1) result", ['40000000-0000-4000-8000-000000000003']);
assert.equal(collectionRedemption.granted.length, 4);
assert.equal(await value("select count(*)::int result from player_cosmetics where player_id=$1 and cosmetic_id like 'celestial-%'", [voucherUser]), 4);
await assert.rejects(() => db.query('update prismatic_wallets set shards=999'), /permission denied/);
await db.exec('reset role');

const migration = read('../supabase/migrations/20261005001849_prismatic_geodes.sql');
for (const threshold of ['200000','400000','570000','710000','810000','880000','930000','965000','985000']) assert.ok(migration.includes(`draw<${threshold}`));
for (const threshold of ['250000','400000','473500','573500','673500','773500','853500','903500','923500','973500','993500','998500','999500','999999']) assert.ok(migration.includes(`draw<${threshold}`));
assert.match(migration, /select total_rolls into total/);
assert.doesNotMatch(migration, /equipment_genuine_rolls/);

await db.close();
console.log('Prismatic Geodes: stock, grants, Exotic Luck, shard exchange, voucher atomicity and idempotency passed.');
