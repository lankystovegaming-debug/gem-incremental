import { withSupabase } from "npm:@supabase/server";
import drops from "./drop-data.json" with { type: "json" };

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json",...CORS}});
const uid=(ctx:any)=>ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;
const num=(v:unknown,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f};

function probability(value:unknown){
 const s=String(value??"").trim().replace(/,/g,"");
 if(!s)return 0;
 if(s.endsWith("%"))return Math.max(0,Math.min(1,Number(s.slice(0,-1))/100));
 const m=s.match(/^1\/([0-9.]+)([KMBT]?)$/i); if(!m)return 0;
 const scale:any={"":1,K:1e3,M:1e6,B:1e9,T:1e12}; return 1/(Number(m[1])*(scale[m[2].toUpperCase()]??1));
}
function weighted<T>(items:T[],weight:(x:T)=>number){
 const total=items.reduce((s,x)=>s+Math.max(0,weight(x)),0); if(total<=0)return items[0]??null;
 let r=Math.random()*total; for(const x of items){r-=Math.max(0,weight(x));if(r<=0)return x} return items[items.length-1]??null;
}
function parseRange(s:string,f=1){
 const m=String(s??"").match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/); if(m)return Math.floor(Number(m[1])+Math.random()*(Number(m[2])-Number(m[1])+1));
 const n=String(s??"").match(/\d+(?:\.\d+)?/); return n?Math.floor(Number(n[0])):f;
}
function regionScale(region:string){return ({"Entrance":[1,1],"Jungle":[3,2],"Beach & Sea":[4,2.5],"Mountain":[10,5],"Volcano":[25,10],"Hell":[50,20],"Dragon's Domain":[100,35],"Abyss":[200,60],"Sky Citadel":[400,110],"Time Rift":[800,200],"Genesis Core":[1600,400]} as any)[region]??[1,1]}
function zoneScale(zone:string){return ({Easy:[.7,.75,.85,.75,.75],Normal:[1,1,1,1,1],Hard:[1.35,1.3,1.25,1.35,1.25],Brutal:[1.8,1.6,1.6,1.75,1.5]} as any)[zone]??[1,1,1,1,1]}
const ROLE:any={
 "Ice Wraith":[.7,1.5],"Avalanche Beast":[1.4,.9],"Magma Imp":[.8,1.3],"Ember Hound":[.8,1.3],"Obsidian Golem":[1.4,.9],"Ash Wraith":[.7,1.5],"Cinder Brute":[1.4,.9],"Hellhound":[.8,1.3],"Bone Colossus":[1.4,.9],"Plague Doctor":[.7,1.5],"Fallen Seraph":[.7,1.5],"Lich Acolyte":[.7,1.5],"Wyvern":[.8,1.3],"Dragonkin Mage":[.7,1.5],"Broodmother":[1.4,.9],"Storm Dragon":[.8,1.3],"Frost Dragon":[.8,1.3],"Elder Wyrm":[1.4,.9],"Void Stalker":[.8,1.3],"Eldritch Horror":[.7,1.5],"Starfall Behemoth":[1.4,.9],"Entropy Wraith":[.7,1.5],"Tide Colossus":[1.4,.9],"Cloud Sentinel":[1.4,.9],"Storm Harpy":[.8,1.3],"Thunder Titan":[1.4,.9],"Aurora Weaver":[.7,1.5],"Celestial Archon":[.7,1.5],"Chrono Wisp":[.7,1.5],"Paradox Knight":[1,1],"Rift Stalker":[.8,1.3],"Fossil Colossus":[1.4,.9],"Echo Phantom":[.7,1.5],"Epoch Behemoth":[1.4,.9],"Origin Golem":[1.4,.9],"Primordial Serpent":[.8,1.3],"Creation Weaver":[.7,1.5],"Omega Sentinel":[1,1],"Singularity Wraith":[.7,1.5],"First Dragon":[1.4,.9]
};
const RANK:any={Normal:[1,1,1],Elite:[2.5,1.8,1.25],Champion:[3.5,2.5,1.5],Cursed:[3.5,2.5,1.4],Mythic:[5,3.5,2],Paragon:[6.5,4.5,2.5],Apex:[8,6,3.5],Calamity:[10,8,5],Boss:[15,6,1]};
const MUTATION_TIER:any={Common:[1.1,1.05,1.1],Uncommon:[1.25,1.15,1.25],Rare:[1.6,1.35,1.5],Epic:[2.5,1.8,2],Legendary:[5,3,3]};
const REGION_CODES:any={"Entrance":["Ent"],"Jungle":["Jun"],"Beach & Sea":["Sea"],"Mountain":["Mtn"],"Volcano":["Vol"],"Hell":["Hel"],"Dragon's Domain":["Dra"],"Abyss":["Aby"],"Sky Citadel":["Sky"],"Time Rift":["Rft"],"Genesis Core":["Gen"]};

