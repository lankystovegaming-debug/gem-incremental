import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PICKAXE_STATS,convergenceEchoGain,prepareEquipmentRoll,finishEquipmentRoll} from "../supabase/functions/roll/equipmentRules.js";
import {convergenceRecipes} from "../src/data/equipmentOverhaul.js";

assert.deepEqual(PICKAXE_STATS["convergence-pickaxe"],[32,3,1.5,5,1.75]);
assert.deepEqual(convergenceRecipes[0].reward.bonus,{luck:31,rollSpeed:2,mutationChance:.5,weightLuck:4,weightMultiplier:.75});
assert.deepEqual([1,50,100,1000,10000,100000,1000000,10000000,100000000,1000000000].map(convergenceEchoGain),[1,2,3,5,10,20,40,75,150,250]);

let context=prepareEquipmentRoll("convergence-pickaxe",{convergence:{echo:995,resonanceRolls:0,momentumCharges:1,surgeRolls:0,convergenceRolls:248}});
assert.equal(context.flags.convergence.oneBecomesMany,false);
let outcome=finishEquipmentRoll(context,{gem:{rarity:1000}});
assert.deepEqual(outcome.state.convergence,{echo:0,resonanceRolls:5,momentumCharges:1,surgeRolls:0,convergenceRolls:249});
context=prepareEquipmentRoll("convergence-pickaxe",outcome.state);
assert.equal(context.flags.convergence.oneBecomesMany,true);
assert.equal(context.flags.convergence.multiplier,1.5);
assert.deepEqual(context.stats,[48,3,2.25,7.5,2.625]);
outcome=finishEquipmentRoll(context,{gem:{rarity:1}});
assert.equal(outcome.state.convergence.echo,0,"resonance rolls must not generate Echo");
assert.equal(outcome.state.convergence.resonanceRolls,4);

context=prepareEquipmentRoll("convergence-pickaxe",{convergence:{echo:77,resonanceRolls:4,momentumCharges:0,surgeRolls:2,convergenceRolls:10}});
assert.equal(context.flags.convergence.surge,true);
assert.equal(context.flags.convergence.resonance,false);
assert.deepEqual(context.stats,[64,3,3,10,3.5]);
outcome=finishEquipmentRoll(context,{gem:{rarity:1e9}});
assert.equal(outcome.state.convergence.surgeRolls,1);
assert.equal(outcome.state.convergence.resonanceRolls,4,"Community Surge pauses resonance");
assert.equal(outcome.state.convergence.echo,77,"Community Surge does not stack Echo generation");

const migration=await readFile(new URL("../supabase/migrations/20261008040012_convergence_community_pickaxe.sql",import.meta.url),"utf8");
for(const token of ["'2026-10-08T16:00:00Z'","'2026-10-10T16:00:00Z'","'2026-10-17T16:00:00Z'","\"rare\":300000","\"epic\":2000000","\"mass\":3250000000","\"cash\":30000000000"]) assert.ok(migration.includes(token),token);
assert.match(migration,/convergence_private\.specimen_preview/);
assert.match(migration,/least\(\(e\.targets->>k\)::numeric/);
assert.match(migration,/donation_requests[\s\S]*primary key \(player_id, request_key\)/);
assert.match(migration,/automatic_consumption_protected/);
assert.match(migration,/momentum_charges=least\(3/);
assert.match(migration,/after update of total_rolls on public\.players/);
assert.doesNotMatch(migration,/convergence_award_momentum after update of equipment_genuine_rolls/);
assert.match(migration,/contribution_percent numeric/);
assert.match(migration,/grant execute on function public\.roll_route_result[\s\S]*to service_role/);

const roll=await readFile(new URL("../supabase/functions/roll/index.ts",import.meta.url),"utf8");
assert.match(roll,/p_convergence_bonuses: convergenceBonuses/);
assert.match(roll,/for \(let bonusIndex = 0; bonusIndex < 4/);
assert.match(roll,/genuine_roll:false/);
assert.match(roll,/roll_number:null/);
assert.match(roll,/requiredFreeSlots:5/);

const page=await readFile(new URL("../crafting/convergence/index.html",import.meta.url),"utf8");
const ui=await readFile(new URL("../crafting/convergence/convergence.js",import.meta.url),"utf8");
for(const id of ["countdown","requirements","communityContributors","communityCp","candidateSearch","candidateRarity","donateGems","cashForm","leaderboard","autoCraftToggle","claimButton","activateSurge"]) assert.match(page,new RegExp(`id="${id}"`));
assert.match(ui,/previewConvergenceDonation/);assert.match(ui,/crypto\.randomUUID/);assert.match(page,/cannot be refunded/);

console.log("Convergence rules, event contract, roll provenance and responsive UI checks passed.");
