import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../index.html");
const chat = read("../src/backend/chat.js");
const rareRolls = read("../src/backend/rareRolls.js");
const shell = read("../src/ui/shell.js");
const chances = read("../src/logic/chances.js");
const migration = read("../supabase/migrations/20260921020918_raise_mutation_rare_roll_cutoff_to_10b.sql");
const marketExclusionMigration = read("../supabase/migrations/20260921021800_exclude_market_gems_from_rare_rolls.sql");
const baseDetailsMigration = read("../supabase/migrations/20260921023523_add_base_rare_roll_luck_and_serial.sql");

assert.ok(page.indexOf('id="rareRollsCard"') < page.indexOf('id="section-roll-stage"'));
assert.match(page, /Base rarity[\s\S]*1 in 100M\+/);
assert.match(page, /Mutation effective[\s\S]*1 in 10B\+/);
assert.doesNotMatch(chat, /global_chat_announcements|get_rare_roll_chat_history/);
assert.doesNotMatch(shell, /chatTabRare|chatRareBadge|>Rare Rolls</);
assert.match(rareRolls, /table: "global_chat_announcements"/);
const loadFunction = rareRolls.slice(
  rareRolls.indexOf("export async function loadRareRolls"),
  rareRolls.indexOf("export function subscribeToRareRolls")
);
assert.match(loadFunction, /get_rare_roll_chat_history/);
assert.doesNotMatch(loadFunction, /\.from\("global_chat_announcements"\)/);
assert.match(rareRolls, /kind: ids\.length \? "mutation" : "base"/);
assert.match(chances, /RARE_ROLL_BASE_THRESHOLD = 100_000_000/);
assert.match(chances, /RARE_ROLL_EFFECTIVE_THRESHOLD = 10_000_000_000/);
assert.match(migration, /not v_has_mutations and new\.rarity >= 100000000/);
assert.match(migration, /v_has_mutations and v_effective_rarity >= 10000000000/);
assert.match(marketExclusionMigration, /from public\.rare_roll_chat_events e/);
assert.doesNotMatch(marketExclusionMigration, /inventory_gems|inventory_rows|union all/i);
assert.match(baseDetailsMigration, /luck_at_roll numeric/);
assert.match(baseDetailsMigration, /serial_number bigint/);

console.log("Rare Rolls card separation checks passed.");
