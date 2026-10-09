import { withSupabase } from "npm:@supabase/server";
import drops from "./drop-data.json" with { type: "json" };
import {
  canonicalEnemyName,
  equipmentGemPower,
  gearChance,
  gearMutationChance,
  mutationWeight,
  parseMutationSummary,
  probability,
  rollEssenceDrops,
  rollMutationTier,
  shouldMutate,
  weighted,
} from "./formulas.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...CORS } });
const uid = (ctx: any) => ctx?.userClaims?.id ?? ctx?.userClaims?.sub ?? ctx?.jwtClaims?.sub ?? null;
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function regionScale(region: string) {
  return ({
    Entrance: [1, 1], Jungle: [3, 2], "Beach & Sea": [4, 2.5], Mountain: [10, 5],
    Volcano: [25, 10], Hell: [50, 20], "Dragon's Domain": [100, 35], Abyss: [200, 60],
    "Sky Citadel": [400, 110], "Time Rift": [800, 200], "Genesis Core": [1600, 400],
  } as any)[region] ?? [1, 1];
}
function zoneScale(zone: string) {
  return ({
    Easy: [.7, .75, .85, .75, .75], Normal: [1, 1, 1, 1, 1],
    Hard: [1.35, 1.3, 1.25, 1.35, 1.25], Brutal: [1.8, 1.6, 1.6, 1.75, 1.5],
  } as any)[zone] ?? [1, 1, 1, 1, 1];
}

const ROLE: any = {
  "Ice Wraith": [.7, 1.5], "Avalanche Beast": [1.4, .9], "Magma Imp": [.8, 1.3],
  "Ember Hound": [.8, 1.3], "Obsidian Golem": [1.4, .9], "Ash Wraith": [.7, 1.5],
  "Cinder Brute": [1.4, .9], Hellhound: [.8, 1.3], "Bone Colossus": [1.4, .9],
  "Plague Doctor": [.7, 1.5], "Fallen Seraph": [.7, 1.5], "Lich Acolyte": [.7, 1.5],
  Wyvern: [.8, 1.3], "Dragonkin Mage": [.7, 1.5], Broodmother: [1.4, .9],
  "Storm Dragon": [.8, 1.3], "Frost Dragon": [.8, 1.3], "Elder Wyrm": [1.4, .9],
  "Void Stalker": [.8, 1.3], "Eldritch Horror": [.7, 1.5], "Starfall Behemoth": [1.4, .9],
  "Entropy Wraith": [.7, 1.5], "Tide Colossus": [1.4, .9], "Cloud Sentinel": [1.4, .9],
  "Storm Harpy": [.8, 1.3], "Thunder Titan": [1.4, .9], "Aurora Weaver": [.7, 1.5],
  "Celestial Archon": [.7, 1.5], "Chrono Wisp": [.7, 1.5], "Paradox Knight": [1, 1],
  "Rift Stalker": [.8, 1.3], "Fossil Colossus": [1.4, .9], "Echo Phantom": [.7, 1.5],
  "Epoch Behemoth": [1.4, .9], "Origin Golem": [1.4, .9], "Primordial Serpent": [.8, 1.3],
  "Creation Weaver": [.7, 1.5], "Omega Sentinel": [1, 1], "Singularity Wraith": [.7, 1.5],
  "First Dragon": [1.4, .9], Mimic: [1.2, 1.1],
};
const RANK: any = {
  Normal: [1, 1, 1], Elite: [2.5, 1.8, 1.25], Champion: [3.5, 2.5, 1.5],
  Cursed: [3.5, 2.5, 1.4], Mythic: [5, 3.5, 2], Paragon: [6.5, 4.5, 2.5],
  Apex: [8, 6, 3.5], Calamity: [10, 8, 5], Boss: [15, 6, 1],
};
const MUTATION_TIER: any = {
  Common: [1.1, 1.05, 1.1], Uncommon: [1.25, 1.15, 1.25], Rare: [1.6, 1.35, 1.5],
  Epic: [2.5, 1.8, 2], Legendary: [5, 3, 3],
};
const REGION_CODES: any = {
  Entrance: ["Ent"], Jungle: ["Jun"], "Beach & Sea": ["Sea"], Mountain: ["Mtn"],
  Volcano: ["Vol"], Hell: ["Hel"], "Dragon's Domain": ["Dra"], Abyss: ["Aby"],
  "Sky Citadel": ["Sky"], "Time Rift": ["Rft"], "Genesis Core": ["Gen"],
};

