import { supabase } from "./supabase.js";

// =========================================================
// LIVE GEM CATALOG
//
// The admin-managed catalog in `private_feature_gems` is the single source of
// truth for what gems exist (the same catalog the roll function rolls from),
// including admin-created custom gems. UI that needs the gem list — the admin
// grant tools, the market's buy-order picker — must read it from here rather
// than the bundled `src/data/gems.js`, which is only a static fallback and
// misses every custom gem.
//
// Prefer the public RPC; fall back to a direct table read for projects whose
// RLS/RPC migration hasn't been applied yet. Returns normalized gems sorted
// the same way the catalog is (sort_order, then rarity).
// =========================================================

export async function loadGemCatalog() {
  let rows = null;

  const rpc = await supabase.rpc("get_public_gem_catalog");
  if (!rpc.error && Array.isArray(rpc.data)) {
    rows = rpc.data;
  } else {
    if (rpc.error) {
      console.warn("Public gem catalog RPC unavailable; trying direct read:", rpc.error.message);
    }
    const direct = await supabase
      .from("private_feature_gems")
      .select("name, rarity, base_weight, value_per_gram, description, hide_rarity_until_discovered, sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
      .order("rarity", { ascending: true });
    if (direct.error) throw direct.error;
    rows = direct.data ?? [];
  }

  return (rows ?? []).map((gem) => ({
    name: String(gem.name),
    rarity: Number(gem.rarity),
    baseWeight: Number(gem.base_weight),
    valuePerGram: Number(gem.value_per_gram),
    description: String(gem.description ?? ""),
    hideRarityUntilDiscovered: gem.hide_rarity_until_discovered === true
  }));
}
