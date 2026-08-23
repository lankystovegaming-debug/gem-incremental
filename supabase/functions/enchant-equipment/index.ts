import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const pools = {
  normal: [
    "deep_strike", "lucky_break", "fortune_surge", "collectors_edge",
    "geologist", "prospectors_instinct", "jackpot_mining", "blitz_vein"
  ],
  ancient: [
    "deep_strike", "lucky_break", "fortune_surge", "collectors_edge",
    "prospectors_instinct", "vein_hunter", "jackpot_mining", "blitz_vein",
    "slow_starter"
  ]
};

const relicGrades: Record<string, keyof typeof pools> = {
  "Enchant Relic": "normal",
  "Ancient Relic": "ancient"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

function randomIndex(length: number) {
  const limit = Math.floor(0x100000000 / length) * length;
  const words = new Uint32Array(1);
  do crypto.getRandomValues(words); while (words[0] >= limit);
  return words[0] % length;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const playerId = ctx.userClaims?.id;
    if (!playerId) return json({ error: "unauthorized" }, 401);

    let body: { equipmentRowId?: number; relicGemId?: number };
    try { body = await req.json(); } catch { return json({ error: "invalid_request" }, 400); }

    const equipmentId = Number(body.equipmentRowId);
    const relicId = Number(body.relicGemId);
    if (!Number.isInteger(equipmentId) || !Number.isInteger(relicId)) {
      return json({ error: "invalid_request" }, 400);
    }

    const [{ data: equipment }, { data: relic }] = await Promise.all([
      ctx.supabaseAdmin.from("player_equipment")
        .select("id, category, equipped, enchant_id, enchant_grade, enchant_state")
        .eq("id", equipmentId).eq("player_id", playerId).maybeSingle(),
      ctx.supabaseAdmin.from("inventory_gems")
        .select("id, gem_name, locked")
        .eq("id", relicId).eq("player_id", playerId).maybeSingle()
    ]);

    if (!equipment || equipment.category !== "pickaxe" || !equipment.equipped) {
      return json({ error: "invalid_equipment" }, 400);
    }

    const grade = relicGrades[relic?.gem_name];
    if (!relic || relic.locked || !grade) return json({ error: "invalid_relic" }, 400);

    const eligible = pools[grade].filter((id) => id !== equipment.enchant_id);
    const enchantId = eligible[randomIndex(eligible.length)];

    // Claim the unlocked relic first. A concurrent request can consume it only once.
    const { data: consumed, error: consumeError } = await ctx.supabaseAdmin
      .from("inventory_gems").delete().eq("id", relicId).eq("player_id", playerId)
      .eq("locked", false).select("id").maybeSingle();
    if (consumeError || !consumed) return json({ error: "invalid_relic" }, 409);

    const { error: enchantError } = await ctx.supabaseAdmin
      .from("player_equipment")
      .update({ enchant_id: enchantId, enchant_grade: grade, enchant_state: {} })
      .eq("id", equipmentId).eq("player_id", playerId);

    if (enchantError) {
      // Best-effort compensation so a transient equipment write does not spend the relic.
      await ctx.supabaseAdmin.from("inventory_gems").insert({
        player_id: playerId,
        gem_name: relic.gem_name,
        rarity: grade === "ancient" ? 1500 : 250,
        base_weight: 0, value_per_gram: 0, rolled_weight_multiplier: 1,
        rolled_weight: 0, final_weight: 0, value: 0, locked: false
      });
      console.error("Enchant equipment update failed:", enchantError);
      return json({ error: "enchant_failed" }, 500);
    }

    const { error: expeditionError } = await ctx.supabaseAdmin.rpc(
      "record_expedition_relic_spend",
      {
        p_player_id: playerId,
        p_enchant: grade === "normal" ? 1 : 0,
        p_ancient: grade === "ancient" ? 1 : 0
      }
    );
    if (expeditionError) console.error("Expedition relic progress failed:", expeditionError);

    return json({ equipmentRowId: equipmentId, relicGemId: relicId, enchantId, grade });
  })
};
