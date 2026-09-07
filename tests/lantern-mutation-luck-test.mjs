// Lanterns grant Mutation Luck (a mutation-chance multiplier) instead of Roll
// Speed, gated behind a tier-5+ pickaxe. This asserts the change stays wired
// across the recipe data, client stats/crafting, the migration, the craft Edge
// Function, and the roll Edge Function.
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const recipes = read("src/data/recipes.js");
const stats = read("src/logic/playerStats.js");
const crafting = read("crafting/crafting.js");
const migration = read("supabase/migrations/20260908000000_lantern_mutation_luck.sql");
const roll = read("supabase/functions/roll/index.ts");
const craftFn = read("supabase/functions/craft-recipe/index.ts");

// ── Recipes: lanterns give mutationLuck, none give rollSpeed anymore ───────
// mutationLuck is used only by the 10 lantern tiers.
assert.equal((recipes.match(/mutationLuck:/g) || []).length, 10,
  "all 10 lantern tiers must grant mutationLuck");
const lanternSection = recipes.slice(
  recipes.indexOf('id: "dim-lantern"'),
  recipes.indexOf('id: "singularity-lantern"') + 400
);
assert.doesNotMatch(lanternSection, /rollSpeed:/, "lanterns must no longer grant rollSpeed");
assert.match(recipes, /type: "equipment-min-tier", category: "pickaxe", tier: 5/,
  "the first lantern must require a tier-5+ pickaxe");

// ── Client: stats + crafting understand mutationLuck and the tier gate ─────
assert.match(stats, /mutationLuck: 1/, "playerStats must seed mutationLuck");
assert.match(stats, /stats\.mutationLuck \+= equipment\.bonus\.mutationLuck/,
  "playerStats must aggregate equipment mutationLuck");
assert.match(crafting, /\["mutationLuck", "Mutation luck"\]/, "crafting must label mutation luck");
assert.match(crafting, /requirement\.type === "equipment-min-tier"/,
  "crafting readiness must handle the tier gate");
assert.match(crafting, /case "equipment-min-tier"/, "crafting must describe the tier gate");

// ── Migration: column + requirement + stored bonus ────────────────────────
assert.match(migration, /add column if not exists mutation_luck_bonus/,
  "must add the mutation_luck_bonus column to player_equipment");
assert.match(migration, /v_req->>'type'='equipment-min-tier'/,
  "craft RPC must enforce the tier requirement");
assert.match(migration, /tier>=coalesce\(\(v_req->>'tier'\)::integer,1\)/,
  "tier requirement must compare against owned equipment tier");
assert.match(migration, /\(v_bonus->>'mutationLuck'\)::double precision/,
  "craft RPC must store the mutationLuck bonus");

// ── Roll Edge Function: reads + applies equipment mutation luck ────────────
assert.match(roll, /mutation_luck_bonus,/, "roll must select mutation_luck_bonus");
assert.match(roll, /let mutationLuckBonus =/, "roll must accumulate equipment mutation luck");
assert.match(roll, /mutationChanceMultiplier \*= 1 \+ mutationLuckBonus/,
  "roll must apply mutation luck to the mutation-chance multiplier");

// ── Craft Edge Function: enforces the gate + forwards the bonus ────────────
assert.match(craftFn, /requirement\.type === "equipment-min-tier"/,
  "craft function must gate on the minimum pickaxe tier");
assert.match(craftFn, /p_mutation_luck_bonus: Number\(bonus\.mutationLuck \?\? 0\)/,
  "craft function must forward the mutationLuck bonus");

console.log("lantern-mutation-luck-test passed");