async function enabled(ctx: any, id: string) {
  const { data, error } = await ctx.supabaseAdmin.from("game_section_settings").select("enabled").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}
async function loadRoom(ctx: any, roomNumber: number) {
  if (!Number.isInteger(roomNumber) || roomNumber < 1 || roomNumber > 1500) throw new Error("invalid_room");
  const { data, error } = await ctx.supabaseAdmin.from("dungeon_catalog_rooms").select("*").eq("room_number", roomNumber).single();
  if (error) throw error;
  return data;
}
async function playerStats(ctx: any, playerId: string) {
  const { data, error } = await ctx.supabaseAdmin.from("players").select("id,total_rolls,max_equipment_tier").eq("id", playerId).single();
  if (error) throw error;
  return data;
}
async function canEnter(ctx: any, playerId: string, roomNumber: number) {
  const player = await playerStats(ctx, playerId);
  if (num(player.total_rolls) < 1) return { ok: false, error: "entry_requirements_not_met", requirements: { minRolls: 1 } };
  if (roomNumber === 1) return { ok: true, player };
  const { data, error } = await ctx.supabaseAdmin.from("dungeon_room_progress").select("room_number")
    .eq("player_id", playerId).eq("room_number", roomNumber - 1).maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "room_locked", previousRoom: roomNumber - 1 };
  return { ok: true, player };
}

function encounterNumber(kind: string) {
  const match = String(kind).match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}
function pickRank(room: any) {
  const row = weighted((room.ranks ?? []).filter((rank: any) => rank.rank !== "Boss"), (rank: any) => probability(rank.spawn));
  return row
    ? { rank: row.rank, essenceMultiplier: Math.max(1, num(String(row.ess).replace(/^x/i, ""), 1)) }
    : { rank: "Normal", essenceMultiplier: 1 };
}
async function chooseMutation(ctx: any, room: any, tier: string) {
  const { data, error } = await ctx.supabaseAdmin.from("dungeon_mutations")
    .select("name,tier,native_regions,value_multiplier,shard_gem_power,core_gem_power,best_odds").eq("tier", tier);
  if (error) throw error;
  const codes = REGION_CODES[room.region] ?? [];
  return weighted(data ?? [], (mutation: any) => mutationWeight(mutation, codes));
}
async function rollRoomMutation(ctx: any, room: any, applyOverallChance: boolean) {
  const summary = parseMutationSummary(room.mutation_summary);
  if (applyOverallChance && !shouldMutate(summary)) return null;
  const tier = rollMutationTier(summary);
  return tier ? await chooseMutation(ctx, room, tier) : null;
}
function enemyBaseStats(room: any, row: any, rank: string, mutation: any, bossRepeat = 0) {
  const [regionHp, regionDamage] = regionScale(room.region);
  const [zoneHp, zoneDamage] = zoneScale(room.zone);
  const role = ROLE[canonicalEnemyName(row.name)] ?? [1, 1];
  const rankMultiplier = RANK[rank] ?? RANK.Normal;
  const mutationMultiplier = MUTATION_TIER[mutation?.tier] ?? [1, 1, 1];
  const repeat = 1 + Math.max(0, bossRepeat);
  return {
    hp: Math.max(1, regionHp * zoneHp * rankMultiplier[0] * role[0] * mutationMultiplier[0] * repeat),
    damage: Math.max(1, regionDamage * zoneDamage * rankMultiplier[1] * role[1] * mutationMultiplier[1] * repeat),
    defense: Math.max(0, regionHp * zoneHp * rankMultiplier[0] * role[0] * mutationMultiplier[0] * .01),
  };
}
async function makeCombatant(ctx: any, room: any, row: any, rank: string, lootRole: string, isBoss = false, essenceMultiplier = 1, bossRepeat = 0) {
  const mutation = isBoss ? null : await rollRoomMutation(ctx, room, true);
  const stats = enemyBaseStats(room, row, rank, mutation, isBoss ? bossRepeat : 0);
  const name = canonicalEnemyName(row.name);
  return {
    id: crypto.randomUUID(), name, rank, lootRole, maxHp: stats.hp, hp: stats.hp,
    damage: stats.damage, defense: stats.defense, essenceMultiplier,
    mutated: !!mutation, mutationTier: mutation?.tier ?? null, mutationName: mutation?.name ?? null,
    mutationData: mutation, drops: (drops as any)[name]?.items ?? [],
  };
}

