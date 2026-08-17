import {
  loadChatMessages,
  sendChatMessage,
  subscribeToChat,
  unsubscribeFromChat
} from "./src/backend/chat.js";
import { ensurePlayerAuth } from "./src/backend/auth.js";
import {
  findPlayerByUsername,
  loadUnreadPrivateMessageCount,
  loadRecentPrivateMessages,
  markAllPrivateMessagesRead,
  sendPrivateMessage,
  subscribeToPrivateMessages,
  unsubscribeFromPrivateMessages
} from "./src/backend/privateMessages.js";
import { gemNameHtml } from "./src/ui/gemStyle.js";
import { getGemMutation } from "./src/data/mutations.js";

const messagesEl = document.querySelector("#chatMessages");
const emptyEl = document.querySelector("#chatEmpty");
const formEl = document.querySelector("#chatForm");
const inputEl = document.querySelector("#chatInput");
const sendEl = document.querySelector("#chatSend");
const statusEl = document.querySelector("#chatStatus");
const hintEl = document.querySelector("#chatHint");
const fabEl = document.querySelector("#chatFab");
const badgeEl = document.querySelector("#chatFabBadge");
const dockEl = document.querySelector("#chatDock");
const closeDockEl = document.querySelector("#chatDockClose");
const settingsToggleEl = document.querySelector("#chatDockSettings");
const settingsPanelEl = document.querySelector("#chatDockSettingsPanel");
const resetSizeEl = document.querySelector("#chatDockResetSize");
const widthResizeEl = document.querySelector("#chatDockResizeWidth");
const heightResizeEl = document.querySelector("#chatDockResizeHeight");
const layoutOptionEls = document.querySelectorAll("[data-chat-layout]");

const CHAT_LAYOUT_STORAGE_KEY = "gem.chat.layout.v1";
const CHAT_UNREAD_STORAGE_KEY = "gem.chat.unread.v1";
const DEFAULT_CHAT_LAYOUT = Object.freeze({
  layout: "floating",
  width: 360,
  height: 560
});

