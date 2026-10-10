import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEEP_SEA_GEMS, DEEP_SEA_TIMES, DEPTHS_REWARDS, NEPTUNE_RECIPE, NEPTUNE_STATS, tideTokensFor } from "../src/data/deepSea.js";

const sql=readFileSync(new URL("../supabase/migrations/20260919105814_deep_sea_limited_event.sql",import.meta.url),"utf8");
const atomicFix=readFileSync(new URL("../supabase/migrations/20261008090000_deep_sea_atomic_roll_fixes.sql",import.meta.url),"utf8");
const roll=readFileSync(new URL("../supabase/functions/roll/index.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("../limited-events/deep-sea/deep-sea.js",import.meta.url),"utf8");
const main=readFileSync(new URL("../main.js",import.meta.url),"utf8");
const automation=readFileSync(new URL("../src/ui/globalAutomation.js",import.meta.url),"utf8");
const lightweightAutomation=readFileSync(new URL("../src/ui/autoRoll.js",import.meta.url),"utf8");
const shell=readFileSync(new URL("../src/ui/shell.js",import.meta.url),"utf8");
const eventsIndex=readFileSync(new URL("../limited-events/index.html",import.meta.url),"utf8");
const eventsListing=readFileSync(new URL("../limited-events/limited-events.js",import.meta.url),"utf8");
const cutscenes=readFileSync(new URL("../src/ui/cutsceneConfig.js",import.meta.url),"utf8");
const cutsceneRenderer=readFileSync(new URL("../src/ui/cutsceneScenes.js",import.meta.url),"utf8");
const cutsceneStyles=readFileSync(new URL("../src/ui/cutsceneScenes.css",import.meta.url),"utf8");

assert.equal(DEEP_SEA_GEMS.length,19);
assert.deepEqual(DEEP_SEA_GEMS.at(0),Object.freeze({...DEEP_SEA_GEMS.at(0)}));
assert.equal(DEEP_SEA_GEMS.at(0).name,"Water");
assert.equal(DEEP_SEA_GEMS.at(-1).name,"Soul of the Sea God");
assert.equal(Date.parse(DEEP_SEA_TIMES.endsAt)-Date.parse(DEEP_SEA_TIMES.startsAt),14*864e5);
assert.equal(Date.parse(DEEP_SEA_TIMES.redemptionEndsAt)-Date.parse(DEEP_SEA_TIMES.endsAt),7*864e5);
assert.equal(DEPTHS_REWARDS.length,30);
assert.equal(NEPTUNE_RECIPE.money,250000);
assert.equal(NEPTUNE_STATS.deepSeaRarityDivisor,10);
assert.equal(tideTokensFor(1),0);
assert.equal(tideTokensFor(1_000_000_000),3981);

for(const token of ["deep_sea_gems","deep_sea_commit_roll","clock_timestamp()","p_inventory_required","first_discovery","offering_charges","treasure_tonic_rolls","legacy_gem_name","3000000","total_rolls"]){
  assert.match(sql+roll,new RegExp(token));
}
assert.doesNotMatch(sql,/equipment_genuine_rolls/);
assert.match(roll,/rollDeepSeaGem/);
assert.match(roll,/batchExecution\.pool === "deep_sea" \? new Date\(\)/);
assert.match(roll,/random01\(\) < 1 \/ 2000[^]*random01\(\) < 1 \/ 100/);
assert.match(roll,/luck \+= 100000/);
assert.match(atomicFix,/create or replace function public\.roll_finalize_atomic/);
assert.match(atomicFix,/limit needed\s+for update/);
assert.match(atomicFix,/get diagnostics deleted_count = row_count/);
assert.ok(atomicFix.indexOf("deep_sea_commit_roll(")<atomicFix.indexOf("roll_route_result("),"Deep Sea economy work must precede routing inside the atomic coordinator");
assert.ok(atomicFix.indexOf("roll_route_result(")<atomicFix.indexOf("roll_commit_result("),"routing and final persistence must share the coordinator transaction");
assert.match(roll,/rpc\('roll_finalize_atomic'/);
assert.doesNotMatch(roll,/rpc\("deep_sea_commit_roll"/);
assert.doesNotMatch(roll,/rpc\("deep_sea_consume_abyssal"/);
assert.match(roll,/authoritative route[\s\S]*autoSellRequested = filterDecision\.sell/);
assert.match(atomicFix,/v_auto_sell := coalesce\(p_filter_sell, false\)[\s\S]*and not v_auto_deposited;/);
for(const source of [main,automation,lightweightAutomation]){
  assert.match(source,/invokeFunction\("roll", \{ batchSize: getSettings\(\)\.batchSize, pool: getSettings\(\)\.rollPool \}\)/,"Auto Roll must send the selected Deep Sea pool");
  assert.match(source,/deep_sea_event_ended[\s\S]*updateSettings\(\{ autoRoll: false, rollPool: "normal" \}\)/,"Auto Roll must stop safely when the Deep Sea event ends");
}
assert.match(shell,/page !== "roll"[\s\S]*import\("\.\.\/\.\.\/src\/ui\/globalAutomation\.js"\)/,"the Deep Sea page must load background Auto Roll");
assert.match(main,/data\.deepSea\?\.autoFed === "neptune"[\s\S]*type: "deep-sea-fed"/);
assert.match(automation,/data\.deepSea\?\.autoFed === "neptune"[\s\S]*sessionOutcome\.type = "deep-sea-fed"/);
assert.match(page,/Stop Auto Roll before changing pools/);
assert.match(page,/now>=target&&!phaseReloading/);
assert.match(page,/load\(\)\.finally/);
assert.match(eventsIndex,/href="\.\/deep-sea\/"/);
assert.ok(eventsIndex.indexOf("Deepcore Project")<eventsIndex.indexOf("<h2>Deep Sea<\/h2>"),"Deep Sea card must follow Deepcore");
assert.match(eventsListing,/deepSeaStatus/);
assert.doesNotMatch(eventsListing,/grid\.innerHTML/);
for(const gem of ["prismarine fragment","ancient coin","pearl of the sea","sunken treasure","abyssal coral","trenchstone","leviathan scale","heart of the sea","neptune's tear","soul of the sea god"]){assert.ok(cutscenes.includes(gem),`missing ${gem} cutscene`);}
for(const token of ["cs-camera--track","cs-camera--plunge","cs-camera--dive","cs-camera--surface-rise","worldExitAt","revealPosition"]){assert.ok((cutscenes+cutsceneRenderer+cutsceneStyles).includes(token),`missing cinematic behavior ${token}`);}
assert.match(cutsceneRenderer,/definition\.focus === false/);
assert.match(cutsceneRenderer,/\.cs-camera-stage[^]*is-exiting/);
assert.match(cutsceneRenderer,/label === "Impossible" && gem\.rarity > 0/);

const requirementBlock=sql.match(/insert into public\.deep_sea_depth_requirements\(step,gem_name,quantity\) values([^;]+);/s)?.[1]??"";
const totals={};
for(const [,gem,qty] of requirementBlock.matchAll(/\(\d+,'([^']+)',(\d+)\)/g))totals[gem]=(totals[gem]??0)+Number(qty);
assert.deepEqual(totals,{Clay:42000,"Salt Crystal":19000,Seaweed:8000,"Sand Rock":3200,"Sea Salt Rock":1200,"Prismarine Fragment":450,"Ancient Coin":180,Pearl:70,"Pearl of the Sea":25,Nautilii:8,"Sunken Treasure":3,"Abyssal Coral":1});
console.log("Deep Sea event specification checks passed.");
