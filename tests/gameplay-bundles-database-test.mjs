import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
await db.exec(read('./fixtures/late-game-live-schema.sql'));
await db.exec(`create table game_section_settings(id text primary key,enabled boolean,description text default null);insert into game_section_settings(id,enabled) values('collection-hall',false);alter role service_role bypassrls;grant all on players,inventory_gems,game_section_settings to service_role;`);
await db.exec(read('../supabase/migrations/20260907023214_gameplay_bundles.sql'));
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => (await query(sql,args))[0]?.result;
const call=(name,args)=>scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args);
const uid='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
await db.query('insert into players(id) values($1),($2)',[uid,other]);
const definitions=await query('select * from game_bundle_requirements order by sort_order');
const expected=JSON.parse(read('./fixtures/gameplay-bundles-catalog.json'));
assert.equal(definitions.length,104);
for(const e of expected){const actual=definitions.find(r=>r.id===e.id);for(const [key,value] of Object.entries(e))assert.equal(String(actual[key]),String(value),e.id+' '+key);}
assert.deepEqual((await query('select bundle_id,count(*)::int n from game_bundle_requirements group by bundle_id order by bundle_id')).map(x=>[x.bundle_id,x.n]),[['cosmic',5],['deep-earth',12],['heavyweight',8],['jewellers',15],['master',19],['mutated',24],['spectrum',21]]);
const req=(bundle,name)=>definitions.find(r=>r.bundle_id===bundle&&r.gem_name===name);
const diamond=req('jewellers','Diamond'),spectrum=req('spectrum','Diamond'),heavy=req('heavyweight','Diamond');
const gem=(patch={})=>({gem_name:'Diamond',rarity:2300,base_weight:550,final_weight:550,locked:false,mutation_ids:[],value:10,...patch});
const insert=async(patch={},player=uid)=>scalar('insert into inventory_gems select * from jsonb_populate_record(null::inventory_gems,$1) returning id::text as result',[{id:++seq,player_id:player,...gem(patch)}]);
let seq=10000;
const matches=(id,g)=>scalar('select bundle_specimen_matches(r,$2) as result from game_bundle_requirements r where id=$1',[id,g]);
assert.equal(await matches(heavy.id,gem({rolled_weight_multiplier:100,final_weight:5499.99})),false);
assert.equal(await matches(heavy.id,gem({rolled_weight_multiplier:1,final_weight:5500})),true);
for(const patch of [{locked:true},{museum_locked:true},{favorited:true},{favorite:true},{base_weight:0},{final_weight:null},{final_weight:'NaN'},{final_weight:'Infinity'}])assert.equal(await matches(heavy.id,gem({final_weight:5500,...patch})),false);
const fusion=definitions.find(r=>r.bundle_id==='mutated'&&r.minimum_mutation_count===4);
assert.equal(await matches(fusion.id,gem({mutation_id:'a',mutation_ids:['a','a','b','c']})),false);
assert.equal(await matches(fusion.id,gem({mutation_id:'d',mutation_ids:['a','b','c']})),true);
assert.equal(await matches(fusion.id,gem({gem_name:'Enchant Relic',mutation_ids:['a','b','c','d']})),false);
// Initial state hides Master rows. Neither toggles nor manual donations can pre-fill it.
let state=await call('bundle_state',[uid]);assert.equal(state.bundles.length,7);
assert.equal(state.bundles.find(b=>b.id==='master').unlocked,false);
assert.deepEqual(state.bundles.find(b=>b.id==='master').requirements,[]);
await assert.rejects(()=>call('bundle_set_auto',[uid,'master-01',true]),/bundle_locked/);
await assert.rejects(()=>call('bundle_contribute',[uid,'master-01',[1],false]),/bundle_locked/);
// Filter in SQL before pagination, including locks and Museum protection.
await db.query("insert into inventory_gems(id,player_id,gem_name,locked) select generate_series(1,1100),$1,'Pebble',false",[uid]);
const locked=await insert({locked:true}),museum=await insert({museum_locked:true}),a=await insert(),b=await insert({value:20});
let candidates=await call('bundle_candidates',[uid,diamond.id,0]);assert.deepEqual(candidates.specimens.map(g=>g.id),[a,b]);
const donated=await call('bundle_contribute',[uid,diamond.id,[a],false]);assert.equal(donated.consumed,1);
assert.equal(await scalar('select count(*)::int as result from inventory_gems where id=$1',[a]),0);
await assert.rejects(()=>call('bundle_contribute',[uid,diamond.id,[a],false]),/specimen_not_found/);
await assert.rejects(()=>call('bundle_contribute',[uid,spectrum.id,[b,b],false]),/invalid_specimen_selection/);
await assert.rejects(()=>call('bundle_contribute',[other,diamond.id,[b],false]),/specimen_not_found/);
await assert.rejects(()=>call('bundle_contribute',[uid,diamond.id,[locked],false]),/bundle_specimen_ineligible/);
await assert.rejects(()=>call('bundle_contribute',[uid,diamond.id,[museum],false]),/bundle_specimen_ineligible/);
// A mixed stale/protected batch rolls back EVERY deletion and its progress.
await assert.rejects(()=>call('bundle_contribute',[uid,diamond.id,[b,locked],false]),/bundle_specimen_ineligible/);
assert.equal(await scalar('select count(*)::int as result from inventory_gems where id=$1',[b]),1);
assert.equal(await scalar('select contributed as result from player_bundle_progress where player_id=$1 and requirement_id=$2',[uid,diamond.id]),1);
assert.equal(await scalar('select count(*)::int as result from player_bundle_progress where requirement_id=$1',[spectrum.id]),0);
// Auto routing and lease receipts: only explicitly enabled, uniquely matching rows advance.
let leaseNumber=10;
async function route(specimen=gem(),lease=null){
 if(!lease){lease=`00000000-0000-0000-0000-${String(++leaseNumber).padStart(12,'0')}`;
 await db.query("update players set roll_lease_id=$2,roll_lease_expires_at=clock_timestamp()+interval '1 minute' where id=$1",[uid,lease]);}
 return {lease,result:await call('bundle_route_roll',[uid,lease,specimen])};
}
assert.equal((await route()).result.status,'none');
await call('bundle_set_auto',[uid,diamond.id,true]);
let routed=await route();assert.equal(routed.result.status,'deposited');
assert.deepEqual((await route(gem(),routed.lease)).result,routed.result,'same accepted roll returns its receipt');
await assert.rejects(()=>call('bundle_route_roll',[uid,'00000000-0000-0000-0000-000000009999',gem()]),/invalid_roll_lease/);
await db.query("update players set roll_lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[uid]);
await assert.rejects(()=>route(gem(),routed.lease),/invalid_roll_lease/);
await call('bundle_set_auto',[uid,spectrum.id,true]);
assert.equal((await route()).result.status,'ambiguous');
assert.equal((await route(gem({locked:true}))).result.status,'none');
await call('bundle_set_auto',[uid,spectrum.id,false]);
assert.equal((await route(gem({gem_name:'Lanky Gem',rarity:10000000,final_weight:2750,mutation_ids:['a','b']}))).result.status,'protected');
await db.query('update player_bundle_progress set contributed=$3 where player_id=$1 and requirement_id=$2',[uid,diamond.id,diamond.required_amount-1]);
const last=await insert();await call('bundle_contribute',[uid,diamond.id,[last],false]);
assert.equal((await route()).result.status,'none','completed rows never overfill');
await assert.rejects(()=>call('bundle_contribute',[uid,diamond.id,[b],false]),/bundle_target_full/);
// Complete first six with the last real transaction triggering each completion.
for(const bundle of ['jewellers','spectrum','deep-earth','heavyweight','mutated','cosmic']){
 const rr=definitions.filter(r=>r.bundle_id===bundle),tail=rr.at(-1);
 for(const r of rr)await db.query('insert into player_bundle_progress(player_id,requirement_id,contributed) values($1,$2,$3) on conflict(player_id,requirement_id) do update set contributed=excluded.contributed',[uid,r.id,r.required_amount-(r===tail?1:0)]);
 const specimen=await insert({gem_name:tail.gem_name??'Diamond',rarity:tail.minimum_gem_rarity??10000000,final_weight:550*(tail.minimum_weight_multiplier??1),mutation_ids:tail.mutation_id?[tail.mutation_id]:Array.from({length:tail.minimum_mutation_count??0},(_,i)=>'m'+i)});
 await call('bundle_contribute',[uid,tail.id,[specimen],false]);
}
state=await call('bundle_state',[uid]);assert.equal(state.bundles.find(b=>b.id==='master').unlocked,true);
assert.ok(state.bundles.find(b=>b.id==='master').requirements.every(r=>r.contributed===0&&!r.auto_contribute));
assert.equal(state.bundles.filter(b=>b.completed_at).length,6);
await assert.rejects(()=>call('bundle_set_auto',[uid,'master-crown',true]),/bundle_manual_only/);
const crown=await insert({gem_name:'Lanky Gem',rarity:10000000,final_weight:2750,mutation_ids:['gilded','smooth'],serial_number:67,created_at:'2026-09-07T00:00:00Z'});
await assert.rejects(()=>call('bundle_contribute',[uid,'master-crown',[crown],false]),/crown_confirmation_required/);
const fake=await insert({gem_name:'Lanky Gem',rarity:9999999,final_weight:2750,mutation_ids:['a','b']});
await assert.rejects(()=>call('bundle_contribute',[uid,'master-crown',[fake],true]),/bundle_specimen_ineligible/);
await call('bundle_contribute',[uid,'master-crown',[crown],true]);
state=await call('bundle_state',[uid]);const snapshot=state.submissions[0].specimen_snapshot;
assert.equal(snapshot.id,crown);assert.equal(snapshot.final_weight_multiplier,5);assert.equal(snapshot.serial_number,67);assert.deepEqual(snapshot.mutation_ids,['gilded','smooth']);
assert.equal(await scalar('select count(*)::int as result from inventory_gems where id=$1',[crown]),0);
assert.equal(state.bundles.find(b=>b.id==='master').completed_at,null,'one trophy does not complete Master');
const summary=await call('bundle_public_summary',[uid]);assert.equal(summary.completed.length,6);assert.equal(summary.crown.gem_name,'Lanky Gem');assert.equal(summary.crown.player_id,undefined);assert.equal(summary.crown.value,undefined);
// The authenticated edge/service role works, but clients cannot forge progress or roll specimens.
await db.exec('set role service_role');assert.equal((await call('bundle_state',[uid])).bundles.length,7);await db.exec('reset role');
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 await assert.rejects(()=>call('bundle_route_roll',[uid,routed.lease,gem()]),/permission denied/);
 await assert.rejects(()=>call('bundle_contribute',[uid,diamond.id,[b],false]),/permission denied/);
 await assert.rejects(()=>db.query('update player_bundle_progress set contributed=999999'),/permission denied/);
 await assert.rejects(()=>db.query('select * from player_bundle_special_submissions'),/permission denied/);
 await db.exec('reset role');
}
assert.ok((await query("select relrowsecurity from pg_class where relname in ('game_bundles','game_bundle_requirements','player_bundle_progress','player_bundle_settings','player_bundle_completions','player_bundle_special_submissions','player_bundle_roll_receipts')")).every(r=>r.relrowsecurity));
await db.close();console.log('Gameplay Bundle database integration tests passed (104 definitions, matching, gating, transactions, receipts, snapshot and permissions).');
