import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const sql=read("supabase/migrations/20260827024337_research_tree_v0140_beta.sql");
const roll=read("supabase/functions/roll/index.ts");
const features=read("supabase/functions/features/index.ts");
const ui=read("research-tree/research-tree.js");
const css=read("research-tree/research-tree.css");

const nodes=[...sql.matchAll(/^\('([^']+)','(root|mining|specimen|engineering|exploration)',/gm)];
assert.equal(nodes.length,98,"expected root plus 97 purchasable research nodes");
const costs=[...sql.matchAll(/^\('[^']+','(mining|specimen|engineering|exploration)',\d+,'[^']+','[^']*',(\d+),/gm)].map((m)=>Number(m[2]));
assert.equal(costs.reduce((sum,cost)=>sum+cost,0),1160,"research catalogue cost must remain 1,160 RP");
for(const branch of ["mining","specimen","engineering","exploration"]){
  assert(sql.includes(`'${branch}'`),`missing ${branch} branch`);
}

assert.match(sql,/unique \(player_id,source_type,source_key\)/);
assert.match(sql,/compile_research_effects_v014/);
assert.match(sql,/reset_research_tree_v014/);
assert.match(sql,/research-notes/);
assert.match(sql,/record_season_roll[\s\S]*season_xp_multiplier/);
assert.match(sql,/set enabled=true[\s\S]*where id='research-tree'/);

assert.match(roll,/player_research_effects\(/);
assert.match(roll,/effectiveInventoryCapacity/);
assert.match(roll,/researchNumber\("luck_multiplier"\)/);
assert.match(roll,/researchNumber\("mutation_chance_multiplier"\)/);
assert.match(roll,/researchNumber\("potion_strength_multiplier"\)/);
assert.doesNotMatch(roll,/award_research_points_v014|sync_research_sources_v014|purchase_research_node_v014/,
  "Roll must not write or synchronize research progression");
assert.equal((roll.match(/player_research_effects\(/g)||[]).length,1,
  "Roll should load one embedded compiled research row");

for(const action of ["research","research-purchase","research-reset"]){
  assert(features.includes(`a===\"${action}\"`),`missing ${action} action`);
}
assert.match(ui,/data-node/);
assert.match(ui,/resetConfirm/);
assert.match(css,/font-family: var\(--font\)/);
assert.match(css,/font-family: var\(--font-display\)/);
assert.match(css,/\.research-node\.owned/);
assert.doesNotMatch(css,/var\(--panel\)|var\(--muted\)|Arial/);
console.log("Research Tree v0.14.0 performance and integration tests passed.");
