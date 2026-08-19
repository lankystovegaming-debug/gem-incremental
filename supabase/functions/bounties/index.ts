import { withSupabase } from "npm:@supabase/server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", ...cors }
});

const uid = (ctx: any) =>
  ctx?.userClaims?.id ?? ctx?.userClaims?.sub ?? ctx?.jwtClaims?.sub ?? null;

async function sectionEnabled(ctx: any, id: string) {
  const { data, error } = await ctx.supabaseAdmin
    .from("game_section_settings").select("enabled").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
      const playerId = uid(ctx);
      if (!playerId) return json({ error: "unauthenticated" }, 401);
      if (!(await sectionEnabled(ctx, "bounties"))) return json({ error: "feature_disabled" }, 403);
      let body: any = {}; try { body = await req.json(); } catch {}
      const action = body.action ?? "list";

      if (action === "list") {
        const { data: bounties, error } = await ctx.supabaseAdmin
          .from("bounty_definitions").select("*").eq("enabled", true).order("sort_order");
        if (error) throw error;
        const { data: claims, error: ce } = await ctx.supabaseAdmin
          .from("bounty_claims").select("*").eq("player_id", playerId);
        if (ce) throw ce;
        return json({ bounties: bounties ?? [], claims: claims ?? [] });
      }

      if (action === "start") {
        const bountyId = String(body.bountyId ?? "");
        const { data, error } = await ctx.supabaseAdmin
          .from("bounty_claims").upsert({ bounty_id: bountyId, player_id: playerId }, { onConflict: "bounty_id,player_id" })
          .select("*").single();
        if (error) throw error;
        return json({ claim: data });
      }

      if (action === "update") {
        const claimId = String(body.claimId ?? "");
        const progress = body.progress && typeof body.progress === "object" ? body.progress : {};
        const { data, error } = await ctx.supabaseAdmin.from("bounty_claims")
          .update({ progress }).eq("id", claimId).eq("player_id", playerId).select("*").single();
        if (error) throw error;
        return json({ claim: data });
      }

      if (action === "claim") {
        const claimId = String(body.claimId ?? "");
        const { data: claim, error: ce } = await ctx.supabaseAdmin
          .from("bounty_claims").select("*, bounty_definitions(*)").eq("id", claimId).eq("player_id", playerId).single();
        if (ce) throw ce;
        if (claim.claimed) return json({ error: "already_claimed" }, 409);
        const reqs = claim.bounty_definitions?.requirements ?? {};
        const progress = claim.progress ?? {};
        if (reqs.rolls && Number(progress.rolls ?? 0) < Number(reqs.rolls)) return json({ error: "requirements_not_met" }, 409);
        const { data, error } = await ctx.supabaseAdmin.from("bounty_claims")
          .update({ claimed: true, claimed_at: new Date().toISOString() }).eq("id", claimId).select("*").single();
        if (error) throw error;
        return json({ claim: data, rewards: claim.bounty_definitions?.rewards ?? [] });
      }

      return json({ error: "unknown_action" }, 400);
    } catch (error) {
      console.error("BOUNTIES", error);
      return json({ error: "bounties_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  })
};
