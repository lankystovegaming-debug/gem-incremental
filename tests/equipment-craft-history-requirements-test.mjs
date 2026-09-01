import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(
  "supabase/migrations/20260901143112_fix_equipment_craft_history_requirements.sql",
  "utf8",
);

assert.match(sql, /select money,total_rolls,best_rare_natural_weight_100k,best_rare_natural_weight_1m/);
assert.match(sql, /v_req->>'type'='lifetime-rolls'/);
assert.match(sql, /v_total_rolls,0\)<coalesce\(\(v_req->>'rolls'\)::bigint,0\)/);
assert.match(sql, /v_req->>'type'='roll-history-condition'/);
assert.match(sql, /minimumRarity'[\s\S]*>=1000000/);
assert.match(sql, /minimumWeightMultiplier/);
assert.match(sql, /then coalesce\(v_best_1m,0\) else coalesce\(v_best_100k,0\)/);
assert.match(sql, /for update/);
assert.match(sql, /grant execute on function public\.craft_equipment_recipe\(text\) to authenticated,service_role/);

console.log("equipment craft history requirement checks passed");
