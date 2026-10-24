import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const run=promisify(execFile);
const bin=process.env.BIOMES_POSTGRES_BIN||'/opt/homebrew/bin';
await access(path.join(bin,'postgres')).catch(()=>{throw new Error('Real concurrency suite requires a PostgreSQL server distribution. Set BIOMES_POSTGRES_BIN to its bin directory; libpq client tools are insufficient.');});
const root=await mkdtemp(path.join(tmpdir(),'biomes-postgres-'));
const uid='00000000-0000-0000-0000-000000000001';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const sql=async statement=>(await run(path.join(bin,'psql'),['-h',root,'-p','55439','-U','postgres','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{maxBuffer:4e6})).stdout.trim();
let started=false;
try{
 await run(path.join(bin,'initdb'),['-D',path.join(root,'data'),'-U','postgres','--auth=trust','--locale=C']);
 await run(path.join(bin,'pg_ctl'),['-D',path.join(root,'data'),'-l',path.join(root,'server.log'),'-o',`-k ${root} -h '' -p 55439`,'-w','start']);started=true;
 await sql(await read('./fixtures/biomes-v11-schema.sql'));
 await sql('alter table players add column equipment_genuine_rolls bigint default 0,add column next_roll_at timestamptz,add column roll_lease_expires_at timestamptz;');
 const equipment=await read('../supabase/migrations/20260906070703_late_game_equipment_expansion.sql');
 const begin=equipment.indexOf('CREATE OR REPLACE FUNCTION public.claim_server_roll(');
 await sql(equipment.slice(begin,equipment.indexOf('$function$;',begin)>0?equipment.indexOf('$function$;',begin)+11:equipment.indexOf('$$;',begin)+3));
 for(const file of ['20261024043850_biomes_v11_global_scheduler.sql','20261024043851_biomes_v11_roll_and_catalog.sql','20261024043908_biomes_v11_discovery_index.sql'])await sql(await read('../supabase/migrations/'+file));
 await sql('update biome_scheduler set enabled=true;');
 const ticks=await Promise.all(Array.from({length:16},()=>sql('select advance_global_biome();')));
 assert.equal(ticks.filter(v=>JSON.parse(v).status==='already_processed').length,15);
 assert.equal(ticks.filter(v=>['normal','activated'].includes(JSON.parse(v).status)).length,1);
 // Use a fixed current occurrence after the scheduler's one categorical check.
 await sql(`update biome_scheduler set occurrence_id=null;delete from biome_occurrences;
 insert into biome_occurrences(biome_key,starts_at,ends_at) values('Frozen',date_trunc('minute',clock_timestamp()),date_trunc('minute',clock_timestamp())+interval '5 minutes');
 update biome_scheduler set occurrence_id=(select id from biome_occurrences);`);
 const claims=await Promise.all(Array.from({length:12},()=>sql(`select claim_equipment_roll_batch('${uid}',2500,'{}','{}',1);`)));
 assert.equal(claims.filter(v=>JSON.parse(v).status==='claimed').length,1);
 assert.equal(claims.filter(v=>['in_flight','cooldown'].includes(JSON.parse(v).status)).length,11);
 const accepted=JSON.parse(claims.find(v=>JSON.parse(v).status==='claimed'));
 assert.equal(accepted.biomeSnapshot.occurrence.key,'Frozen');
 await Promise.all(Array.from({length:12},()=>sql(`begin;update players set equipment_state_roll=1 where id='${uid}';commit;`)));
 assert.equal(await sql('select count(*) from player_biome_discoveries;'),'1');
 // Reconnect-style new session cannot reset the accepted cooldown or lease.
 assert.notEqual(JSON.parse(await sql(`select claim_equipment_roll_batch('${uid}',2500,'{}','{}',1);`)).status,'claimed');
 console.log('Real local Postgres: 16 concurrent ticks yield one draw; 12 claims yield one lease; 12 commit updates yield one discovery; reconnect cannot reset cooldown.');
}finally{
 if(started)await run(path.join(bin,'pg_ctl'),['-D',path.join(root,'data'),'-m','fast','-w','stop']);
 await rm(root,{recursive:true,force:true});
}
