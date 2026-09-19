import { withSupabase } from "npm:@supabase/server";

const headers = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

const actions: Record<string, { rpc: string; args: (body: any, uid: string) => Record<string, unknown> }> = {
  snapshot: { rpc: "deep_sea_snapshot", args: (_b, uid) => ({ p_player_id: uid }) },
  setFeed: { rpc: "deep_sea_set_feed", args: (b, uid) => ({ p_player_id: uid, p_target: b.target, p_enabled: Boolean(b.enabled) }) },
  craftNeptune: { rpc: "deep_sea_craft_neptune", args: (_b, uid) => ({ p_player_id: uid }) },
  buy: { rpc: "deep_sea_buy", args: (b, uid) => ({ p_player_id: uid, p_item_id: b.itemId, p_quantity: b.quantity ?? 1 }) },
  use: { rpc: "deep_sea_use", args: (b, uid) => ({ p_player_id: uid, p_item_id: b.itemId, p_quantity: b.quantity ?? 1 }) },
  openCrate: { rpc: "deep_sea_open_crate", args: (_b, uid) => ({ p_player_id: uid }) },
  claimLegacy: { rpc: "deep_sea_claim_legacy", args: (b, uid) => ({ p_player_id: uid, p_gem_name: b.gemName }) }
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers });
    if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
    let body: any;
    try { body = await req.json(); } catch { return reply({ error: "invalid_json" }, 400); }
    const command = actions[String(body?.action ?? "snapshot")];
    if (!command) return reply({ error: "unknown_action" }, 400);
    const { data, error } = await ctx.supabase.rpc(command.rpc, command.args(body, String(ctx.userClaims?.id)));
    if (error) {
      const code = String(error.message ?? "deep_sea_action_failed").match(/[a-z][a-z0-9_]+/)?.[0] ?? "deep_sea_action_failed";
      return reply({ error: code, message: error.message }, ["insufficient_funds","wrong_phase","inventory_full"].includes(code) ? 409 : 400);
    }
    return reply(data);
  })
};