function tablePick(table: any[]) {
  return weighted(table ?? [], (item: any) => probability(item.chance));
}
async function rollGearMutation(ctx: any, room: any, enemy: any) {
  if (Math.random() >= gearMutationChance(enemy.mutated)) return null;
  if (enemy.mutated && enemy.mutationData && Math.random() < .60) return enemy.mutationData;
  return await rollRoomMutation(ctx, room, false);
}
async function gearDrops(ctx: any, room: any, enemy: any) {
  const output: any[] = [];
  for (const itemType of ["weapon", "armor"]) {
    if (Math.random() >= gearChance(room, enemy.lootRole, itemType)) continue;
    const item = tablePick(itemType === "weapon" ? room.weapon_table : room.armor_table);
    if (!item) continue;
    const mutation = await rollGearMutation(ctx, room, enemy);
    const gemPower = equipmentGemPower(room.room_number, item, num(mutation?.value_multiplier, 1));
    output.push({
      type: "gear", room: room.room_number, source_enemy: enemy.name, item_type: itemType,
      name: item.name, quality: item.quality,
      upgrade_level: Number.parseInt(String(item.level).replace("+", ""), 10) || 0,
      components: item.components, gem_power: gemPower, mutation_name: mutation?.name ?? null,
      stats: {
        name: item.name, quality: item.quality, components: item.components,
        room: room.room_number, gemPower, mutationName: mutation?.name ?? null,
      },
    });
  }
  return output;
}

