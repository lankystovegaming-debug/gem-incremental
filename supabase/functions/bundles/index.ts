import { withSupabase } from "npm:@supabase/server";
import { handleBundles } from "./handler.js";
export default {
  fetch: withSupabase({ auth: "user" }, (req, ctx) =>
    handleBundles(req, ctx.userClaims?.id, ctx.supabaseAdmin))
};
