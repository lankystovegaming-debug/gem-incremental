import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
const run=promisify(execFile);
const bin=process.env.WORLD2_POSTGRES_BIN;
if(!bin)throw new Error('Set WORLD2_POSTGRES_BIN to an isolated PostgreSQL server bin directory (initdb/pg_ctl/postgres).');
await access(path.join(bin,'postgres'));
const psql=process.env.WORLD2_PSQL||'psql';
const root=await mkdtemp('/tmp/abyss-pg-');
const uid='00000000-0000-0000-0000-000000000001';
const request='10000000-0000-0000-0000-000000000001';
const sql=async query=>{
 try { return (await run(psql,['-h',root,'-p','55443','-U','postgres','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',query],{maxBuffer:4e6})).stdout.trim(); }
 catch(error) { const short=new Error(error.stderr||error.message);short.stderr=error.stderr;throw short; }
};
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
let started=false;
try {
 await run(path.join(bin,'initdb'),['-D',path.join(root,'data'),'-U','postgres','--auth=trust','--locale=C']);
 await run(path.join(bin,'pg_ctl'),['-D',path.join(root,'data'),'-l',path.join(root,'log'),'-o',`-k ${root} -h '' -p 55443`,'-w','start']);started=true;
 await sql(await read('tests/fixtures/world2-phase1-schema.sql'));
 await sql(await read('supabase/migrations/20261029002115_world2_abyss_phase1_foundations.sql'));
 const epochs=await Promise.all(Array.from({length:24},()=>sql('set role service_role;select world2_initialize_current_epoch();')));
 const normalized=epochs.map(e=>JSON.parse(e.split('\n').at(-1)));
 assert(normalized.every(e=>JSON.stringify(e)===JSON.stringify(normalized[0])));
 assert.equal(await sql('select count(*) from world2_epochs'),'1');
 // Repeated laws in consecutive epochs are legal. No anti-repeat exclusion.
 await sql("insert into world2_epochs(world_id,starts_at,ends_at,version,a_id,b_id,c_id) select world_id,starts_at+interval '12 hours',ends_at+interval '12 hours',version,a_id,b_id,c_id from world2_epochs");
 assert.equal(await sql('select count(*) from world2_epochs'),'2');
 // Concurrent initialize-or-read patterns cannot erase persistent buckets.
 await sql(`insert into world2_equipment_buckets(player_id,world_id,counters_and_queues) values('${uid}',2,'{"charge":99}');`);
 await Promise.all(Array.from({length:24},()=>sql(`set role service_role;insert into world2_equipment_buckets(player_id,world_id) values('${uid}',2) on conflict do nothing;`)));
 assert.equal(await sql("select counters_and_queues->>'charge' from world2_equipment_buckets"),'99');
 const insert=`set role service_role;insert into world2_outcome_receipts(player_id,request_id,subroll,epoch_start,lease_id,internal_genuine_sequence,world_genuine_ordinal,revision_before,revision_after,request_digest,outcome)
 values('${uid}','${request}',0,'${normalized[0].starts_at}','${request}',801,1,0,1,repeat('a',64),'{"status":"loss"}');`;
 const receipts=await Promise.allSettled(Array.from({length:24},()=>sql(insert)));
 assert.equal(receipts.filter(r=>r.status==='fulfilled').length,1);
 assert(receipts.filter(r=>r.status==='rejected').every(r=>/duplicate key/.test(r.reason.stderr)));
 assert.equal(await sql('select count(*) from world2_outcome_receipts'),'1');
 assert.equal(await sql(`select total_rolls from players where id='${uid}'`),'300000');
 console.log('Real isolated PostgreSQL: 24 epoch initializers return one tuple; repeated tuple legal; 24 reconnect initializations preserve charge; 24 receipt inserts produce one durable identity. W1 counters unchanged.');
} finally {
 if(started)await run(path.join(bin,'pg_ctl'),['-D',path.join(root,'data'),'-m','fast','-w','stop']);
 await rm(root,{recursive:true,force:true});
}
