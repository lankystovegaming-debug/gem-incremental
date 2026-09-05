import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import { createHandler } from "./handler.ts";

// Never forward the caller's Authorization header into this privileged client.
// createHandler validates the JWT with Auth before accessing any player data.
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false }
});
Deno.serve(createHandler(admin));
