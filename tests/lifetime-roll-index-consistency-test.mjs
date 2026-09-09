import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import recipes from '../src/data/recipes.js';

const requirements = recipes.flatMap((recipe) =>
  recipe.requirements.map((requirement) => ({ recipe: recipe.id, requirement }))
);

for (const id of [
  'jackpot-slot',
  'reality-shifter',
  'bedrock-pickaxe',
  'the-accelerator',
  'empyrean-pickaxe',
  'eternity-pickaxe'
]) {
  assert.ok(
    requirements.some((entry) => entry.recipe === id && entry.requirement.type === 'lifetime-rolls'),
    `${id} must use account lifetime rolls`
  );
}

assert.equal(
  requirements.some(({ requirement }) =>
    requirement.type === 'equipment-history' && requirement.metric === 'genuineRolls'
  ),
  false,
  'the post-overhaul mechanics counter must not be presented as lifetime progress'
);

const migration = readFileSync(
  new URL('../supabase/migrations/20260909124500_lifetime_rolls_and_index_achievement_consistency.sql', import.meta.url),
  'utf8'
);
assert.match(migration, /count\(distinct combination\.gem_name\)/);
assert.match(migration, /unnest\(coalesce\(combination\.mutation_ids/);
assert.match(migration, /sync_gem_index_achievements_v013/);

console.log('Lifetime-roll recipes and Gem Index achievement sources are consistent.');
