import { supabase } from "./supabase.js";

const CHAT_CHANNEL = "global-chat";
const MAX_MESSAGE_LENGTH = 500;

let chatChannel = null;

/**
 * Send a global chat message.
 *
 * The 5-second cooldown is enforced by PostgreSQL, not this client.
 * This function therefore cannot bypass the cooldown by changing
 * browser-side JavaScript.
 */
export async function sendChatMessage(message) {
  const text = String(message ?? "").trim();

  if (!text) {
    throw new Error("Message cannot be empty.");
  }

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

/**
 * Load the most recent global chat messages.
 */
export async function loadChatMessages(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const { data, error } = await supabase
    .from("chat_messages")
    .select(`
      id,
      sender_id,
      message,
      created_at,
      players!chat_messages_sender_id_fkey (
        username
      )
    `)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error("[CHAT] Failed to load messages:", error);
    throw error;
  }

  return (data ?? []).reverse().map(normalizeMessage);
}

/**
 * Subscribe to new global chat messages.
 *
 * Realtime handles new messages, so the client does not poll the database.
 */
export function subscribeToChat(onMessage) {
  if (typeof onMessage !== "function") {
    throw new TypeError("subscribeToChat requires a callback.");
  }

  if (chatChannel) {
    console.warn("[CHAT] Already subscribed to global chat.");
    return chatChannel;
  }

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
          // Realtime INSERT payloads contain the new row, but not necessarily
          // the joined player username. Fetch the username only for this
          // newly-created message.
          const message = await getMessageWithUsername(payload.new);

          if (message) {
            onMessage(message);
          }
        } catch (error) {
          console.error("[CHAT] Failed to process realtime message:", error);
        }
      }
    )
    .subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        console.log("[CHAT] Realtime subscription active.");
      } else if (status === "CHANNEL_ERROR") {
        console.error("[CHAT] Realtime channel error:", error);
      } else if (status === "TIMED_OUT") {
        console.error("[CHAT] Realtime subscription timed out.");
      }
    });

  return chatChannel;
}

/**
 * Stop the Realtime subscription.
 */
export async function unsubscribeFromChat() {
  if (!chatChannel) return;

  await supabase.removeChannel(chatChannel);
  chatChannel = null;
}

/**
 * Fetch the player username for a newly received message.
 */
async function getMessageWithUsername(row) {
  if (!row?.id) return null;

  const { data, error } = await supabase
    .from("chat_messages")
    .select(`
      id,
      sender_id,
      message,
      created_at,
      players!chat_messages_sender_id_fkey (
        username
      )
    `)
    .eq("id", row.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? normalizeMessage(data) : null;
}

function normalizeMessage(row) {
  return {
    id: row.id,
    sender_id: row.sender_id,
    username: row.players?.username ?? "Unknown",
    message: row.message,
    created_at: row.created_at
  };
}

export default {
  loadChatMessages,
  sendChatMessage,
  subscribeToChat,
  unsubscribeFromChat
};