if (messagesEl && formEl && inputEl) {
  let sending = false;
  let ready = false;
  let currentUserId = null;
  let unreadGlobal = 0;
  let unreadPrivate = 0;
  let markingPrivateRead = false;
  let layoutSettings = loadChatLayout();
  const documentTitle = document.title.replace(/^\(\d+\)\s+/, "");

  inputEl.disabled = true;
  if (sendEl) sendEl.disabled = true;

  function readStorage(key) {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The game still works if browser storage is unavailable.
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || min));
  }

  function loadChatLayout() {
    const saved = readStorage(CHAT_LAYOUT_STORAGE_KEY) ?? {};
    const layout = ["floating", "side-right", "side-left"].includes(saved.layout)
      ? saved.layout
      : DEFAULT_CHAT_LAYOUT.layout;

    return {
      layout,
      width: clamp(saved.width ?? DEFAULT_CHAT_LAYOUT.width, 300, 720),
      height: clamp(saved.height ?? DEFAULT_CHAT_LAYOUT.height, 360, 760)
    };
  }

  function saveChatLayout() {
    writeStorage(CHAT_LAYOUT_STORAGE_KEY, layoutSettings);
  }

  function applyChatLayout() {
    if (!dockEl) return;

    const maxWidth = Math.max(300, Math.min(720, window.innerWidth - 24));
    const maxHeight = Math.max(360, Math.min(760, window.innerHeight - 24));

    layoutSettings.width = clamp(layoutSettings.width, 300, maxWidth);
    layoutSettings.height = clamp(layoutSettings.height, 360, maxHeight);

    dockEl.dataset.layout = layoutSettings.layout;
    dockEl.style.setProperty("--chat-dock-width", `${layoutSettings.width}px`);
    dockEl.style.setProperty("--chat-dock-height", `${layoutSettings.height}px`);

    for (const option of layoutOptionEls) {
      const selected = option.dataset.chatLayout === layoutSettings.layout;
      option.classList.toggle("is-active", selected);
      option.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function isChatOpen() {
    return Boolean(dockEl && !dockEl.classList.contains("hidden"));
  }

  function isChatBeingRead() {
    return isChatOpen() && !document.hidden;
  }

  function latestGlobalMessageAt(messages) {
    return (messages ?? [])
      .filter((message) => message.source === "global" && message.created_at)
      .map((message) => new Date(message.created_at).getTime())
      .filter(Number.isFinite)
      .reduce((latest, value) => Math.max(latest, value), 0);
  }

  function renderedChatMessages() {
    return [...messagesEl.querySelectorAll(".chat-message")].map((item) => ({
      source: item.classList.contains("chat-message--private") ? "private" : "global",
      created_at: item.querySelector("time")?.dateTime
    }));
  }

  function globalSeenAt() {
    const value = readStorage(CHAT_UNREAD_STORAGE_KEY)?.globalSeenAt;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function setGlobalSeenAt(value) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return;

    const previous = globalSeenAt();
    if (timestamp <= previous) return;

    writeStorage(CHAT_UNREAD_STORAGE_KEY, {
      globalSeenAt: new Date(timestamp).toISOString()
    });
  }

  function updateUnreadBadge() {
    const count = Math.max(0, unreadGlobal) + Math.max(0, unreadPrivate);

    if (badgeEl) {
      badgeEl.textContent = count > 99 ? "99+" : String(count);
      badgeEl.classList.toggle("hidden", count === 0);
    }

    if (fabEl) {
      fabEl.setAttribute(
        "aria-label",
        count ? `Open chat — ${count} unread message${count === 1 ? "" : "s"}` : "Open chat"
      );
    }

    document.title = count ? `(${count > 99 ? "99+" : count}) ${documentTitle}` : documentTitle;
  }

  async function markPrivateMessagesRead() {
    if (markingPrivateRead || !currentUserId) return;

    markingPrivateRead = true;

    try {
      await markAllPrivateMessagesRead();
    } catch (error) {
      console.error("[CHAT] Could not mark private messages read:", error);
    } finally {
      markingPrivateRead = false;
    }
  }

  function clearUnreadMessages(messages = []) {
    unreadGlobal = 0;
    unreadPrivate = 0;

    const latest = latestGlobalMessageAt(messages);
    if (latest) setGlobalSeenAt(latest);

    updateUnreadBadge();
    markPrivateMessagesRead();
  }

  function countUnreadGlobalMessages(messages) {
    const seenAt = globalSeenAt();
    const latest = latestGlobalMessageAt(messages);

    // A fresh install starts at the latest visible message rather than
    // presenting old public chat history as a new notification.
    if (!seenAt) {
      if (latest) setGlobalSeenAt(latest);
      return 0;
    }

    return (messages ?? []).filter((message) => {
      const createdAt = new Date(message.created_at).getTime();
      return (
        message.source === "global" &&
        message.sender_id !== currentUserId &&
        Number.isFinite(createdAt) &&
        createdAt > seenAt
      );
    }).length;
  }

  function receiveGlobalMessage(message) {
    if (!message || message.source !== "global" || message.sender_id === currentUserId) {
      return;
    }

    if (isChatBeingRead()) {
      setGlobalSeenAt(message.created_at);
      return;
    }

    unreadGlobal += 1;
    updateUnreadBadge();
  }

  function receivePrivateMessage(message) {
    if (!message || message.sender_id === currentUserId) return;

    if (isChatBeingRead()) {
      unreadPrivate = 0;
      updateUnreadBadge();
      markPrivateMessagesRead();
      return;
    }

    unreadPrivate += 1;
    updateUnreadBadge();
  }

  function setChatOpen(open) {
    if (!dockEl || !fabEl) return;

    dockEl.classList.toggle("hidden", !open);
    dockEl.setAttribute("aria-hidden", open ? "false" : "true");
    fabEl.setAttribute("aria-expanded", open ? "true" : "false");
    fabEl.classList.toggle("is-open", open);

    if (open) {
      settingsPanelEl?.classList.add("hidden");
      settingsToggleEl?.setAttribute("aria-expanded", "false");
      clearUnreadMessages(renderedChatMessages());
      setTimeout(() => inputEl.focus(), 50);
    }
  }

  function toggleChatSettings() {
    if (!settingsPanelEl || !settingsToggleEl) return;

    const opening = settingsPanelEl.classList.contains("hidden");
    settingsPanelEl.classList.toggle("hidden", !opening);
    settingsToggleEl.setAttribute("aria-expanded", opening ? "true" : "false");
  }

  function resetChatSize() {
    layoutSettings = {
      ...layoutSettings,
      width: DEFAULT_CHAT_LAYOUT.width,
      height: DEFAULT_CHAT_LAYOUT.height
    };
    applyChatLayout();
    saveChatLayout();
  }

  function beginResize(event, axis) {
    if (!dockEl || window.matchMedia("(max-width: 720px)").matches) return;

    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = layoutSettings.width;
    const startHeight = layoutSettings.height;

    const onMove = (moveEvent) => {
      if (axis === "width") {
        const growsRight = layoutSettings.layout === "side-left";
        const delta = moveEvent.clientX - startX;
        const max = Math.max(300, Math.min(720, window.innerWidth - 24));
        layoutSettings.width = clamp(
          startWidth + (growsRight ? delta : -delta),
          300,
          max
        );
      } else if (layoutSettings.layout === "floating") {
        const max = Math.max(360, Math.min(760, window.innerHeight - 24));
        layoutSettings.height = clamp(startHeight - (moveEvent.clientY - startY), 360, max);
      }

      applyChatLayout();
    };

    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      saveChatLayout();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  }

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

  function systemMessageHtml(message) {
    if (!message.roller_username || !message.gem_name) {
      return escapeHtml(message.message);
    }

    const rarity = Number(message.rarity ?? 0);

    const mutationIds = Array.isArray(message.mutation_ids)
      ? message.mutation_ids
      : [];

    const mutationHtml = mutationIds.length
      ? `
        <div class="chat-message__mutations">
          ${mutationIds.map((id) => {
            const mutation = getGemMutation(id);
            if (!mutation) return "";
            return `
              <span class="mutation-name-effect mutation-name-effect--${escapeHtml(id)}">
                <span class="mutation-name-effect__fx" aria-hidden="true"></span>
                <span class="mutation-name-effect__text">${escapeHtml(mutation.name)}</span>
              </span>
            `;
          }).join("")}
        </div>
      `
      : "";

    return `<strong>${escapeHtml(
      message.roller_username
    )}</strong> rolled a rare ${gemNameHtml(
      message.gem_name,
      escapeHtml
    )} — 1 in ${escapeHtml(rarity.toLocaleString("en-US"))}!${mutationHtml}`;
  }

  function renderMessage(message, shouldScroll = true) {
    if (!message?.id) return false;

    const messageId = String(message.id);

    if (
      messagesEl.querySelector(
        `[data-message-id="${CSS.escape(messageId)}"]`
      )
    ) {
      return false;
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
      label = message.roller_username
        ? `<span class="chat-system-tag">[SYSTEM]</span> · ${escapeHtml(
            message.roller_username
          )}`
        : `<span class="chat-system-tag">[SYSTEM]</span>`;
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
          ${isSystem ? systemMessageHtml(message) : escapeHtml(message.message)}
        </div>
      </div>
    `;

    messagesEl.appendChild(item);

    if (shouldScroll) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    return true;
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

      // Load public chat and this user's private inbox before subscribing so
      // the badge is accurate as soon as the page opens.
      const [globalMessages, privateMessages, privateUnreadCount] = await Promise.all([
        loadChatMessages(),
        loadRecentPrivateMessages(50),
        loadUnreadPrivateMessageCount()
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

      unreadGlobal = countUnreadGlobalMessages(globalMessages);
      unreadPrivate = Number(privateUnreadCount) || 0;

      if (isChatBeingRead()) {
        clearUnreadMessages(merged);
      } else {
        updateUnreadBadge();
      }

      subscribeToChat((message) => {
        if (renderMessage(message)) {
          receiveGlobalMessage(message);
        }
      });

      subscribeToPrivateMessages((message) => {
        const privateMessage = {
          ...message,
          id: `private-${message.id}`,
          source: "private"
        };

        if (renderMessage(privateMessage)) {
          receivePrivateMessage(privateMessage);
        }
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

  applyChatLayout();

  fabEl?.addEventListener("click", () => {
    setChatOpen(!isChatOpen());
  });

  closeDockEl?.addEventListener("click", () => {
    setChatOpen(false);
  });

  settingsToggleEl?.addEventListener("click", toggleChatSettings);

  for (const option of layoutOptionEls) {
    option.addEventListener("click", () => {
      layoutSettings.layout = option.dataset.chatLayout ?? "floating";
      applyChatLayout();
      saveChatLayout();
    });
  }

  resetSizeEl?.addEventListener("click", resetChatSize);
  widthResizeEl?.addEventListener("pointerdown", (event) => beginResize(event, "width"));
  heightResizeEl?.addEventListener("pointerdown", (event) => beginResize(event, "height"));

  document.addEventListener("visibilitychange", () => {
    if (isChatBeingRead()) {
      clearUnreadMessages(renderedChatMessages());
    }
  });

  window.addEventListener("resize", () => {
    applyChatLayout();
  });

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
