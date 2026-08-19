import { withSupabase } from "npm:@supabase/server";

const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json",...cors}});
function uid(ctx:any){return ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;}

export default {
  fetch: withSupabase({auth:"user"}, async(req,ctx)=>{
    if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
    const playerId=uid(ctx);
    if(!playerId) return json({error:"unauthenticated"},401);

    try{
      const {data:cfg,error:ce}=await ctx.supabaseAdmin
        .from("daily_spin_config").select("*").eq("id",true).single();
      if(ce) throw ce;
      if(!cfg.enabled) return json({error:"feature_disabled",message:"Daily Spin is currently disabled."},403);

      const body=await req.json().catch(()=>({}));
      const action=body.action||"config";

      if(action==="config"){
        const today=new Date().toISOString().slice(0,10);
        const {data:claim,error:claimError}=await ctx.supabaseAdmin
          .from("daily_spin_claims").select("claim_date,reward,created_at")
          .eq("player_id",playerId).eq("claim_date",today).maybeSingle();
        if(claimError) throw claimError;
        return json({
          config:{
            title:cfg.title,subtitle:cfg.subtitle,icon:cfg.icon,
            rewards:cfg.rewards??[]
          },
          claimed:Boolean(claim),
          claim:claim??null,
          claimDate:today
        });
      }

      if(action==="spin"){
        const {data,error}=await ctx.supabaseAdmin.rpc("claim_daily_spin");
        if(error){
          const msg=error.message||"";
          if(msg.includes("already_claimed")) return json({error:"already_claimed",message:"You already claimed today's spin."},409);
          if(msg.includes("feature_disabled")) return json({error:"feature_disabled"},403);
          throw error;
        }
        return json(data??{});
      }

      return json({error:"unknown_action"},400);
    }catch(e){
      console.error("DAILY_SPIN_ERROR",e);
      return json({error:"daily_spin_server_error",message:e instanceof Error?e.message:String(e)},500);
    }
  })
};
