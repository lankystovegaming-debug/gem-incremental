import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const db=new PGlite();
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const uid='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table admins(user_id uuid primary key);
create table players(id uuid primary key,money double precision default 0,lifetime_earnings double precision default 0,lifetime_money_burned double precision default 0);
create table bank_accounts(player_id uuid primary key references players on delete cascade,balance double precision default 0,credit_score integer default 600,loan_principal double precision default 0,loan_interest_accrued double precision default 0,loan_due_at timestamptz,loan_opened_at timestamptz,on_time_repayments integer default 0,missed_marks integer default 0,bankruptcies integer default 0,borrow_frozen_until timestamptz,last_interest_at timestamptz default now(),last_loan_accrual_at timestamptz default now(),updated_at timestamptz default now());
create table bank_transactions(id bigserial primary key,player_id uuid,kind text,amount double precision,balance_after double precision,loan_after double precision,credit_after integer,memo text,created_at timestamptz default now());
create table market_fee_transactions(id bigserial primary key,player_id uuid,amount numeric,market_type text,reference_id bigint,rate numeric,created_at timestamptz default now());
create table admin_audit_log(id bigserial,admin_id uuid,target_player_id uuid,action text,details jsonb);
create table player_shares(player_id uuid primary key,shares numeric,total_invested numeric,updated_at timestamptz);
create table player_wars(id uuid primary key,challenger_id uuid,opponent_id uuid,metric text,duration_hours int,stake numeric,status text,challenger_start numeric,opponent_start numeric,challenger_score numeric,opponent_score numeric,winner_id uuid,pot numeric,created_at timestamptz,accepted_at timestamptz,ends_at timestamptz,resolved_at timestamptz);
create function share_market_is_open() returns boolean language sql as $$select true$$;
create function share_price_at(numeric) returns numeric language sql as $$select 10::numeric$$;
create function get_share_market() returns jsonb language sql as $$select '{}'::jsonb$$;
create function bank_loan_daily_rate(integer) returns numeric language sql as $$select 0::numeric$$;
create function bank_borrow_limit(integer,double precision) returns numeric language sql as $$select 1000000::numeric$$;
create function bank_dashboard_json(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
create function war_metric_value(uuid,text) returns numeric language sql as $$select 1::numeric$$;
`);
const live=JSON.parse(readFileSync(new URL('./fixtures/economy-live-functions.json',import.meta.url)));
for(const name of ['buy_shares','sell_shares','war_resolve_due','bank_touch','bank_deposit','bank_withdraw','bank_borrow','bank_repay'])await db.exec(live.find(d=>d.proname===name).definition);
await q('insert into players(id,money) values($1,10000),($2,5000)',[uid,other]);
await q('insert into admins values($1)',[uid]);
await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
const migration=readFileSync(new URL('../supabase/migrations/20260909104511_economy_cash_ledger.sql',import.meta.url),'utf8');
await db.exec(migration);
const summary=async(period='All')=>(await q('select admin_get_economy_breakdown($1) d',[period]))[0].d;
let d=await summary();
assert.equal(d.balanceEvents,0);assert.equal(d.totalMoneySupply,15000);assert.equal(d.cashCreated,0);assert.deepEqual(d.breakdown,[]);
await assert.rejects(()=>summary('bad'),/invalid_economy_period/);
await q("select set_config('request.jwt.claim.sub',$1,false)",[other]);
await assert.rejects(()=>summary(),/not_admin/);
await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
for(const role of ['anon','authenticated']){
 assert.equal((await q("select has_table_privilege($1,'public.economy_cash_ledger','INSERT') allowed",[role]))[0].allowed,false);
 assert.equal((await q("select has_function_privilege($1,'public.admin_adjust_economy_cash(uuid,uuid,numeric)','EXECUTE') allowed",[role]))[0].allowed,false);
}
assert.equal((await q("select has_function_privilege('anon','public.admin_get_economy_breakdown(text)','EXECUTE') allowed"))[0].allowed,false);
await q('select admin_adjust_economy_cash($1,$2,100)',[uid,other]);
d=await summary(); assert.equal(d.cashCreated,100);assert.equal(d.unattributedEntries,0);
assert.equal((await q('select count(*) n from admin_audit_log'))[0].n,1);
await q('select bank_deposit(1000)');
d=await summary(); assert.equal(d.walletToBank,1000);assert.equal(d.cashCreated,100);assert.equal(d.cashDestroyed,0);assert.equal(d.transferNet,0);
await q('select bank_withdraw(250)');
d=await summary();assert.equal(d.bankToWallet,250);assert.equal(d.transferNet,0);assert.equal(d.totalMoneySupply,15100);
// Interest is a source inside a nested bank call; debt accrual has no balance event.
await q("update bank_accounts set last_interest_at=now()-interval '365 days' where player_id=$1",[uid]);
await q('select bank_deposit(100)');
d=await summary();assert.ok(Math.abs(d.cashCreated-148.75)<.01);assert.equal(d.walletToBank,1100);
const interest=d.breakdown.find(r=>r.category==='bank_interest');assert.ok(interest.amount>48);
// Actual loan issuance creates wallet cash; actual repayment destroys it.
const beforeLoan=await summary();await q('select bank_borrow(100)');
assert.equal((await summary()).cashCreated-beforeLoan.cashCreated,100);
await q('select bank_repay(100)');assert.equal((await summary()).cashDestroyed-beforeLoan.cashDestroyed,100);
// No-op balance writes do not generate telemetry.
const beforeNoop=(await summary()).balanceEvents;await q('update players set money=money');assert.equal((await summary()).balanceEvents,beforeNoop);
// Failed transactions roll the ledger back with the balance.
const before=await summary();await db.exec('begin');await q('select bank_deposit(5)');await db.exec('rollback');assert.deepEqual((await summary()).breakdown,before.breakdown);
// Unknown writes are measured but excluded from claimed attribution.
await q('update players set money=money+13 where id=$1',[other]);d=await summary();assert.equal(d.unattributedNet,13);assert.equal(d.unattributedEntries,1);
// Token reimbursements are positive sink reversals, not cash sources.
await db.exec(`create function masterwork_equipment_beta(uuid) returns void language plpgsql as $$begin update public.players set money=money-50 where id=$1;end$$;
create function masterwork_equipment_with_cache_tokens(uuid) returns void language plpgsql as $$begin perform public.masterwork_equipment_beta($1);update public.players set money=money+50 where id=$1;end$$;`);
const preToken=(await summary()).netCreation;await q('select masterwork_equipment_with_cache_tokens($1)',[uid]);assert.equal((await summary()).netCreation,preToken);
// Withheld market fee: wallet transfer -100 / +90, clearing +10 / -10.
await db.exec(`create function buy_auction(uuid,uuid) returns void language plpgsql as $$begin
update players set money=money-100 where id=$1; update players set money=money+90 where id=$2;
insert into market_fee_transactions(player_id,amount,market_type) values($2,10,'listing');end$$;`);
const beforeMarket=(await summary()).cashDestroyed;await q('select buy_auction($1,$2)',[uid,other]);
d=await summary();assert.equal(d.cashDestroyed-beforeMarket,10);assert.equal(d.transferNet,0);
assert.equal((await q('select count(*) n from market_fee_transactions'))[0].n,1);
// Live share functions split their actual 1% embedded fees without changing balances.
const beforeShares=await summary();await q('select buy_shares(101)');await q('select sell_shares(10)');d=await summary();
assert.ok(Math.abs(d.cashCreated-beforeShares.cashCreated-100)<1e-7);
assert.ok(Math.abs(d.cashDestroyed-beforeShares.cashDestroyed-102)<1e-7);
// The deployed wager settlement records the computed rake and escrow payout.
await db.exec("create or replace function war_metric_value(uuid,text) returns numeric language sql as $$select case when $1='00000000-0000-0000-0000-000000000001'::uuid then 2::numeric else 1::numeric end$$");
await q("insert into player_wars(id,challenger_id,opponent_id,status,ends_at,pot,stake,metric,challenger_start,opponent_start) values('00000000-0000-0000-0000-000000000003',$1,$2,'active',now()-interval '1 hour',200,100,'rolls',0,0)",[uid,other]);
const beforeWar=await summary();await q('select war_resolve_due()');d=await summary();
assert.equal(d.cashDestroyed-beforeWar.cashDestroyed,10);assert.equal(d.transferNet-beforeWar.transferNet,200);
// Entry metadata has a stable writer reference and the exact before/after balances.
const entries=await q("select * from economy_cash_ledger where account='wallet' and category='shares'");
assert.equal(entries[0].reference,'buy_shares');assert.equal(Number(entries[0].amount),-101);
// All periods aggregate correctly, including no-data periods and oldest boundary.
await q("update economy_private.tracking set started_at=now()-interval '10 days'");
await q("update economy_cash_ledger set created_at=now()-interval '8 days'");
for(const period of ['1H','6H','24H','7D']){const empty=await summary(period);assert.equal(empty.balanceEvents,0);assert.equal(empty.cashCreated,0);assert.deepEqual(empty.breakdown,[]);}
assert.ok((await summary()).balanceEvents>0);
// At the exact cutoff, include the event; one microsecond earlier, exclude it.
await db.exec(`create function test_boundary() returns numeric language plpgsql as $$begin
insert into public.economy_cash_ledger(created_at,account,amount,direction,category,subcategory) values(statement_timestamp()-interval '1 hour','wallet',11,'source','gem_sales','boundary'),(statement_timestamp()-interval '1 hour'-interval '1 microsecond','wallet',17,'source','gem_sales','outside');
return (public.admin_get_economy_breakdown('1H')->>'cashCreated')::numeric;end$$;`);
assert.equal(Number((await q('select test_boundary() n'))[0].n),11);
// Deletion preserves telemetry even when bank rows cascade away.
await q('delete from players where id=$1',[uid]);
await q("select set_config('request.jwt.claim.sub','38d5e8ce-18af-46d3-aa9e-6e601e75dd78',false)");
assert.ok((await q("select count(*) n from economy_cash_ledger where category='account_removal'"))[0].n>=2);
d=await summary();
const actual=Number((await q("select sum(amount) n from economy_cash_ledger where account<>'clearing'"))[0].n);
assert.ok(Math.abs(actual-(d.netCreation+d.transferNet+d.unattributedNet))<1e-7);
await db.close();console.log('Economy database tests passed');
