import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../supabase/functions/features/index.ts', import.meta.url),
  'utf8',
);

assert.match(
  source,
  /a==="achievement-claim"[\s\S]*?ctx\.supabaseAdmin\.rpc\("claim_achievement_reward_v013"/,
);
assert.match(
  source,
  /a==="achievement-milestone-claim"[\s\S]*?ctx\.supabaseAdmin\.rpc\("claim_achievement_milestone_v013"/,
);
assert.doesNotMatch(
  source,
  /ctx\.supabase\.rpc\("claim_achievement_(?:reward|milestone)_v013"/,
);

console.log('Achievement claim service-client regression checks passed.');
