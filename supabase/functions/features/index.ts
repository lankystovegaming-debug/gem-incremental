import { withSupabase } from "npm:@supabase/server";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json",...cors}});
function uid(ctx:any){return ctx?.userClaims?.id??ctx?.userClaims?.sub??ctx?.jwtClaims?.sub??null;}
const OWNER_USER_IDS=["38d5e8ce-18af-46d3-aa9e-6e601e75dd78"];
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
  if(a==="guild"){
   const {data:member}=await ctx.supabaseAdmin.from("guild_members").select("guild_id,role").eq("player_id",userId).maybeSingle();
   let guild:any=null, members:any[]=[], invites:any[]=[], quests:any[]=[];
   if(member){const g=await ctx.supabaseAdmin.from("guilds").select("*").eq("id",member.guild_id).single(); if(g.error)throw g.error;guild=g.data; const m=await ctx.supabaseAdmin.from("guild_members").select("player_id,role,joined_at").eq("guild_id",guild.id); if(m.error)throw m.error;members=m.data??[]; const q=await ctx.supabaseAdmin.from("guild_quests").select("*").eq("guild_id",guild.id).order("created_at",{ascending:false}); if(q.error)throw q.error;quests=q.data??[];}
   const iv=await ctx.supabaseAdmin.from("guild_invites").select("id,guild_id,invited_by,status,created_at,guilds(name)").eq("invited_player_id",userId).eq("status","pending").order("created_at",{ascending:false}); if(iv.error)throw iv.error;invites=iv.data??[];
   return json({guild,members,invites,quests,currentPlayerId:userId});
  }
  if (a === "guild-create") {
    const name = String(b.name ?? "").trim().slice(0, 50);

    if (name.length < 2) {
      return json({ error: "invalid_name" }, 400);
    }

    // Prefer the transactional RPC. Older deployments may not have the RPC
    // yet, so the fallback below keeps guild creation usable while the
    // migration is being rolled out.
    const rpc = await ctx.supabaseAdmin.rpc("create_guild_for_player", {
      p_name: name,
      p_player_id: userId
    });

    if (!rpc.error) {
      return json(rpc.data ?? { guild: null });
    }

    const rpcMessage = String(rpc.error.message ?? "").toLowerCase();
    const rpcMissing = rpc.error.code === "42883" ||
      rpc.error.code === "PGRST202" ||
      rpcMessage.includes("does not exist");

    if (!rpcMissing) {
      const code = rpcMessage.includes("guild_name_taken")
        ? "guild_name_taken"
        : rpcMessage.includes("already_in_guild")
          ? "already_in_guild"
          : "guild_create_failed";
      return json({ error: code, message: rpc.error.message }, code === "guild_create_failed" ? 500 : 409);
    }

    const { data: existingMember, error: memberLookupError } = await ctx.supabaseAdmin
      .from("guild_members")
      .select("guild_id")
      .eq("player_id", userId)
      .maybeSingle();

    if (memberLookupError) {
      return json({ error: "guild_create_failed", message: memberLookupError.message }, 500);
    }

    if (existingMember) {
      return json({ error: "already_in_guild" }, 409);
    }

    const { data: guild, error: guildError } = await ctx.supabaseAdmin
      .from("guilds")
      .insert({ name, owner_id: userId })
      .select("*")
      .single();

    if (guildError) {
      const message = String(guildError.message ?? "").toLowerCase();
      return json({
        error: message.includes("duplicate") || message.includes("unique")
          ? "guild_name_taken"
          : "guild_create_failed",
        message: guildError.message
      }, message.includes("duplicate") || message.includes("unique") ? 409 : 500);
    }

    const { error: ownerError } = await ctx.supabaseAdmin
      .from("guild_members")
      .insert({ guild_id: guild.id, player_id: userId, role: "owner" });

    if (ownerError) {
      // Best-effort rollback for deployments without the transactional RPC.
      await ctx.supabaseAdmin.from("guilds").delete().eq("id", guild.id);
      return json({ error: "guild_create_failed", message: ownerError.message }, 500);
    }

    return json({ guild });
  }
  if(a==="guild-invite"){const gid=String(b.guildId??"");const target=String(b.playerId??"");const own=await ctx.supabaseAdmin.from("guilds").select("id").eq("id",gid).eq("owner_id",userId).maybeSingle();if(own.error)throw own.error;if(!own.data)return json({error:"owner_only"},403);if(!target)return json({error:"player_id_required"},400);const {data:inGuild}=await ctx.supabaseAdmin.from("guild_members").select("guild_id").eq("player_id",target).maybeSingle();if(inGuild)return json({error:"player_already_in_guild"},409);const r=await ctx.supabaseAdmin.from("guild_invites").insert({guild_id:gid,invited_player_id:target,invited_by:userId});if(r.error)throw r.error;return json({ok:true});}
  if(a==="guild-respond-invite"){const id=String(b.inviteId??"");const accept=b.accept===true;const iv=await ctx.supabaseAdmin.from("guild_invites").select("*").eq("id",id).eq("invited_player_id",userId).eq("status","pending").single();if(iv.error)throw iv.error;if(accept){const already=await ctx.supabaseAdmin.from("guild_members").select("guild_id").eq("player_id",userId).maybeSingle();if(already.data)return json({error:"already_in_guild"},409);const m=await ctx.supabaseAdmin.from("guild_members").insert({guild_id:iv.data.guild_id,player_id:userId,role:"member"});if(m.error)throw m.error;}const u=await ctx.supabaseAdmin.from("guild_invites").update({status:accept?"accepted":"declined",responded_at:new Date().toISOString()}).eq("id",id);if(u.error)throw u.error;return json({ok:true});}
  if(a==="guild-quest-save"){const gid=String(b.guildId??"");const own=await ctx.supabaseAdmin.from("guilds").select("id").eq("id",gid).eq("owner_id",userId).maybeSingle();if(own.error)throw own.error;if(!own.data)return json({error:"owner_only"},403);const q=b.quest??{};const payload={name:String(q.name??"Guild Quest").slice(0,120),description:String(q.description??"").slice(0,500),requirements:q.requirements&&typeof q.requirements==="object"?q.requirements:{type:"guild_points",amount:100},reward_points:Math.max(0,Number(q.reward_points??0)),enabled:q.enabled!==false,starts_at:q.starts_at||null,ends_at:q.ends_at||null,updated_at:new Date().toISOString()};let r;if(q.id)r=await ctx.supabaseAdmin.from("guild_quests").update(payload).eq("id",q.id).eq("guild_id",gid).select().single();else r=await ctx.supabaseAdmin.from("guild_quests").insert({...payload,guild_id:gid}).select().single();if(r.error)throw r.error;return json({quest:r.data});}
  if(a==="guild-quest-delete"){const gid=String(b.guildId??"");const own=await ctx.supabaseAdmin.from("guilds").select("id").eq("id",gid).eq("owner_id",userId).maybeSingle();if(!own.data)return json({error:"owner_only"},403);const r=await ctx.supabaseAdmin.from("guild_quests").delete().eq("id",String(b.id)).eq("guild_id",gid);if(r.error)throw r.error;return json({ok:true});}
  return json({error:"unknown_action"},400);
 }catch(e){console.error("FEATURES_API",e);return json({error:"features_api_error",message:e instanceof Error?e.message:String(e)},500);}
})};
