import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const db=new PGlite();
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const uid='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const rows=async sql=>(await db.query(sql)).rows;
const one=async sql=>(await rows(sql))[0];
const reject=async(sql,pattern)=>{await assert.rejects(db.exec(sql),pattern);};
try {
 await db.exec(read('tests/fixtures/world2-phase1-schema.sql'));
 const legacy=await rows(`select to_jsonb(p) as row from players p order by id`);
 const inventory=await rows('select * from inventory_gems');
 const gear=await rows('select * from player_equipment');
 const legacyFunction=await one("select pg_get_functiondef('world1_legacy_roll(uuid,integer)'::regprocedure) as definition");
 const legacyTriggers=await rows("select tgrelid::regclass::text as tbl,tgname,pg_get_triggerdef(oid) as definition from pg_trigger where tgrelid in ('players'::regclass,'inventory_gems'::regclass,'player_equipment'::regclass) order by tbl,tgname");
 await db.exec(read('supabase/migrations/20261029002115_world2_abyss_phase1_foundations.sql'));
 assert.deepEqual(await rows('select to_jsonb(p) as row from players p order by id'),legacy);
 assert.deepEqual(await rows('select * from inventory_gems'),inventory);
 assert.deepEqual(await rows('select * from player_equipment'),gear);
 assert.deepEqual(await one("select pg_get_functiondef('world1_legacy_roll(uuid,integer)'::regprocedure) as definition"),legacyFunction);
 assert.equal((await one(`select world1_legacy_roll('${uid}') as n`)).n,300000);
 assert.equal((await one('select count(*)::int as n from world2_player_state')).n,0);
 assert.equal((await one('select count(*)::int as n from world2_specimen_provenance')).n,0);
 const laws=await rows('select category,law_id,weight,contract from world2_law_definitions order by law_id');
 const manifest=JSON.parse(read('world2/manifest.v1.json'));
 assert.deepEqual(laws.map(l=>l.contract),[...manifest.laws].sort((a,b)=>a.id.localeCompare(b.id)));
 assert.equal((await one("select count(*)::int as n from world2_law_definitions a cross join world2_law_definitions b cross join world2_law_definitions c where a.category='A' and b.category='B' and c.category='C'")).n,264);
 // Exhaust the ACTUAL SQL cumulative selector across every discrete ticket.
 for(const category of ['A','B','C']) {
  const selected=await rows(`with weights as (select law_id,weight,sum(weight) over(order by law_id) as cumulative from world2_law_definitions where category='${category}'),
    tickets as (select generate_series(0,(select sum(weight)::int-1 from weights)) as ticket)
    select picked.law_id,count(*)::int as n from tickets cross join lateral
      (select law_id from weights where cumulative>ticket order by cumulative limit 1) picked group by picked.law_id order by picked.law_id`);
  assert.deepEqual(selected,laws.filter(l=>l.category===category).map(l=>({law_id:l.law_id,n:l.weight})));
 }
 // New infrastructure introduces no trigger on any pre-existing game table.
 assert.deepEqual(await rows("select tgrelid::regclass::text as tbl,tgname,pg_get_triggerdef(oid) as definition from pg_trigger where tgrelid in ('players'::regclass,'inventory_gems'::regclass,'player_equipment'::regclass) order by tbl,tgname"),legacyTriggers);
 // No writes to old tables, no legacy backfill; absence is explicitly neutral.
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false);`);
 const status=(await one('select world2_my_status() as s')).s;
 assert.deepEqual(status,{activeWorld:1,abyssUnlocked:false,gameplayEnabled:false,questEnabled:false,lawEffectsEnabled:false,adaptationEnabled:false,revision:0,genuineRolls:0});
 await reject(`insert into world2_player_state(player_id) values('${uid}')`,/permission denied/);
 await reject('select world2_initialize_current_epoch()',/permission denied/);
 await reject('select * from abyss_private.release_config',/permission denied/);
 await reject('select * from world2_specimen_provenance',/permission denied/);
 await db.exec('reset role;');
 await db.exec(`insert into world2_player_state(player_id) values('${uid}'),('${other}');`);
 await db.exec(`set role authenticated;`);
 assert.equal((await rows('select * from world2_player_state')).length,1);
 assert.equal((await one('select player_id from world2_player_state')).player_id,uid);
 assert.equal((await rows(`select * from world2_player_state where player_id='${other}'`)).length,0);
 await reject(`update world2_player_state set abyss_unlocked=true where player_id='${uid}'`,/permission denied/);
 await reject('update world2_epochs set a_id=a_id',/permission denied/);
 await reject('delete from world2_law_definitions',/permission denied/);
 await reject(`insert into world2_outcome_receipts(player_id) values('${uid}')`,/permission denied/);
 await db.exec('reset role;set role anon;');
 assert.equal((await rows('select * from world2_law_definitions')).length,22);
 await reject('select * from world2_player_state',/permission denied/);
 await reject('select world2_my_status()',/permission denied/);
 await db.exec('reset role;');
 // False gates and locked identity hold even for privileged writes.
 await reject('update abyss_private.release_config set gameplay_enabled=true',/check constraint/);
 for(const flag of ['quest_enabled','law_effects_enabled','adaptation_enabled'])
  await reject(`update abyss_private.release_config set ${flag}=true`,/check constraint/);
 await reject(`update world2_player_state set active_world=2 where player_id='${uid}'`,/check constraint/);
 await reject(`update world2_player_state set abyss_unlocked=true where player_id='${uid}'`,/check constraint/);
 await reject(`insert into world2_quest_progress(player_id,version,stage) values('${uid}',1,1)`,/check constraint/);
 await db.exec('set role service_role;');
 await reject("insert into world2_player_state(player_id) values('00000000-0000-0000-0000-000000000099')",/world2_player_not_found/);
 const epoch=(await one('select world2_initialize_current_epoch() as e')).e;
 const repeat=(await one('select world2_initialize_current_epoch() as e')).e;
 assert.deepEqual(epoch,repeat);
 await reject("insert into world2_epochs select * from world2_epochs",/permission denied/);
 const begins=Date.parse(epoch.starts_at);
 assert.equal(begins%43200000,0);assert.equal(Date.parse(epoch.ends_at)-begins,43200000);
 await db.exec(`insert into world2_adaptation_progress(player_id,source_world,destination_world,version,qualifying_genuine_rolls) values('${uid}',1,2,1,2500),('${uid}',2,1,1,0);`);
 assert.equal((await one(`select qualifying_genuine_rolls as n from world2_adaptation_progress where source_world=2`)).n,0);
 await reject(`insert into world2_adaptation_progress(player_id,source_world,destination_world,version) values('${other}',1,1,1)`,/check constraint/);
 await db.exec(`insert into world2_equipment_buckets(player_id,world_id,counters_and_queues) values('${uid}',1,'{"charge":100}'),('${uid}',2,'{"charge":0}');`);
 assert.equal((await one(`select counters_and_queues from world2_equipment_buckets where world_id=1`)).counters_and_queues.charge,100);
 await reject(`insert into world2_equipment_activations(player_id,effect_id,activation_world,activated_at) values('${uid}','supersizer_blessing',1,now())`,/check constraint/);
 await db.exec(`insert into world2_equipment_activations(player_id,effect_id,activation_world,activated_at,expires_at) values('${uid}','supersizer_blessing',1,now(),now()+interval '5 minutes');`);
 await reject(`insert into world2_equipment_activations(player_id,effect_id,activation_world,activated_at,expires_at) values('${uid}','supersizer_blessing',2,now(),now()+interval '5 minutes')`,/duplicate key/);
 // Populate/evict more than a complete history window, including empty/loss positions.
 for(let ordinal=1;ordinal<=280;ordinal++) await db.exec(`insert into world2_resonance_history(player_id,slot,genuine_ordinal,gem_identity,outcome_kind,natural_mutation_ids)
 values('${uid}',${(ordinal-1)%250},${ordinal},${ordinal%2?"'Quartz'":"null"},'${ordinal%2?'ordinary':'loss'}','{glossy}')
 on conflict(player_id,slot) do update set genuine_ordinal=excluded.genuine_ordinal,gem_identity=excluded.gem_identity,outcome_kind=excluded.outcome_kind,natural_mutation_ids=excluded.natural_mutation_ids;`);
 const history=await one('select count(*)::int as n,min(genuine_ordinal) as low,max(genuine_ordinal) as high from world2_resonance_history');
 assert.deepEqual(history,{n:250,low:31,high:280});
 await reject(`insert into world2_resonance_history(player_id,slot,genuine_ordinal,outcome_kind) values('${other}',250,251,'empty')`,/check constraint/);
 const req='10000000-0000-0000-0000-000000000001';
 await db.exec(`insert into world2_outcome_receipts(player_id,request_id,subroll,epoch_start,lease_id,internal_genuine_sequence,world_genuine_ordinal,revision_before,revision_after,request_digest,outcome)
 values('${uid}','${req}',0,'${epoch.starts_at}','${req}',801,1,0,1,repeat('a',64),'{"status":"loss"}');`);
 await reject(`update world2_outcome_receipts set outcome='{}'`,/permission denied/);
 await reject(`delete from world2_outcome_receipts`,/permission denied/);
 const receipt=await one('select * from world2_outcome_receipts');
 await reject(`insert into world2_outcome_receipts select * from world2_outcome_receipts`,/duplicate key/);
 assert.deepEqual(await one('select * from world2_outcome_receipts'),receipt);
 await db.exec(`insert into world2_specimen_provenance(acquisition_player_id,request_id,subroll,specimen_index,source_kind) values('${uid}','${req}',0,0,'legacy');`);
 assert.equal(Number((await one('select npc_liquidation_factor from world2_specimen_provenance')).npc_liquidation_factor),1);
 await reject(`update world2_specimen_provenance set npc_liquidation_factor=.8`,/permission denied/);
 // Reconnect is read-only: state, bucket charge and both histories survive.
 const before=await rows('select to_jsonb(s) as row from world2_resonance_history s order by slot');
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false);`);
 for(let i=0;i<3;i++)await one('select world2_my_status()');
 assert.deepEqual(await rows('select to_jsonb(s) as row from world2_resonance_history s order by slot'),before);
 await db.exec('reset role;');
 await reject(`update world2_epochs set a_id=a_id`,/world2_immutable_record/);
 await reject(`delete from world2_specimen_provenance`,/world2_immutable_record/);
 // Explicit ACL/RLS coverage includes default-grant leakage and future tables.
 const tables=await rows("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'world2_%'");
 assert.equal(tables.length,15);
 assert(tables.every(t=>t.relrowsecurity));
 for(const t of tables)for(const role of ['anon','authenticated'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
  assert.equal((await one(`select has_table_privilege('${role}','${t.relname}','${privilege}') as allowed`)).allowed,false,t.relname+':'+role+':'+privilege);
 }
 assert.equal((await one("select has_function_privilege('authenticated','world2_initialize_current_epoch()','EXECUTE') as allowed")).allowed,false);
 console.log('Isolated PostgreSQL migration, defaults, owner/RLS/grants, immutable receipts/provenance, disabled gates, 250-slot history and independent tracks passed.');
} finally {await db.close();}
