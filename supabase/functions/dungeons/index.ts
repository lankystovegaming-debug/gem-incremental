import { withSupabase } from "npm:@supabase/server";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json",...cors}});
function uid(ctx:any){return ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;}
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});const playerId=uid(ctx);if(!playerId)return json({error:"unauthenticated"},401);
 try{
  const {data:sec,error:se}=await ctx.supabaseAdmin.from("game_section_settings").select("enabled").eq("id","dungeons").single();if(se)throw se;if(!sec.enabled)return json({error:"feature_disabled",message:"Dungeons are currently disabled."},403);
  const b=await req.json().catch(()=>({}));const a=b.action||"list";
  if(a==="list"){const {data,error}=await ctx.supabaseAdmin.from("dungeon_definitions").select("*").eq("enabled",true).order("sort_order");if(error)throw error;return json({dungeons:data??[]});}
  if(a==="start"){
   const {data:player,error:pe}=await ctx.supabaseAdmin.from("players").select("total_rolls,max_equipment_tier").eq("id",playerId).single();if(pe)throw pe;
   const {data:d,error}=await ctx.supabaseAdmin.from("dungeon_definitions").select("*").eq("id",String(b.dungeonId)).eq("enabled",true).single();if(error)throw error;
   const req=d.entry_requirements||{};if(Number(req.minRolls||0)>Number(player.total_rolls||0)||Number(req.minAllEquipmentTier||0)>Number(player.max_equipment_tier||0))return json({error:"requirements_not_met",requirements:req},400);
   const {data:e,error:ee}=await ctx.supabaseAdmin.from("dungeon_enemies").select("*").eq("dungeon_id",d.id).eq("enabled",true).order("sort_order").limit(d.max_enemies);if(ee)throw ee;if(!e?.length)return json({error:"no_enemies"},400);
   const ids=e.map((x:any)=>x.id);const {data:r,error:re}=await ctx.supabaseAdmin.from("dungeon_runs").insert({player_id:playerId,dungeon_id:d.id,enemy_ids:ids,enemy_index:1,enemy_health:e[0].max_health,player_health:100,status:"active"}).select("*").single();if(re)throw re;return json({run:r,enemy:e[0]});
  }
  if(a==="attack"){
   const {data:r,error:re}=await ctx.supabaseAdmin.from("dungeon_runs").select("*").eq("id",String(b.runId)).eq("player_id",playerId).eq("status","active").single();if(re)throw re;
   const {data:enemy,error:ee}=await ctx.supabaseAdmin.from("dungeon_enemies").select("*").eq("id",r.enemy_ids[r.enemy_index-1]).single();if(ee)throw ee;
   const damage=Math.max(1,Number(b.damage??10)-Number(enemy.defense??0));let eh=Math.max(0,Number(r.enemy_health)-damage);let ph=Number(r.player_health)-Number(enemy.attack??10);
   let idx=r.enemy_index,status="active";let loot=r.loot||[];
   if(eh<=0){if(Array.isArray(enemy.loot))loot=[...loot,...enemy.loot];idx+=1;const {data:next}=await ctx.supabaseAdmin.from("dungeon_enemies").select("*").eq("id",r.enemy_ids[idx-1]??"").maybeSingle();if(next)eh=next.max_health;else status="won";}
   if(ph<=0)status="lost";
   const {data:u,error:ue}=await ctx.supabaseAdmin.from("dungeon_runs").update({enemy_index:idx,enemy_health:eh,player_health:Math.max(0,ph),status,loot,updated_at:new Date().toISOString()}).eq("id",r.id).select("*").single();if(ue)throw ue;
   return json({run:u,won:status==="won",lost:status==="lost"});
  }
  if(a==="claim"){
   const {data:r,error:re}=await ctx.supabaseAdmin.from("dungeon_runs").select("*").eq("id",String(b.runId)).eq("player_id",playerId).eq("status","won").single();if(re)throw re;
   const {data:d,error:de}=await ctx.supabaseAdmin.from("dungeon_definitions").select("rewards").eq("id",r.dungeon_id).single();if(de)throw de;
   const rewards={...(d?.rewards||{}),loot:r.loot||[]};
   if(Number(rewards.money||0))await ctx.supabaseAdmin.rpc("increment_player_money",{p_player_id:playerId,p_amount:Number(rewards.money)}).catch(()=>{});
   const {data:u,error:ue}=await ctx.supabaseAdmin.from("dungeon_runs").update({status:"claimed",updated_at:new Date().toISOString()}).eq("id",r.id).select("*").single();if(ue)throw ue;return json({ok:true,rewards});
  }
  return json({error:"unknown_action"},400);
 }catch(e){console.error("DUNGEON_ERROR",e);return json({error:"dungeon_server_error",message:e instanceof Error?e.message:String(e)},500);}
})};
