import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260823000001_guild_point_cash_contributions.sql");
const permissionUpdate = read("supabase/migrations/20260823094431_guild_member_funding_officer_upgrades.sql");
const features = read("supabase/functions/features/index.ts");
const page = read("guilds/index.html");
const client = read("guilds/guilds.js") + read("guilds/guild-point-exchange.js");
const gemIndex = read("gem-index/index.js");

assert.match(migration, /array\[1000000,1500000,2000000,3000000,5000000\]/);
assert.match(migration, /purchase_number between 1 and 5/);
assert.match(migration, /points_awarded integer not null default 100/);
assert.match(migration, /v_member\.role not in \('owner','officer'\)/);
assert.match(migration, /where id = v_member\.guild_id for update/);
assert.match(migration, /contribution_date = v_date/);
assert.match(migration, /at time zone 'UTC'/);
assert.match(migration, /guild_points = guild_points \+ 100/);
assert.match(migration, /money = money - v_cost/);

assert.match(features, /guild-purchase-points/);
assert.match(features, /guild_point_cash_contributions/);
assert.match(features, /pointPurchases/);
assert.match(page, /id="purchaseGuildPoints"/);
assert.match(page, /Today’s contributors/);
assert.match(client, /function render/);
assert.match(client, /function renderGuild/);
assert.match(client, /function renderMembers/);
assert.match(client, /Permanently contribute/);
assert.doesNotMatch(permissionUpdate, /v_member\.role not in/);
assert.match(permissionUpdate, /m\.role in \('owner','officer'\)/);
assert.match(client, /\["owner","officer"\]\.includes\(m\.role\)/);
assert.match(page, /Any guild member can permanently contribute/);
assert.match(gemIndex, /index-card__hidden[\s\S]*dailyAvailabilityLabel\(entry\.gem\)[\s\S]*index-card__chance/);

console.log("Guild Point cash contribution checks passed.");
