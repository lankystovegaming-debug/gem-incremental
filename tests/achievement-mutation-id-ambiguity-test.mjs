import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260830122339_fix_achievement_mutation_id_ambiguity.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(
  migration,
  /count\(distinct mutations\.expanded_mutation_id\)/i
);
assert.match(
  migration,
  /as mutations\(expanded_mutation_id\)/i
);
assert.doesNotMatch(migration, /count\(distinct mutation_id\)/i);
assert.match(migration, /v_value numeric := greatest\(0, coalesce\(p_value, 0\)\)/i);
assert.match(migration, /v_target numeric := greatest\(1, coalesce\(p_target, 1\)\)/i);
assert.match(
  migration,
  /select coalesce\(\(\s*select profile\.prestige[\s\S]*?\), 0\) into v/i
);
assert.match(
  migration,
  /specimen_snapshot->>'serial_number' ~ '\^\[0-9\]\{1,18\}\$'/i
);
assert.doesNotMatch(
  migration,
  /nullif\(specimen_snapshot->>'serial_number', ''\)::bigint/i
);
assert.match(
  migration,
  /where public\.private_feature_progress\.current_value < excluded\.current_value/i
);
assert.match(
  migration,
  /revoke all on function public\.achievement_set_progress_v013\([\s\S]*?from public, anon, authenticated/i
);
assert.match(
  migration,
  /revoke all on function public\.refresh_player_achievements_v013\(uuid\)[\s\S]*from public, anon, authenticated/i
);
assert.match(
  migration,
  /grant execute on function public\.refresh_player_achievements_v013\(uuid\)[\s\S]*to service_role/i
);

console.log("Achievement mutation ID ambiguity checks passed.");
