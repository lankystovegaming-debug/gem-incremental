import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const uid='00000000-0000-0000-0000-000000000001';
const design=JSON.parse(readFileSync(new URL('../docs/biomes-v11-design.json',import.meta.url),'utf8'));
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select '${uid}'::uuid$$;
 create table players(id uuid primary key,equipment_state jsonb default '{}',equipment_state_roll bigint default 0,
  roll_lease_id uuid,total_rolls bigint default 0);
 create table player_equipment(id bigint,player_id uuid,equipped boolean);
 create table player_settings(player_id uuid primary key,settings jsonb default '{}',updated_at timestamptz);
 create table private_feature_gems(id uuid default gen_random_uuid(),name text,rarity numeric,base_weight numeric,value_per_gram numeric,
  sort_order integer,enabled boolean,affected_by_luck boolean,metadata jsonb,description text,hide_rarity_until_discovered boolean);
 create function roll_batch_unlock_status(uuid,integer) returns jsonb language sql as $$select '{"status":"unlocked"}'::jsonb$$;
 create function claim_guild_mythic_surge(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function claim_server_roll(p_player_id uuid,p_cooldown_ms numeric) returns jsonb language plpgsql as $$
 declare v_lease uuid:=gen_random_uuid(); begin
 update public.players set roll_lease_id=v_lease where id=p_player_id;
 return jsonb_build_object('status','claimed','leaseId',v_lease,'genuineRoll',1);
 end $$;
 insert into players(id) values('${uid}');
`);
for(const file of ['20261024043850_biomes_v11_global_scheduler.sql','20261024043851_biomes_v11_roll_and_catalog.sql','20261024043908_biomes_v11_discovery_index.sql']) {
 await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
}
assert.equal((await one('select count(*)::int n from biome_gem_rules')).n,69);
assert.equal((await one('select count(*)::int n from private_feature_gems')).n,11);
assert.equal((await one('select count(*)::int n from biome_gem_rules where exclusive')).n,7);
assert.equal((await one('select count(*)::int n from private_feature_gems where enabled')).n,0);
for(const [name,g] of Object.entries(design.new_gems)){
 const saved=await one('select * from private_feature_gems where name=$1',[name]);
 assert.equal(saved.description,g.description);assert.equal(Number(saved.rarity),g.canonical);
 assert.equal(Number(saved.base_weight),g.weight);assert.equal(Number(saved.value_per_gram),g.value_per_gram);
 if(['Damnation','Aberration'].includes(name))assert.equal(saved.metadata.rarityClass,'anomalous');
}
await db.exec(`
 create table player_gem_mutation_combinations(player_id uuid,gem_name text,mutation_ids text[]);
 create table game_mutations(enabled boolean);
 create table achievement_fixture(name text primary key,progress numeric,target numeric);
 create function achievement_set_progress_v013(uuid,text,numeric,numeric) returns void language sql as $$
 insert into public.achievement_fixture values($2,$3,$4) on conflict(name) do update set progress=$3,target=$4; $$;
 insert into player_gem_mutation_combinations values('${uid}','Permafrost','{}'),('${uid}','Aberration','{}');
 update private_feature_gems set enabled=true;
 select sync_gem_index_achievements_v013('${uid}');
`);
const complete=await one("select * from achievement_fixture where name='The Complete Index'");
assert.equal(Number(complete.progress),1);assert.equal(Number(complete.target),4);
await db.exec('update private_feature_gems set enabled=false');
const calibration=await one(`select sum(duration_minutes/interval_minutes)::float8 u,
 sum(1/interval_minutes)::float8 r from biome_definitions`);
assert.ok(Math.abs(calibration.u-0.1249834656084656)<1e-12);
assert.ok(Math.abs(calibration.r/(1-calibration.u+calibration.r)-0.027805844)<1e-8);
assert.equal((await one('select advance_global_biome() v')).v.status,'disabled');
let index=(await one('select get_biome_index() v')).v;
assert.equal(index.entries.length,9);assert.ok(index.entries.every(e=>!e.key&&!e.gems&&!e.meanIntervalMinutes));
await db.exec(`update biome_scheduler set enabled=true;
 insert into biome_occurrences(biome_key,starts_at,ends_at) values('Frozen',date_trunc('minute',clock_timestamp()),date_trunc('minute',clock_timestamp())+interval '5 minutes');
 update biome_scheduler set occurrence_id=(select id from biome_occurrences);
`);
assert.equal((await one('select advance_global_biome() v')).v.status,'active');
assert.equal((await one('select advance_global_biome() v')).v.status,'already_processed');
// Database exclusion is defense-in-depth even against competing insert paths.
await assert.rejects(db.exec(`insert into biome_occurrences(biome_key,starts_at,ends_at) values('Void',clock_timestamp(),clock_timestamp()+interval '1 minute')`),/biome_no_overlap/);
const claim=(await one(`select claim_equipment_roll_batch($1,2500,'{}','{}',1) v`,[uid])).v;
assert.equal(claim.biomeSnapshot.occurrence.key,'Frozen');
assert.equal(claim.biomeSnapshot.occurrence.denominators.Aurorite,100000000);
// An accepted snapshot survives expiry; a failed commit rolls discovery back.
await db.exec('begin; update players set equipment_state_roll=1; rollback;');
assert.equal((await one('select count(*)::int n from player_biome_discoveries')).n,0);
await db.exec('update players set equipment_state_roll=1');
await db.exec('update players set equipment_state_roll=1');
assert.equal((await one('select count(*)::int n from player_biome_discoveries')).n,1);
index=(await one('select get_biome_index() v')).v;
assert.equal(index.entries.filter(e=>e.discovered).length,1);
assert.equal(index.entries.find(e=>e.discovered).key,'Frozen');
await db.exec(`select set_biome_tournament_mode(true)`);
assert.equal((await one(`select biome_acceptance_snapshot($1) v`,[uid])).v.tournament,true);
// Direct authenticated writes cannot forge acceptance state; tables/rules are private.
await db.exec('grant select,update on players to authenticated; set role authenticated;');
await assert.rejects(db.exec("update players set biome_batch_snapshot='{}'"),/biome_snapshot_is_server_owned/);
await assert.rejects(db.exec('select * from biome_gem_rules'),/permission denied/);
await assert.rejects(db.exec('select advance_global_biome()'),/permission denied/);
assert.equal((await one('select count(*)::int n from player_biome_discoveries')).n,1);
await db.exec('reset role');
// Distortion stays hidden until a genuine committed roll, including tournament rolls.
await db.exec(`update biome_occurrences set starts_at=date_trunc('minute',clock_timestamp())-interval '8 minutes',ends_at=date_trunc('minute',clock_timestamp())-interval '3 minutes';
 insert into biome_occurrences(biome_key,starts_at,ends_at) values('Distortion',date_trunc('minute',clock_timestamp()),date_trunc('minute',clock_timestamp())+interval '2 minutes');
 update biome_scheduler set occurrence_id=(select id from biome_occurrences where biome_key='Distortion');`);
await one(`select claim_equipment_roll_batch($1,2500,'{}','{}',1) v`,[uid]);
await db.exec('update players set equipment_state_roll=2');
index=(await one('select get_biome_index() v')).v;
assert.equal(index.entries.length,10);assert.equal(index.entries.filter(e=>e.phenomenon).length,1);
// Expiry tick is eligible again; no replay of skipped minutes.
await db.exec(`update biome_occurrences set starts_at=date_trunc('minute',clock_timestamp())-interval '2 minutes',ends_at=date_trunc('minute',clock_timestamp()) where biome_key='Distortion';
 update biome_scheduler set last_tick=null;`);
assert.ok(['normal','activated'].includes((await one('select advance_global_biome() v')).v.status));
assert.equal((await one('select advance_global_biome() v')).v.status,'already_processed');
await db.close();
console.log('Biomes migrations: calibration, 69 rules, 11 gems, masking, claims, rollback/idempotent discovery, RLS, overlap exclusion and expiry tick pass.');
