import { withSupabase } from "npm:@supabase/server";

const allowedActions = new Set(["upgrade", "reroll", "insight", "imprint", "choose", "attune", "convert_relics"]);

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
    const playerId = ctx.userClaims?.id;
    if (!playerId) return Response.json({ error: "unauthorized" }, { status: 401 });
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }
    const action = String(body.action ?? "");
    const equipmentRowId = action === "convert_relics" ? null : Number(body.equipmentRowId);
    if (!allowedActions.has(action) || (action !== "convert_relics" && !Number.isInteger(equipmentRowId))) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    const { data, error } = await ctx.supabase.rpc("masterwork_equipment_beta", {
      p_equipment_row_id: equipmentRowId,
      p_action: action,
      p_choice: typeof body.choice === "string" ? body.choice : null
    });
    if (error) {
      const code = ["not_enough_money","not_enough_enchant_relics","not_enough_ancient_relics","masterwork_tier_locked","masterwork_maxed","passive_unavailable","attunement_locked","invalid_passive","invalid_attunement"].find((value) => error.message.includes(value)) ?? "masterwork_failed";
      return Response.json({ error: code }, { status: 409 });
    }
    const spentEnchant = Number(data?.spentEnchantRelics ?? (data?.converted ? 12 : 0));
    const spentAncient = Number(data?.spentAncientRelics ?? 0);
    if (spentEnchant > 0 || spentAncient > 0) {
      const { error: expeditionError } = await ctx.supabaseAdmin.rpc("record_expedition_relic_spend", {
        p_player_id: playerId,
        p_enchant: spentEnchant,
        p_ancient: spentAncient
      });
      if (expeditionError) console.error("Expedition relic progress failed:", expeditionError);
    }
    return Response.json(data);
  })
};
