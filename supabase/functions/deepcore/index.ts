import { withSupabase } from "npm:@supabase/server";

const headers = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

const RPC_BY_ACTION: Record<string, { name: string; args?: (body: any) => Record<string, unknown> }> = {
  snapshot: { name: "get_deepcore_snapshot", args: () => ({}) },
  contribute: { name: "deepcore_contribute", args: (b) => ({ p_amount: b.amount, p_target: b.target ?? "global", p_request_id: b.requestId }) },
  sacrifice: { name: "deepcore_sacrifice", args: (b) => ({ p_specimen_id: b.specimenId, p_objective: b.objective, p_request_id: b.requestId }) },
  buySupply: { name: "deepcore_buy_supply", args: (b) => ({ p_request_id: b.requestId }) },
  buyConsumable: { name: "deepcore_buy_consumable", args: (b) => ({ p_item: b.itemId, p_quantity: b.quantity ?? 1, p_request_id: b.requestId }) },
  useConsumable: { name: "deepcore_use_consumable", args: (b) => ({ p_item: b.itemId, p_request_id: b.requestId }) },
  setAutoContribute: { name: "deepcore_set_auto_contribute", args: (b) => ({ p_enabled: Boolean(b.enabled), p_min_rarity: b.minRarity ?? 1, p_max_rarity: b.maxRarity ?? null, p_max_value: b.maxValue ?? null, p_route: b.route ?? null }) },
  claimReward: { name: "deepcore_claim_reward", args: (b) => ({ p_reward_key: b.rewardKey }) },
  openCrate: { name: "deepcore_open_crate", args: (b) => ({ p_request_id: b.requestId }) },
  claimQuest: { name: "deepcore_claim_quest", args: (b) => ({ p_quest_key: b.questKey }) },
  claimResearch: { name: "deepcore_claim_research", args: (b) => ({ p_milestone: b.milestone }) }
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers });
    if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
    let body: any;
    try { body = await req.json(); } catch { return response({ error: "invalid_json" }, 400); }
    const action = String(body?.action ?? "snapshot");
    const command = RPC_BY_ACTION[action];
    if (!command) return response({ error: "unknown_action" }, 400);
    const { data, error } = await ctx.supabase.rpc(command.name, command.args?.(body) ?? {});
    if (error) {
      const code = String(error.message ?? "deepcore_action_failed").match(/[a-z][a-z0-9_]+/)?.[0] ?? "deepcore_action_failed";
      const status = code === "insufficient_funds" ? 409 : code.includes("locked") || code.includes("not_active") ? 409 : 400;
      return response({ error: code, message: error.message }, status);
    }
    return response(data);
  })
};
