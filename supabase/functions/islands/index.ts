import { withSupabase } from "npm:@supabase/server";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json",...cors}});
function uid(ctx:any){return ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;}

async function enabled(ctx:any){
 const {data,error}=await ctx.supabaseAdmin.from("game_section_settings").select("enabled").eq("id","islands").single();
 if(error) throw error; return data?.enabled===true;
}
function num(v:any){const n=Number(v);return Number.isFinite(n)?n:0;}
async function meets(req:any, player:any){
 if(!req||typeof req!=="object") return true;
 if(num(req.minRolls)>num(player.total_rolls)) return false;
 if(num(req.minMoney)>num(player.money)) return false;
 if(num(req.minCoins)>num(player.coins)) return false;
 if(num(req.minAllEquipmentTier)>num(player.max_equipment_tier)) return false;
 if(num(req.minPickaxeTier)>num(player.pickaxe_tier)) return false;
 if(num(req.minBagTier)>num(player.bag_tier)) return false;
 return true;
}
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const playerId=uid(ctx); if(!playerId)return json({error:"unauthenticated"},401);
 try{
  if(!(await enabled(ctx)))return json({error:"feature_disabled",message:"Islands are currently disabled."},403);
  const {data:player,error:pe}=await ctx.supabaseAdmin.from("players").select("id,total_rolls,money,coins,max_equipment_tier,pickaxe_tier,bag_tier,current_island_id").eq("id",playerId).single();
  if(pe) return json({error:"player_load_failed",message:pe.message},500);
  const {data:islands,error:ie}=await ctx.supabaseAdmin.from("island_definitions").select("*").eq("enabled",true).order("sort_order");
  if(ie)throw ie;
  const body=await req.json().catch(()=>({})); const action=body.action||"list";
  if(action==="list")return json({islands:islands??[],currentIslandId:player.current_island_id??null});
  if(action==="unlock"){
   const island=(islands??[]).find((x:any)=>x.id===body.islandId); if(!island)return json({error:"island_not_found"},404);
   if(!(await meets(island.unlock_requirements,player)))return json({error:"requirements_not_met",requirements:island.unlock_requirements},400);
   const {error}=await ctx.supabaseAdmin.from("player_island_progress").upsert({player_id:playerId,island_id:island.id,unlocked:true,unlocked_at:new Date().toISOString()},{onConflict:"player_id,island_id"});
   if(error)throw error;
   return json({ok:true,islandId:island.id});
  }
  if(action==="travel"){
   const island=(islands??[]).find((x:any)=>x.id===body.islandId); if(!island)return json({error:"island_not_found"},404);
   const {data:p}=await ctx.supabaseAdmin.from("player_island_progress").select("unlocked").eq("player_id",playerId).eq("island_id",island.id).maybeSingle();
   if(island.island_number!==1 && !p?.unlocked && !(await meets(island.unlock_requirements,player)))return json({error:"island_locked",requirements:island.unlock_requirements},400);
   await ctx.supabaseAdmin.from("players").update({current_island_id:island.id}).eq("id",playerId);
   return json({ok:true,islandId:island.id,boosts:island.boosts});
  }
  return json({error:"unknown_action"},400);
 }catch(e){console.error("ISLANDS_ERROR",e);return json({error:"islands_server_error",message:e instanceof Error?e.message:String(e)},500);}
})};
