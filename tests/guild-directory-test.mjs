import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(file)=>readFile(new URL(file,import.meta.url),"utf8");
const [migration,features,page,script,css]=await Promise.all([
  read("../supabase/migrations/20260828180000_guild_directory.sql"),
  read("../supabase/functions/features/index.ts"),
  read("../guilds/index.html"),
  read("../guilds/guilds.js"),
  read("../guilds/guilds.css")
]);

assert.match(migration,/create table if not exists public\.guild_join_requests/);
assert.match(migration,/guild_join_open_v1/);
assert.match(migration,/guild_request_join_v1/);
assert.match(migration,/guild_manage_join_request_v1/);
assert.match(migration,/for update/);
assert.match(migration,/guild_join_cooldown/);
assert.match(migration,/guild_full/);
assert.match(migration,/revoke all on function public\.guild_join_open_v1/);

assert.match(features,/a==="guild-directory"/);
assert.match(features,/guild-join-open/);
assert.match(features,/guild-request-join/);
assert.match(features,/guild-manage-join-request/);
assert.match(features,/pendingRequest/);

assert.match(page,/id="guildDirectory"/);
assert.match(page,/id="guildDirectorySearch"/);
assert.match(page,/id="joinRequestList"/);
assert.match(script,/function renderDirectory/);
assert.match(script,/function actOnDirectory/);
assert.match(script,/function renderJoinRequests/);
assert.match(css,/\.directory-grid/);

console.log("Guild directory tests passed.");
