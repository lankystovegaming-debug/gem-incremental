import { supabase } from "./supabase.js";

const CHAT_CHANNEL = "global-chat";
const MAX_MESSAGE_LENGTH = 500;
const BASE_ANNOUNCEMENT_THRESHOLD = 1_000_000;
const EFFECTIVE_ANNOUNCEMENT_THRESHOLD = 10_000_000;

let chatChannel = null;

export async function sendChatMessage(message) {
  const text = String(message ?? "").trim();

  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const { data, error } = await supabase.rpc("send_chat_message", {
    p_message: text
  });

  if (error) {
    console.error("[CHAT] Failed to send message:", error);
    throw error;
  }

  return data;
}

async function getProfiles(ids) {
  const uniqueIds = [...new Set((ids ?? []).filter(Boolean))];
  if (!uniqueIds.length) return {};

  const { data, error } = await supabase.rpc("get_chat_profiles", {
    p_user_ids: uniqueIds
  });

  let profiles = data && typeof data === "object" ? data : {};
  // Title data is intentionally protected in player_titles. If an older
  // get_chat_profiles deployment does not expose it, hydrate titles through
  // the dedicated batch RPC instead of silently dropping them.
  const { data: titleData, error: titleError } = await supabase.rpc("get_public_player_titles", {
    p_user_ids: uniqueIds
  });
  if (!titleError && titleData && typeof titleData === "object") {
    profiles = Object.fromEntries(uniqueIds.map((id) => [id, {
      ...(profiles[id] ?? {}),
      ...(titleData[id] ?? {})
    }]));
  } else if (error) {
    throw error;
  }
  return profiles;
}

function normalizeChatRow(row, profiles = {}) {
  const profile = profiles[row?.sender_id] ?? {};

  return {
    id: `global-${row.id}`,
    source: "global",
    sender_id: row.sender_id,
    username: profile.username ?? "Unknown",
    avatar_url: profile.avatar_url ?? null,
    title: profile.title ?? "",
    title_color: profile.title_color ?? "#ffd166",
    message: row.message,
    created_at: row.created_at
  };
}

function parseMutationIds(raw) {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id)).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((id) => String(id)).filter(Boolean);
      }
    } catch {
      // Fall through to legacy comma-separated values.
    }
    return raw.split(",").map((id) => id.trim()).filter(Boolean);
  }
  return [];
}

function normalizeAnnouncement(row, profiles = {}) {
  const rarity = Number(row?.rarity ?? 0);
  const profile = profiles[row?.player_id] ?? {};
  const rollerName = profile.username ?? "Someone";

  return {
    id: `rare-${row.id}`,
    source: "system",
    sender_id: null,
    username: "[SYSTEM]",
    avatar_url: null,
    roller_id: row.player_id,
    roller_username: rollerName,
    roller_title: profile.title ?? "",
    roller_title_color: profile.title_color ?? "#ffd166",
    gem_name: row.gem_name,
    rarity,
    effective_rarity: row?.effective_rarity == null ? null : Number(row.effective_rarity),
    luckAtRoll: row?.luck_at_roll == null ? null : Number(row.luck_at_roll),
    // Supabase normally returns a text[] as an array, but keep legacy/imported
    // rows readable if the value arrives serialized as JSON or CSV.
    mutation_ids: parseMutationIds(row?.mutation_ids),
    message: `${rollerName} rolled a rare ${row.gem_name} — 1 in ${rarity.toLocaleString("en-US")}!`,
    created_at: row.created_at
  };
}

async function enrich(rows, normalizer, includeProfiles = true) {
  if (!includeProfiles) {
    return rows.map(row => normalizer(row));
  }

  const ids = rows.map(row => row.sender_id ?? row.player_id);
  const profiles = await getProfiles(ids);
  return rows.map(row => normalizer(row, profiles));
}


function mutationChanceProductFromCatalog(ids, catalog) {
  const byId = new Map((catalog ?? []).map((mutation) => [String(mutation.id), mutation]));
  return (Array.isArray(ids) ? ids : []).reduce((product, id) => {
    const chance = Number(byId.get(String(id))?.chance ?? 1);
    return product * Math.max(1, chance);
  }, 1);
}

