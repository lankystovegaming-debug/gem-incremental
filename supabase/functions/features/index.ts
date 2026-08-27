import { withSupabase } from "npm:@supabase/server";
import { Redis } from "npm:@upstash/redis";
import { Ratelimit } from "npm:@upstash/ratelimit";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json",...cors}});
function uid(ctx:any){return ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;}
const redis=new Redis({url:Deno.env.get("UPSTASH_REDIS_REST_URL"),token:Deno.env.get("UPSTASH_REDIS_REST_TOKEN")});
const guildCreateRateLimit=new Ratelimit({redis,limiter:Ratelimit.slidingWindow(3,"10 m"),prefix:"ratelimit:guild-create",analytics:false});
async function limitGuildCreation(userId:string){
 try{
  const result=await guildCreateRateLimit.limit(userId);
  if(result.success)return null;
  const retryAfterSeconds=Math.max(1,Math.ceil((result.reset-Date.now())/1000));
  return new Response(JSON.stringify({error:"guild_create_rate_limited",message:"Too many guild creation attempts. Please wait before trying again.",limit:result.limit,remaining:result.remaining,reset:result.reset,retryAfterSeconds}),{status:429,headers:{"Content-Type":"application/json","Retry-After":String(retryAfterSeconds),...cors}});
 }catch(error){
  console.error("GUILD_CREATE_RATE_LIMIT",error);
  return json({error:"rate_limit_unavailable",message:"Guild creation is temporarily unavailable. Please try again shortly."},503);
 }
}
const OWNER_USER_IDS=["38d5e8ce-18af-46d3-aa9e-6e601e75dd78"];
const GUILD_COMPETITION_REWARDS=[
  {placement:"1st",items:"1 Ancient Relic · 4 Enchant Relics · 1 Mythic Potion · 3 Legendary Potions · $2,000,000",guildPoints:10500},
  {placement:"2nd",items:"1 Ancient Relic · 3 Enchant Relics · 3 Legendary Potions · $1,500,000",guildPoints:9000},
  {placement:"3rd",items:"3 Enchant Relics · 2 Legendary Potions · $1,000,000",guildPoints:7500},
  {placement:"4th–5th",items:"2 Enchant Relics · 1 Legendary Potion · 2 Tier III Potions · $600,000",guildPoints:5250},
  {placement:"6th–10th",items:"1 Enchant Relic · 3 Tier III Potions · $300,000",guildPoints:3750},
  {placement:"Participation",items:"2 Tier II Potions · 1 Tier III Potion · $100,000",guildPoints:2250}
];
const GUILD_POINT_CASH_COSTS=[1000000,1500000,2000000,3000000,5000000];
const GUILD_ERROR_STATUS:Record<string,number>={
  unauthenticated:401,management_only:403,owner_only:403,not_in_guild:403,
  owner_cannot_leave:409,invite_not_found:404,player_not_found:404,
  member_not_found:404,guild_not_found:404,already_in_guild:409,
  player_already_in_guild:409,guild_join_cooldown:409,guild_full:409,
  guild_identity_taken:409,officer_limit:409,insufficient_guild_points:409,
  guild_level_required:409,max_upgrade:409,insufficient_money:409,
  guild_point_purchase_limit:409,research_node_not_found:404,
  research_node_owned:409,research_ap_gate:409,research_prerequisite_missing:409,
  research_points_insufficient:409,research_reset_cooldown:409,
  research_reset_money_insufficient:409,research_shop_daily_limit:409
};
function guildFailure(value:any){
  const raw=String(value?.message??value?.error??value??"guild_request_failed");
  const known=Object.keys(GUILD_ERROR_STATUS).find((code)=>raw.includes(code))
    ?? ["username_required","invalid_name","invalid_tag","invalid_description","invalid_join_mode","invalid_upgrade","invalid_member_action","invalid_role_change","cannot_kick_role","confirmation_mismatch"].find((code)=>raw.includes(code));
  const code=known??"guild_request_failed";
  return json({error:code,message:known?undefined:"The guild request could not be completed.",details:raw},GUILD_ERROR_STATUS[code]??(known?400:500));
}
async function isAdmin(ctx:any,userId:string){
  if(OWNER_USER_IDS.includes(userId)) return true;
  const {data,error}=await ctx.supabaseAdmin.from("admins").select("user_id").eq("user_id",userId).maybeSingle();
  if(error){console.error("FEATURES_ADMIN_LOOKUP",error.message);return false;}
  return data?.user_id===userId;
}
export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors}); const userId=uid(ctx); if(!userId)return json({error:"unauthenticated"},401); let b:any={};try{b=await req.json()}catch{} const a=b.action;
 try{
  if(a==="sections"){
    const {data,error}=await ctx.supabaseAdmin.from("game_section_settings").select("*").order("sort_order");
    if(error)throw error;
    const admin=await isAdmin(ctx,userId);
    const visible=(data??[]).filter((section:any)=>section.admin_only!==true || admin);
    return json({sections:visible,isAdmin:admin});
  }
  if(a==="list"){
    const {data:definitions,error}=await ctx.supabaseAdmin.from("private_feature_definitions").select("*").eq("enabled",true).order("feature_kind").order("quest_type").order("sort_order");
    if(error)throw error;
    const admin=await isAdmin(ctx,userId);
    const visible=(definitions??[]).filter((definition:any)=>definition.admin_only!==true || admin);
    const {data:progress,error:pe}=await ctx.supabaseAdmin.from("private_feature_progress").select("*").eq("player_id",userId);
    if(pe)throw pe;
    return json({definitions:visible,progress:progress??[],isAdmin:admin});
  }
  if(a==="achievements"){
    const result=await ctx.supabaseAdmin.rpc("get_player_achievements_v013",{p_player_id:userId});
    if(result.error)throw result.error;return json(result.data);
  }
  if(a==="achievement-claim"){
    const result=await ctx.supabaseAdmin.rpc("claim_achievement_reward_v013",{p_player_id:userId,p_feature_id:String(b.featureId??"")});
    if(result.error)throw result.error;return json(result.data);
  }
  if(a==="achievement-milestone-claim"){
    const result=await ctx.supabaseAdmin.rpc("claim_achievement_milestone_v013",{p_player_id:userId,p_ap:Number(b.ap??0)});
    if(result.error)throw result.error;return json(result.data);
  }
  if(a==="research"){
    const result=await ctx.supabaseAdmin.rpc("get_research_tree_v014",{p_player_id:userId});
    if(result.error)throw result.error;return json(result.data);
  }
  if(a==="research-purchase"){
    const result=await ctx.supabaseAdmin.rpc("purchase_research_node_v014",{p_player_id:userId,p_node_id:String(b.nodeId??"")});
    if(result.error)throw result.error;return json(result.data);
  }
  if(a==="research-reset"){
    const result=await ctx.supabaseAdmin.rpc("reset_research_tree_v014",{p_player_id:userId});
    if(result.error)throw result.error;return json(result.data);
  }
  if(a==="guild"){
   const {data:membership,error:membershipError}=await ctx.supabaseAdmin.from("guild_members").select("guild_id,role,eligible_at").eq("player_id",userId).maybeSingle();
   if(membershipError)throw membershipError;
   let guild:any=null,members:any[]=[],missions:any[]=[],activity:any[]=[],competition:any=null,standings:any[]=[],competitionMembers:any[]=[],pointPurchases:any=null;
   if(membership){
    const runtime=await ctx.supabaseAdmin.rpc("ensure_guild_runtime",{p_guild_id:membership.guild_id});
    if(runtime.error)throw runtime.error;
    const {data:g,error:guildError}=await ctx.supabaseAdmin.from("guilds").select("*").eq("id",membership.guild_id).single();
    if(guildError)throw guildError; guild=g;
    const {data:memberRows,error:memberError}=await ctx.supabaseAdmin.from("guild_members").select("player_id,role,joined_at,eligible_at,lifetime_contribution,weekly_contribution").eq("guild_id",guild.id).order("role");
    if(memberError)throw memberError;
    const ids=(memberRows??[]).map((row:any)=>row.player_id);
    const {data:profiles,error:profileError}=ids.length?await ctx.supabaseAdmin.from("players").select("id,username").in("id",ids):{data:[],error:null};
    if(profileError)throw profileError;
    const names=new Map((profiles??[]).map((profile:any)=>[profile.id,profile.username]));
    members=(memberRows??[]).map((row:any)=>({...row,username:names.get(row.player_id)||"Unknown player"}));
    const now=new Date().toISOString();
    const contributionDate=now.slice(0,10);
    const {data:cashRows,error:cashError}=await ctx.supabaseAdmin.from("guild_point_cash_contributions").select("player_id,purchase_number,money_spent,points_awarded,created_at").eq("guild_id",guild.id).eq("contribution_date",contributionDate).order("purchase_number");
    if(cashError)throw cashError;
    const totals=new Map<string,{playerId:string,username:string,moneySpent:number,pointsAwarded:number,purchases:number}>();
    for(const row of cashRows??[]){const current=totals.get(row.player_id)??{playerId:row.player_id,username:names.get(row.player_id)||"Unknown player",moneySpent:0,pointsAwarded:0,purchases:0};current.moneySpent+=Number(row.money_spent||0);current.pointsAwarded+=Number(row.points_awarded||0);current.purchases+=1;totals.set(row.player_id,current);}
    const purchaseCount=(cashRows??[]).length;
    pointPurchases={purchaseCount,remainingPurchases:Math.max(0,5-purchaseCount),nextCost:GUILD_POINT_CASH_COSTS[purchaseCount]??null,resetsAt:`${new Date(Date.parse(`${contributionDate}T00:00:00Z`)+86400000).toISOString()}`,contributors:[...totals.values()].sort((left,right)=>right.moneySpent-left.moneySpent||left.username.localeCompare(right.username))};
    const {data:missionRows,error:missionError}=await ctx.supabaseAdmin.from("guild_missions").select("*").eq("guild_id",guild.id).lte("starts_at",now).gt("ends_at",now).order("cadence").order("difficulty");
    if(missionError)throw missionError; missions=missionRows??[];
    const {data:activityRows,error:activityError}=await ctx.supabaseAdmin.from("guild_activity").select("id,actor_id,action,details,created_at").eq("guild_id",guild.id).order("created_at",{ascending:false}).limit(20);
    if(activityError)throw activityError; activity=activityRows??[];
    const {data:competitionRow}=await ctx.supabaseAdmin.from("guild_competitions").select("*").lte("cycle_start",now).gt("cycle_ends_at",now).maybeSingle();
    if(competitionRow){
      const active=Date.parse(now)>=Date.parse(competitionRow.active_starts_at)&&Date.parse(now)<Date.parse(competitionRow.active_ends_at);
      competition={...competitionRow,competition_type:active?competitionRow.competition_type:null,status:active?"active":"intermission"};
      const {data:scoreRows}=await ctx.supabaseAdmin.from("guild_competition_results").select("guild_id,score,rank,guilds(name,tag)").eq("competition_id",competitionRow.id).order("score",{ascending:false}).limit(100);
      standings=scoreRows??[];
      const {data:memberScoreRows,error:memberScoreError}=await ctx.supabaseAdmin.from("guild_competition_members").select("player_id,score,reached_at").eq("competition_id",competitionRow.id).eq("guild_id",guild.id).order("score",{ascending:false}).order("reached_at",{ascending:true});
      if(memberScoreError)throw memberScoreError;
      const scores=new Map((memberScoreRows??[]).map((row:any)=>[row.player_id,row]));
      competitionMembers=members.map((member:any)=>({...member,score:Number(scores.get(member.player_id)?.score??0),reached_at:scores.get(member.player_id)?.reached_at??null})).sort((left:any,right:any)=>right.score-left.score||String(left.username).localeCompare(String(right.username)));
    }
   }
   const {data:invites,error:inviteError}=await ctx.supabaseAdmin.from("guild_invites").select("id,guild_id,invited_by,status,created_at,guilds(name,tag)").eq("invited_player_id",userId).eq("status","pending").order("created_at",{ascending:false});
   if(inviteError)throw inviteError;
   return json({guild,membership,members,missions,activity,competition,standings,competitionMembers,competitionRewards:GUILD_COMPETITION_REWARDS,pointPurchases,invites:invites??[],currentPlayerId:userId,serverNow:new Date().toISOString()});
  }
  if (a === "guild-create") {
    const limited=await limitGuildCreation(userId);if(limited)return limited;
    const rpc=await ctx.supabaseAdmin.rpc("create_guild_v2",{
      p_player_id:userId,p_name:String(b.name??""),p_tag:String(b.tag??""),
      p_description:String(b.description??""),p_emblem:String(b.emblem??"gem"),
      p_primary:String(b.primaryColor??"#7c83ff"),p_secondary:String(b.secondaryColor??"#42d6b3"),
      p_accent:String(b.accentColor??"#f5c451"),p_join_mode:String(b.joinMode??"invite")
    });
    if(rpc.error)throw rpc.error; return json(rpc.data);
  }
  if(a==="guild-invite"){
    const username=String(b.username??"").trim(); if(!username)return json({error:"username_required"},400);
    const {data:actor}=await ctx.supabaseAdmin.from("guild_members").select("guild_id,role").eq("player_id",userId).maybeSingle();
    if(!actor||!["owner","officer"].includes(actor.role))return json({error:"management_only"},403);
    const {data:target,error:targetError}=await ctx.supabaseAdmin.from("players").select("id,username").ilike("username",username).maybeSingle();
    if(targetError)throw targetError;if(!target)return json({error:"player_not_found"},404);
    const {data:inGuild}=await ctx.supabaseAdmin.from("guild_members").select("guild_id").eq("player_id",target.id).maybeSingle();
    if(inGuild)return json({error:"player_already_in_guild"},409);
    await ctx.supabaseAdmin.from("guild_invites").update({status:"cancelled",responded_at:new Date().toISOString()}).eq("guild_id",actor.guild_id).eq("invited_player_id",target.id).eq("status","pending");
    const {error}=await ctx.supabaseAdmin.from("guild_invites").insert({guild_id:actor.guild_id,invited_player_id:target.id,invited_by:userId});
    if(error)throw error;return json({ok:true,username:target.username});
  }
  if(a==="guild-respond-invite"){const r=await ctx.supabaseAdmin.rpc("guild_respond_invite_v2",{p_player_id:userId,p_invite_id:String(b.inviteId??""),p_accept:b.accept===true});if(r.error)throw r.error;return json(r.data);}
  if(a==="guild-manage-member"){const r=await ctx.supabaseAdmin.rpc("guild_manage_member",{p_actor_id:userId,p_target_id:String(b.playerId??""),p_action:String(b.memberAction??"")});if(r.error)throw r.error;return json(r.data);}
  if(a==="guild-leave"){const r=await ctx.supabaseAdmin.rpc("guild_leave_v2",{p_player_id:userId});if(r.error)throw r.error;return json(r.data);}
  if(a==="guild-upgrade"){const r=await ctx.supabaseAdmin.rpc("guild_purchase_upgrade",{p_player_id:userId,p_track:String(b.track??"")});if(r.error)throw r.error;return json(r.data);}
  if(a==="guild-purchase-points"){const r=await ctx.supabaseAdmin.rpc("guild_purchase_points_with_cash",{p_player_id:userId});if(r.error)throw r.error;return json(r.data);}
  if(a==="guild-update-identity"){const r=await ctx.supabaseAdmin.rpc("guild_update_identity",{p_player_id:userId,p_name:String(b.name??""),p_tag:String(b.tag??""),p_description:String(b.description??""),p_join_mode:String(b.joinMode??"invite")});if(r.error)throw r.error;return json(r.data);}
  if(a==="guild-disband"){const r=await ctx.supabaseAdmin.rpc("guild_disband_v2",{p_player_id:userId,p_confirmation:String(b.confirmation??"")});if(r.error)throw r.error;return json(r.data);}
  return json({error:"unknown_action"},400);
 }catch(e){console.error("FEATURES_API",e);return guildFailure(e);}
})};
