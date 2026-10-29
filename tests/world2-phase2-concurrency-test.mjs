import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
const run=promisify(execFile);
const bin=process.env.WORLD2_POSTGRES_BIN;
if(!bin)throw new Error('Set WORLD2_POSTGRES_BIN to a disposable PostgreSQL bin directory.');
const root=await mkdtemp('/tmp/abyss-p2-pg-');
const uid='00000000-0000-0000-0000-000000000001';
const request='10000000-0000-0000-0000-000000000001';
const sql=async query=>{try{return (await run(process.env.WORLD2_PSQL||'psql',['-h',root,'-p','55444','-U','postgres','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',query],{maxBuffer:4e6})).stdout.trim();}catch(e){throw new Error(e.stderr||e.message);}};
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const json=async s=>JSON.parse((await sql(s)).split('\n').at(-1));
let started=false;
try {
 await run(path.join(bin,'initdb'),['-D',path.join(root,'data'),'-U','postgres','--auth=trust','--locale=C']);
 await run(path.join(bin,'pg_ctl'),['-D',path.join(root,'data'),'-l',path.join(root,'log'),'-o',`-k ${root} -h '' -p 55444`,'-w','start']);started=true;
 for(const file of ['tests/fixtures/world2-phase1-schema.sql','tests/fixtures/world2-phase2-schema.sql','tests/fixtures/world2-phase2-live-functions.sql','supabase/migrations/20261029002115_world2_abyss_phase1_foundations.sql','supabase/migrations/20261029010322_world2_abyss_phase2_pipeline.sql'])await sql(await read(file));
 await sql(`alter table abyss_private.release_config drop constraint release_config_gameplay_enabled_check;update abyss_private.release_config set gameplay_enabled=true;alter table abyss_private.pipeline_config drop constraint pipeline_config_enabled_check;update abyss_private.pipeline_config set enabled=true;
 alter table world2_player_state drop constraint world2_player_state_active_world_check;alter table world2_player_state drop constraint world2_player_state_abyss_unlocked_check;
 insert into world2_player_state(player_id,active_world,abyss_unlocked) values('${uid}',2,true)`);
 const claim=(id=request)=>`select world2_claim_batch('${uid}','${id}',repeat('a',64),3,2500,world2_roll_context('${uid}'))`;
 const claims=await Promise.all(Array.from({length:24},()=>json(`set role service_role;${claim()}`)));
 assert.equal(claims.filter(x=>x.status==='claimed').length,1);
 assert.equal(claims.filter(x=>x.status==='in_flight').length,23);
 const accepted=claims.find(x=>x.status==='claimed');
 const outcome=JSON.stringify({kind:'ordinary',primary:{gem_name:'Quartz',value:12,natural_mutation_ids:['glossy']},extras:[],bucket:{charge:1},lawState:{step:1}});
 const commit=(sub=0,token=accepted.workerToken)=>`select world2_commit_subroll('${uid}','${request}',repeat('a',64),${sub},'${token}','${outcome}')`;
 const results=await Promise.all(Array.from({length:24},()=>json(`set role service_role;${commit()}`)));
 assert(results.every(r=>JSON.stringify(r)===JSON.stringify(results[0])));
 assert.equal(await sql('select count(*) from world2_outcome_receipts'),'1');
 assert.equal(await sql('select count(*) from world2_specimen_provenance'),'1');
 assert.equal(await sql(`select total_rolls from players where id='${uid}'`),'300001');
 // Concurrent different requests cannot claim while this batch lease is live.
 const competing=await Promise.all(Array.from({length:12},(_,i)=>json(claim(`20000000-0000-0000-0000-${String(i).padStart(12,'0')}`))));
 assert(competing.every(x=>x.status==='in_flight'));
 // A commit that waits behind a routing/player lock must validate the clock
 // after the lock; let its original lease expire while it is blocked.
 await sql(`update players set roll_lease_expires_at=clock_timestamp()+interval '200 milliseconds' where id='${uid}';update abyss_private.roll_batches set expires_at=clock_timestamp()+interval '200 milliseconds' where request_id='${request}'`);
 const blocker=sql(`begin;select id from players where id='${uid}' for update;select pg_sleep(0.5);commit`);
 // Wait for the blocker to be observable, not an arbitrary timing guess.
 for(let i=0;i<30;i++) {
  if(await sql("select count(*) from pg_stat_activity where wait_event='PgSleep'")==='1')break;
  await new Promise(r=>setTimeout(r,10));
 }
 await assert.rejects(sql(commit(1)),/stale_lease/);await blocker;
 assert.equal(await sql('select count(*) from world2_outcome_receipts'),'1');
 // Expired suffix remains terminal; original result remains replayable.
 const retry=await json(claim());assert.equal(retry.status,'partial');assert.equal(retry.completed,1);
 assert.deepEqual(await json(commit()),results[0]);
 // Replacement claim + delayed old release cannot clear the new lease.
 await sql(`update players set next_roll_at=null where id='${uid}'`);
 const replacement=await json(claim('30000000-0000-0000-0000-000000000001'));assert.equal(replacement.status,'claimed');
 await sql(`select release_server_roll('${uid}','${accepted.leaseId}')`);
 assert.equal(await sql(`select roll_lease_id from players where id='${uid}'`),replacement.leaseId);
 await assert.rejects(sql(`select world2_switch_world('${uid}',1)`),/roll_in_flight/);
 // Race a fresh world switch against a fresh claim. Exactly one can win;
 // neither can accept a batch in the other operation's stale world context.
 for(let i=0;i<8;i++) {
  await sql(`update players set next_roll_at=null,roll_lease_id=null,roll_lease_expires_at=null where id='${uid}';update world2_player_state set active_world=2,revision=revision+1 where player_id='${uid}'`);
  const raced=await Promise.allSettled([
   json(claim(`40000000-0000-0000-0000-${String(i).padStart(12,'0')}`)),
   json(`select world2_switch_world('${uid}',1)`)
  ]);
  assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);
  const failure=raced.find(r=>r.status==='rejected');assert.match(failure.reason.message,/world2_locked|world2_roll_in_flight/);
 }
 // Same lock order makes a switch serialize behind commit; it either refuses
 // a live lease or (after final commit) observes released lease and preserves state.
 console.log('Real PostgreSQL Phase 2: 24 claims -> one worker; 24 commits -> one identical receipt/provenance/counter; 12 competing requests fenced; lock-wait expiry, prefix replay, replacement lease and eight claim/switch races passed.');
} finally {
 if(started)await run(path.join(bin,'pg_ctl'),['-D',path.join(root,'data'),'-m','fast','-w','stop']);
 await rm(root,{recursive:true,force:true});
}
