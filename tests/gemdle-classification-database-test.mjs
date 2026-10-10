import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { GEMDLE_GEM_TAGS } from '../supabase/functions/gemdle/gemTags.ts';
import { scoreSpecimen } from '../supabase/functions/gemdle/classifications.ts';

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.players(id uuid primary key,username text,leaderboard_hidden boolean default false);
create table public.user_roll_luck_rarity_mult(player_id uuid,active_until timestamptz);
create table public.private_feature_gems(
  name text primary key,metadata jsonb not null default '{}',affected_by_luck boolean not null default true,
  availability_mode text not null default 'always',description text
);
grant select on public.players,public.user_roll_luck_rarity_mult to service_role;
insert into public.players values
  ('00000000-0000-0000-0000-000000000001','One',false),
  ('00000000-0000-0000-0000-000000000002','Two',false);
insert into public.private_feature_gems(name) values ('Meteorite Peridot'),('error 404');
`);
await db.exec(await fs.readFile(new URL('../supabase/migrations/20260904145142_gemdle_daily_results.sql',import.meta.url),'utf8'));

const one='00000000-0000-0000-0000-000000000001';
const two='00000000-0000-0000-0000-000000000002';
const oldSpecimen=(gem_name,mutations,weight_multiplier,base)=>({
  version:1,gem_name,weight_multiplier,final_weight:weight_multiplier,mutations,
  badges:[],contributions:{gem:base,weight:2,mutations:3},overall_rarity:base*6
});
await db.exec('set role service_role');
await db.query('select public.save_gemdle_result($1,$2,$3)',[
  one,'2026-09-04T12:00:00Z',JSON.stringify(oldSpecimen('Meteorite Peridot',[{id:'celestial',name:'Celestial'}],.8,100))
]);
await db.query('select public.save_gemdle_result($1,$2,$3)',[
  two,'2026-09-04T12:00:00Z',JSON.stringify(oldSpecimen('error 404',[{id:'balanced',name:'Balanced'},{id:'corrupted',name:'Corrupted'},{id:'chaotic',name:'Chaotic'}],.5,10))
]);
await db.exec('reset role');

const migration=await fs.readFile(new URL('../supabase/migrations/20261006082544_gemdle_classification_rarity_bonuses.sql',import.meta.url),'utf8');
await db.exec(migration);
const sqlTags=(await db.query('select gem_name,primary_classification,semantic_tags from gemdle_private.gem_tags')).rows
  .sort((a,b)=>a.gem_name.localeCompare(b.gem_name));
const edgeTags=Object.entries(GEMDLE_GEM_TAGS).map(([gem_name,tags])=>({
  gem_name,primary_classification:tags.primary,semantic_tags:[...tags.semantic]
})).sort((a,b)=>a.gem_name.localeCompare(b.gem_name));
assert.equal(sqlTags.length,296);
assert.deepEqual(sqlTags,edgeTags);
const parityCases=[
  [oldSpecimen('Solarion',[{name:'Cosmic'},{name:'Lit'},{name:'Heated'},{name:'Frozen'}],.5,10),{}],
  [oldSpecimen('Amber',[{name:'Alive'},{name:'Fossilised'}],1,10),{}],
  [oldSpecimen('Aquamarine',[{name:'Fake'},{name:'Aquatic'}],3.004,10),{}],
  [oldSpecimen('Core Sample',[{name:'Small'},{name:'Big'},{name:'Titanic'},{name:'Edible'},{name:'Moldy'},{name:'Rotten'}],.54,10),
    {affected_by_luck:false,availability_mode:'date_range',metadata:{deepcore_stage:null,creator:'@author'}}]
];
for(const [specimenInput,gemInput] of parityCases){
  const edge=scoreSpecimen(gemInput,specimenInput);
  const sql=(await db.query('select gemdle_private.classify_specimen($1::jsonb,$2::jsonb) scored',[JSON.stringify(specimenInput),JSON.stringify(gemInput)])).rows[0].scored;
  assert.deepEqual(sql.gem_tags,edge.gem_tags);
  assert.deepEqual(sql.classifications,edge.classifications);
  assert.ok(Math.abs(sql.classification_bonus-edge.classification_bonus)<1e-12);
  assert.ok(Math.abs(sql.overall_rarity-edge.overall_rarity)<1e-10);
}
let rows=(await db.query('select player_id,gemdle_date,rolled_at,specimen,overall_rarity from public.gemdle_results order by player_id')).rows;
assert.equal(rows.length,2);
assert.equal(rows[0].overall_rarity,708);
assert.equal(rows[0].specimen.specimen_rarity,600);
assert.deepEqual(rows[0].specimen.classifications.filter(x=>x.bonus>0).map(x=>x.name),['Written in the Stars']);
assert.ok(!rows[0].specimen.classifications.some(x=>x.name==='Celestial Alignment'));
assert.equal(rows[0].specimen.gem_name,'Meteorite Peridot');
assert.equal(rows[0].specimen.weight_multiplier,.8);
assert.equal(rows[0].specimen.mutations[0].name,'Celestial');
assert.ok(Math.abs(rows[1].overall_rarity-141)<1e-10);
assert.deepEqual(rows[1].specimen.classifications.filter(x=>x.bonus>0).map(x=>x.name),['Perfectly Balanced','Corrupted Alignment','Perfect Chaos','Bare Minimum']);

const firstPass=structuredClone(rows);
await db.exec(`
with rescored as (
  select r.id,gemdle_private.classify_specimen(r.specimen,to_jsonb(g)) scored
  from public.gemdle_results r left join public.private_feature_gems g on g.name=r.specimen->>'gem_name'
)
update public.gemdle_results r set specimen=r.specimen||s.scored,
  overall_rarity=(s.scored->>'overall_rarity')::double precision
from rescored s where s.id=r.id;
`);
rows=(await db.query('select player_id,gemdle_date,rolled_at,specimen,overall_rarity from public.gemdle_results order by player_id')).rows;
assert.deepEqual(rows,firstPass);

const audit=(await db.query(`select count(*)::int total,
  count(*) filter(where original_overall_rarity is distinct from recalculated_overall_rarity)::int changed
  from gemdle_private.classification_backfill_audit`)).rows[0];
assert.deepEqual(audit,{total:2,changed:2});
await db.exec('set role authenticated');
await assert.rejects(db.exec('select * from gemdle_private.gem_tags'),/permission denied/);
await db.close();
console.log('PASS: SQL/Edge map and rule parity, exact override, additive scoring, full historical backfill, preserved RNG fields and second-pass idempotency');
