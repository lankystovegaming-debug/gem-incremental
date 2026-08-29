import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20260828153546_abandoned_mine_hell_mode_v1.sql");
const targetCastFix = read("supabase/migrations/20260829011537_fix_hell_mode_objective_target_cast.sql");
const moneyFix = read("supabase/migrations/20260829013122_fix_hell_funding_money_ambiguity.sql");
const roll = read("supabase/functions/roll/index.ts");
const client = read("src/backend/cloudExpeditions.js");
const page = read("expeditions/expeditions.js");

assert.match(sql, /add column if not exists mode text not null default 'normal'/);
assert.match(sql, /add column if not exists hell_state jsonb not null default '\{\}'::jsonb/);
for (const table of ["abandoned_mine_hell_config", "player_hell_resources", "abandoned_mine_hell_weekly_claims", "abandoned_mine_hell_telemetry"]) {
  assert.match(sql, new RegExp(`create table public\\.${table}`));
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(sql, /'depthCosts',to_jsonb\(array\[100000,125000,150000,200000,250000,300000,400000,500000,650000,825000\]/);
assert.match(sql, /'revealCosts',to_jsonb\(array\[100000,150000,250000,400000,650000,1000000,1500000,2250000,3250000,5000000\]/);
assert.match(sql, /'doomThreshold',90/);
assert.match(sql, /'weeklyMythicCap',5/);
assert.match(targetCastFix, /target=ceil\(coalesce\([\s\S]*::numeric[\s\S]*::integer/,
  "decimal Hell objective targets must not be cast from text directly to integer");
assert.match(moneyFix, /update public\.players p[\s\S]*set money=p\.money-v_cost[\s\S]*returning p\.money into v_money/,
  "Hell funding must qualify the player money column and use distinct variable names");
assert.doesNotMatch(moneyFix, /\bdeclare[^;]*\bmoney numeric/,
  "Hell funding must not declare a variable that collides with players.money");
assert.match(sql, /public\.abandoned_mine_hell_triple_chance/);
assert.match(sql, /when p_od<=2 then 0/);
assert.match(sql, /else \.45 end/);
assert.match(sql, /public\.abandoned_mine_hell_curse_tier/);
assert.match(sql, /2 Curse \+ 1 Lesser|i=3 and not triple/);
assert.match(sql, /public\.abandoned_mine_hell_objective/);
assert.match(sql, /family in \('rare_or_grind','weight_or_grind','combined'\)/);
assert.match(sql, /public\.abandoned_mine_hell_event/);
for (const name of ["Forked Mineworks", "Collapsed Junction", "Flooded Galleries", "Old Railway", "Ventilation Network", "Deep Shaft", "Exposed Ore Vein", "Broken Mine Railway", "Functional Cargo Lift", "Failing Supports", "Abandoned Survey Station", "Sealed Mining Chamber"]) assert.match(sql, new RegExp(name));

for (const rpc of ["start_abandoned_mine_hell", "fund_abandoned_mine_hell", "resolve_abandoned_mine_hell_event", "reveal_abandoned_mine_hell_card", "select_abandoned_mine_hell_card", "continue_abandoned_mine_hell_overdepth", "extract_abandoned_mine_hell", "settle_abandoned_mine_hell", "get_abandoned_mine_hell_dashboard"]) {
  assert.match(sql, new RegExp(`function public\\.${rpc}`));
  assert.match(client, new RegExp(rpc));
}
assert.match(sql, /alter function public\.record_abandoned_mine_roll\(uuid,jsonb\) rename to record_normal_abandoned_mine_roll/);
assert.match(sql, /if exists\(select 1 from public\.abandoned_mine_runs[\s\S]*mode='hell'[\s\S]*record_abandoned_mine_hell_roll[\s\S]*else perform public\.record_normal_abandoned_mine_roll/);
assert.match(roll, /displayedValue: relicDrop \? 0 : value/);
assert.match(roll, /finalWeight: relicDrop \? 0 : finalWeight/);

assert.match(sql, /where value->>'kind' is distinct from 'artifact'/);
assert.match(sql, /order by random\(\) limit take_/);
assert.match(sql, /failedRecoveryMin/);
assert.match(sql, /public\.abandoned_mine_hell_artifact_roll/);
for (const artifact of ["charred-miners-tag", "melted-chain-link", "crimson-geode", "extinguished-hell-lantern", "doomstone", "eye-bottomless-mine"]) assert.match(sql, new RegExp(artifact));
assert.match(sql, /public\.abandoned_mine_hell_cache/);
assert.match(sql, /for i in 1\.\.3 loop/);
assert.match(sql, /mythic_claims<5/);

assert.match(sql, /jsonb_build_object\('slot',\(value->>'slot'\)::integer,'revealed',false\)/, "face-down cards must be redacted");
assert.match(sql, /alter function public\.get_abandoned_mine_dashboard\(\) rename to get_normal_abandoned_mine_dashboard/);
assert.match(sql, /return public\.get_abandoned_mine_hell_dashboard\(\)/);
assert.match(sql, /revoke all on public\.abandoned_mine_hell_config[\s\S]*from public,anon,authenticated/);
assert.match(sql, /revoke all on function public\.get_normal_abandoned_mine_dashboard\(\) from public,anon,authenticated/);

assert.match(page, /Hell Mode/);
assert.match(page, /No Supply Camps/);
assert.match(page, /Face-down card/);
assert.match(page, /Critical extraction will lose them/);
assert.doesNotMatch(sql, /Crystal Caverns|Volcanic Depths|Ancient Ruins|Lost Jungle/);

console.log("Abandoned Mine Hell Mode V1 tests passed.");
