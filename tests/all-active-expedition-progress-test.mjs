import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20260904100154_advance_all_active_expeditions.sql", import.meta.url), "utf8");
// Extract actual independent SQL branches, not a separate copy of the routing.
const branches = [...sql.matchAll(/if exists \(\s*select 1 from public\.(\w+)\s*where ([\s\S]*?)\) then\s*perform public\.(\w+)\(p_player_id, p_payload\);(?:\s*else\s*perform public\.(\w+)\(p_player_id, p_payload\);)?\s*end if;/g)];
assert.equal(branches.length, 3);
assert.doesNotMatch(sql, /\belsif\b|\breturn\s*;/i);
assert.match(sql, /set search_path = ''/);
assert.match(sql, /from public, anon, authenticated/);
assert.match(sql, /to service_role/);
assert.deepEqual(branches.map(b => b[3]), [
  "record_volcanic_depth_roll", "record_crystal_cavern_roll",
  "record_abandoned_mine_hell_roll"
]);
for (let mask = 0; mask < 8; mask++) {
  for (const mode of ["normal", "hell"]) {
    const active = {
      volcanic_depth_runs: Boolean(mask & 1),
      crystal_cavern_runs: Boolean(mask & 2),
      abandoned_mine_runs: Boolean(mask & 4)
    };
    const calls = [];
    for (const [, table, predicate, target, fallback] of branches) {
      assert.match(predicate, /player_id = p_player_id/);
      assert.match(predicate, /status = 'active'/);
      if (active[table] && (!predicate.includes("mode = 'hell'") || mode === "hell")) calls.push(target);
      else if (fallback) calls.push(fallback);
    }
    assert.equal(calls.includes("record_volcanic_depth_roll"), active.volcanic_depth_runs);
    assert.equal(calls.includes("record_crystal_cavern_roll"), active.crystal_cavern_runs);
    assert.equal(calls.includes("record_abandoned_mine_hell_roll"), active.abandoned_mine_runs && mode === "hell");
    assert.equal(new Set(calls).size, calls.length);
  }
}
console.log("All-active expedition routing checks passed.");
