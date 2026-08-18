import { supabase } from "./supabase.js";

// Up to 3 gems a player pins to their profile / leaderboard. Stored as
// a jsonb snapshot on players.showcase, set only via set_showcase (which
// verifies ownership), and read publicly for the leaderboard.

export async function loadMyShowcase() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("players").select("showcase").eq("id", user.id).maybeSingle();

  if (error) {
    console.error("Failed to load showcase:", error);
    return [];
  }
  return Array.isArray(data?.showcase) ? data.showcase : [];
}

export async function setShowcase(specimenIds) {
  const ids = (Array.isArray(specimenIds) ? specimenIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))
    .slice(0, 3);

  const { data, error } = await supabase.rpc("set_showcase", { p_specimen_ids: ids });

  if (error) {
    const message = /too_many/.test(error.message ?? "")
      ? "You can only showcase 3 gems."
      : "Could not update your showcase.";
    return { error: { message } };
  }
  return { data: Array.isArray(data) ? data : [] };
}

export async function loadShowcasesFor(usernames) {
  const names = Array.from(new Set((usernames ?? []).filter(Boolean)));
  if (!names.length) return {};

  const { data, error } = await supabase.rpc("get_showcases_for_usernames", {
    p_usernames: names
  });

  if (error) {
    console.error("Failed to load showcases:", error);
    return {};
  }
  return data && typeof data === "object" ? data : {};
}
