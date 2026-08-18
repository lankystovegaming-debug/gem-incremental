import { supabase } from "./supabase.js";

const PRIVATE_CHANNEL = "private-messages";
const MAX_MESSAGE_LENGTH = 500;

let privateChannel = null;

async function getCurrentUser() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  const user = session?.user;

  if (error) throw error;
  if (!user) throw new Error("You must be signed in to use private messaging.");

  return user;
}

export async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user.id;
}

export async function searchPlayers(query, limit = 20) {
  const text = String(query ?? "").trim();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  let request = supabase
    .from("players")
    .select("id, username")
    .not("username", "is", null)
    .order("username", { ascending: true })
    .limit(safeLimit);

  if (text) {
    request = request.ilike("username", `%${text}%`);
  }

  const { data, error } = await request;

  if (error) {
    console.error("[DM] Failed to search players:", error);
    throw error;
  }

  const userId = await getCurrentUserId();
  return (data ?? []).filter((player) => player.id !== userId);
}

async function getUsernames(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from("players")
    .select("id, username")
    .in("id", uniqueIds);

  if (error) throw error;

  return new Map(
    (data ?? []).map((player) => [
      player.id,
      player.username || "Unknown"
    ])
  );
}

export async function loadConversation(otherPlayerId, limit = 100) {
  const userId = await getCurrentUserId();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);

  if (!otherPlayerId || otherPlayerId === userId) {
    throw new Error("Invalid player.");
  }

  const { data, error } = await supabase
    .from("private_messages")
    .select(`
      id,
      sender_id,
      recipient_id,
      message,
      created_at,
      read_at
    `)
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${otherPlayerId}),and(sender_id.eq.${otherPlayerId},recipient_id.eq.${userId})`
    )
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  if (error) {
    console.error("[DM] Failed to load conversation:", error);
    throw error;
  }

  const usernames = await getUsernames(
    (data ?? []).flatMap((row) => [row.sender_id, row.recipient_id])
  );

  return (data ?? []).map((row) => ({
    ...row,
    username: usernames.get(row.sender_id) || "Unknown"
  }));
}

export async function loadConversations() {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("private_messages")
    .select(`
      id,
      sender_id,
      recipient_id,
      message,
      created_at,
      read_at
    `)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[DM] Failed to load conversations:", error);
    throw error;
  }

  const rows = data ?? [];
  const otherIds = rows.map((row) =>
    row.sender_id === userId ? row.recipient_id : row.sender_id
  );

  const usernames = await getUsernames(otherIds);
  const conversations = new Map();

  for (const row of rows) {
    const otherId =
      row.sender_id === userId ? row.recipient_id : row.sender_id;

    if (!conversations.has(otherId)) {
      conversations.set(otherId, {
        playerId: otherId,
        username: usernames.get(otherId) || "Unknown",
        lastMessage: row.message,
        lastMessageAt: row.created_at,
        unread: 0
      });
    }

    if (
      row.recipient_id === userId &&
      row.sender_id === otherId &&
      !row.read_at
    ) {
      conversations.get(otherId).unread += 1;
    }
  }

  return [...conversations.values()];
}

export async function sendPrivateMessage(recipientId, message) {
  const text = String(message ?? "").trim();

  if (!recipientId) throw new Error("Choose a player first.");
  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const { data, error } = await supabase.rpc("send_private_message", {
    p_recipient_id: recipientId,
    p_message: text
  });

  if (error) {
    console.error("[DM] Failed to send message:", error);
    throw error;
  }

  return data;
}

export async function markConversationRead(otherPlayerId) {
  const userId = await getCurrentUserId();

  if (!otherPlayerId || otherPlayerId === userId) return;

  const { error } = await supabase
    .from("private_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_id", otherPlayerId)
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) {
    console.error("[DM] Failed to mark messages read:", error);
    throw error;
  }
}


export async function loadUnreadPrivateMessageCount() {
  const userId = await getCurrentUserId();

  const { count, error } = await supabase
    .from("private_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) {
    console.error("[DM] Failed to count unread messages:", error);
    throw error;
  }

  return count ?? 0;
}


export async function markAllPrivateMessagesRead() {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("private_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) {
    console.error("[DM] Failed to mark messages read:", error);
    throw error;
  }
}

export function subscribeToPrivateMessages(onMessage) {
  if (typeof onMessage !== "function") {
    throw new TypeError("subscribeToPrivateMessages requires a callback.");
  }

  if (privateChannel) return privateChannel;

  privateChannel = supabase
    .channel(PRIVATE_CHANNEL)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "private_messages"
      },
      async (payload) => {
        try {
          const userId = await getCurrentUserId();
          const row = payload.new;

          if (
            row?.sender_id !== userId &&
            row?.recipient_id !== userId
          ) {
            return;
          }

          const usernames = await getUsernames([
            row.sender_id,
            row.recipient_id
          ]);

          onMessage({
            ...row,
            username: usernames.get(row.sender_id) || "Unknown"
          });
        } catch (error) {
          console.error("[DM] Failed to process realtime message:", error);
        }
      }
    )
    .subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        console.log("[DM] Realtime subscription active.");
      } else if (status === "CHANNEL_ERROR") {
        console.error("[DM] Realtime channel error:", error);
      }
    });

  return privateChannel;
}


export async function findPlayerByUsername(username) {
  const name = String(username ?? "").trim();
  if (!name) return null;

  const { data, error } = await supabase
    .from("players")
    .select("id, username")
    .ilike("username", name)
    .limit(5);

  if (error) throw error;

  return (data ?? []).find(
    player => String(player.username ?? "").toLowerCase() === name.toLowerCase()
  ) ?? null;
}

export async function cleanupPrivateMessages(maxAgeDays = 30) {
  const days = Math.min(Math.max(Number(maxAgeDays) || 30, 1), 3650);

  const { data, error } = await supabase.rpc("cleanup_private_messages", {
    p_max_age_days: days
  });

  if (error) {
    console.error("[DM] Failed to auto-clear old private messages:", error);
    throw error;
  }

  return Number(data ?? 0);
}

export async function loadRecentPrivateMessages(limit = 50) {
  const userId = await getCurrentUserId();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const { data, error } = await supabase
    .from("private_messages")
    .select("id, sender_id, recipient_id, message, created_at, read_at")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  const ids = [...new Set(
    (data ?? []).flatMap(row => [row.sender_id, row.recipient_id])
  )];

  const profiles = {};
  if (ids.length) {
    const result = await supabase.rpc("get_chat_profiles", {
      p_user_ids: ids
    });
    if (result.error) throw result.error;
    Object.assign(profiles, result.data ?? {});
  }

  return (data ?? []).map(row => {
    const otherId =
      row.sender_id === userId ? row.recipient_id : row.sender_id;
    const other = profiles[otherId] ?? {};
    const sender = profiles[row.sender_id] ?? {};

    return {
      id: `private-${row.id}`,
      private_id: row.id,
      source: "private",
      sender_id: row.sender_id,
      recipient_id: row.recipient_id,
      username: sender.username ?? "Unknown",
      avatar_url: sender.avatar_url ?? null,
      other_username: other.username ?? "Unknown",
      other_avatar_url: other.avatar_url ?? null,
      message: row.message,
      created_at: row.created_at,
      read_at: row.read_at
    };
  }).reverse();
}

export async function unsubscribeFromPrivateMessages() {
  if (!privateChannel) return;
  await supabase.removeChannel(privateChannel);
  privateChannel = null;
}
