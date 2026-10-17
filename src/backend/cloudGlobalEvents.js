import { supabase } from "./supabase.js";

export async function loadActiveGlobalEvent() {
  return supabase.rpc("get_active_global_event");
}

export async function loadActiveGlobalEvents() {
  const result = await supabase.rpc("get_active_global_events");
  // Frontend and migrations may be deployed separately. Fall back only when
  // the new API is absent, rather than hiding arbitrary backend errors.
  if (result.error?.code !== "PGRST202") return result;
  const previous = await loadActiveGlobalEvent();
  return { ...previous, data: previous.data?.id ? [previous.data] : [] };
}
