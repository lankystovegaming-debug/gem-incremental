import {
  supabase
} from "./supabase.js";

export async function ensureCloudPlayer(
  user
) {
  // Player rows are server-managed. Never fall back to a browser upsert:
  // doing so would require restoring write privileges on protected columns.
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
    console.error(
      "Failed to create/load cloud player:",
      ensureError
    );
    return null;
  }

  console.error("Failed to create/load cloud player: setup returned no row.");
  return null;
}
