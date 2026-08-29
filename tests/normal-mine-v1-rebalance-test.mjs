import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync(new URL("../supabase/migrations/20260829034841_normal_abandoned_mine_v1_rebalance.sql",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../expeditions/expeditions.js",import.meta.url),"utf8");
const roll=fs.readFileSync(new URL("../supabase/functions/roll/index.ts",import.meta.url),"utf8");

for(const value of [100000,150000,250000,400000,600000,500000,750000,1000000,1250000,2000000,4000000,7500000])
  assert.match(migration,new RegExp(`then ${value}(?:\\D|$)`));
assert.match(migration,/v_run\.overdepth=0 and v_run\.depth=4[\s\S]*v_multiplier:=1\.25/);
assert.match(migration,/v_run\.overdepth=0 and v_run\.depth=7[\s\S]*v_multiplier:=1\.40/);
assert.match(migration,/normal_danger_exact numeric/);
assert.match(migration,/v_critical_cutoff:=\.928/);
assert.match(migration,/v_exact:=v_exact\+\(v_target_danger-v_exact\)\*\.95/);
assert.match(migration,/player_market_fee_rate[\s\S]*then \.95/);
assert.match(client,/formatMoney\(Number\(last\.valueLost\|\|0\)\)\} value lost/);
for(const passive of ["+2% additive Roll Speed","+3% Weight Luck","+5% Weight Multiplier","+3% normal gem sale value","10% relative reduction to Critical incident chance","+5% additive Luck","5% relative reduction to Danger gained from descending","+5% relative Expedition artifact chance","+5% additive Roll Speed","5% relative reduction to player-market transaction fees","×1.05 mutation chance","×1.05 final gem value"])
  assert.ok(client.includes(passive),`missing passive UI copy: ${passive}`);
for(const key of ["miners-lamp","surveyors-compass","silver-pick","vein-prism","clockwork-drill","black-geode","bedrock-crown"])
  assert.match(roll,new RegExp(`mineArtifacts\\.has\\("${key}"\\)`));
assert.doesNotMatch(migration,/abandoned_mine_hell/);

console.log("Normal Abandoned Mine V1 rebalancing checks passed.");
