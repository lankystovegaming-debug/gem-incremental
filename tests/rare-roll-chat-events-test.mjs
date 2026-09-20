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
    "../supabase/migrations/20260920031734_raise_mutation_announcement_threshold_to_1b.sql",
    import.meta.url
  ),
  "utf8"
);

const chanceLogic = readFileSync(
  new URL("../src/logic/chances.js", import.meta.url),
  "utf8"
);

const chatBackend = readFileSync(
  new URL("../src/backend/chat.js", import.meta.url),
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
assert.match(effectiveThresholdMigration, /coalesce\(new\.effective_rarity, 0\) >= 1000000000/);
assert.match(effectiveThresholdMigration, /after insert or update of rarity, effective_rarity, mutation_ids/);
assert.match(effectiveThresholdMigration, /v_effective_rarity >= 1000000000/);
assert.match(effectiveThresholdMigration, /not v_has_mutations and new\.rarity >= 1000000/);
assert.match(effectiveThresholdMigration, /coalesce\(effective_rarity, 0\) < 1000000000/);
assert.match(chanceLogic, /EFFECTIVE_CHAT_CHANCE_THRESHOLD = 1_000_000_000/);
assert.match(chatBackend, /EFFECTIVE_ANNOUNCEMENT_THRESHOLD = 1_000_000_000/);
assert.match(chatBackend, /mutationIds\.length > 0\s*\? effectiveRarity >= EFFECTIVE_ANNOUNCEMENT_THRESHOLD\s*:\s*rarity >= BASE_ANNOUNCEMENT_THRESHOLD/);

console.log("Rare-roll chat event persistence checks passed.");
