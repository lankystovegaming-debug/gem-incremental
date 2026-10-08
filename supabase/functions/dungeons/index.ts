import { withSupabase } from "npm:@supabase/server";
import drops from "./drop-data.json" with { type: "json" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
const uid = (ctx: any) => ctx?.userClaims?.id ?? ctx?.userClaims?.sub ?? ctx?.jwtClaims?.sub ?? null;
const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function probability(value: unknown) {
  const s = String(value ?? "").trim().replace(/,/g, "");
  if (s.endsWith("%")) return Math.max(0, Number(s.slice(0, -1)) / 100);
  const m = s.match(/^1\/([0-9.]+)([KMBT]?)$/i);
  if (!m) return 0;
  const scale: Record<string, number> = { "": 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return 1 / (Number(m[1]) * (scale[m[2].toUpperCase()] ?? 1));
}

function weighted<T>(items: T[], getWeight: (item: T) => number): T | null {
  const total = items.reduce((s, x) => s + Math.max(0, getWeight(x)), 0);
  if (total <= 0) return items[0] ?? null;
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, getWeight(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}

function pickRank(rows: any[], forceBoss = false) {
  if (forceBoss) return { rank: "Boss", essenceMultiplier: 1 };
  const available = rows.filter((r) => r.rank !== "Boss");
  const picked = weighted(available, (r) => probability(r.spawn));
  return picked ? { rank: picked.rank, essenceMultiplier: num(String(picked.ess).replace(/^x/, ""), 1) } : { rank: "Normal", essenceMultiplier: 1 };
}

function parseEncounterCount(row: any) {
  const text = String(row?.kind ?? "");
  const add = text.match(/\+\s*(\d+)\s*guard|\+\s*(\d+)\s*adds?/i);
  if (add) return Number(add[1] || add[2]);
  const m = text.match(/^(\d+)/);
  if (m) return Number(m[1]);
  const dash = text.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (dash) return Number(dash[1]) + Math.floor(Math.random() * (Number(dash[2]) - Number(dash[1]) + 1));
  return 1;
}

function regionScale(region: string) {
  const map: Record<string, [number, number]> = {
    "Entrance": [1, 1], "Jungle": [3, 2], "Beach & Sea": [4, 2.5], "Mountain": [10, 5],
    "Volcano": [25, 10], "Hell": [50, 20], "Dragon's Domain": [100, 35], "Abyss": [200, 60],
    "Sky Citadel": [400, 110], "Time Rift": [800, 200], "Genesis Core": [1600, 400],
  };
  return map[region] ?? [1, 1];
}

function zoneScale(zone: string) {
  const map: Record<string, [number, number, number, number, number]> = {
    Easy: [.7, .75, .85, .75, .75], Normal: [1, 1, 1, 1, 1], Hard: [1.35, 1.3, 1.25, 1.35, 1.25], Brutal: [1.8, 1.6, 1.6, 1.75, 1.5],
  };
  return map[zone] ?? map.Normal;
}

const ROLE_MULTIPLIERS: Record<string, [number, number]> = {
  "Ice Wraith": [.7, 1.5], "Avalanche Beast": [1.4, .9], "Magma Imp": [.8, 1.3], "Ember Hound": [.8, 1.3], "Obsidian Golem": [1.4, .9], "Ash Wraith": [.7, 1.5], "Flame Salamander": [1, 1], "Cinder Brute": [1.4, .9],
  "Hellhound": [.8, 1.3], "Bone Colossus": [1.4, .9], "Chain Devil": [1, 1], "Demon Knight": [1, 1], "Plague Doctor": [.7, 1.5], "Fallen Seraph": [.7, 1.5], "Lich Acolyte": [.7, 1.5],
  "Wyvern": [.8, 1.3], "Drake Knight": [1, 1], "Dragonkin Mage": [.7, 1.5], "Broodmother": [1.4, .9], "Storm Dragon": [.8, 1.3], "Frost Dragon": [.8, 1.3], "Elder Wyrm": [1.4, .9],
  "Void Stalker": [.8, 1.3], "Eldritch Horror": [.7, 1.5], "Starfall Behemoth": [1.4, .9], "Entropy Wraith": [.7, 1.5], "Tide Colossus": [1.4, .9], "Void Sovereign Guard": [1, 1],
  "Cloud Sentinel": [1.4, .9], "Storm Harpy": [.8, 1.3], "Radiant Paladin": [1, 1], "Thunder Titan": [1.4, .9], "Aurora Weaver": [.7, 1.5], "Celestial Archon": [.7, 1.5],
  "Chrono Wisp": [.7, 1.5], "Paradox Knight": [1, 1], "Rift Stalker": [.8, 1.3], "Fossil Colossus": [1.4, .9], "Echo Phantom": [.7, 1.5], "Epoch Behemoth": [1.4, .9],
  "Origin Golem": [1.4, .9], "Primordial Serpent": [.8, 1.3], "Creation Weaver": [.7, 1.5], "Omega Sentinel": [1, 1], "Singularity Wraith": [.7, 1.5], "First Dragon": [1.4, .9],
};
const RANK_MULTIPLIERS: Record<string, [number, number, number]> = { Normal: [1,1,1], Elite: [2.5,1.8,1.25], Champion: [3.5,2.5,1.5], Cursed: [3.5,2.5,1.4], Mythic: [5,3.5,2], Paragon: [6.5,4.5,2.5], Apex: [8,6,3.5], Calamity: [10,8,5], Boss: [15,6,1] };

async function enabled(ctx: any) {
  const { data, error } = await ctx.supabaseAdmin.from("game_section_settings").select("enabled").eq("id", "dungeons").maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

async function loadRoom(ctx: any, roomNumber: number) {
  const { data, error } = await ctx.supabaseAdmin.from("dungeon_catalog_rooms").select("*").eq("room_number", roomNumber).single();
  if (error) throw error;
  return data;
}

async function buildCombatants(ctx: any, room: any) {
  const boss = room.room_type.startsWith("Boss Room") ? (await ctx.supabaseAdmin.from("dungeon_boss_catalog").select("*").eq("room_number", room.room_number).maybeSingle()).data : null;
  const encounter = weighted(room.encounters ?? [], (x: any) => probability(x.chance)) ?? { kind: "1", chance: "100%" };
  const isBoss = room.room_type.startsWith("Boss Room");
  const isTreasure = room.room_type.startsWith("Treasure Room");
  let count = Math.max(1, parseEncounterCount(encounter));
  if (isBoss) count = Math.max(0, count);
  const enemyRows = (room.enemies ?? []).filter((x: any) => !String(x.name).toLowerCase().includes("(boss)"));
  const combatants: any[] = [];
  if (isBoss && boss) {
    const bossRow = (room.enemies ?? []).find((x: any) => String(x.name).replace(/\s*\(boss\)$/, "") === boss.boss_name);
    if (bossRow) combatants.push(makeCombatant(boss.boss_name, bossRow, room, "Boss", true, 1));
  }
  const addCount = isBoss ? count : (isTreasure ? count : count);
  for (let i = 0; i < addCount; i++) {
    const row = weighted(enemyRows, (x: any) => probability(x.spawn)) ?? enemyRows[0];
    if (!row) continue;
    const rank = pickRank(room.ranks ?? []);
    combatants.push(makeCombatant(row.name, row, room, rank.rank, false, rank.essenceMultiplier));
  }
  return { combatants, encounter: encounter.kind, boss: boss?.boss_name ?? null };
}

function makeCombatant(name: string, row: any, room: any, rank: string, isBoss: boolean, essenceMultiplier: number) {
  const [regionHp, regionDmg] = regionScale(room.region);
  const [zoneHp, zoneDmg] = zoneScale(room.zone);
  const role = ROLE_MULTIPLIERS[name] ?? [1,1];
  const rankMult = RANK_MULTIPLIERS[rank] ?? RANK_MULTIPLIERS.Normal;
  const mutationRate = probability(String(room.mutation_summary).match(/chance:\s*([^\s]+)/i)?.[1] ?? "0");
  const mutated = !isBoss && Math.random() < mutationRate;
  const mutationTier = mutated ? weighted([
    {tier:"Common",w:72},{tier:"Uncommon",w:20},{tier:"Rare",w:6},{tier:"Epic",w:1.8},{tier:"Legendary",w:.2}
  ], x => x.w)?.tier : null;
  const mutationMult = mutationTier === "Common" ? [1.1,1.05,1.1] : mutationTier === "Uncommon" ? [1.25,1.15,1.25] : mutationTier === "Rare" ? [1.6,1.35,1.5] : mutationTier === "Epic" ? [2.5,1.8,2] : mutationTier === "Legendary" ? [5,3,3] : [1,1,1];
  const hp = Math.max(1, regionHp * zoneHp * rankMult[0] * role[0] * mutationMult[0] * (isBoss ? 1 + num((room.boss_repeat_bonus ?? 0),0) : 1));
  const dmg = Math.max(1, regionDmg * zoneDmg * rankMult[1] * role[1] * mutationMult[1] * (isBoss ? 1 + num((room.boss_repeat_bonus ?? 0),0) : 1));
  return { id: crypto.randomUUID(), name, rank, maxHp: hp, hp, damage: dmg, defense: Math.max(0, hp * .01), essenceMultiplier, mutated, mutationTier, drops: (drops as any)[name]?.items ?? [] };
}

export default { fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const playerId = uid(ctx); if (!playerId) return json({ error: "unauthenticated" }, 401);
  try {
    if (!(await enabled(ctx))) return json({ error: "feature_disabled", message: "Dungeons are currently disabled." }, 403);
    const body = await req.json().catch(() => ({})); const action = String(body.action ?? "catalog");
    if (action === "catalog") {
      const region = String(body.region ?? ""); const zone = String(body.zone ?? ""); const from = Math.max(1, Number(body.from ?? 1)); const to = Math.min(1500, Number(body.to ?? 1500));
      let q = ctx.supabaseAdmin.from("dungeon_catalog_rooms").select("room_number,room_type,region,zone,mob_level,base_count,room_key_chance,fog_chance").gte("room_number",from).lte("room_number",to).order("room_number");
      if (region) q=q.eq("region",region); if(zone) q=q.eq("zone",zone);
      const {data,error}=await q.limit(1500); if(error) throw error; return json({rooms:data??[]});
    }
    if (action === "room") {
      const room=await loadRoom(ctx,Number(body.roomNumber));
      const {data:boss}=await ctx.supabaseAdmin.from("dungeon_boss_catalog").select("*").eq("room_number",room.room_number).maybeSingle();
      return json({room,boss});
    }
    if (action === "mutations") { const {data,error}=await ctx.supabaseAdmin.from("dungeon_mutations").select("*").order("tier").order("name"); if(error)throw error; return json({mutations:data??[]}); }
    if (action === "inventory") {
      const [{data:materials,error:me},{data:essence,error:ee},{data:gear,error:ge}]=await Promise.all([
        ctx.supabaseAdmin.from("player_dungeon_materials").select("*").eq("player_id",playerId).order("material_name"),
        ctx.supabaseAdmin.from("player_dungeon_essence").select("*").eq("player_id",playerId),
        ctx.supabaseAdmin.from("dungeon_gear").select("*").eq("player_id",playerId).order("created_at",{ascending:false}).limit(100)
      ]); if(me||ee||ge) throw me||ee||ge; return json({materials:materials??[],essence:essence??[],gear:gear??[]});
    }
    if (action === "start") {
      const room=await loadRoom(ctx,Number(body.roomNumber));
      const {data:definition,error:de}=await ctx.supabaseAdmin.from("dungeon_definitions").select("id").eq("name","The 1,500-Room Dungeon").single(); if(de)throw de;
      const {combatants,encounter,boss}=await buildCombatants(ctx,room); if(!combatants.length) return json({error:"empty_room",message:"This room rolled an empty encounter."},400);
      const playerAttack=10+Math.max(0,num((await ctx.supabaseAdmin.from("players").select("max_equipment_tier").eq("id",playerId).single()).data?.max_equipment_tier))*2;
      const {data:run,error}=await ctx.supabaseAdmin.from("dungeon_runs").insert({player_id:playerId,dungeon_id:definition.id,room_number:room.room_number,enemy_ids:[],enemy_index:1,enemy_health:combatants[0].hp,player_health:100,status:"active",loot:[],combatants,room_state:{encounter,boss,zone:room.zone,region:room.region},player_attack:playerAttack}).select("*").single(); if(error)throw error;
      return json({run,room,combatant:combatants[0]});
    }
    if (action === "attack") {
      const {data:run,error:re}=await ctx.supabaseAdmin.from("dungeon_runs").select("*").eq("id",String(body.runId)).eq("player_id",playerId).eq("status","active").single(); if(re)throw re;
      const combatants=Array.isArray(run.combatants)?run.combatants:[]; const index=Math.max(0,Number(run.enemy_index||1)-1); const enemy=combatants[index]; if(!enemy)return json({error:"combat_finished"},409);
      const damage=Math.max(1,num(run.player_attack,10)-num(enemy.defense)); enemy.hp=Math.max(0,num(enemy.hp)-damage); let playerHp=num(run.player_health,100)-num(enemy.damage,10)*.08;
      let loot=Array.isArray(run.loot)?run.loot:[]; let nextIndex=index;
      if(enemy.hp<=0){
        const room=await loadRoom(ctx,Number(run.room_number));
        for(const d of enemy.drops??[]){ if(Math.random()<num(d.chance)) loot.push({type:"material",name:d.name,quantity:1,source:enemy.name,room:Number(run.room_number)}); }
        const mainEss=(room.region==="Entrance"?"TE":room.region==="Jungle"||room.region==="Beach & Sea"?"SE":room.region==="Mountain"||room.region==="Volcano"||room.region==="Hell"?"LE":"ME");
        const essBase=enemy.essenceMultiplier||1; const amount=Math.max(1,Math.round((1+Math.random()*2)*essBase)); loot.push({type:"essence",tier:mainEss,quantity:amount});
        if(enemy.mutated){
          const mutationName=(await ctx.supabaseAdmin.from("dungeon_mutations").select("name,shard_gem_power,core_gem_power").eq("tier",enemy.mutationTier).limit(20)).data;
          const chosen=weighted(mutationName??[],()=>1); if(chosen){loot.push({type:"material",name:`${chosen.name} Shard`,quantity:1,quantityIfAvailable:1,gem_power:chosen.shard_gem_power}); if(Math.random()<({Common:.08,Uncommon:.12,Rare:.18,Epic:.25,Legendary:.35} as any)[enemy.mutationTier])loot.push({type:"material",name:`${chosen.name} Core`,quantity:1,gem_power:chosen.core_gem_power});}
        }
        nextIndex=index+1;
        if(nextIndex<combatants.length){combatants[nextIndex].hp=combatants[nextIndex].maxHp;}
      }
      const status=nextIndex>=combatants.length?"won":playerHp<=0?"lost":"active";
      const {data:updated,error:ue}=await ctx.supabaseAdmin.from("dungeon_runs").update({combatants,enemy_index:nextIndex+1,enemy_health:combatants[nextIndex]?.hp??0,player_health:Math.max(0,playerHp),status,loot,updated_at:new Date().toISOString()}).eq("id",run.id).eq("status","active").select("*").single(); if(ue)throw ue;
      return json({run:updated,combatant:combatants[nextIndex]??null,won:status==="won",lost:status==="lost",defeated:enemy.name,damage});
    }
    if (action === "claim") {
      const {data:run,error:re}=await ctx.supabaseAdmin.from("dungeon_runs").select("*").eq("id",String(body.runId)).eq("player_id",playerId).eq("status","won").single(); if(re)throw re;
      const {data:claimed,error}=await ctx.supabaseAdmin.rpc("claim_dungeon_run_rewards",{p_run_id:run.id,p_player_id:playerId}); if(error)throw error; return json(claimed);
    }
    return json({error:"unknown_action"},400);
  } catch(e) { console.error("DUNGEON_ERROR",e); return json({error:"dungeon_server_error",message:e instanceof Error?e.message:String(e)},500); }
})};
