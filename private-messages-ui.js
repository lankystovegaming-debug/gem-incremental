import {
  getCurrentUserId,
  searchPlayers,
  loadConversation,
  loadConversations,
  sendPrivateMessage,
  markConversationRead,
  subscribeToPrivateMessages,
  unsubscribeFromPrivateMessages
} from "./src/backend/privateMessages.js";

const searchInput = document.querySelector("#dmPlayerSearch");
const searchResults = document.querySelector("#dmSearchResults");
const conversationsEl = document.querySelector("#dmConversations");
const messagesEl = document.querySelector("#dmMessages");
const emptyEl = document.querySelector("#dmEmpty");
const formEl = document.querySelector("#dmForm");
const inputEl = document.querySelector("#dmInput");
const sendEl = document.querySelector("#dmSend");
const titleEl = document.querySelector("#dmConversationTitle");
const statusEl = document.querySelector("#dmStatus");
const hintEl = document.querySelector("#dmHint");

if (
  searchInput &&
  searchResults &&
  conversationsEl &&
  messagesEl &&
  formEl
) {
  let currentUserId = null;
  let selectedPlayer = null;
  let sending = false;
  let searchTimer = null;

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

  function setHint(text, type = "") {
    hintEl.textContent = text;
    hintEl.className = `dm-hint${type ? ` dm-hint--${type}` : ""}`;
  }

  function renderMessage(message, shouldScroll = true) {
    if (!message?.id) return;

    const existing = messagesEl.querySelector(
      `[data-dm-message-id="${message.id}"]`
    );

    if (existing) return;

    emptyEl?.remove();

    const item = document.createElement("div");
    item.className =
      "dm-message" +
      (message.sender_id === currentUserId
        ? " dm-message--mine"
        : " dm-message--theirs");

    item.dataset.dmMessageId = message.id;

    item.innerHTML = `
      <div class="dm-message__bubble">
        <div class="dm-message__text">${escapeHtml(message.message)}</div>
        <time class="dm-message__time" datetime="${escapeHtml(message.created_at)}">
          ${escapeHtml(formatTime(message.created_at))}
        </time>
      </div>
    `;

    messagesEl.appendChild(item);

    if (shouldScroll) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function renderConversationList(conversations) {
    conversationsEl.innerHTML = "";

    if (!conversations.length) {
      conversationsEl.innerHTML =
        '<div class="dm-list-empty">No private conversations yet.</div>';
      return;
    }

    for (const conversation of conversations) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "dm-conversation" +
        (selectedPlayer?.id === conversation.playerId
          ? " dm-conversation--active"
          : "");

      button.dataset.playerId = conversation.playerId;

      button.innerHTML = `
        <span class="dm-conversation__body">
          <strong>${escapeHtml(conversation.username)}</strong>
          <span>${escapeHtml(conversation.lastMessage || "")}</span>
        </span>
        <span class="dm-conversation__meta">
          <time>${escapeHtml(formatTime(conversation.lastMessageAt))}</time>
          ${
            conversation.unread
              ? `<b class="dm-unread">${conversation.unread > 99 ? "99+" : conversation.unread}</b>`
              : ""
          }
        </span>
      `;

      button.addEventListener("click", () => {
        selectPlayer({
          id: conversation.playerId,
          username: conversation.username
        });
      });

      conversationsEl.appendChild(button);
    }
  }

  function renderSearchResults(players) {
    searchResults.innerHTML = "";

    if (!players.length) {
      searchResults.innerHTML =
        '<div class="dm-search-empty">No players found.</div>';
      return;
    }

    for (const player of players) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dm-player-result";
      button.innerHTML = `<span>${escapeHtml(player.username || "Unknown")}</span>`;

      button.addEventListener("click", () => {
        searchInput.value = "";
        searchResults.hidden = true;
        selectPlayer(player);
      });

      searchResults.appendChild(button);
    }

    searchResults.hidden = false;
  }

  async function refreshConversations() {
    try {
      const conversations = await loadConversations();
      renderConversationList(conversations);
    } catch (error) {
      console.error("[DM] Failed to load conversations:", error);
    }
  }

  async function selectPlayer(player) {
    if (!player?.id) return;

    selectedPlayer = player;
    titleEl.textContent = player.username || "Unknown";
    statusEl.textContent = "Loading…";
    inputEl.disabled = true;
    sendEl.disabled = true;

    document
      .querySelectorAll(".dm-conversation")
      .forEach((element) => {
        element.classList.toggle(
          "dm-conversation--active",
          element.dataset.playerId === player.id
        );
      });

    messagesEl.innerHTML =
      '<div class="dm-empty-loading">Loading conversation…</div>';

    try {
      const messages = await loadConversation(player.id);

      messagesEl.innerHTML = "";

      if (!messages.length) {
        messagesEl.innerHTML =
          '<div class="dm-empty-loading">No messages yet. Start the conversation!</div>';
      } else {
        for (const message of messages) {
          renderMessage(message, false);
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      await markConversationRead(player.id);

      statusEl.textContent = "Private";
      inputEl.disabled = false;
      sendEl.disabled = false;
      inputEl.focus();
      setHint("Private conversation. You can send one message every 5 seconds.");

      await refreshConversations();
    } catch (error) {
      console.error("[DM] Failed to open conversation:", error);
      statusEl.textContent = "Unavailable";
      messagesEl.innerHTML =
        '<div class="dm-empty-loading">Could not load this conversation.</div>';
      setHint(error.message || "Could not load conversation.", "error");
    }
  }

  async function search() {
    try {
      const players = await searchPlayers(searchInput.value);
      renderSearchResults(players);
    } catch (error) {
      console.error("[DM] Player search failed:", error);
      searchResults.hidden = true;
    }
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);

    const text = searchInput.value.trim();

    if (!text) {
      searchResults.hidden = true;
      searchResults.innerHTML = "";
      return;
    }

    searchTimer = setTimeout(search, 250);
  });

  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) search();
  });

  document.addEventListener("click", (event) => {
    if (
      !searchResults.contains(event.target) &&
      event.target !== searchInput
    ) {
      searchResults.hidden = true;
    }
  });

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (sending || !selectedPlayer) return;

    const text = inputEl.value.trim();
    if (!text) return;

    sending = true;
    inputEl.disabled = true;
    sendEl.disabled = true;

    try {
      const message = await sendPrivateMessage(selectedPlayer.id, text);

      inputEl.value = "";

      if (message?.id) {
        renderMessage({
          ...message,
          sender_id: currentUserId
        });
      }

      setHint(
        "Message sent. You can send another message in 5 seconds.",
        "ok"
      );

      await refreshConversations();
    } catch (error) {
      console.error("[DM] Send failed:", error);

      const message = error?.message || "Could not send message.";

      if (message.toLowerCase().includes("wait 5 seconds")) {
        setHint("Please wait 5 seconds between messages.", "error");
      } else {
        setHint(message, "error");
      }
    } finally {
      sending = false;
      inputEl.disabled = false;
      sendEl.disabled = false;
      inputEl.focus();
    }
  });

  async function init() {
    try {
      currentUserId = await getCurrentUserId();
      await refreshConversations();

      subscribeToPrivateMessages(async (message) => {
        const otherPlayerId =
          message.sender_id === currentUserId
            ? message.recipient_id
            : message.sender_id;

        if (selectedPlayer?.id === otherPlayerId) {
          renderMessage(message);

          if (message.sender_id !== currentUserId) {
            await markConversationRead(otherPlayerId);
          }
        }

        await refreshConversations();
      });

      setHint("Select a player to start a private conversation.");
    } catch (error) {
      console.error("[DM] Initialization failed:", error);
      statusEl.textContent = "Unavailable";
      setHint(error.message || "Could not load private messages.", "error");
    }
  }

  window.addEventListener("beforeunload", () => {
    unsubscribeFromPrivateMessages().catch(() => {});
  });

  init();
}
