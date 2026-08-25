import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260825052803_persist_rare_roll_chat_events.sql",
    import.meta.url
  ),
  "utf8"
);

const lowerThresholdMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260825053430_lower_effective_chat_threshold.sql",
    import.meta.url
  ),
  "utf8"
);

const rollFunction = readFileSync(
  new URL("../supabase/functions/roll/index.ts", import.meta.url),
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
assert.match(lowerThresholdMigration, /coalesce\(new\.effective_rarity, 0\) >= 10000000/);
assert.match(lowerThresholdMigration, /v_effective_rarity >= 10000000/);
assert.match(lowerThresholdMigration, /create trigger persist_rare_roll_chat_event/);
assert.match(lowerThresholdMigration, /\) >= 10000000/);
assert.match(rollFunction, /effectiveRarity\s*>=\s*10_000_000/);
assert.match(chatBackend, /EFFECTIVE_ANNOUNCEMENT_THRESHOLD = 10_000_000/);

console.log("Rare-roll chat event persistence checks passed.");
