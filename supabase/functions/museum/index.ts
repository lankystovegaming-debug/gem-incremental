import { withSupabase } from "npm:@supabase/server";

const fail = (code: string, status = 400, message?: string) =>
  Response.json({ error: code, message: message ?? code }, { status });

function databaseCode(error: any) {
  const text = String(error?.message ?? "");
  const known = [
    "invalid_museum_slot", "specimen_not_found", "specimen_already_exhibited",
    "museum_slot_occupied", "museum_slot_empty", "museum_capacity_maxed",
    "not_enough_money", "specimen_is_exhibited", "gem_locked"
  ];
  return known.find((code) => text.includes(code)) ?? "museum_action_failed";
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const playerId = ctx.userClaims?.id;
    if (!playerId) return fail("not_authenticated", 401, "Sign in before opening the Museum.");

    const { data: setting } = await ctx.supabaseAdmin
      .from("game_section_settings")
      .select("enabled")
      .eq("id", "museum")
      .maybeSingle();
    if (setting && setting.enabled === false) return fail("museum_closed", 403, "The Gem Museum is currently closed.");

    let body: any = {};
    try { body = await req.json(); } catch { return fail("invalid_request", 400); }
    const action = String(body.action ?? "state");

    if (action === "place" || action === "remove" || action === "expand" || action === "register") {
      const rpc = action === "place" ? "museum_place_exhibit"
        : action === "remove" ? "museum_remove_exhibit"
        : action === "expand" ? "museum_expand"
        : "museum_register_specimen";
      const args: Record<string, unknown> = { p_player_id: playerId };
      if (action === "place" || action === "register") args.p_specimen_id = Number(body.specimenId);
      if (action === "place" || action === "remove") args.p_slot = Number(body.slot);
      const { data, error } = await ctx.supabaseAdmin.rpc(rpc, args);
      if (error) return fail(databaseCode(error), 400, error.message);
      if (action !== "state") await ctx.supabaseAdmin.rpc("museum_recalculate", { p_player_id: playerId });
      return Response.json({ ok: true, result: data });
    }

    if (action !== "state") return fail("invalid_action", 400);

    await ctx.supabaseAdmin.from("museum_profiles").upsert({ player_id: playerId }, { onConflict: "player_id", ignoreDuplicates: true });
    await ctx.supabaseAdmin.rpc("museum_recalculate", { p_player_id: playerId });

    const [profileResult, exhibitsResult, gemsResult, definitionsResult, registrationsResult, completionsResult, playerResult] = await Promise.all([
      ctx.supabaseAdmin.from("museum_profiles").select("*").eq("player_id", playerId).single(),
      ctx.supabaseAdmin.from("museum_exhibits").select("slot,specimen_id,prestige,snapshot,added_at").eq("player_id", playerId).order("slot"),
      ctx.supabaseAdmin.from("inventory_gems").select("id,gem_name,rarity,effective_rarity,base_weight,final_weight,value,mutation_ids,serial_number,locked,museum_locked,created_at").eq("player_id", playerId).order("effective_rarity", { ascending: false }).limit(500),
      ctx.supabaseAdmin.from("museum_collection_definitions").select("*").eq("enabled", true).order("sort_order"),
      ctx.supabaseAdmin.from("museum_registrations").select("specimen_snapshot,registered_at").eq("player_id", playerId),
      ctx.supabaseAdmin.from("museum_collection_completions").select("collection_id,completed_at").eq("player_id", playerId),
      ctx.supabaseAdmin.from("players").select("money").eq("id", playerId).single()
    ]);

    const firstError = [profileResult, exhibitsResult, gemsResult, definitionsResult, registrationsResult, completionsResult, playerResult].find((r) => r.error)?.error;
    if (firstError) return fail("museum_load_failed", 500, firstError.message);

    return Response.json({
      profile: profileResult.data,
      exhibits: exhibitsResult.data ?? [],
      inventory: gemsResult.data ?? [],
      collections: definitionsResult.data ?? [],
      registrations: registrationsResult.data ?? [],
      completedCollections: completionsResult.data ?? [],
      money: Number(playerResult.data?.money ?? 0),
      featureStatus: { publicVisits: false, weeklies: false, events: false }
    });
  })
};
