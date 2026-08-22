import {
  supabase
} from "./supabase.js";

export async function ensureCloudPlayer(
  user
) {
  // Prefer the SECURITY DEFINER setup path. It keeps account creation
  // reliable even when direct inserts are restricted by RLS.
  const { error: ensureError } = await supabase.rpc("ensure_player_record");

  if (ensureError) {
    console.warn("Server-side player setup unavailable; using fallback:", ensureError);
  }

  const {
    data,
    error
  } =
    ensureError
      ? await supabase
          .from("players")
          .upsert(
            { id: user.id, last_seen: new Date().toISOString() },
            { onConflict: "id" }
          )
          .select()
          .single()
      : await supabase
          .from("players")
          .update({ last_seen: new Date().toISOString() })
          .eq("id", user.id)
          .select()
          .single();

  if (error) {
    console.error(
      "Failed to create/load cloud player:",
      error
    );

    return null;
  }

  return data;
}
