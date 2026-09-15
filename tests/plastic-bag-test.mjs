import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { equipmentTotals } from '../supabase/functions/roll/equipmentRules.js';
import { isRequirementComplete } from '../src/logic/crafting.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const totals = equipmentTotals([
  { category: 'pickaxe', equipment_id: 'celestial-pickaxe' },
  { category: 'bag', equipment_id: 'plastic-shopping-bag', weight_multiplier_bonus: 1.55 }
]);
assert.equal(totals.weightMultiplier, 3.05, 'Plastic Shopping Bag retains its additive +155% bonus');

const requirement = { type: 'equipment', equipmentId: 'omnidimensional-vault' };
const recipe = { id: 'plastic-shopping-bag', requirements: [requirement] };
assert.equal(isRequirementComplete({ progress: {} }, recipe, requirement, 0, {
  equipment: [{ id: 'dimensional-vault' }]
}), true, 'legacy Dimensional Vault owners remain eligible');
assert.equal(isRequirementComplete({ progress: {} }, recipe, requirement, 0, {
  equipment: [{ id: 'unrelated-bag' }]
}), false);

const shop = read('../boosts/boosts.js');
assert.match(shop, /Number\(offer\.price\) > 0 && Number\(offer\.price\) < 1 \? 2 : 0/,
  'sub-dollar daily offers retain cents');

const migration = read('../supabase/migrations/20260915010109_fix_plastic_bag_catalog.sql');
assert.match(migration, /'plastic-bag',[\s\S]*?'material',[\s\S]*?0\.10/,
  'Plastic Bag is registered as a backend material and remains a 10¢ offer');
assert.match(migration, /'material',[\s\S]*?1,[\s\S]*?1,[\s\S]*?1,[\s\S]*?false/,
  'the inert material uses constraint-safe tier, effect, and duration values');
assert.match(migration, /purchasable = false/);
assert.match(migration, /shop_price = null/);

const passive = read('../src/data/equipmentPassives.js');
assert.match(passive, /preserve ordinary crafting materials/);
assert.match(passive, /Every 67th genuine roll has a 1\/67 chance/);

console.log('Plastic Bag catalog, price, crafting prerequisite, bonus, conservation copy, and marker coverage passed.');
