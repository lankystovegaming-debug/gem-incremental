import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [panel, migration] = await Promise.all([
  readFile(new URL("../src/ui/devpanel.js", import.meta.url), "utf8"),
  readFile(
    new URL(
      "../supabase/migrations/20260828190000_maintenance_research_points.sql",
      import.meta.url
    ),
    "utf8"
  )
]);

assert.match(panel, /id="devResearchPoints"/);
assert.match(panel, /data-action="researchpoints"/);
assert.match(panel, /callDependency\("research_points"/);
assert.match(panel, /Enter 1 to 1,000,000 Research Points\./);

assert.match(migration, /security definer set search_path to ''/);
assert.match(migration, /code_improvement c where c\.user_id = v_actor/);
assert.match(migration, /elsif p_action = 'research_points' then/);
assert.match(migration, /perform public\.ensure_research_profile_v014\(v_target\)/);
assert.match(migration, /insert into public\.research_point_ledger/);
assert.match(migration, /source_type, source_key, amount/);
assert.match(migration, /points_available = points_available \+ v_research_points/);
assert.match(migration, /points_earned = points_earned \+ v_research_points/);
assert.match(migration, /insert into public\.dependency_log/);

console.log("devpanel research-points checks passed");