async function enabled(ctx:any,id:string){const {data,error}=await ctx.supabaseAdmin.from("game_section_settings").select("enabled").eq("id",id).maybeSingle();if(error)throw error;return data?.enabled===true}
async function loadRoom(ctx:any,n:number){if(!Number.isInteger(n)||n<1||n>1500)throw new Error("invalid_room");const {data,error}=await ctx.supabaseAdmin.from("dungeon_catalog_rooms").select("*").eq("room_number",n).single();if(error)throw error;return data}
async function playerStats(ctx:any,pid:string){const {data,error}=await ctx.supabaseAdmin.from("players").select("id,total_rolls,max_equipment_tier").eq("id",pid).single();if(error)throw error;return data}
async function canEnter(ctx:any,pid:string,room:number){
 const player=await playerStats(ctx,pid);
 if(num(player.total_rolls)<1)return {ok:false,error:"entry_requirements_not_met",requirements:{minRolls:1}};
 if(room===1)return {ok:true,player};
 const {data,error}=await ctx.supabaseAdmin.from("dungeon_room_progress").select("room_number").eq("player_id",pid).eq("room_number",room-1).maybeSingle();
 if(error)throw error;
 if(!data)return {ok:false,error:"room_locked",previousRoom:room-1};
 return {ok:true,player};
}
function encounterNumber(kind:string){const m=String(kind).match(/(\d+)/);return m?Number(m[1]):0}
function parseMutationSummary(s:string){
 const out:any={};
 for(const t of ["Common","Uncommon","Rare","Epic","Legendary"]){const m=String(s).match(new RegExp(t+"[^%]*?([0-9.]+)%"));if(m)out[t]=Number(m[1])/100}
 return out;
}
async function chooseMutation(ctx:any,room:any,tier:string){
 const {data,error}=await ctx.supabaseAdmin.from("dungeon_mutations").select("name,tier,native_regions,value_multiplier,shard_gem_power,core_gem_power,best_odds").eq("tier",tier);if(error)throw error;
 const codes=REGION_CODES[room.region]??[]; const eligible=(data??[]).filter((m:any)=>{const rs=m.native_regions??[];return rs.includes("Any")||rs.some((x:string)=>codes.includes(x))});
 return weighted(eligible.length?eligible:(data??[]),(m:any)=>{const p=probability(String(m.best_odds).replace(/^1 in /i,"1/"));return p||1});
}
function pickRank(room:any){const rows=(room.ranks??[]).filter((r:any)=>r.rank!=="Boss");const r=weighted(rows,(x:any)=>probability(x.spawn));return r?{rank:r.rank,essenceMultiplier:Math.max(1,num(String(r.ess).replace(/^x/i,""),1))}:{rank:"Normal",essenceMultiplier:1}}
function enemyBaseStats(room:any,row:any,rank:string,mut:any,bossRepeat=0){
 const [rh,rd]=regionScale(room.region),[zh,zd]=zoneScale(room.zone),role=ROLE[row.name]??[1,1],rm=RANK[rank]??RANK.Normal,mm=MUTATION_TIER[mut?.tier]??[1,1,1],repeat=1+Math.max(0,bossRepeat);
 return {hp:Math.max(1,rh*zh*rm[0]*role[0]*mm[0]*repeat),damage:Math.max(1,rd*zd*rm[1]*role[1]*mm[1]*repeat),defense:Math.max(0,rh*zh*rm[0]*role[0]*mm[0]*.01)};
}
async function makeCombatant(ctx:any,room:any,row:any,rank:string,isBoss=false,essMult=1,bossRepeat=0){
 let mutation:null|any=null;
 const split=parseMutationSummary(room.mutation_summary);
 if(!isBoss){const roll=Math.random();let acc=0;for(const tier of ["Common","Uncommon","Rare","Epic","Legendary"]){acc+=split[tier]??0;if(roll<acc){mutation=await chooseMutation(ctx,room,tier);break}}}
 const st=enemyBaseStats(room,row,rank,mutation,isBoss?bossRepeat:0);
 const itemDrops=(drops as any)[row.name]?.items??[];
 return {id:crypto.randomUUID(),name:row.name,rank,maxHp:st.hp,hp:st.hp,damage:st.damage,defense:st.defense,essenceMultiplier:essMult,mutated:!!mutation,mutationTier:mutation?.tier??null,mutationName:mutation?.name??null,mutationData:mutation,drops:itemDrops};
}
function parseMaterialAmount(amount:string){const m=String(amount??"").match(/(\d+)\s*[–-]\s*(\d+)/);if(m)return Math.max(1,Math.floor(Number(m[1])+Math.random()*(Number(m[2])-Number(m[1])+1)));const n=String(amount??"").match(/(\d+)/);return n?Math.max(1,Number(n[1])):1}
function essenceFromEnemy(row:any,rankMult:number){
 const tiers=["TE","SE","LE","ME"];const probs=tiers.map(t=>probability(row[t]));for(let i=0;i<tiers.length;i++)if(Math.random()<Math.min(1,probs[i]*rankMult))return {tier:tiers[i],quantity:parseMaterialAmount(row.amount)};return null;
}
function tablePick(table:any[]){return weighted(table??[],(x:any)=>probability(x.chance))}
async function gearDrops(ctx:any,room:any,enemy:any){
 const rewards:number[]=[];const z=zoneScale(room.zone)[2];const isBoss=enemy.rank==="Boss";const isTreasure=String(room.room_type).startsWith("Treasure Room");
 const mult=isBoss?2.5:isTreasure?2.2:1;
 const weaponChance=Math.min(.95,probability(room.weapon_chance)*z*mult),armorChance=Math.min(.95,probability(room.armor_chance)*z*mult);
 const out:any[]=[];
 if(Math.random()<weaponChance){const item=tablePick(room.weapon_table);if(item)out.push({type:"gear",room:room.room_number,source_enemy:enemy.name,item_type:"weapon",name:item.name,quality:item.quality,upgrade_level:parseInt(String(item.level).replace("+",""))||0,components:item.components,gem_power:0,mutation_name:enemy.mutationName??null,stats:{quality:item.quality,components:item.components,room:room.room_number}})}
 if(Math.random()<armorChance){const item=tablePick(room.armor_table);if(item)out.push({type:"gear",room:room.room_number,source_enemy:enemy.name,item_type:"armor",name:item.name,quality:item.quality,upgrade_level:parseInt(String(item.level).replace("+",""))||0,components:item.components,gem_power:0,mutation_name:enemy.mutationName??null,stats:{quality:item.quality,components:item.components,room:room.room_number}})}
 return out;
}
async function buildCombatants(ctx:any,room:any){
 const isBoss=String(room.room_type).startsWith("Boss Room"),isTreasure=String(room.room_type).startsWith("Treasure Room");
 const encounterRows=(room.encounters??[]).filter((x:any)=>x&&x.kind);
 if(isBoss){
  const bossCountRow=weighted(encounterRows.filter((x:any)=>/boss/i.test(x.kind)),(x:any)=>probability(x.chance));
  const addCountRow=weighted(encounterRows.filter((x:any)=>/add/i.test(x.kind)),(x:any)=>probability(x.chance));
  const bossCount=Math.max(1,encounterNumber(bossCountRow?.kind??"1 boss")),addCount=Math.max(0,encounterNumber(addCountRow?.kind??"0 adds"));
  const {data:boss,error}=await ctx.supabaseAdmin.from("dungeon_boss_catalog").select("*").eq("room_number",room.room_number).maybeSingle();if(error)throw error;
  const bossName=String(boss?.boss_name??"");const bossRow=(room.enemies??[]).find((x:any)=>String(x.name).replace(/\s*\(boss\)$/i,"")===bossName)||{name:bossName||"Dungeon Boss",spawn:"100%",amount:"1 ME",ME:"100%"};
  const list:any[]=[];for(let i=0;i<bossCount;i++)list.push(await makeCombatant(ctx,room,bossRow,"Boss",true,1,num(boss?.repeat_bonus)));
  const enemyRows=(room.enemies??[]).filter((x:any)=>!String(x.name).toLowerCase().includes("(boss)"));
  for(let i=0;i<addCount;i++){const row=weighted(enemyRows,(x:any)=>probability(x.spawn));if(row){const r=pickRank(room);list.push(await makeCombatant(ctx,room,row,r.rank,false,r.essenceMultiplier))}}
  return {combatants:list,encounter:`${bossCount} boss + ${addCount} adds`,treasure:null,boss:boss?.boss_name??null,bossRepeat:num(boss?.repeat_bonus)};
 }
 if(isTreasure){
  const chosen=weighted(encounterRows.filter((x:any)=>/chest|mimic/i.test(x.kind)),(x:any)=>probability(x.chance));
  const kind=String(chosen?.kind??"Chest only (safe)");const guards=encounterNumber(kind);
  const treasure=kind.toLowerCase().includes("mimic")?"mimic":"chest";
  const loot:any[]=[{type:"treasure",treasure,quantity:1,room:room.room_number}];
  if(guards>0){const rows=(room.enemies??[]).filter((x:any)=>!String(x.name).toLowerCase().includes("(boss)"));const list:any[]=[];for(let i=0;i<guards;i++){const row=weighted(rows,(x:any)=>probability(x.spawn));if(row){const r=pickRank(room);list.push(await makeCombatant(ctx,room,row,r.rank,false,r.essenceMultiplier))}}return {combatants:list,encounter:kind,treasure:loot,boss:null,bossRepeat:0}}
  return {combatants:[],encounter:kind,treasure:loot,boss:null,bossRepeat:0};
 }
 const chosen=weighted(encounterRows.filter((x:any)=>/^\d/.test(String(x.kind))||/ambush/i.test(String(x.kind))),(x:any)=>probability(x.chance));
 const count=encounterNumber(chosen?.kind??"1");if(count<=0)return {combatants:[],encounter:chosen?.kind??"0 (empty room)",treasure:null,boss:null,bossRepeat:0};
 const rows=(room.enemies??[]).filter((x:any)=>!String(x.name).toLowerCase().includes("(boss)"));const list:any[]=[];
 for(let i=0;i<count;i++){const row=weighted(rows,(x:any)=>probability(x.spawn));if(row){const r=pickRank(room);list.push(await makeCombatant(ctx,room,row,r.rank,false,r.essenceMultiplier))}}
 return {combatants:list,encounter:chosen?.kind??String(count),treasure:null,boss:null,bossRepeat:0};
}
async function playerCombatPower(ctx:any,pid:string){
 const {data:player,error}=await ctx.supabaseAdmin.from("players").select("max_equipment_tier").eq("id",pid).single();if(error)throw error;
 const {data:gear,error:ge}=await ctx.supabaseAdmin.from("dungeon_gear").select("gem_power,upgrade_level").eq("player_id",pid).order("gem_power",{ascending:false}).limit(10);if(ge)throw ge;
 const gp=Math.max(0,...(gear??[]).map((g:any)=>num(g.gem_power)));const tier=num(player.max_equipment_tier);
 return {attack:10+tier*2+Math.floor(gp/10000),health:100+Math.floor(gp/5000),gemPower:gp};
}
async function awardEnemyLoot(ctx:any,room:any,enemy:any,loot:any[]){
 for(const d of enemy.drops??[])if(Math.random()<num(d.chance))loot.push({type:"material",name:d.name,quantity:1,source:enemy.name,room:room.room_number});
 const essenceRow=(room.enemies??[]).find((x:any)=>x.name===enemy.name);if(essenceRow){const e=essenceFromEnemy(essenceRow,enemy.essenceMultiplier??1);if(e){const mutMult=enemy.mutated?(MUTATION_TIER[enemy.mutationTier]?.[2]??1):1;e.quantity=Math.max(1,Math.round(e.quantity*mutMult));loot.push({type:"essence",tier:e.tier,quantity:e.quantity,source:enemy.name})}}
 if(enemy.mutated&&enemy.mutationData){const tier=enemy.mutationTier;const shard={Common:.08,Uncommon:.12,Rare:.18,Epic:.25,Legendary:.35}[tier]??0;const core={Common:.005,Uncommon:.01,Rare:.02,Epic:.04,Legendary:.08}[tier]??0;if(Math.random()<shard)loot.push({type:"material",name:`${enemy.mutationName} Shard`,quantity:1,gem_power:enemy.mutationData.shard_gem_power,source:enemy.name,room:room.room_number});if(Math.random()<core)loot.push({type:"material",name:`${enemy.mutationName} Core`,quantity:1,gem_power:enemy.mutationData.core_gem_power,source:enemy.name,room:room.room_number})}
 loot.push(...await gearDrops(ctx,room,enemy));
 if(Math.random()<probability(room.room_key_chance))loot.push({type:"key",room:room.room_number,quantity:1});
}

