import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [inventory, playerCloud, css, guildPage, guildJs, features, migration, updates] = await Promise.all([
  read("../inventory/inventory.js"), read("../src/backend/playerCloud.js"),
  read("../src/styles/app.css"), read("../guilds/index.html"),
  read("../guilds/guilds.js"), read("../supabase/functions/features/index.ts"),
  read("../supabase/migrations/20260822000002_qol_hotfix.sql"), read("../updates/index.html")
]);

assert.match(inventory, /chanceLabelForResult\(gem, mutationIds, gem\.luck_at_roll \?\? 1\)/);
assert.match(playerCloud, /ensure_player_record/);
assert.match(css, /overscroll-behavior-inline: contain/);
assert.match(guildPage, /id="competitionRewards"/);
assert.match(guildJs, /competitionRewards/);
assert.match(features, /GUILD_COMPETITION_REWARDS/);
assert.match(migration, /create trigger on_auth_user_created/);
assert.match(migration, /record_gems_found_score/);
assert.match(migration, /get_best_roll_leaderboard/);
assert.match(updates, /v0\.11\.0\.1/);
console.log("QoL hotfix v0.11.0.1 tests passed.");
