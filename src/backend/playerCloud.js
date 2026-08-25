import {
  supabase
} from "./supabase.js";

export async function ensureCloudPlayer(
  user
) {
  // Prefer the SECURITY DEFINER setup path. It keeps account creation
  // reliable even when direct inserts are restricted by RLS.
  const {
    data: ensuredPlayer,
    error: ensureError
  } = await supabase.rpc("ensure_player_record");

  if (!ensureError && ensuredPlayer) {
    return Array.isArray(ensuredPlayer)
      ? ensuredPlayer[0] ?? null
      : ensuredPlayer;
  }

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
      : { data: null, error: new Error("Player setup returned no row.") };

  if (error) {
    console.error(
      "Failed to create/load cloud player:",
      error
    );

    return null;
  }

  return data;
}