export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 const playerId=uid(ctx);if(!playerId)return json({error:"unauthenticated"},401);
 try{
  if(!(await enabled(ctx,"dungeons")))return json({error:"feature_disabled",message:"Dungeons are currently disabled."},403);
  const body=await req.json().catch(()=>({}));const action=String(body.action??"catalog");
  if(action==="catalog"){const from=Math.max(1,Number(body.from??1)),to=Math.min(1500,Number(body.to??1500));let q=ctx.supabaseAdmin.from("dungeon_catalog_rooms").select("room_number,room_type,region,zone,mob_level,base_count,room_key_chance,fog_chance,weapon_chance,armor_chance").gte("room_number",from).lte("room_number",to).order("room_number");if(body.region)q=q.eq("region",String(body.region));if(body.zone)q=q.eq("zone",String(body.zone));const {data,error}=await q.limit(1500);if(error)throw error;return json({rooms:data??[]})}
  if(action==="room"){const room=await loadRoom(ctx,Number(body.roomNumber));const {data:boss}=await ctx.supabaseAdmin.from("dungeon_boss_catalog").select("*").eq("room_number",room.room_number).maybeSingle();const {data:progress}=await ctx.supabaseAdmin.from("dungeon_room_progress").select("room_number,completed_at").eq("player_id",playerId).eq("room_number",room.room_number).maybeSingle();return json({room,boss,completed:!!progress})}
  if(action==="mutations"){const {data,error}=await ctx.supabaseAdmin.from("dungeon_mutations").select("*").order("tier").order("name");if(error)throw error;return json({mutations:data??[]})}
  if(action==="inventory"){const [{data:materials,error:me},{data:essence,error:ee},{data:gear,error:ge}]=await Promise.all([ctx.supabaseAdmin.from("player_dungeon_materials").select("*").eq("player_id",playerId).order("material_name"),ctx.supabaseAdmin.from("player_dungeon_essence").select("*").eq("player_id",playerId),ctx.supabaseAdmin.from("dungeon_gear").select("*").eq("player_id",playerId).order("created_at",{ascending:false}).limit(100)]);if(me||ee||ge)throw me||ee||ge;return json({materials:materials??[],essence:essence??[],gear:gear??[]})}
  if(action==="progress"){const {data,error}=await ctx.supabaseAdmin.from("dungeon_room_progress").select("room_number,completed_at").eq("player_id",playerId).order("room_number");if(error)throw error;return json({progress:data??[]})}
  if(action==="start"){
   const room=await loadRoom(ctx,Number(body.roomNumber));const access=await canEnter(ctx,playerId,room.room_number);if(!access.ok)return json(access,403);
   const {data:def,error:de}=await ctx.supabaseAdmin.from("dungeon_definitions").select("id,entry_requirements").eq("name","The 1,500-Room Dungeon").single();if(de)throw de;
   const reqs=def.entry_requirements??{};if(num(reqs.minRolls)>num(access.player.total_rolls))return json({error:"entry_requirements_not_met",requirements:reqs},403);
   const built=await buildCombatants(ctx,room);const power=await playerCombatPower(ctx,playerId);const loot=built.treasure??[];const status=built.combatants.length?"active":"won";
   const {data:run,error}=await ctx.supabaseAdmin.from("dungeon_runs").insert({player_id:playerId,dungeon_id:def.id,room_number:room.room_number,enemy_ids:[],enemy_index:1,enemy_health:built.combatants[0]?.hp??0,player_health:power.health,status,loot,combatants:built.combatants,room_state:{encounter:built.encounter,boss:built.boss,zone:room.zone,region:room.region,bossRepeat:built.bossRepeat},player_attack:power.attack}).select("*").single();if(error)throw error;
   return json({run,room,combatant:built.combatants[0]??null,completedWithoutCombat:!built.combatants.length})
  }
  if(action==="attack"){
   const {data:run,error:re}=await ctx.supabaseAdmin.from("dungeon_runs").select("*").eq("id",String(body.runId)).eq("player_id",playerId).eq("status","active").single();if(re)throw re;
   const combatants=Array.isArray(run.combatants)?run.combatants:[];const index=Math.max(0,num(run.enemy_index,1)-1);const enemy=combatants[index];if(!enemy)return json({error:"combat_finished"},409);
   const damage=Math.max(1,num(run.player_attack,10)-num(enemy.defense));enemy.hp=Math.max(0,num(enemy.hp)-damage);let playerHp=num(run.player_health,100)-num(enemy.damage,10)*.08;let loot=Array.isArray(run.loot)?run.loot:[];let next=index;
   if(enemy.hp<=0){const room=await loadRoom(ctx,Number(run.room_number));await awardEnemyLoot(ctx,room,enemy,loot);next=index+1;if(next<combatants.length)combatants[next].hp=combatants[next].maxHp}
   const status=next>=combatants.length?"won":playerHp<=0?"lost":"active";const {data:updated,error:ue}=await ctx.supabaseAdmin.from("dungeon_runs").update({combatants,enemy_index:next+1,enemy_health:combatants[next]?.hp??0,player_health:Math.max(0,playerHp),status,loot,updated_at:new Date().toISOString()}).eq("id",run.id).eq("status","active").select("*").single();if(ue)throw ue;
   return json({run:updated,combatant:combatants[next]??null,won:status==="won",lost:status==="lost",defeated:enemy.name,damage})
  }
  if(action==="claim"){
   const {data:run,error:re}=await ctx.supabaseAdmin.from("dungeon_runs").select("*").eq("id",String(body.runId)).eq("player_id",playerId).eq("status","won").single();if(re)throw re;
   const {data:claimed,error}=await ctx.supabaseAdmin.rpc("claim_dungeon_run_rewards",{p_run_id:run.id,p_player_id:playerId});if(error)throw error;return json(claimed)
  }
  return json({error:"unknown_action"},400)
 }catch(e){console.error("DUNGEON_ERROR",e);return json({error:"dungeon_server_error",message:e instanceof Error?e.message:String(e)},500)}
})};
