import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260825052803_persist_rare_roll_chat_events.sql",
    import.meta.url
  ),
  "utf8"
);

const effectiveThresholdMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260920235514_move_rare_rolls_out_of_chat.sql",
    import.meta.url
  ),
  "utf8"
);

const chanceLogic = readFileSync(
  new URL("../src/logic/chances.js", import.meta.url),
  "utf8"
);

const rareRollBackend = readFileSync(
  new URL("../src/backend/rareRolls.js", import.meta.url),
  "utf8"
);

assert.match(migration, /create table if not exists public\.rare_roll_chat_events/);
assert.match(migration, /create unique index if not exists rare_roll_chat_events_source_unique/);
assert.match(migration, /create or replace function public\.record_roll_leaderboard_entry/);
assert.match(migration, /insert into public\.rare_roll_chat_events/);
assert.match(migration, /p_rarity >= 1000000/);
assert.match(migration, /v_effective_rarity >= 100000000/);
assert.match(migration, /'history',\s*v_history_id/);
assert.match(migration, /on conflict \(source_type, source_id\).*do nothing/s);
assert.match(migration, /'rareChatEventId', v_rare_event_id/);
assert.match(effectiveThresholdMigration, /cardinality\(coalesce\(new\.mutation_ids/);
assert.match(effectiveThresholdMigration, /coalesce\(new\.effective_rarity, 0\) >= 10000000000/);
assert.match(effectiveThresholdMigration, /after insert or update of rarity, effective_rarity, mutation_ids/);
assert.match(effectiveThresholdMigration, /v_effective_rarity >= 10000000000/);
assert.match(effectiveThresholdMigration, /not v_has_mutations and new\.rarity >= 100000000/);
assert.match(effectiveThresholdMigration, /coalesce\(effective_rarity, 0\) < 10000000000/);
assert.match(chanceLogic, /RARE_ROLL_EFFECTIVE_THRESHOLD = 10_000_000_000/);
assert.match(chanceLogic, /RARE_ROLL_BASE_THRESHOLD = 100_000_000/);
assert.match(rareRollBackend, /RARE_ROLL_EFFECTIVE_THRESHOLD/);
assert.match(rareRollBackend, /row\.kind === "mutation"\s*\? row\.effectiveRarity >= RARE_ROLL_EFFECTIVE_THRESHOLD\s*:\s*row\.rarity >= RARE_ROLL_BASE_THRESHOLD/);

console.log("Rare-roll chat event persistence checks passed.");
