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

    let body: { equipmentRowId?: number; relicType?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid_request" }, 400); }

    const equipmentId = Number(body.equipmentRowId);
    const relicType = String(body.relicType ?? "");
    const grade = relicGrades[relicType];
    if (!Number.isInteger(equipmentId) || !grade) {
      return json({ error: "invalid_request" }, 400);
    }

    const { data: equipment } = await ctx.supabaseAdmin.from("player_equipment")
      .select("id, category, equipped, enchant_id, enchant_grade, enchant_state")
      .eq("id", equipmentId).eq("player_id", playerId).maybeSingle();

    if (!equipment || equipment.category !== "pickaxe" || !equipment.equipped) {
      return json({ error: "invalid_equipment" }, 400);
    }

    const eligible = pools[grade].filter((id) => id !== equipment.enchant_id);
    const enchantId = eligible[randomIndex(eligible.length)];

    const { data, error } = await ctx.supabaseAdmin.rpc("apply_equipment_enchant", {
      p_player_id: playerId,
      p_equipment_row_id: equipmentId,
      p_relic_type: relicType,
      p_enchant_id: enchantId,
      p_enchant_grade: grade
    });

    if (error) {
      const code = [
        "not_enough_enchant_relics",
        "not_enough_ancient_relics",
        "invalid_equipment",
        "invalid_relic",
        "same_enchant"
      ].find((value) => error.message.includes(value)) ?? "enchant_failed";
      return json({ error: code }, code.startsWith("not_enough_") ? 409 : 400);
    }

    return json(data);
  })
};