async function buildCombatants(ctx: any, room: any) {
  const isBoss = String(room.room_type).startsWith("Boss Room");
  const isTreasure = String(room.room_type).startsWith("Treasure Room");
  const encounterRows = (room.encounters ?? []).filter((entry: any) => entry?.kind);
  if (isBoss) {
    const bossCountRow = weighted(encounterRows.filter((entry: any) => /boss/i.test(entry.kind)), (entry: any) => probability(entry.chance));
    const addCountRow = weighted(encounterRows.filter((entry: any) => /add/i.test(entry.kind)), (entry: any) => probability(entry.chance));
    const bossCount = Math.max(1, encounterNumber(bossCountRow?.kind ?? "1 boss"));
    const addCount = Math.max(0, encounterNumber(addCountRow?.kind ?? "0 adds"));
    const { data: boss, error } = await ctx.supabaseAdmin.from("dungeon_boss_catalog").select("*").eq("room_number", room.room_number).maybeSingle();
    if (error) throw error;
    const bossName = String(boss?.boss_name ?? "");
    const bossRow = (room.enemies ?? []).find((entry: any) => canonicalEnemyName(entry.name) === bossName)
      ?? { name: bossName || "Dungeon Boss", spawn: "100%", amount: "1 ME", me: "100%" };
    const combatants: any[] = [];
    for (let index = 0; index < bossCount; index++) {
      combatants.push(await makeCombatant(ctx, room, bossRow, "Boss", "boss", true, 1, num(boss?.repeat_bonus)));
    }
    const enemyRows = (room.enemies ?? []).filter((entry: any) => !/\(boss\)/i.test(String(entry.name)));
    for (let index = 0; index < addCount; index++) {
      const row = weighted(enemyRows, (entry: any) => probability(entry.spawn));
      if (row) {
        const rank = pickRank(room);
        combatants.push(await makeCombatant(ctx, room, row, rank.rank, "boss_add", false, rank.essenceMultiplier));
      }
    }
    return { combatants, encounter: `${bossCount} boss + ${addCount} adds`, initialLoot: [], boss: boss?.boss_name ?? null, bossRepeat: num(boss?.repeat_bonus) };
  }
  if (isTreasure) {
    const chosen = weighted(encounterRows.filter((entry: any) => /chest|mimic/i.test(entry.kind)), (entry: any) => probability(entry.chance));
    const kind = String(chosen?.kind ?? "Chest only (safe)");
    const guardCount = encounterNumber(kind);
    const combatants: any[] = [];
    if (/mimic/i.test(kind)) {
      combatants.push(await makeCombatant(ctx, room, { name: "Mimic", amount: "" }, "Elite", "mimic", false, 1.25));
    }
    const enemyRows = (room.enemies ?? []).filter((entry: any) => !/\(boss\)/i.test(String(entry.name)));
    for (let index = 0; index < guardCount; index++) {
      const row = weighted(enemyRows, (entry: any) => probability(entry.spawn));
      if (row) {
        const rank = pickRank(room);
        combatants.push(await makeCombatant(ctx, room, row, rank.rank, "treasure_guard", false, rank.essenceMultiplier));
      }
    }
    const chest = { name: /mimic/i.test(kind) ? "Mimic chest" : "Treasure chest", lootRole: "treasure_chest", mutated: false };
    return { combatants, encounter: kind, initialLoot: await gearDrops(ctx, room, chest), boss: null, bossRepeat: 0 };
  }
  const chosen = weighted(
    encounterRows.filter((entry: any) => /^\d/.test(String(entry.kind)) || /ambush/i.test(String(entry.kind))),
    (entry: any) => probability(entry.chance),
  );
  const count = encounterNumber(chosen?.kind ?? "1");
  if (count <= 0) return { combatants: [], encounter: chosen?.kind ?? "0 (empty room)", initialLoot: [], boss: null, bossRepeat: 0 };
  const enemyRows = (room.enemies ?? []).filter((entry: any) => !/\(boss\)/i.test(String(entry.name)));
  const combatants: any[] = [];
  for (let index = 0; index < count; index++) {
    const row = weighted(enemyRows, (entry: any) => probability(entry.spawn));
    if (row) {
      const rank = pickRank(room);
      combatants.push(await makeCombatant(ctx, room, row, rank.rank, "enemy", false, rank.essenceMultiplier));
    }
  }
  return { combatants, encounter: chosen?.kind ?? String(count), initialLoot: [], boss: null, bossRepeat: 0 };
}

async function playerCombatPower(ctx: any, playerId: string) {
  const { data: player, error } = await ctx.supabaseAdmin.from("players").select("max_equipment_tier").eq("id", playerId).single();
  if (error) throw error;
  const { data: gear, error: gearError } = await ctx.supabaseAdmin.from("dungeon_gear").select("gem_power")
    .eq("player_id", playerId).order("gem_power", { ascending: false }).limit(10);
  if (gearError) throw gearError;
  const gemPower = Math.max(0, ...(gear ?? []).map((item: any) => num(item.gem_power)));
  const tier = num(player.max_equipment_tier);
  return { attack: 10 + tier * 2 + Math.floor(gemPower / 10000), health: 100 + Math.floor(gemPower / 5000), gemPower };
}
async function awardEnemyLoot(ctx: any, room: any, enemy: any, loot: any[]) {
  for (const drop of enemy.drops ?? []) {
    if (Math.random() < num(drop.chance)) {
      loot.push({ type: "material", name: drop.name, quantity: 1, source: enemy.name, room: room.room_number });
    }
  }
  const essenceRow = (room.enemies ?? []).find((entry: any) => canonicalEnemyName(entry.name) === canonicalEnemyName(enemy.name));
  if (essenceRow) {
    const mutationMultiplier = enemy.mutated ? (MUTATION_TIER[enemy.mutationTier]?.[2] ?? 1) : 1;
    const rewardMultiplier = zoneScale(room.zone)[2];
    for (const essence of rollEssenceDrops(essenceRow, enemy.essenceMultiplier ?? 1)) {
      loot.push({
        type: "essence", tier: essence.tier,
        quantity: Math.max(1, Math.round(essence.quantity * rewardMultiplier * mutationMultiplier)), source: enemy.name,
      });
    }
  }
  if (enemy.mutated && enemy.mutationData) {
    const shardChance = ({ Common: .08, Uncommon: .12, Rare: .18, Epic: .25, Legendary: .35 } as any)[enemy.mutationTier] ?? 0;
    const coreChance = ({ Common: .005, Uncommon: .01, Rare: .02, Epic: .04, Legendary: .08 } as any)[enemy.mutationTier] ?? 0;
    if (Math.random() < shardChance) loot.push({ type: "material", name: `${enemy.mutationName} Shard`, quantity: 1, gem_power: enemy.mutationData.shard_gem_power, source: enemy.name, room: room.room_number });
    if (Math.random() < coreChance) loot.push({ type: "material", name: `${enemy.mutationName} Core`, quantity: 1, gem_power: enemy.mutationData.core_gem_power, source: enemy.name, room: room.room_number });
  }
  loot.push(...await gearDrops(ctx, room, enemy));
}
function awardRoomKey(room: any, loot: any[]) {
  if (Math.random() < probability(room.room_key_chance)) {
    loot.push({ type: "material", name: "Dungeon Room Key", quantity: 1, room: room.room_number });
  }
}

