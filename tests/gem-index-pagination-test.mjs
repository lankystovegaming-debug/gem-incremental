import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../gem-index/index.js', import.meta.url), 'utf8');
const start = source.indexOf('async function loadCombinations');
const end = source.indexOf('\nfunction exactEntryChance', start);
const loader = source.slice(start, end);

assert.match(loader, /const pageSize = 1000/);
assert.match(loader, /\.order\("id", \{ ascending: true \}\)/);
assert.match(loader, /\.range\(from, from \+ pageSize - 1\)/);
assert.match(loader, /if \(\(page\?\.length \?\? 0\) < pageSize\) break/);
assert.doesNotMatch(loader, /const \{ data, error \} = await supabase/);

console.log('Gem Index discovery pagination checks passed.');
