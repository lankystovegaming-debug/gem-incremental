import { supabase } from "./supabase.js";
import {
  RARE_ROLL_BASE_THRESHOLD,
  RARE_ROLL_EFFECTIVE_THRESHOLD
} from "../logic/chances.js";

const CHANNEL = "rare-rolls-card";
let channel = null;

function mutationIds(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

async function profilesFor(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};
  const { data, error } = await supabase.rpc("get_chat_profiles", { p_user_ids: uniqueIds });
  if (error) return {};
  return data && typeof data === "object" ? data : {};
}

async function mutationCatalog() {
  const result = await supabase.rpc("get_public_mutation_catalog");
  if (!result.error) return result.data ?? [];
  const fallback = await supabase
    .from("game_mutations")
    .select("id, name, chance, color, icon, enabled, sort_order")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  return fallback.error ? [] : (fallback.data ?? []);
}

function normalize(row, profiles, catalog, recovered = false) {
  const ids = mutationIds(row?.mutation_ids);
  const byId = new Map(catalog.map((entry) => [String(entry.id), entry]));
  const details = ids.map((id) => byId.get(id)).filter(Boolean);
  const rarity = Number(row?.rarity ?? 0);
  const calculatedEffective = details.reduce(
    (value, mutation) => value * Math.max(1, Number(mutation.chance) || 1),
    Math.max(1, rarity)
  );
  const effectiveRarity = Number(row?.effective_rarity) || calculatedEffective;
  const profile = profiles[row?.player_id] ?? {};
  return {
    id: `${recovered ? "history" : "announcement"}-${row.id}`,
    playerId: row.player_id,
    username: row.username ?? profile.username ?? "Someone",
    gemName: row.gem_name,
    rarity,
    effectiveRarity,
    mutationIds: ids,
    mutations: details.map((entry) => ({ id: String(entry.id), name: entry.name })),
    kind: ids.length ? "mutation" : "base",
    createdAt: row.created_at
  };
}

function qualifies(row) {
  return row.kind === "mutation"
    ? row.effectiveRarity >= RARE_ROLL_EFFECTIVE_THRESHOLD
    : row.rarity >= RARE_ROLL_BASE_THRESHOLD;
}

export async function loadRareRolls(limit = 30) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const [history, catalog] = await Promise.all([
    supabase.rpc("get_rare_roll_chat_history", { p_limit: safeLimit * 2 }),
    mutationCatalog()
  ]);
  if (history.error) throw history.error;

  const historyRows = history.data ?? [];
  const profiles = await profilesFor(historyRows.map((row) => row.player_id));
  const genuineRolls = historyRows.map((row) => normalize(row, profiles, catalog, true));

  return genuineRolls
    .filter(qualifies)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, safeLimit);
}

export function subscribeToRareRolls(onChange) {
  if (channel) return channel;
  channel = supabase
    .channel(CHANNEL)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "global_chat_announcements"
    }, () => onChange?.())
    .subscribe();
  return channel;
}

export async function unsubscribeFromRareRolls() {
  if (!channel) return;
  await supabase.removeChannel(channel);
  channel = null;
}