export default { fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const playerId = uid(ctx);
  if (!playerId) return json({ error: "unauthenticated" }, 401);
  try {
    if (!(await enabled(ctx, "dungeons"))) return json({ error: "feature_disabled", message: "Dungeons are currently disabled." }, 403);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "catalog");
    if (action === "catalog") {
      const from = Math.max(1, Number(body.from ?? 1));
      const to = Math.min(1500, Number(body.to ?? 1500));
      let query = ctx.supabaseAdmin.from("dungeon_catalog_rooms")
        .select("room_number,room_type,region,zone,mob_level,base_count,room_key_chance,fog_chance,weapon_chance,armor_chance")
        .gte("room_number", from).lte("room_number", to).order("room_number");
      if (body.region) query = query.eq("region", String(body.region));
      if (body.zone) query = query.eq("zone", String(body.zone));
      const { data, error } = await query.limit(1500);
      if (error) throw error;
      return json({ rooms: data ?? [] });
    }
    if (action === "room") {
      const room = await loadRoom(ctx, Number(body.roomNumber));
      const { data: boss } = await ctx.supabaseAdmin.from("dungeon_boss_catalog").select("*").eq("room_number", room.room_number).maybeSingle();
      const { data: progress } = await ctx.supabaseAdmin.from("dungeon_room_progress").select("room_number,completed_at")
        .eq("player_id", playerId).eq("room_number", room.room_number).maybeSingle();
      return json({ room, boss, completed: !!progress });
    }
    if (action === "mutations") {
      const { data, error } = await ctx.supabaseAdmin.from("dungeon_mutations").select("*").order("tier").order("name");
      if (error) throw error;
      return json({ mutations: data ?? [] });
    }
    if (action === "inventory") {
      const [{ data: materials, error: materialError }, { data: essence, error: essenceError }, { data: gear, error: gearError }] = await Promise.all([
        ctx.supabaseAdmin.from("player_dungeon_materials").select("*").eq("player_id", playerId).order("material_name"),
        ctx.supabaseAdmin.from("player_dungeon_essence").select("*").eq("player_id", playerId),
        ctx.supabaseAdmin.from("dungeon_gear").select("*").eq("player_id", playerId).order("created_at", { ascending: false }).limit(100),
      ]);
      if (materialError || essenceError || gearError) throw materialError || essenceError || gearError;
      return json({ materials: materials ?? [], essence: essence ?? [], gear: gear ?? [] });
    }
    if (action === "progress") {
      const { data, error } = await ctx.supabaseAdmin.from("dungeon_room_progress").select("room_number,completed_at")
        .eq("player_id", playerId).order("room_number");
      if (error) throw error;
      return json({ progress: data ?? [] });
    }
    if (action === "start") {
      const room = await loadRoom(ctx, Number(body.roomNumber));
      const access = await canEnter(ctx, playerId, room.room_number);
      if (!access.ok) return json(access, 403);
      const { data: definition, error: definitionError } = await ctx.supabaseAdmin.from("dungeon_definitions")
        .select("id,entry_requirements").eq("name", "The 1,500-Room Dungeon").single();
      if (definitionError) throw definitionError;
      const requirements = definition.entry_requirements ?? {};
      if (num(requirements.minRolls) > num(access.player.total_rolls)) {
        return json({ error: "entry_requirements_not_met", requirements }, 403);
      }
      const built = await buildCombatants(ctx, room);
      const power = await playerCombatPower(ctx, playerId);
      const loot = built.initialLoot;
      const status = built.combatants.length ? "active" : "won";
      if (status === "won") awardRoomKey(room, loot);
      const { data: run, error } = await ctx.supabaseAdmin.from("dungeon_runs").insert({
        player_id: playerId, dungeon_id: definition.id, room_number: room.room_number, enemy_ids: [], enemy_index: 1,
        enemy_health: built.combatants[0]?.hp ?? 0, player_health: power.health, status, loot,
        combatants: built.combatants,
        room_state: { encounter: built.encounter, boss: built.boss, zone: room.zone, region: room.region, bossRepeat: built.bossRepeat },
        player_attack: power.attack,
      }).select("*").single();
      if (error) throw error;
      return json({ run, room, combatant: built.combatants[0] ?? null, completedWithoutCombat: !built.combatants.length });
    }
    if (action === "attack") {
      const { data: run, error: runError } = await ctx.supabaseAdmin.from("dungeon_runs").select("*")
        .eq("id", String(body.runId)).eq("player_id", playerId).eq("status", "active").single();
      if (runError) throw runError;
      const combatants = Array.isArray(run.combatants) ? run.combatants : [];
      const index = Math.max(0, num(run.enemy_index, 1) - 1);
      const enemy = combatants[index];
      if (!enemy) return json({ error: "combat_finished" }, 409);
      const damage = Math.max(1, num(run.player_attack, 10) - num(enemy.defense));
      enemy.hp = Math.max(0, num(enemy.hp) - damage);
      let playerHealth = num(run.player_health, 100);
      let loot = Array.isArray(run.loot) ? run.loot : [];
      let next = index;
      if (enemy.hp <= 0) {
        const room = await loadRoom(ctx, Number(run.room_number));
        await awardEnemyLoot(ctx, room, enemy, loot);
        next = index + 1;
        if (next < combatants.length) combatants[next].hp = combatants[next].maxHp;
        else awardRoomKey(room, loot);
      } else {
        playerHealth -= num(enemy.damage, 10) * .08;
      }
      const status = playerHealth <= 0 ? "lost" : next >= combatants.length ? "won" : "active";
      const { data: updated, error } = await ctx.supabaseAdmin.from("dungeon_runs").update({
        combatants, enemy_index: next + 1, enemy_health: combatants[next]?.hp ?? 0,
        player_health: Math.max(0, playerHealth), status, loot, updated_at: new Date().toISOString(),
      }).eq("id", run.id).eq("status", "active").select("*").single();
      if (error) throw error;
      return json({ run: updated, combatant: combatants[next] ?? null, won: status === "won", lost: status === "lost", defeated: enemy.hp <= 0 ? enemy.name : null, damage });
    }
    if (action === "claim") {
      const { data: run, error: runError } = await ctx.supabaseAdmin.from("dungeon_runs").select("*")
        .eq("id", String(body.runId)).eq("player_id", playerId).eq("status", "won").single();
      if (runError) throw runError;
      const { data: claimed, error } = await ctx.supabaseAdmin.rpc("claim_dungeon_run_rewards", { p_run_id: run.id, p_player_id: playerId });
      if (error) throw error;
      return json(claimed);
    }
    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("DUNGEON_ERROR", error);
    return json({ error: "dungeon_server_error", message: error instanceof Error ? error.message : String(error) }, 500);
  }
}) };
