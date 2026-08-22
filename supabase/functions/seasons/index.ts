import { withSupabase } from "npm:@supabase/server";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json",...cors}});
const uid=(ctx:any)=>ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;
async function enabled(ctx:any){const{data,error}=await ctx.supabaseAdmin.from("game_section_settings").select("enabled").eq("id","seasons").maybeSingle();if(error)throw error;return data?.enabled===true;}
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{try{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});const playerId=uid(ctx);if(!playerId)return json({error:"unauthenticated"},401);if(!(await enabled(ctx)))return json({error:"feature_disabled"},403);
 let body:any={};try{body=await req.json();}catch{}const action=String(body.action??"list");
 if(action==="list"){
  let{data:seasonId,error:ee}=await ctx.supabaseAdmin.rpc("ensure_player_season",{p_uid:playerId});if(ee)throw ee;
  if(!seasonId){const{data:latest,error:le}=await ctx.supabaseAdmin.from("season_definitions").select("id").eq("enabled",true).order("starts_at",{ascending:false}).limit(1).maybeSingle();if(le)throw le;seasonId=latest?.id;}
  if(!seasonId)return json({error:"no_active_season"},404);
  const{data:season,error:se}=await ctx.supabaseAdmin.from("season_definitions").select("*").eq("id",seasonId).single();if(se)throw se;
  const[{data:progress,error:pe},{data:missions,error:me},{data:rerolls,error:re}]=await Promise.all([
   ctx.supabaseAdmin.from("player_seasons").select("*").eq("season_id",seasonId).eq("player_id",playerId).single(),
   ctx.supabaseAdmin.from("player_season_missions").select("*").eq("season_id",seasonId).eq("player_id",playerId).gte("period_end",new Date().toISOString()).order("cadence").order("slot"),
   ctx.supabaseAdmin.from("player_season_rerolls").select("used,period_start").eq("season_id",seasonId).eq("player_id",playerId).eq("used",true)
  ]);if(pe)throw pe;if(me)throw me;if(re)throw re;
  return json({season,progress,missions:missions??[],rerolls:rerolls??[],serverNow:new Date().toISOString()});
 }
 if(action==="purchase-premium"){const{data,error}=await ctx.supabase.rpc("purchase_season_premium",{p_season_id:String(body.seasonId??"")});if(error)throw error;return json(data);}
 if(action==="claim-tier"){const{data,error}=await ctx.supabase.rpc("claim_season_tier",{p_season_id:String(body.seasonId??""),p_tier:Number(body.tier),p_lane:String(body.lane??"free")});if(error)throw error;return json(data);}
 if(action==="reroll-daily"){const{data,error}=await ctx.supabase.rpc("reroll_daily_season_mission",{p_season_id:String(body.seasonId??""),p_slot:Number(body.slot)});if(error)throw error;return json(data);}
 return json({error:"unknown_action"},400);
}catch(error){const message=error instanceof Error?error.message:String(error);console.error("SEASONS",error);const code=["not_enough_money","season_not_active","tier_locked","already_claimed","premium_required","claim_period_ended","mission_in_progress","reroll_used"].find(x=>message.includes(x))??"seasons_error";return json({error:code,message},code==="seasons_error"?500:409);}})};
