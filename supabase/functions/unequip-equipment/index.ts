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
    const {data,error}=await ctx.supabase.rpc('set_overhaul_equipment_equipped', {
      p_equipment_row_id: equipmentRowId,p_equipped: shouldEquip
    });
    if(error) return response({error:error.message},409);
    return response(data);

  })
};
