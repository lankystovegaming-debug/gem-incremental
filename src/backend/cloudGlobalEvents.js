import { supabase } from "./supabase.js";

export async function loadActiveGlobalEvent() {
  return supabase.rpc("get_active_global_event");
}
