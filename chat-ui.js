import {
  loadChatMessages,
  sendChatMessage,
  subscribeToChat,
  unsubscribeFromChat
} from "./src/backend/chat.js";
import { ensurePlayerAuth } from "./src/backend/auth.js";

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

  // Do not allow an unauthenticated submit while the anonymous session is
  // being created. The database intentionally denies those requests.
  inputEl.disabled = true;
  if (sendEl) sendEl.disabled = true;

  function escapeHtml(value) {
    return String(value)
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

  function renderMessage(message, shouldScroll = true) {
    if (!message?.id) return;

    if (messagesEl.querySelector(`[data-message-id="${message.id}"]`)) {
      return;
    }

    emptyEl?.remove();

    const item = document.createElement("div");
    item.className = "chat-message";
    item.dataset.messageId = message.id;

    item.innerHTML = `
      <span class="chat-message__name">${escapeHtml(message.username)}</span>
      <span class="chat-message__text">${escapeHtml(message.message)}</span>
      <time class="chat-message__time" datetime="${escapeHtml(message.created_at)}">
        ${escapeHtml(formatTime(message.created_at))}
      </time>
    `;

    messagesEl.appendChild(item);

    if (shouldScroll) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function setHint(text, type = "") {
    hintEl.textContent = text;
    hintEl.className = `chat-hint${type ? ` chat-hint--${type}` : ""}`;
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  async function init() {
    try {
      const user = await ensurePlayerAuth();

      if (!user) {
        throw new Error("Could not sign you in. Refresh to try again.");
      }

      const messages = await loadChatMessages();

      messagesEl.innerHTML = "";

      if (!messages.length) {
        const empty = document.createElement("div");
        empty.className = "chat-empty";
        empty.id = "chatEmpty";
        empty.textContent = "No messages yet. Say hello!";
        messagesEl.appendChild(empty);
      } else {
        for (const message of messages) {
          renderMessage(message, false);
        }

        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      subscribeToChat((message) => {
        renderMessage(message);
      });

      ready = true;
      inputEl.disabled = false;
      if (sendEl) sendEl.disabled = false;
      setStatus("Live");
      setHint("You can send one message every 5 seconds.");
    } catch (error) {
      console.error("[CHAT] Initialization failed:", error);
      setStatus("Unavailable");
      setHint(error.message || "Could not load chat.", "error");
    }
  }

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (sending || !ready) return;

    const text = inputEl.value.trim();
    if (!text) return;

    sending = true;
    sendEl.disabled = true;
    inputEl.disabled = true;

    try {
      await sendChatMessage(text);

      inputEl.value = "";
      setHint("Message sent. You can send another message in 5 seconds.", "ok");
    } catch (error) {
      console.error("[CHAT] Send failed:", error);

      const message = error?.message || "Could not send message.";

      if (message.toLowerCase().includes("wait 5 seconds")) {
        setHint("Please wait 5 seconds between messages.", "error");
      } else {
        setHint(message, "error");
      }
    } finally {
      sending = false;
      sendEl.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
  });

  window.addEventListener("beforeunload", () => {
    unsubscribeFromChat().catch(() => {});
  });

  init();
}
