import { withSupabase } from "npm:@supabase/server";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers:{"Content-Type":"application/json",...cors}});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default {fetch:withSupabase({auth:"user"}, async (req, ctx) => {
 try {
  if (req.method === "OPTIONS") return new Response("ok", {headers:cors});
  if (req.method !== "POST") return json({error:"method_not_allowed"},405);
  const playerId = ctx?.userClaims?.id ?? ctx?.userClaims?.sub ?? ctx?.jwtClaims?.sub;
  if (!playerId) return json({error:"unauthenticated"},401);
  const {data:setting,error:settingError} = await ctx.supabaseAdmin.from("game_section_settings").select("enabled").eq("id","seasons").maybeSingle();
  if (settingError) throw settingError;
  if (!setting?.enabled) return json({error:"feature_disabled"},403);
  let body:any; try { body = await req.json(); } catch { return json({error:"invalid_request"},400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({error:"invalid_request"},400);
  const action = body.action ?? "list";
  if (body.seasonId !== undefined && (typeof body.seasonId !== "string" || !uuid.test(body.seasonId))) return json({error:"invalid_season"},400);
  if (action === "list") {
   const {data:activeId,error:ensureError} = await ctx.supabaseAdmin.rpc("ensure_player_season",{p_uid:playerId});
   if (ensureError) throw ensureError;
   const {data:seasons,error:seasonsError} = await ctx.supabaseAdmin.from("season_definitions").select("*").eq("enabled",true).order("starts_at",{ascending:false});
   if (seasonsError) throw seasonsError;
   const now = Date.now();
   const selectedId = body.seasonId ?? activeId ?? seasons?.find(s => now >= Date.parse(s.ends_at) && now < Date.parse(s.ends_at)+7*86400000)?.id
    ?? [...(seasons ?? [])].reverse().find(s => Date.parse(s.starts_at)>now)?.id ?? seasons?.[0]?.id;
   const season = seasons?.find(s => s.id === selectedId);
   if (!season) return json({error:"season_not_found"},404);
   const [{data:progress,error:pe},{data:missions,error:me},{data:rerolls,error:re}] = await Promise.all([
    ctx.supabaseAdmin.from("player_seasons").select("*").eq("season_id",season.id).eq("player_id",playerId).maybeSingle(),
    ctx.supabaseAdmin.from("player_season_missions").select("*").eq("season_id",season.id).eq("player_id",playerId).lte("period_start",new Date(now).toISOString()).gt("period_end",new Date(now).toISOString()).order("cadence").order("slot"),
    ctx.supabaseAdmin.from("player_season_rerolls").select("used,period_start").eq("season_id",season.id).eq("player_id",playerId).eq("used",true)
   ]);
   if (pe || me || re) throw pe ?? me ?? re;
   const today = new Date(now).toISOString().slice(0,10);
   return json({season,seasons:seasons.map(s=>({id:s.id,name:s.name,starts_at:s.starts_at,ends_at:s.ends_at})),
    progress:{...(progress ?? {xp:0,premium:false,claimed_tiers:[]}),roll_xp_today:progress?.roll_xp_date===today?progress.roll_xp_today:0},
    missions:now>=Date.parse(season.starts_at)&&now<Date.parse(season.ends_at)?missions??[]:[],rerolls:rerolls??[],serverNow:new Date(now).toISOString()});
  }
  if (!body.seasonId) return json({error:"invalid_season"},400);
  if (action === "claim-tier" && (!Number.isInteger(body.tier) || body.tier<1 || body.tier>50 || !["free","premium"].includes(body.lane))) return json({error:"invalid_tier"},400);
  if (action === "reroll-daily" && (!Number.isInteger(body.slot) || body.slot<1 || body.slot>2)) return json({error:"invalid_slot"},400);
  if (action === "claim-all") {
   const [{data:season,error:se},{data:progress,error:pe}] = await Promise.all([
    ctx.supabaseAdmin.from("season_definitions").select("tiers,starts_at,ends_at").eq("id",body.seasonId).eq("enabled",true).single(),
    ctx.supabaseAdmin.from("player_seasons").select("xp,premium,claimed_tiers").eq("season_id",body.seasonId).eq("player_id",playerId).single()
   ]);
   if (se || pe) throw se ?? pe;
   if (Date.now()<Date.parse(season.starts_at) || Date.now()>=Date.parse(season.ends_at)+7*86400000) throw new Error("claim_period_ended");
   const claimed = new Set(progress.claimed_tiers ?? []); let count=0;
   for (const tier of season.tiers ?? []) {
    if (Number(progress.xp)<Number(tier.xp)) continue;
    for (const lane of progress.premium?["free","premium"]:["free"]) {
     if (claimed.has(`${lane}:${tier.tier}`)) continue;
     const {error} = await ctx.supabase.rpc("claim_season_tier",{p_season_id:body.seasonId,p_tier:tier.tier,p_lane:lane});
     if (error) { if (String(error.message).includes("already_claimed")) continue; throw error; }
     count++;
    }
   }
   return json({claimed:count});
  }
  const endpoints = {"purchase-premium":["purchase_season_premium",{p_season_id:body.seasonId}],"claim-tier":["claim_season_tier",{p_season_id:body.seasonId,p_tier:body.tier,p_lane:body.lane}],"reroll-daily":["reroll_daily_season_mission",{p_season_id:body.seasonId,p_slot:body.slot}]} as const;
  if (!Object.hasOwn(endpoints,action)) return json({error:"unknown_action"},400);
  const [rpc,args] = endpoints[action as keyof typeof endpoints];
  const {data,error} = await ctx.supabase.rpc(rpc,args); if (error) throw error; return json(data);
 } catch (error) {
  console.error("SEASONS",error);
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? error);
  const code = ["not_enough_money","season_not_active","tier_locked","already_claimed","premium_required","claim_period_ended","mission_in_progress","reroll_used","season_progress_not_found","mission_not_found"].find(x=>message.includes(x)) ?? "seasons_error";
  return json({error:code,message:code},code==="seasons_error"?500:409);
 }
})};
