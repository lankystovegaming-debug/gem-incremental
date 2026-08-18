import { withSupabase } from "npm:@supabase/server";
function response(data, status = 200) {
  return Response.json(data, {
    status
  });
}
export default {
  fetch: withSupabase({
    auth: "user"
  }, async (req, ctx)=>{
    const playerId = ctx.userClaims?.id;
    if (!playerId) {
      return response({
        error: "unauthorized"
      }, 401);
    }
    let body;
    try {
      body = await req.json();
    } catch  {
      return response({
        error: "invalid_request"
      }, 400);
    }
    const equipmentRowId = body?.equipmentRowId;
    const shouldEquip = body?.equipped;
    if (typeof equipmentRowId !== "string" && typeof equipmentRowId !== "number" || String(equipmentRowId).length === 0 || String(equipmentRowId).length > 128 || typeof shouldEquip !== "boolean") {
      return response({
        error: "invalid_equipment_id"
      }, 400);
    }
    const { data: equipment, error: loadError } = await ctx.supabaseAdmin.from("player_equipment").select("id, category, equipped").eq("id", equipmentRowId).eq("player_id", playerId).maybeSingle();
    if (loadError) {
      console.error("Load equipment failed:", loadError);
      return response({
        error: "equipment_update_failed"
      }, 500);
    }
    if (!equipment) {
      return response({
        error: "equipment_not_found"
      }, 404);
    }
    if (equipment.equipped === shouldEquip) {
      return response({
        success: true,
        equipmentRowId: equipment.id,
        equipped: shouldEquip
      });
    }
    if (shouldEquip) {
      const { error: storeError } = await ctx.supabaseAdmin.from("player_equipment").update({
        equipped: false
      }).eq("player_id", playerId).eq("category", equipment.category).eq("equipped", true);
      if (storeError) {
        console.error("Store previous equipment failed:", storeError);
        return response({
          error: "equipment_update_failed"
        }, 500);
      }
    }
    const { data: updated, error: updateError } = await ctx.supabaseAdmin.from("player_equipment").update({
      equipped: shouldEquip
    }).eq("id", equipment.id).eq("player_id", playerId).select("id").maybeSingle();
    if (updateError || !updated) {
      console.error("Equipment state update failed:", updateError);
      return response({
        error: "equipment_update_failed"
      }, 500);
    }
    return response({
      success: true,
      equipmentRowId: updated.id,
      equipped: shouldEquip
    });
  })
};
