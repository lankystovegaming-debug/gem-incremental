import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20260829040000_hell_artifact_passives.sql");
const roll = read("supabase/functions/roll/index.ts");

for (const [key, field, value] of [
  ["charred-miners-tag","bonusProgressMultiplier","1.03"],
  ["melted-chain-link","doomGainMultiplier",".97"],
  ["crimson-geode","mutationChanceMultiplier","1.03"],
  ["extinguished-hell-lantern","artifactChanceMultiplier","1.03"],
  ["doomstone","gemValueMultiplier","1.03"],
  ["eye-bottomless-mine","luckBonus",".05"]
]) {
  assert.match(sql, new RegExp(key));
  assert.match(sql, new RegExp(`${field}'.*${value}`));
}
assert.match(sql,/from public\.museum_artifact_registrations/);
assert.doesNotMatch(sql,/incident.*mitigation/i);
assert.match(roll,/player_expedition_artifact_effects/);
assert.match(roll,/luck \+= expeditionArtifactLuckBonus/);
assert.match(roll,/mutationChanceMultiplier \*= expeditionArtifactMutationMultiplier/);
assert.match(roll,/expeditionArtifactGemValueMultiplier/);

console.log("Hell artifact passive tests passed.");