function chatMutationDetails(ids, catalog) {
  const byId = new Map((catalog ?? []).map((mutation) => [String(mutation.id), mutation]));
  return (Array.isArray(ids) ? ids : [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((mutation) => ({
      id: String(mutation.id),
      name: String(mutation.name ?? mutation.id),
      chance: Number(mutation.chance ?? 1),
      multiplier: Number(mutation.multiplier ?? 1),
      color: mutation.color ?? "#9fdcff",
      icon: mutation.icon ?? "✦"
    }));
}

let mutationCatalogCache = [];
let mutationCatalogCacheExpiresAt = 0;

async function loadLiveMutationCatalog() {
  if (mutationCatalogCache.length && Date.now() < mutationCatalogCacheExpiresAt) {
    return mutationCatalogCache;
  }

  const rpcResult = await supabase.rpc("get_public_mutation_catalog");
  let catalog = rpcResult.error ? [] : (rpcResult.data ?? []);

  if (rpcResult.error) {
    const fallback = await supabase
      .from("game_mutations")
      .select("id, name, chance, multiplier, color, icon, enabled, sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    if (!fallback.error) catalog = fallback.data ?? [];
  }

  mutationCatalogCache = catalog;
  mutationCatalogCacheExpiresAt = Date.now() + 60_000;
  return catalog;
}

function historyAnnouncementKey(row) {
  return `${row?.player_id ?? ""}|${row?.gem_name ?? ""}|${new Date(row?.created_at ?? 0).getTime()}`;
}

function nearAnnouncement(historyRow, announcements) {
  const historyTime = new Date(historyRow?.created_at ?? 0).getTime();
  return announcements.some((announcement) => {
    if (announcement?.roller_id !== historyRow?.player_id) return false;
    if (announcement?.gem_name !== historyRow?.gem_name) return false;
    const announcementTime = new Date(announcement?.created_at ?? 0).getTime();
    return Number.isFinite(historyTime) && Number.isFinite(announcementTime) && Math.abs(historyTime - announcementTime) <= 5000;
  });
}

function normalizeHistoryAnnouncement(row, mutationCatalog = []) {
  const mutationIds = parseMutationIds(row?.mutation_ids);
  const rarity = Number(row?.rarity ?? 0);
  const effectiveRarity = Math.max(1, rarity * mutationChanceProductFromCatalog(mutationIds, mutationCatalog));
  return {
    id: `rare-history-${row.id}`,
    source: "system",
    sender_id: null,
    username: "[SYSTEM]",
    avatar_url: null,
    roller_id: row.player_id,
    roller_username: row.username ?? "Someone",
    roller_title: row.title ?? "",
    roller_title_color: row.title_color ?? "#ffd166",
    gem_name: row.gem_name,
    rarity,
    effective_rarity: effectiveRarity,
    luckAtRoll: row.base_luck == null ? null : Number(row.base_luck),
    mutation_ids: mutationIds,
    message: `${row.username ?? "Someone"} rolled a rare ${row.gem_name} — 1 in ${Math.round(effectiveRarity).toLocaleString("en-US")}!`,
    created_at: row.created_at,
    recovered_from_history: true
  };
}

export async function loadChatMessages(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const [chatResult, announcementResult, historyResult, mutationCatalogResult] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, sender_id, message, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit),

    supabase
      .from("global_chat_announcements")
      .select("id, player_id, gem_name, rarity, effective_rarity, mutation_ids, luck_at_roll, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit),

    // Best-roll history is a durable recovery path. If a rare announcement
    // was missed by an older Edge Function/database deployment, a page reload
    // can still reconstruct the qualifying roll instead of losing it from chat.
    // best_roll_history is intentionally private under RLS. Use the
    // SECURITY DEFINER recovery projection instead of querying it directly.
    supabase.rpc("get_rare_roll_chat_history", {
      p_limit: Math.min(100, safeLimit * 2)
    }),

    // The live catalog is required for custom mutations whose chances are not
    // present in the historical five-mutation client constant.
    supabase.rpc("get_public_mutation_catalog")
  ]);

  if (chatResult.error) {
    console.error("[CHAT] Failed to load messages:", chatResult.error);
    throw chatResult.error;
  }

  if (announcementResult.error) {
    console.error("[CHAT] Failed to load rare announcements:", announcementResult.error);
    throw announcementResult.error;
  }

  const [messages, announcements] = await Promise.all([
    enrich(chatResult.data ?? [], normalizeChatRow),
    enrich(announcementResult.data ?? [], normalizeAnnouncement)
  ]);

  let mutationCatalog = mutationCatalogResult.error ? [] : (mutationCatalogResult.data ?? []);
  if (mutationCatalogResult.error) {
    const fallback = await supabase
      .from("game_mutations")
      .select("id, name, chance, multiplier, color, icon, enabled, sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    if (!fallback.error) mutationCatalog = fallback.data ?? [];
  }
  const recoveredKeys = new Set();
  const recoveredAnnouncements = (historyResult.error ? [] : (historyResult.data ?? []))
    .filter((row) => {
      const mutationIds = parseMutationIds(row?.mutation_ids);
      const rarity = Number(row?.rarity ?? 0);
      const effectiveRarity = rarity * mutationChanceProductFromCatalog(mutationIds, mutationCatalog);
      // Natural base rarity and mutation-driven effective rarity use separate
      // thresholds so common gems do not flood global chat.
      return rarity >= BASE_ANNOUNCEMENT_THRESHOLD ||
        (mutationIds.length > 0 && effectiveRarity >= EFFECTIVE_ANNOUNCEMENT_THRESHOLD);
    })
    .filter((row) => !nearAnnouncement(row, announcements))
    .filter((row) => {
      const key = [
        row?.player_id ?? "",
        row?.gem_name ?? "",
        new Date(row?.created_at ?? 0).getTime(),
        parseMutationIds(row?.mutation_ids).join("+")
      ].join("|");
      if (recoveredKeys.has(key)) return false;
      recoveredKeys.add(key);
      return true;
    })
    .map((row) => normalizeHistoryAnnouncement(row, mutationCatalog));

  const allAnnouncements = [...announcements, ...recoveredAnnouncements].map((message) => ({
    ...message,
    mutation_details: chatMutationDetails(message.mutation_ids, mutationCatalog)
  }));

  return [...messages, ...allAnnouncements]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(-safeLimit);
}

export function subscribeToChat(onMessage) {
  if (typeof onMessage !== "function") {
    throw new TypeError("subscribeToChat requires a callback.");
  }

  if (chatChannel) return chatChannel;

  chatChannel = supabase
    .channel(CHAT_CHANNEL)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages"
      },
      async (payload) => {
        try {
          const [message] = await enrich(
            [payload.new],
            normalizeChatRow
          );
          if (message) onMessage(message);
        } catch (error) {
          console.error("[CHAT] Failed to process message:", error);
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "global_chat_announcements"
      },
      async (payload) => {
        try {
          const [message] = await enrich(
            [payload.new],
            normalizeAnnouncement
          );
          if (message) {
            const catalog = await loadLiveMutationCatalog();
            message.mutation_details = chatMutationDetails(message.mutation_ids, catalog);
          }
          if (message) onMessage(message);
        } catch (error) {
          console.error("[CHAT] Failed to process rare announcement:", error);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "global_chat_announcements" },
      async (payload) => {
        try {
          const [message] = await enrich([payload.new], normalizeAnnouncement);
          if (message) {
            const catalog = await loadLiveMutationCatalog();
            message.mutation_details = chatMutationDetails(message.mutation_ids, catalog);
          }
          if (message) onMessage(message);
        } catch (error) {
          console.error("[CHAT] Failed to process rare announcement update:", error);
        }
      }
    )
    .subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        console.log("[CHAT] Global/reward realtime subscription active.");
      } else if (status === "CHANNEL_ERROR") {
        console.error("[CHAT] Realtime channel error:", error);
      } else if (status === "TIMED_OUT") {
        console.error("[CHAT] Realtime subscription timed out.");
      }
    });

  return chatChannel;
}

export async function unsubscribeFromChat() {
  if (!chatChannel) return;
  await supabase.removeChannel(chatChannel);
  chatChannel = null;
}
