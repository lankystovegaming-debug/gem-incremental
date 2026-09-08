// Preserve the earlier Lantern migration's compatibility while the consolidated
// overhaul supplies the final values, formulas and recipes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import recipes from '../src/data/recipes.js';
import {getPlayerStats} from '../src/logic/playerStats.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const lanterns=recipes.filter(r=>r.category==='lantern');
assert.equal(lanterns.length,10);
assert.deepEqual(lanterns.map(r=>Number((1+r.reward.bonus.mutationChance).toFixed(3))),[1.02,1.035,1.05,1.07,1.09,1.115,1.14,1.17,1.205,1.25]);
assert.ok(lanterns.every(r=>!r.reward.bonus.rollSpeed));
assert.ok(!lanterns[0].requirements.some(r=>r.type==='equipment-min-tier'),'locked overhaul starter recipe supersedes the previous gate');
const stats=getPlayerStats({equipment:[{id:'eternity-pickaxe',category:'pickaxe',equipped:true},{id:'singularity-lantern',category:'lantern',equipped:true,bonus:{mutationChance:.25}}]});
assert.equal(stats.mutationLuck,1.375);assert.equal(stats.mutationChance,1.375);assert.equal(stats.rollSpeed,3);
const legacy=getPlayerStats({equipment:[{category:'lantern',equipped:true,bonus:{mutationLuck:.25}}]});assert.equal(legacy.mutationChance,1.25);
const crafting=read('crafting/crafting.js');assert.match(crafting,/case "equipment-min-tier"/);assert.match(crafting,/requirement\.type === "equipment-min-tier"/);
const previous=read('supabase/migrations/20260908000000_lantern_mutation_luck.sql');assert.match(previous,/add column if not exists mutation_luck_bonus/);
const overhaul=read('supabase/migrations/20260908000001_equipment_overhaul.sql');assert.match(overhaul,/v_req->>'type'='equipment-min-tier'/);assert.match(overhaul,/new.mutation_chance_bonus:=/);
const roll=read('supabase/functions/roll/index.ts');assert.match(roll,/mutation_chance_bonus,/);assert.match(roll,/mutationChanceMultiplier \*= equipmentStats.mutation/);assert.doesNotMatch(roll,/let mutationLuckBonus/);
const craft=read('supabase/functions/craft-recipe/index.ts');assert.match(craft,/requirement\.type === "equipment-min-tier"/);assert.doesNotMatch(craft,/p_mutation_luck_bonus:/,'legacy multi-argument RPC does not accept the added argument; redesigned rewards use the canonical SQL function');
console.log('Lantern merge compatibility: locked multipliers, legacy alias, preserved tier requirement support, and no double-counting passed.');
