import {
  loadChatMessages,
  sendChatMessage,
  subscribeToChat,
  unsubscribeFromChat
} from "./src/backend/chat.js";
import { ensurePlayerAuth } from "./src/backend/auth.js";
import {
  findPlayerByUsername,
  loadRecentPrivateMessages,
  sendPrivateMessage,
  subscribeToPrivateMessages,
  unsubscribeFromPrivateMessages
} from "./src/backend/privateMessages.js";

const messagesEl = document.querySelector("#chatMessages");
const emptyEl = document.querySelector("#chatEmpty");
const formEl = document.querySelector("#chatForm");
const inputEl = document.querySelector("#chatInput");
const sendEl = document.querySelector("#chatSend");
const statusEl = document.querySelector("#chatStatus");
const hintEl = document.querySelector("#chatHint");

if (messagesEl && formEl && inputEl) {
  let sending = false;
  let ready = false;
  let currentUserId = null;

  inputEl.disabled = true;
  if (sendEl) sendEl.disabled = true;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function rarityClass(rarity) {
    const n = Number(rarity ?? 0);

    if (n >= 1_000_000) return "chat-message--million";
    if (n >= 100_000) return "chat-message--hundredk";

    return "";
  }

  function avatarHtml(message) {
    if (message.source === "system" || message.source === "announcement") {
      return `
        <span class="chat-avatar chat-avatar--system" aria-hidden="true">
          S
        </span>
      `;
    }

    const initial =
      String(message.username ?? "?").trim().charAt(0).toUpperCase() || "?";

    if (message.avatar_url) {
      return `
        <span class="chat-avatar">
          <img
            src="${escapeHtml(message.avatar_url)}"
            alt=""
            referrerpolicy="no-referrer"
          >
        </span>
      `;
    }

    return `
      <span class="chat-avatar chat-avatar--fallback">
        ${escapeHtml(initial)}
      </span>
    `;
  }

  function renderMessage(message, shouldScroll = true) {
    if (!message?.id) return;

    const messageId = String(message.id);

    if (
      messagesEl.querySelector(
        `[data-message-id="${CSS.escape(messageId)}"]`
      )
    ) {
      return;
    }

    messagesEl.querySelector("#chatEmpty")?.remove();

    const isPrivate = message.source === "private";
    const isSystem =
      message.source === "system" || message.source === "announcement";
    const mine = isPrivate && message.sender_id === currentUserId;

    const item = document.createElement("div");

    item.className = [
      "chat-message",
      isPrivate ? "chat-message--private" : "",
      mine ? "chat-message--mine" : "",
      isSystem ? "chat-message--system" : "",
      rarityClass(message.rarity)
    ]
      .filter(Boolean)
      .join(" ");

    item.dataset.messageId = messageId;

    let label;

    if (isPrivate) {
      label = mine
        ? `<span class="chat-private-tag">Private</span> to ${escapeHtml(
            message.other_username ?? "Unknown"
          )}`
        : `<span class="chat-private-tag">Private</span> from ${escapeHtml(
            message.username ?? "Unknown"
          )}`;
    } else if (isSystem) {
      label = `<span class="chat-system-tag">[SYSTEM]</span>`;
    } else {
      label = escapeHtml(message.username ?? "Unknown");
    }

    const effect =
      isSystem && Number(message.rarity ?? 0) >= 1_000_000
        ? "chat-message__effect"
        : "";

    const avatar = avatarHtml(message);

    item.innerHTML = `
      <div class="chat-message__avatar">${avatar}</div>

      <div class="chat-message__body ${effect}">
        <div class="chat-message__meta">
          <span class="chat-message__name">${label}</span>

          <time
            class="chat-message__time"
            datetime="${escapeHtml(message.created_at)}"
          >
            ${escapeHtml(formatTime(message.created_at))}
          </time>
        </div>

        <div class="chat-message__text">
          ${escapeHtml(message.message)}
        </div>
      </div>
    `;

    messagesEl.appendChild(item);

    if (shouldScroll) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function setHint(text, type = "") {
    if (!hintEl) return;

    hintEl.textContent = text;
    hintEl.className = `chat-hint${type ? ` chat-hint--${type}` : ""}`;
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function parseCommand(text) {
    const match = text.match(/^\/msg\s+([^\s]+)\s+([\s\S]+)$/i);

    if (!match) return null;

    const username = match[1].trim();
    const message = match[2].trim();

    if (!username || !message) return null;

    return { username, message };
  }

  async function sendInput(text) {
    const command = parseCommand(text);

    // Anything that is not /msg username message is a global message.
    if (!command) {
      await sendChatMessage(text);
      return "global";
    }

    const target = await findPlayerByUsername(command.username);

    if (!target) {
      throw new Error(`Player "${command.username}" was not found.`);
    }

    if (target.id === currentUserId) {
      throw new Error("You cannot send a private message to yourself.");
    }

    const privateMessage = await sendPrivateMessage(
      target.id,
      command.message
    );

    // Render immediately. The realtime INSERT is deduplicated by the same ID.
    if (privateMessage) {
      const row = Array.isArray(privateMessage)
        ? privateMessage[0]
        : privateMessage;

      if (row?.id) {
        renderMessage({
          ...row,
          id: `private-${row.id}`,
          source: "private",
          sender_id: currentUserId,
          recipient_id: target.id,
          username: "You",
          other_username: target.username,
          message: row.message ?? command.message,
          created_at: row.created_at ?? new Date().toISOString()
        });
      }
    }

    return "private";
  }

  async function init() {
    try {
      const user = await ensurePlayerAuth();

      if (!user) {
        throw new Error("Could not sign you in. Refresh to try again.");
      }

      currentUserId = user.id;

      // Load public chat and only this user's private messages.
      const [globalMessages, privateMessages] = await Promise.all([
        loadChatMessages(),
        loadRecentPrivateMessages(50)
      ]);

      messagesEl.innerHTML = "";

      const merged = [...globalMessages, ...privateMessages]
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        )
        .slice(-100);

      if (!merged.length) {
        const empty = document.createElement("div");
        empty.className = "chat-empty";
        empty.id = "chatEmpty";
        empty.textContent = "No messages yet. Say hello!";
        messagesEl.appendChild(empty);
      } else {
        for (const message of merged) {
          renderMessage(message, false);
        }

        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      subscribeToChat((message) => {
        renderMessage(message);
      });

      subscribeToPrivateMessages((message) => {
        renderMessage({
          ...message,
          id: `private-${message.id}`,
          source: "private"
        });
      });

      ready = true;
      inputEl.disabled = false;

      if (sendEl) sendEl.disabled = false;

      setStatus("Live");
      setHint(
        "Global chat is live. Use /msg username message for a private message."
      );
    } catch (error) {
      console.error("[CHAT] Initialization failed:", error);
      setStatus("Unavailable");
      setHint(
        error?.message || "Could not load chat.",
        "error"
      );
    }
  }

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (sending || !ready) return;

    const text = inputEl.value.trim();

    if (!text) return;

    sending = true;
    inputEl.disabled = true;

    if (sendEl) sendEl.disabled = true;

    try {
      const type = await sendInput(text);

      inputEl.value = "";

      if (type === "private") {
        setHint(
          "Private message sent. You can send another message in 5 seconds.",
          "ok"
        );
      } else {
        setHint(
          "Global message sent. You can send another message in 5 seconds.",
          "ok"
        );
      }
    } catch (error) {
      console.error("[CHAT] Send failed:", error);

      const message = error?.message || "Could not send message.";

      setHint(
        message.toLowerCase().includes("wait 5 seconds")
          ? "Please wait 5 seconds between messages."
          : message,
        "error"
      );
    } finally {
      sending = false;
      inputEl.disabled = false;

      if (sendEl) sendEl.disabled = false;

      inputEl.focus();
    }
  });

  window.addEventListener("beforeunload", () => {
    Promise.all([
      unsubscribeFromChat(),
      unsubscribeFromPrivateMessages()
    ]).catch(() => {});
  });

  init();
}
