import { supabase } from "./supabase.js";

const CHAT_CHANNEL = "global-chat";
const MAX_MESSAGE_LENGTH = 500;

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

  if (error) throw error;
  return data && typeof data === "object" ? data : {};
}

function normalizeChatRow(row, profiles = {}) {
  const profile = profiles[row?.sender_id] ?? {};

  return {
    id: `global-${row.id}`,
    source: "global",
    sender_id: row.sender_id,
    username: profile.username ?? "Unknown",
    avatar_url: profile.avatar_url ?? null,
    message: row.message,
    created_at: row.created_at
  };
}

function normalizeAnnouncement(row, profiles = {}) {
  const profile = profiles[row?.player_id] ?? {};

  return {
    id: `rare-${row.id}`,
    source: "announcement",
    sender_id: row.player_id,
    username: profile.username ?? "Unknown",
    avatar_url: profile.avatar_url ?? null,
    gem_name: row.gem_name,
    rarity: Number(row.rarity ?? 0),
    message: `${profile.username ?? "Unknown"} rolled ${row.gem_name} — 1 in ${Number(row.rarity ?? 0).toLocaleString("en-US")}!`,
    created_at: row.created_at
  };
}

async function enrich(rows, normalizer) {
  const ids = rows.map(row => row.sender_id ?? row.player_id);
  const profiles = await getProfiles(ids);
  return rows.map(row => normalizer(row, profiles));
}

export async function loadChatMessages(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const [chatResult, announcementResult] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, sender_id, message, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit),

    supabase
      .from("global_chat_announcements")
      .select("id, player_id, gem_name, rarity, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit)
  ]);

  if (chatResult.error) {
    console.error("[CHAT] Failed to load messages:", chatResult.error);
    throw chatResult.error;
  }

  if (announcementResult.error) {
    console.error("[CHAT] Failed to load rare announcements:", announcementResult.error);
    throw announcementResult.error;
  }

  const messages = await enrich(
    chatResult.data ?? [],
    normalizeChatRow
  );

  const announcements = await enrich(
    announcementResult.data ?? [],
    normalizeAnnouncement
  );

  return [...messages, ...announcements]
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
          if (message) onMessage(message);
        } catch (error) {
          console.error("[CHAT] Failed to process rare announcement:", error);
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
