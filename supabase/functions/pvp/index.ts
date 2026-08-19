import { withSupabase } from "npm:@supabase/server";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json",...cors}});
function uid(ctx:any){return ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;}
function clamp(n:number,min:number,max:number){return Math.max(min,Math.min(max,n));}

async function ensureEnabled(ctx:any){
  const {data,error}=await ctx.supabaseAdmin.from("game_section_settings").select("enabled").eq("id","pvp").single();
  if(error) throw error;
  if(!data?.enabled) throw new Error("feature_disabled");
}

export default {
 fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  const playerId=uid(ctx);if(!playerId)return json({error:"unauthenticated"},401);
  try{
   await ensureEnabled(ctx);
   const b=await req.json().catch(()=>({}));const a=b.action||"config";

   if(a==="config"){
     const {data:weapons,error}=await ctx.supabaseAdmin.from("pvp_weapon_definitions").select("*").eq("enabled",true).order("sort_order");
     if(error)throw error;
     return json({weapons:weapons??[]});
   }

   if(a==="start"){
     const opponentId=String(b.opponentId||"");
     if(!opponentId||opponentId===playerId)return json({error:"invalid_opponent"},400);
     const {data:opponent,error:oe}=await ctx.supabaseAdmin.from("players").select("id,username").eq("id",opponentId).single();
     if(oe||!opponent)return json({error:"opponent_not_found"},404);
     const {data:weapons,error:we}=await ctx.supabaseAdmin.from("pvp_weapon_definitions").select("*").eq("enabled",true).order("sort_order");
     if(we)throw we;
     const chosen=weapons?.find((x:any)=>x.id===String(b.weaponId))??weapons?.[0];
     if(!chosen)return json({error:"no_weapons"},400);
     const opponentWeapon=weapons?.find((x:any)=>x.id===String(b.opponentWeaponId))??weapons?.[0];
     const {data:match,error:me}=await ctx.supabaseAdmin.from("pvp_matches").insert({
       challenger_id:playerId,opponent_id:opponentId,
       challenger_weapon_id:chosen.id,opponent_weapon_id:opponentWeapon.id,
       challenger_hp:100,opponent_hp:100,turn_player_id:playerId,status:"active",battle_log:[]
     }).select("*").single();
     if(me)throw me;
     return json({match,weapon:chosen,opponentWeapon});
   }

   if(a==="state"){
     const id=String(b.matchId||"");
     const {data:m,error}=await ctx.supabaseAdmin.from("pvp_matches").select("*")
       .eq("id",id).or(`challenger_id.eq.${playerId},opponent_id.eq.${playerId}`).single();
     if(error)throw error;
     const weaponIds=[m.challenger_weapon_id,m.opponent_weapon_id].filter(Boolean);
     const {data:weapons,error:we}=await ctx.supabaseAdmin.from("pvp_weapon_definitions").select("*").in("id",weaponIds);
     if(we)throw we;
     return json({match:m,weapons:weapons??[]});
   }

   if(a==="attack"){
     const id=String(b.matchId||"");
     const {data:m,error:me}=await ctx.supabaseAdmin.from("pvp_matches").select("*")
       .eq("id",id).or(`challenger_id.eq.${playerId},opponent_id.eq.${playerId}`).single();
     if(me)throw me;
     if(m.status!=="active")return json({match:m,finished:true});
     if(m.turn_player_id!==playerId)return json({error:"not_your_turn"},409);

     const isChallenger=m.challenger_id===playerId;
     const weaponId=isChallenger?m.challenger_weapon_id:m.opponent_weapon_id;
     const opponentId=isChallenger?m.opponent_id:m.challenger_id;
     const {data:weapon,error:we}=await ctx.supabaseAdmin.from("pvp_weapon_definitions").select("*").eq("id",weaponId).single();
     if(we)throw we;
     const attacks=Array.isArray(weapon.attacks)?weapon.attacks:[];
     if(attacks.length<3)return json({error:"weapon_requires_three_attacks"},400);
     const attack=attacks.find((x:any)=>String(x.id)===String(b.attackId))??attacks[0];

     const base=Number(weapon.base_damage)||10;
     const damage=Math.max(1,Math.round(base*Math.max(0,Number(attack.damageMultiplier)||1)));
     let challengerHp=Number(m.challenger_hp), opponentHp=Number(m.opponent_hp);
     if(isChallenger)opponentHp=Math.max(0,opponentHp-damage);else challengerHp=Math.max(0,challengerHp-damage);

     let status="active",winnerId=null;
     if(opponentHp<=0||challengerHp<=0){
       status=opponentHp<=0&&challengerHp<=0?"draw":"won";
       winnerId=status==="draw"?null:playerId;
     }

     const log=Array.isArray(m.battle_log)?m.battle_log.slice(-49):[];
     log.push({playerId,attackId:attack.id,attackName:attack.name,damage,at:new Date().toISOString()});

     // Simple turn-based combat: the defender gets the next turn.
     const nextTurn=status==="active"?opponentId:playerId;
     const {data:updated,error:ue}=await ctx.supabaseAdmin.from("pvp_matches").update({
       challenger_hp:challengerHp,opponent_hp:opponentHp,
       turn_player_id:nextTurn,status,winner_id:winnerId,battle_log:log,updated_at:new Date().toISOString()
     }).eq("id",id).eq("status","active").select("*").single();
     if(ue)throw ue;
     return json({match:updated,attack:{...attack,damage},finished:status!=="active"});
   }

   return json({error:"unknown_action"},400);
  }catch(e){
   const msg=e instanceof Error?e.message:String(e);
   if(msg==="feature_disabled")return json({error:"feature_disabled",message:"PvP is currently disabled."},403);
   console.error("PVP_ERROR",e);
   return json({error:"pvp_server_error",message:msg},500);
  }
 })
};
