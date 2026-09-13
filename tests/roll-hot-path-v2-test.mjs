import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const uid = "00000000-0000-0000-0000-000000000001";
const gid = "00000000-0000-0000-0000-000000000002";
const eventId = "00000000-0000-0000-0000-000000000003";
const migration = readFileSync(
  new URL("../supabase/migrations/20260913102618_optimize_roll_hot_path_v2.sql", import.meta.url),
  "utf8"
);
const contextColumnFix = readFileSync(
  new URL("../supabase/migrations/20260913123601_fix_roll_prepare_context_admin_event_columns.sql", import.meta.url),
  "utf8"
);
const serviceRoleAuthFix = readFileSync(
  new URL("../supabase/migrations/20260913124716_fix_roll_service_role_secret_key_auth.sql", import.meta.url),
  "utf8"
);
const autoCraftHotPath = readFileSync(
  new URL("../supabase/migrations/20260913233627_optimize_roll_autocraft_hot_path.sql", import.meta.url),
  "utf8"
);
const edge = readFileSync(new URL("../supabase/functions/roll/index.ts", import.meta.url), "utf8");
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;

  create table players (
    id uuid primary key, username text, next_roll_at timestamptz, inventory_capacity integer default 0,
    total_rolls bigint default 0, mutation_luck numeric default 1, rarity_resonance numeric default 0,
    equipment_state jsonb default '{}', gravitational_surge_progress integer default 0,
    gravitational_surge_ready boolean default false, bag_compression_progress integer default 0,
    best_rare_natural_weight_100k numeric default 0, best_rare_natural_weight_1m numeric default 0,
    misty_mutation_boost_rolls integer default 0, misty_mutation_boost_stacks integer default 0,
    ancient_relic_boost_rolls integer default 0, enchanted_relic_boost_rolls integer default 0
  );
  create table player_research_effects (player_id uuid primary key, inventory_bonus integer default 0);
  create table user_roll_luck_rarity_mult (player_id uuid primary key, active_until timestamptz, note text);
  create table inventory_gems (id bigserial primary key, player_id uuid, gem_name text, created_at timestamptz default now());
  create table player_equipment (
    id bigserial primary key, player_id uuid, equipment_id text, category text, equipped boolean default false,
    luck_bonus float8, roll_speed_bonus float8, weight_luck_bonus float8, weight_multiplier_bonus float8,
    mutation_chance_bonus float8, enchant_id text, enchant_grade text, enchant_state jsonb,
    masterwork_level integer, masterwork_passive text, masterwork_passive_rank integer, masterwork_attunement text
  );
  create table museum_artifact_registrations (id bigserial primary key, player_id uuid, artifact_key text);
  create table player_boosts (player_id uuid, family text, tier smallint, effect_value numeric, expires_at timestamptz);
  create table player_one_roll_boosts (player_id uuid primary key, consumable_id text, effect_value numeric, charges integer);
  create table admin_events (
    id uuid primary key, name text, luck_bonus numeric, roll_speed_bonus numeric, weight_luck_bonus numeric,
    weight_multiplier_bonus numeric, luck_multiplier numeric,
    roll_speed_multiplier numeric, weight_luck_multiplier numeric, weight_multiplier_multiplier numeric,
    mutation_luck_bonus numeric, mutation_luck_multiplier numeric, starts_at timestamptz, ends_at timestamptz,
    active boolean
  );
  create table guilds (id uuid primary key, luck_tier integer, speed_tier integer, weight_luck_tier integer);
  create table guild_members (guild_id uuid, player_id uuid primary key, eligible_at timestamptz);
  create table guild_shop_buffs (guild_id uuid, potion_id text, expires_at timestamptz);
  create table private_feature_gems (
    name text primary key, rarity numeric, base_weight numeric, value_per_gram numeric,
    affected_by_luck boolean, availability_mode text, starts_at timestamptz, ends_at timestamptz,
    daily_start_time time, daily_end_time time, availability_timezone text, required_event_key text,
    metadata jsonb, special_gem boolean, sort_order integer, enabled boolean
  );
  create table game_mutations (
    id text primary key, name text, chance numeric, multiplier numeric, description text,
    icon text, color text, enabled boolean
  );
  create table roll_weight_history (
    id bigserial primary key, player_id uuid not null, username text, gem_name text not null,
    final_weight numeric not null default 0, base_rarity numeric not null default 0,
    mutation_ids text[] not null default '{}', created_at timestamptz not null default now()
  );
  create table global_chat_announcements (
    player_id uuid, gem_name text, rarity numeric, effective_rarity numeric,
    mutation_ids text[], luck_at_roll numeric
  );
  create table player_crafting (
    player_id uuid primary key, active_auto_craft text, created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create table game_recipes (id text primary key, recipe jsonb not null);
  create table crafting_progress (
    player_id uuid not null, recipe_id text not null, progress jsonb not null default '{}',
    updated_at timestamptz not null default now(), primary key (player_id, recipe_id)
  );

  create function qol_roll_context(uuid) returns jsonb language sql stable as
    'select ''{"settings":{"enableBuffs":true},"discoveries":["Quartz"]}''::jsonb';
  create function get_active_global_event() returns jsonb language sql stable as
    'select ''{"id":"event-1","eventKey":"starfall"}''::jsonb';
  create function crystal_player_effects(uuid) returns jsonb language sql stable as 'select ''{}''::jsonb';
  create function player_expedition_artifact_effects(uuid) returns jsonb language sql stable as 'select ''{}''::jsonb';
  create function record_server_roll(uuid,text,integer,double precision) returns jsonb language sql as
    'select ''{"totalRolls":7}''::jsonb';
  create function record_gem_mutation_combination(uuid,text,text,text[],jsonb,numeric) returns jsonb language sql as
    'select ''{"recorded":true}''::jsonb';
  create function record_guild_roll_activity(uuid,numeric,text,numeric,numeric,numeric,numeric,boolean,boolean) returns jsonb language sql as
    'select ''{"points":3}''::jsonb';
  create function record_global_event_roll(uuid) returns jsonb language sql as 'select ''{"mass":4}''::jsonb';
  create function process_private_feature_progress_event_incremental(uuid,text,bigint,jsonb) returns jsonb language sql as 'select ''{}''::jsonb';
  create function record_season_roll(uuid,numeric,numeric,integer,boolean) returns jsonb language sql as 'select ''{}''::jsonb';
  create function claim_guild_mythic_surge(uuid) returns jsonb language sql as 'select ''{}''::jsonb';
  create function record_abandoned_mine_roll(uuid,jsonb) returns void language plpgsql as 'begin return; end';
  create function spend_one_roll_charge(uuid) returns integer language sql as 'select 0';
  create function record_roll_leaderboard_entry(uuid,text,text,numeric,numeric,numeric,text,text[],numeric,numeric,numeric,bigint) returns jsonb language sql as 'select ''{}''::jsonb';
  create function attach_roll_announcement_mutations(uuid,text,numeric,text[],numeric,numeric) returns bigint language sql as 'select null::bigint';
  create function deposit_equipment_material(uuid,text,jsonb,integer default null) returns jsonb language sql as
    'select jsonb_build_object(''deposited'',true,''preserved'',true,''requirementIndex'',coalesce($4,0))';
`);

await db.exec(migration);
await db.exec(contextColumnFix);
await db.exec(serviceRoleAuthFix);
await db.exec(autoCraftHotPath);
assert.equal((await one("select has_function_privilege('authenticated','public.roll_prepare_context(uuid,timestamptz,bigint,bigint)','execute') allowed")).allowed, false);
assert.equal((await one("select has_function_privilege('authenticated','public.roll_finish_bookkeeping(uuid,text,jsonb)','execute') allowed")).allowed, false);
assert.equal((await one("select has_function_privilege('service_role','public.roll_prepare_context(uuid,timestamptz,bigint,bigint)','execute') allowed")).allowed, true);
assert.equal((await one("select has_function_privilege('authenticated','public.roll_autocraft_deposit(uuid,jsonb)','execute') allowed")).allowed, false);
assert.equal((await one("select has_function_privilege('service_role','public.roll_autocraft_deposit(uuid,jsonb)','execute') allowed")).allowed, true);
await db.exec(`
  select set_config('request.jwt.claim.role', 'service_role', false);
  insert into players(id,username,inventory_capacity) values ('${uid}','Miner',4);
  insert into player_research_effects(player_id,inventory_bonus) values ('${uid}',1);
  insert into inventory_gems(player_id,gem_name) values ('${uid}','Quartz');
  insert into player_one_roll_boosts values ('${uid}','legendary-potion',500,2);
  insert into guilds values ('${gid}',2,3,4);
  insert into guild_members values ('${gid}','${uid}',now()-interval '2 days');
  insert into guild_shop_buffs values ('${gid}','mythic',now()+interval '1 hour');
  insert into user_roll_luck_rarity_mult values ('${uid}',now()+interval '1 day','test ban');
  insert into admin_events(
    id, name, luck_bonus, roll_speed_bonus, weight_luck_bonus, weight_multiplier_bonus,
    luck_multiplier, roll_speed_multiplier, weight_luck_multiplier,
    weight_multiplier_multiplier, mutation_luck_bonus, mutation_luck_multiplier,
    starts_at, ends_at, active
  ) values (
    '${eventId}', 'Live columns', 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    now()-interval '1 hour', now()+interval '1 hour', true
  );
  insert into private_feature_gems values ('Quartz',1,1,1,true,'always',null,null,null,null,'UTC',null,'{}',false,1,true);
  insert into game_mutations values ('polished','Polished',100,2,'','','',true);
  insert into game_recipes values ('mass-recipe','{"requirements":[{"type":"gem-total-weight","totalWeight":20}]}');
  insert into player_crafting(player_id,active_auto_craft) values ('${uid}','mass-recipe');
`);

await db.exec("select set_config('request.jwt.claim.role', '', false); set role service_role");
const secretKeyContext = (await one("select roll_prepare_context($1,now(),null,null) context", [uid])).context;
assert.equal(secretKeyContext.player.username, "Miner", "opaque secret-key service role works without legacy JWT claims");
const secretKeyBookkeeping = (await one(
  "select roll_finish_bookkeeping($1,'loss',$2) result",
  [uid, { rollNumber: 1, progressPayload: {}, expeditionPayload: {} }]
)).result;
assert.deepEqual(secretKeyBookkeeping.errors, [], "opaque secret-key service role can run post-roll bookkeeping");
await db.exec("reset role");

const initial = (await one("select roll_prepare_context($1,now(),null,null) context", [uid])).context;
assert.equal(initial.player.username, "Miner", "ordinary roll context includes the player");
assert.equal(Number(initial.inventoryCount), 1, "full-inventory decisions use the authoritative non-relic count");
assert.equal(initial.activeAutoCraft, "mass-recipe", "Auto Craft selection is included in the pre-roll context");
assert.equal(Number(initial.player.player_research_effects[0].inventory_bonus), 1);
assert.equal(Number(initial.oneRollBoost.charges), 2, "potion charge is loaded in the same snapshot");
assert.equal(initial.guild.shopBuffIds[0], "mythic", "active guild buff is included");
assert.equal(initial.globalEvent.eventKey, "starfall", "active global event is included");
assert.equal(initial.ban.note, "test ban", "banned-player state is included");
assert.equal(Number(initial.activeAdminEvent.mutation_luck_bonus), 10, "admin events use the live mutation-luck columns");
assert.equal(initial.activeAdminEvent.mutation_chance_bonus, undefined, "stale admin event columns are not queried");
assert.equal(initial.gemCatalog.length, 1);
assert.equal(initial.mutationCatalog.length, 1);

const warm = (await one("select roll_prepare_context($1,now(),$2,$3) context", [
  uid, initial.catalogVersions.gems, initial.catalogVersions.mutations
])).context;
assert.equal(warm.gemCatalog, null);
assert.equal(warm.mutationCatalog, null);
await db.exec("update game_mutations set multiplier=3 where id='polished'");
const invalidated = (await one("select roll_prepare_context($1,now(),$2,$3) context", [
  uid, initial.catalogVersions.gems, initial.catalogVersions.mutations
])).context;
assert.equal(Number(invalidated.mutationCatalog[0].multiplier), 3, "catalog mutation invalidates the warm cache version");

await db.exec("set role authenticated");
await assert.rejects(() => db.query("select roll_prepare_context($1,now(),null,null)", [uid]), /permission denied/);
await assert.rejects(() => db.query("select roll_finish_bookkeeping($1,'background','{}'::jsonb)", [uid]), /permission denied/);
await db.exec("reset role");

await db.exec("set role service_role");
const specimen = {
  gem_name: "Quartz", rarity: 100, base_weight: 1, final_weight: 12,
  rolled_weight_multiplier: 12, value: 25
};
const massDeposit = (await one(
  "select roll_autocraft_deposit($1,$2) result", [uid, specimen]
)).result;
assert.equal(massDeposit.deposited, true);
assert.equal(massDeposit.preserved, false, "legacy aggregate deposits remain fully consumed");
assert.equal(massDeposit.recipeId, "mass-recipe");
assert.equal(massDeposit.requirementIndex, 0);
await db.exec("reset role");
assert.equal(Number((await one(
  "select progress->>'gem-total-weight-0' weight from crafting_progress where player_id=$1 and recipe_id='mass-recipe'",
  [uid]
)).weight), 12);

await db.query("insert into game_recipes values ('points-recipe',$1)", [{
  requirements: [{ type: "rarity-points", points: 100, minimumUniqueGemTypes: 2 }]
}]);
await db.query("update player_crafting set active_auto_craft='points-recipe' where player_id=$1", [uid]);
await db.exec("set role service_role");
const pointsDeposit = (await one(
  "select roll_autocraft_deposit($1,$2) result", [uid, specimen]
)).result;
assert.equal(pointsDeposit.deposited, true);
assert.deepEqual(pointsDeposit.progress["rarity-points-0"], { points: 20, gemTypes: ["Quartz"] });

await db.exec("reset role");
await db.query("insert into game_recipes values ('count-recipe',$1)", [{
  requirements: [{ type: "gem-count", gem: "Quartz", amount: 2 }]
}]);
await db.query("update player_crafting set active_auto_craft='count-recipe' where player_id=$1", [uid]);
await db.exec("set role service_role");
const countDeposit = (await one(
  "select roll_autocraft_deposit($1,$2) result", [uid, specimen]
)).result;
assert.equal(countDeposit.deposited, true);
assert.equal(countDeposit.preserved, true, "material-planner conservation result is preserved");
assert.equal(countDeposit.recipeId, "count-recipe");
assert.equal(countDeposit.requirementIndex, 0);
await db.exec("reset role");

for (let weight = 1; weight <= 100; weight += 1) {
  await db.query("insert into roll_weight_history(player_id,username,gem_name,final_weight) values($1,'Miner','Quartz',$2)", [uid, weight]);
}
await db.query("select roll_finish_bookkeeping($1,'background',$2)", [uid, {
  username: "Miner", gemName: "Quartz", rarity: 1, effectiveRarity: 1,
  finalWeight: 0.5, value: 1, mutationIds: [], mutationMultipliers: {},
  mutationMultiplier: 1, rawLuck: 1, baseLuck: 1, announcedLuck: 1,
  rollNumber: 1, relic: false, progressPayload: {}, expeditionPayload: {}
}]);
assert.equal(Number((await one("select count(*) count from roll_weight_history where player_id=$1", [uid])).count), 100);
assert.equal(Number((await one("select min(final_weight) minimum from roll_weight_history where player_id=$1", [uid])).minimum), 1);

assert.match(edge, /currentInventoryCount \+ batchExecution\.batchSize > effectiveInventoryCapacity/, "x4 preflight reserves every required slot");
assert.match(edge, /roll_finish_bookkeeping[\s\S]*p_phase: "critical"/);
assert.match(edge, /roll_finish_bookkeeping[\s\S]*p_phase: "background"/);
assert.match(edge, /roll_autocraft_deposit/);
assert.doesNotMatch(edge, /player_crafting|game_recipes|crafting_progress|apply_autocraft_progress|deposit_equipment_material/);
assert.doesNotMatch(edge, /consolidatedBookkeeping|bestRollHistoryPromise|announcementMutationPromise/);
assert.doesNotMatch(edge, /ROLL_CATALOG_CACHE_MS/);

await db.close();
console.log("Roll hot-path context, scenario contracts, cache invalidation and bounded history retention passed.");
