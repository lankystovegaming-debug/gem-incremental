import { withSupabase } from "npm:@supabase/server";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function jsonResponse(body:any,init:ResponseInit={}){return new Response(JSON.stringify(body),{...init,headers:{"Content-Type":"application/json",...corsHeaders,...(init.headers??{})}})}
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method==="OPTIONS") return new Response("ok",{status:200,headers:corsHeaders});
 const playerId=ctx.userClaims?.id; if(!playerId) return jsonResponse({error:"Could not identify player."},{status:401});
 let body:any={}; try{body=await req.json()}catch{}
 const specimenId=Number(body?.specimenId); if(!Number.isInteger(specimenId)||specimenId<=0) return jsonResponse({error:"Invalid specimen id."},{status:400});
 const {data:gem,error:loadError}=await ctx.supabaseAdmin.from("inventory_gems").select("id,player_id,locked").eq("id",specimenId).eq("player_id",playerId).maybeSingle();
 if(loadError) return jsonResponse({error:"Failed to load gem."},{status:500});
 if(!gem) return jsonResponse({error:"Gem not found."},{status:404});
 if(gem.locked) return jsonResponse({error:"Unlock this gem before deleting it."},{status:409});
 const {error:deleteError}=await ctx.supabaseAdmin.from("inventory_gems").delete().eq("id",specimenId).eq("player_id",playerId).eq("locked",false);
 if(deleteError) return jsonResponse({error:"Failed to delete gem."},{status:500});
 return jsonResponse({ok:true,specimenId});
})};
