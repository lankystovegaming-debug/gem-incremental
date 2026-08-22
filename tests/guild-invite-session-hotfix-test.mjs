import assert from "node:assert/strict";import{readFile}from"node:fs/promises";
const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");
const[guild,invoke,features,migration,main,page,updates,automation]=await Promise.all([read("../guilds/guilds.js"),read("../src/backend/invoke.js"),read("../supabase/functions/features/index.ts"),read("../supabase/migrations/20260822000003_guild_invite_repair.sql"),read("../main.js"),read("../index.html"),read("../updates/index.html"),read("../src/ui/globalAutomation.js")]);
assert.match(guild,/invokeFunction\("features"/);
for(const code of["invite_not_found","guild_join_cooldown","guild_full","insufficient_guild_points","guild_level_required"]){assert.match(invoke,new RegExp(code));assert.match(features,new RegExp(code));}
assert.match(migration,/guild_not_found/);assert.match(migration,/grant execute on function public\.guild_respond_invite_v2/);
assert.match(main,/type: "auto-sold"/);assert.match(main,/type: "auto-crafted"/);assert.match(main,/tier: rarityTier\(data\.gem\.rarity\)\.id/);assert.match(main,/clearSessionInsightsButton/);
assert.match(page,/id="clearSessionInsights"/);assert.match(updates,/v0\.11\.0\.2/);
assert.match(automation,/recordSessionRoll\(data, sessionOutcome\)/);assert.match(automation,/type: "auto-sold"/);
console.log("Guild invite and Session Insights hotfix tests passed.");
