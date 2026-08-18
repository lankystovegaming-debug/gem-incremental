import { withSupabase } from "npm:@supabase/server";
function response(data, status = 200) {
  return Response.json(data, {
    status
  });
}
export default {
  fetch: withSupabase({
    auth: "user"
  }, async (_req, ctx)=>{
    const { data, error } = await ctx.supabase.rpc("upgrade_inventory_infinite");
    if (error) {
      console.error("Inventory upgrade failed:", error);
      return response({
        error: "upgrade_failed"
      }, 500);
    }
    if (!data?.success) {
      const code = data?.error ?? "upgrade_failed";
      const status = code === "insufficient_funds" ? 409 : 400;
      return response({
        ...data,
        error: code
      }, status);
    }
    return response(data);
  })
};
