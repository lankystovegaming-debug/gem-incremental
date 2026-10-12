import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { db } from "./deep-sea-database-test.mjs";

await db.exec(await readFile(new URL("../supabase/migrations/20261008090000_deep_sea_atomic_roll_fixes.sql",import.meta.url),"utf8"));
await db.exec(await readFile(new URL("../supabase/migrations/20261012063502_fix_neptune_inventory_deposit_and_auto_forge.sql",import.meta.url),"utf8"));
const uid="00000000-0000-0000-0000-000000000001";
const other="00000000-0000-0000-0000-000000000002";
const lease="00000000-0000-0000-0000-000000000003";
const one=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
const rpc=async(name,...args) => (await one(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) result`,args)).result;
await db.query("insert into public.players(id,money,inventory_capacity) values($1,1000000,100),($2,1000000,100)",[uid,other]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
async function phase(value="active"){
  const times=value==="active"?["-1 day","1 day","8 days"]:value==="redemption"?["-15 days","-1 day","6 days"]:["-30 days","-16 days","-9 days"];
  await db.query("update public.deep_sea_event_runs set starts_at=now()+$1::interval,ends_at=now()+$2::interval,redemption_ends_at=now()+$3::interval",times);
}
async function reset(){
  await db.exec("delete from deep_sea_private.roll_commits; delete from public.player_deep_sea_progress; delete from public.player_deep_sea_state; delete from public.player_equipment; delete from public.inventory_gems; delete from public.player_gem_mutation_combinations;");
  await db.query("update public.players set money=1000000,inventory_capacity=100 where id=$1",[uid]);
  await rpc("deep_sea_snapshot",uid);
  await phase();
}
async function inventory(name,n,{locked=false,museum=false,player=uid}={}){
  await db.query(`insert into public.inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,value,locked,museum_locked)
    select $1,$2,1000,1,1,1,1,1,1,$4,$5 from generate_series(1,$3::int)`,[player,name,n,locked,museum]);
}
async function fill(except=null){
  await db.query(`insert into public.player_deep_sea_progress(player_id,run_id,target,gem_name,quantity)
    select $1,'deep-sea-2026','neptune',gem_name,quantity-case when gem_name=$2 then 1 else 0 end
    from deep_sea_private.neptune_requirements() on conflict(player_id,run_id,target,gem_name) do update set quantity=excluded.quantity`,[uid,except]);
}
async function money(){return (await one("select money from public.players where id=$1",[uid])).money;}
async function owned(){return Boolean((await one("select neptune_owned from public.player_deep_sea_state where player_id=$1",[uid])).neptune_owned);}
async function roll(number,name="Clay",capacity=false){
  return rpc("deep_sea_commit_roll",uid,lease,number,{gem_name:name},false,capacity);
}

await reset();
await fill("Clay");
await inventory("Clay",3);
await inventory("Clay",1,{locked:true});
await inventory("Clay",1,{museum:true});
await inventory("Clay",1,{player:other});
let result=await rpc("deep_sea_deposit_neptune",uid);
assert.equal(result.deposited,1,"only the outstanding deficit is consumed");
assert.equal(await owned(),false,"depositing is not consent to auto forge");
assert.equal(await money(),1000000);
assert.equal((await one("select count(*)::int n from public.inventory_gems where player_id=$1",[uid])).n,4);
assert.equal((await rpc("deep_sea_deposit_neptune",uid)).deposited,0,"repeat deposits cannot consume surplus");
await assert.rejects(rpc("deep_sea_deposit_neptune",other),/not_authorized/);
await assert.rejects(rpc("deep_sea_set_neptune_auto_craft",other,true),/not_authorized/);
await assert.rejects(rpc("deep_sea_neptune_progress",other),/not_authorized/);

await db.query(`insert into public.player_equipment(player_id,equipment_id,category,equipped) values($1,'old-pickaxe','pickaxe',true)`,[uid]);
result=await rpc("deep_sea_set_neptune_auto_craft",uid,true);
assert.equal(result.state.neptune_owned,true);
assert.equal(await money(),750000);
assert.equal((await one("select equipped from public.player_equipment where player_id=$1 and equipment_id='neptune'",[uid])).equipped,false);
assert.equal((await one("select equipped from public.player_equipment where player_id=$1 and equipment_id='old-pickaxe'",[uid])).equipped,true);
assert.equal(result.state.neptune_auto_craft,false);
assert.equal(result.progress.length,9,"completed counters remain visible");
await rpc("deep_sea_set_neptune_auto_craft",uid,true);
await rpc("deep_sea_neptune_progress",uid);
assert.equal(await money(),750000,"forging is exactly once");
await assert.rejects(rpc("deep_sea_craft_neptune",uid),/already_owned/);

await reset();
await inventory("Clay",2,{locked:true});
await inventory("Clay",2,{museum:true});
assert.equal((await rpc("deep_sea_deposit_neptune",uid)).deposited,0,"protected rows cannot be deposited");
await rpc("deep_sea_set_neptune_auto_craft",uid,true);
await inventory("Clay",4);
result=await rpc("deep_sea_deposit_neptune",uid);
assert.equal(result.deposited,4,"incomplete inventory can be added without all recipe materials");
assert.equal(result.state,undefined);
assert.equal(result.snapshot.state.neptune_owned,false);

await reset();
await fill("Clay");
await inventory("Clay",1);
await db.query("update public.players set money=0 where id=$1",[uid]);
await assert.rejects(rpc("deep_sea_craft_neptune",uid),/insufficient_funds/);
assert.equal((await one("select count(*)::int n from public.inventory_gems where player_id=$1",[uid])).n,1,"failed manual craft restores consumed gems");
await db.query("update public.players set money=250000 where id=$1",[uid]);
result=await rpc("deep_sea_craft_neptune",uid);
assert.equal(result.state.neptune_owned,true);
assert.equal(await money(),0);
assert.equal((await one("select equipped from public.player_equipment where player_id=$1 and equipment_id='neptune'",[uid])).equipped,true);

await reset();
await fill("Clay");
await rpc("deep_sea_set_feed",uid,"neptune",true);
await rpc("deep_sea_set_neptune_auto_craft",uid,true);
let committed=await roll(1);
assert.equal(committed.firstDiscovery,true);
assert.equal(committed.fed,null,"the first discovery must remain in inventory");
assert.equal(await owned(),false);
await db.query("insert into public.player_gem_mutation_combinations(player_id,gem_name,combination_key) values($1,'Clay','none')",[uid]);
committed=await roll(2);
assert.equal(committed.fed,"neptune");
assert.equal(await owned(),true,"the final future-roll deposit auto forges inside the roll transaction");
assert.equal(await money(),749990,"two $5 rolls and one $250k craft");
assert.deepEqual(await roll(2),committed,"retrying a committed subroll is idempotent");
assert.equal(await money(),749990);

await reset();
await fill("Clay");
await rpc("deep_sea_set_feed",uid,"neptune",true);
await rpc("deep_sea_set_neptune_auto_craft",uid,true);
await db.query("insert into public.player_gem_mutation_combinations(player_id,gem_name,combination_key) values($1,'Clay','none')",[uid]);
await db.exec("begin");
await roll(3);
assert.equal(await owned(),true);
await db.exec("rollback");
assert.equal(await owned(),false,"a failed outer roll transaction rolls the forge back too");
assert.equal(await money(),1000000);
assert.equal((await one("select quantity from public.player_deep_sea_progress where player_id=$1 and target='neptune' and gem_name='Clay'",[uid])).quantity,499);

await reset();
await fill("Clay");
await rpc("deep_sea_set_feed",uid,"neptune",true);
await rpc("deep_sea_set_neptune_auto_craft",uid,true);
await db.query("update public.players set inventory_capacity=0 where id=$1",[uid]);
await assert.rejects(roll(4,"Clay",true),/inventory_full/);
assert.equal(await owned(),false);
assert.equal(await money(),1000000,"full-inventory rejection leaves both roll and forge charges untouched");
await db.query("insert into public.player_gem_mutation_combinations(player_id,gem_name,combination_key) values($1,'Clay','none')",[uid]);
assert.equal((await roll(5,"Clay",true)).fed,"neptune","a useful duplicate can feed and forge even with full inventory");
assert.equal(await owned(),true);

await reset();
await fill();
await db.query("update public.players set money=249999 where id=$1",[uid]);
await rpc("deep_sea_set_neptune_auto_craft",uid,true);
assert.equal(await owned(),false);
await phase("redemption");
await db.query("update public.players set money=250000 where id=$1",[uid]);
assert.equal((await rpc("deep_sea_neptune_progress",uid)).state.neptune_owned,true,"viewing progress retries an opted-in forge after gaining cash, including redemption");
await reset();
await fill();
await db.query("update public.player_deep_sea_state set neptune_auto_craft=true where player_id=$1",[uid]);
await phase("archived");
assert.equal((await rpc("deep_sea_neptune_progress",uid)).state.neptune_owned,false);
await assert.rejects(rpc("deep_sea_deposit_neptune",uid),/wrong_phase/);
await assert.rejects(rpc("deep_sea_set_neptune_auto_craft",uid,true),/wrong_phase/);

const privileges=await one(`select has_function_privilege('anon','public.deep_sea_deposit_neptune(uuid)','execute') anon_deposit,
  has_function_privilege('authenticated','deep_sea_private.finish_neptune(uuid,boolean)','execute') direct_forge`);
assert.equal(privileges.anon_deposit,false);
assert.equal(privileges.direct_forge,false);
await db.close();
console.log("Neptune inventory top-ups, auto forge, ownership, atomicity and lifecycle checks passed.");
