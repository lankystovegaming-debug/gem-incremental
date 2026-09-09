import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../mutation-index/index.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../mutation-index/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../mutation-index/mutation-index.css', import.meta.url), 'utf8');

assert.match(script, /get_gem_index_mutation_catalog_v3/);
assert.match(script, /get_public_mutation_catalog/);
assert.match(script, /from\("game_mutations"\)/);
assert.match(script, /maximumFractionDigits:max/);
assert.doesNotMatch(script, /formatHugeDecimal/);
assert.match(script, /chance-desc/);
assert.match(script, /multiplier-desc/);
assert.match(script, /location\.reload\(\)/);

for (const id of ['mutationCount','visibleCount','rarestMutation','largestMultiplier','mutationSearch','mutationSort','clearSearch','catalogStatus','list']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(html, /aria-busy="true"/);
assert.match(css, /@media\(max-width:620px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Mutation Index catalog, controls, exact formatting, and responsive-state checks passed.');
