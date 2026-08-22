import assert from "node:assert/strict";import{readFile}from"node:fs/promises";
const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");
const[guild,guildPage,features,season,seasonPage,updates]=await Promise.all([read("../guilds/guilds.js"),read("../guilds/index.html"),read("../supabase/functions/features/index.ts"),read("../seasons/seasons.js"),read("../seasons/index.html"),read("../updates/index.html")]);
assert.match(guild,/guildMissionDescription/);assert.match(guild,/competitionScore/);assert.match(guild,/data\.competitionMembers/);
assert.match(guildPage,/id="competitionMembers"/);assert.match(features,/guild_competition_members/);assert.match(features,/competitionMembers=members\.map/);assert.match(features,/right\.score-left\.score/);
for(const category of["rolls","sold","legendary","mythic","exotic","mutated","effective100k","effective1m"])assert.match(season,new RegExp(`${category}:`));
assert.match(season,/mission-description/);assert.match(seasonPage,/mission-descriptions\.css/);assert.match(updates,/v0\.11\.0\.3/);
console.log("Mission descriptions and competition contribution tests passed.");
