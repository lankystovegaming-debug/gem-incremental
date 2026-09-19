import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEEP_SEA_GEMS, DEEP_SEA_TIMES, DEPTHS_REWARDS, NEPTUNE_RECIPE, NEPTUNE_STATS, tideTokensFor } from "../src/data/deepSea.js";

const sql=readFileSync(new URL("../supabase/migrations/20260919105814_deep_sea_limited_event.sql",import.meta.url),"utf8");
const roll=readFileSync(new URL("../supabase/functions/roll/index.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("../limited-events/deep-sea/deep-sea.js",import.meta.url),"utf8");
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
assert.match(page,/Stop Auto Roll before changing pools/);
for(const gem of ["prismarine fragment","ancient coin","pearl of the sea","sunken treasure","abyssal coral","trenchstone","leviathan scale","heart of the sea","neptune's tear","soul of the sea god"]){assert.ok(cutscenes.includes(gem),`missing ${gem} cutscene`);}
for(const token of ["cs-camera--track","cs-camera--plunge","cs-camera--dolly","cs-camera--surge","worldExitAt","revealPosition"]){assert.ok((cutscenes+cutsceneRenderer+cutsceneStyles).includes(token),`missing cinematic behavior ${token}`);}
assert.match(cutsceneRenderer,/definition\.focus === false/);
assert.match(cutsceneRenderer,/\.cs-camera-stage[^]*is-exiting/);
assert.match(cutsceneRenderer,/label === "Impossible" && gem\.rarity > 0/);

const requirementBlock=sql.match(/insert into public\.deep_sea_depth_requirements\(step,gem_name,quantity\) values([^;]+);/s)?.[1]??"";
const totals={};
for(const [,gem,qty] of requirementBlock.matchAll(/\(\d+,'([^']+)',(\d+)\)/g))totals[gem]=(totals[gem]??0)+Number(qty);
assert.deepEqual(totals,{Clay:42000,"Salt Crystal":19000,Seaweed:8000,"Sand Rock":3200,"Sea Salt Rock":1200,"Prismarine Fragment":450,"Ancient Coin":180,Pearl:70,"Pearl of the Sea":25,Nautilii:8,"Sunken Treasure":3,"Abyssal Coral":1});
console.log("Deep Sea event specification checks passed.");
