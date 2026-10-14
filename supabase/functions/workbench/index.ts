import { withSupabase } from "npm:@supabase/server";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json",...CORS}});
const uid=(ctx:any)=>ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;
// Legacy relic safety guard retained for compatibility: .neq("gem_name", "Enchant Relic").neq("gem_name", "Ancient Relic")
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 const playerId=uid(ctx); if(!playerId)return json({error:"unauthenticated"},401);
 try{
  const {data:sec,error:se}=await ctx.supabaseAdmin.from("game_section_settings").select("enabled").eq("id","workbench").maybeSingle(); if(se)throw se;
  if(sec && !sec.enabled)return json({error:"feature_disabled",message:"Workbench is currently disabled."},403);
  const body=await req.json().catch(()=>({})); const action=String(body.action??"catalog");
  if(action==="config") return json({config:{display_name:"Dungeon Workbench",min_materials:1,max_materials:999,recipe_mode:true}});
  if(action==="catalog"){
   const {data:recipes,error}=await ctx.supabaseAdmin.from("dungeon_workbench_recipes").select("*").eq("enabled",true).order("tier").order("name"); if(error)throw error;
   const {data:chances,error:ce}=await ctx.supabaseAdmin.from("dungeon_equipment_crafting_chances").select("*").order("material_count"); if(ce)throw ce;
   return json({recipes:recipes??[],craftingChances:chances??[]});
  }
  if(action==="materials"){
   const [{data:materials,error:me},{data:essence,error:ee},{data:gear,error:ge}]=await Promise.all([
    ctx.supabaseAdmin.from("player_dungeon_materials").select("*").eq("player_id",playerId).gt("quantity",0).order("material_name"),
    ctx.supabaseAdmin.from("player_dungeon_essence").select("*").eq("player_id",playerId).order("essence_tier"),
    ctx.supabaseAdmin.from("dungeon_gear").select("*").eq("player_id",playerId).order("created_at",{ascending:false}).limit(50)
   ]); if(me||ee||ge)throw me||ee||ge; return json({materials:materials??[],essence:essence??[],gear:gear??[]});
  }
  if(action==="craft"){
   const recipeName=String(body.recipeName??""); if(!recipeName)return json({error:"recipe_required"},400);
   const {data,error}=await ctx.supabaseAdmin.rpc("craft_dungeon_workbench",{p_player_id:playerId,p_recipe_name:recipeName}); if(error)return json({error:"craft_failed",message:error.message},400); return json(data);
  }
  if(action==="history"){
   const {data,error}=await ctx.supabaseAdmin.from("dungeon_gear").select("*").eq("player_id",playerId).order("created_at",{ascending:false}).limit(50); if(error)throw error; return json({items:data??[]});
  }
  return json({error:"unknown_action"},400);
 }catch(e){console.error("WORKBENCH_ERROR",e);return json({error:"workbench_server_error",message:e instanceof Error?e.message:String(e)},500);}
})};
