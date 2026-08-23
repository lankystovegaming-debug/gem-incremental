import {
  loadChatMessages,
  sendChatMessage,
  subscribeToChat,
  unsubscribeFromChat
} from "./src/backend/chat.js";
import { ensurePlayerAuth } from "./src/backend/auth.js";
import { roleForId, roleBadgeHtml } from "./src/ui/roles.js";
import {
  findPlayerByUsername,
  loadUnreadPrivateMessageCount,
  loadRecentPrivateMessages,
  cleanupPrivateMessages,
  markAllPrivateMessagesRead, 
  sendPrivateMessage,
  subscribeToPrivateMessages,
  unsubscribeFromPrivateMessages
} from "./src/backend/privateMessages.js";
import { gemNameHtml } from "./src/ui/gemStyle.js";
import { getGemMutation } from "./src/data/mutations.js";
import {
  chanceDenominator,
  chanceLabelForResult,
  CHAT_CHANCE_THRESHOLD,
  EFFECTIVE_CHAT_CHANCE_THRESHOLD
} from "./src/logic/chances.js";

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
const chatTabEls = document.querySelectorAll("[data-chat-tab]");
const generalBadgeEl = document.querySelector("#chatGeneralBadge");
const rareBadgeEl = document.querySelector("#chatRareBadge");

const CHAT_LAYOUT_STORAGE_KEY = "gem.chat.layout.v1";
const CHAT_UNREAD_STORAGE_KEY = "gem.chat.unread.v1";
const CHAT_RARE_ROLL_STORAGE_KEY = "gem.chat.rare-rolls.v2";
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
  let unreadRare = 0;
  let activeTab = "general";
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

  function loadPersistedLocalRareRolls() {
    const rows = readStorage(CHAT_RARE_ROLL_STORAGE_KEY);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row && row.local_only && row.gem_name && row.created_at)
      .slice(-100);
  }

  function persistLocalRareRoll(message) {
    if (!message?.local_only || !message.gem_name || !message.created_at) return;
    const rows = loadPersistedLocalRareRolls();
    const key = `${message.roller_id ?? currentUserId ?? ""}|${message.gem_name}|${message.created_at}|${(message.mutation_ids ?? []).join("+")}`;
    const existing = rows.findIndex((row) =>
      `${row.roller_id ?? currentUserId ?? ""}|${row.gem_name}|${row.created_at}|${(row.mutation_ids ?? []).join("+")}` === key
    );
    if (existing >= 0) rows[existing] = message;
    else rows.push(message);
    writeStorage(CHAT_RARE_ROLL_STORAGE_KEY, rows.slice(-100));
  }

  function clearLocalRareRollsOlderThan(days = 30) {
    const cutoff = Date.now() - days * 86400000;
    const rows = loadPersistedLocalRareRolls().filter((row) => {
      const time = new Date(row.created_at).getTime();
      return Number.isFinite(time) && time >= cutoff;
    });
    writeStorage(CHAT_RARE_ROLL_STORAGE_KEY, rows);
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

  function isRareMessage(message) {
    return Boolean(
      message &&
      (message.source === "system" || message.source === "announcement") &&
      message.gem_name &&
      chatChanceIsRareEnough(message)
    );
  }

  function isMessageVisibleInTab(message) {
    if (activeTab === "rare") return isRareMessage(message);
    return !isRareMessage(message);
  }

  function scrollChatToBottom(instant = false) {
    if (!messagesEl) return;
    requestAnimationFrame(() => {
      messagesEl.scrollTo({
        top: messagesEl.scrollHeight,
        behavior: instant ? "auto" : "smooth"
      });
    });
  }

  function renderActiveTab() {
    let visibleCount = 0;
    for (const item of messagesEl.querySelectorAll(".chat-message")) {
      const source = item.dataset.messageSource || "global";
      const rare = item.dataset.rare === "true";
      const visible = activeTab === "rare" ? rare : !rare;
      item.classList.toggle("chat-message--tab-hidden", !visible);
      if (visible) visibleCount += 1;
    }

    let empty = messagesEl.querySelector("#chatEmpty");
    if (!visibleCount) {
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "chat-empty";
        empty.id = "chatEmpty";
        messagesEl.appendChild(empty);
      }
      empty.textContent = activeTab === "rare"
        ? "No rare rolls yet. Chase something extraordinary!"
        : "No general messages yet. Say hello!";
    } else {
      empty?.remove();
    }
    for (const tab of chatTabEls) {
      const selected = tab.dataset.chatTab === activeTab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", selected ? "true" : "false");
    }
    scrollChatToBottom(true);
  }

  function updateTabBadges() {
    if (generalBadgeEl) {
      const count = unreadGlobal + unreadPrivate;
      generalBadgeEl.textContent = count > 99 ? "99+" : String(count);
      generalBadgeEl.classList.toggle("hidden", count === 0);
    }
    if (rareBadgeEl) {
      rareBadgeEl.textContent = unreadRare > 99 ? "99+" : String(unreadRare);
      rareBadgeEl.classList.toggle("hidden", unreadRare === 0);
    }
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
    const count = Math.max(0, unreadGlobal) + Math.max(0, unreadPrivate) + Math.max(0, unreadRare);

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
    updateTabBadges();
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
    if (!message) return;

    if (isRareMessage(message)) {
      if (isChatBeingRead() && activeTab === "rare") {
        unreadRare = 0;
      } else if (message.sender_id !== currentUserId) {
        unreadRare += 1;
      }
      updateUnreadBadge();
      return;
    }

    if (message.source !== "global" || message.sender_id === currentUserId) return;

    if (isChatBeingRead() && activeTab === "general") {
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

    // Never hide a focused descendant from assistive technology.
    // This also fixes the Chrome aria-hidden warning when the close button
    // is focused as the dock is closed.
    if (!open && dockEl.contains(document.activeElement)) {
      document.activeElement?.blur?.();
    }

    dockEl.classList.toggle("hidden", !open);
    dockEl.setAttribute("aria-hidden", open ? "false" : "true");
    dockEl.inert = !open;
    fabEl.setAttribute("aria-expanded", open ? "true" : "false");
    fabEl.classList.toggle("is-open", open);

    if (open) {
      settingsPanelEl?.classList.add("hidden");
      settingsToggleEl?.setAttribute("aria-expanded", "false");
      clearUnreadMessages(renderedChatMessages());
      unreadRare = 0;
      updateUnreadBadge();
      renderActiveTab();
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

    if (n >= 1_000_000_000) return "chat-message--secret";
    if (n >= 100_000_000) return "chat-message--transcendent";
    if (n >= 10_000_000) return "chat-message--cosmic";
    if (n >= 1_000_000) return "chat-message--million";
    if (n >= 100_000) return "chat-message--hundredk";

    return "";
  }

  function titleBadgeHtml(title, color) {
    if (!title) return "";
    const safeColor = /^#[0-9a-f]{6}$/i.test(String(color ?? "")) ? String(color) : "#ffd166";
    return `<span class="player-title-badge" style="--player-title-color:${escapeHtml(safeColor)}">${escapeHtml(title)}</span>`;
  }

  function displayNameHtml(userId, username, title = "", titleColor = "#ffd166") {
    return `${roleBadgeHtml(roleForId(userId))}<span>${escapeHtml(username ?? "Unknown")}</span>${titleBadgeHtml(title, titleColor)}`;
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

  function chatMutationIds(message) {
    return Array.isArray(message.mutation_ids)
      ? message.mutation_ids
      : [];
  }

  function chatChanceIsRareEnough(message) {
    const baseRarity = Number(message?.rarity ?? 0);
    const mutationIds = chatMutationIds(message);
    // Normal/unmutated rolls announce at 1 in 100,000. Once a mutation is
    // present, the combined effective rarity must reach 1 in 1,000,000.
    if (mutationIds.length === 0) {
      return Number.isFinite(baseRarity) && baseRarity >= CHAT_CHANCE_THRESHOLD;
    }
    const storedEffective = Number(message?.effective_rarity);
    if (Number.isFinite(storedEffective) && storedEffective > 0) {
      return storedEffective >= EFFECTIVE_CHAT_CHANCE_THRESHOLD;
    }
    const calculated = chanceDenominator(
      { name: message?.gem_name, rarity: baseRarity },
      mutationIds
    );
    return Number.isFinite(calculated) && calculated >= EFFECTIVE_CHAT_CHANCE_THRESHOLD;
  }

  function exactChatChanceLabel(message) {
    const storedEffective = Number(message?.effective_rarity);
    if (Number.isFinite(storedEffective) && storedEffective > 0) {
      return `1 in ${Math.round(storedEffective).toLocaleString("en-US")}`;
    }
    const mutationDetails = Array.isArray(message?.mutation_details) ? message.mutation_details : [];
    if (mutationDetails.length) {
      const denominator = mutationDetails.reduce((product, mutation) => product * Math.max(1, Number(mutation.chance) || 1), Math.max(1, Number(message?.rarity) || 1));
      return `1 in ${Math.round(denominator).toLocaleString("en-US")}`;
    }
    return chanceLabelForResult(
      { name: message.gem_name, rarity: Number(message?.rarity ?? 0) },
      chatMutationIds(message)
    );
  }

  function systemMessageHtml(message) {
    if (!message.roller_username || !message.gem_name) {
      return escapeHtml(message.message);
    }

    const rarity = Number(message.rarity ?? 0);

    const mutationIds = chatMutationIds(message);
    const showFinalChance = chatChanceIsRareEnough(message);

    const mutationNames = showFinalChance
      ? (Array.isArray(message?.mutation_details) && message.mutation_details.length
          ? message.mutation_details
          : mutationIds.map((id) => getGemMutation(id)).filter(Boolean))
      : [];

    const mutationPrefix = mutationNames.length
      ? `${mutationNames.map((mutation, index) => `
          ${index > 0 ? '<span class="mutation-name-separator" aria-hidden="true">·</span>' : ""}
          <span class="mutation-name-effect mutation-name-effect--${escapeHtml(mutation.id)}">
            <span class="mutation-name-effect__fx" aria-hidden="true"></span>
            <span class="mutation-name-effect__text">${escapeHtml(mutation.name)}</span>
          </span>
        `).join(" ")} `
      : "";

    // At/above 1 in 100,000, show the actual combined chance:
    // gem chance × every mutation chance. Otherwise this announcement is
    // not meant to be surfaced by the client.
    const chance = showFinalChance
      ? exactChatChanceLabel(message)
      : `1 in ${Math.max(1, rarity).toLocaleString("en-US")}`;
    const luck = Number(message.luckAtRoll);
    const luckSuffix = Number.isFinite(luck) && luck > 0
      ? ` with luck of ${luck.toLocaleString("en-US", { maximumFractionDigits: 2 })}x!`
      : "!";

    const announcementRarity = Number(message.effective_rarity ?? message.rarity ?? 0);
    const announcementCopy = announcementRarity >= 1_000_000_000
      ? "uncovered a secret"
      : announcementRarity >= 100_000_000
        ? "made a transcendent discovery"
        : announcementRarity >= 10_000_000
          ? "found a cosmic gem"
          : "rolled a rare";

    return `<strong>${escapeHtml(
      message.roller_username
    )}</strong> ${announcementCopy} ${mutationPrefix}${gemNameHtml(
      message.gem_name,
      escapeHtml
    )} ${escapeHtml(chance)}${escapeHtml(luckSuffix)}`;
  }

  function localRollAnnouncement(data) {
    if (!data?.gem?.name) return null;
    if (data?.gem?.dropType === "relic") return null;

    const mutationIds = Array.isArray(data.mutationIds)
      ? data.mutationIds
      : Array.isArray(data.mutations)
        ? data.mutations.map((mutation) => mutation?.id).filter(Boolean)
        : [];

    const effectiveRarity = Number(data?.effectiveRarity) || chanceDenominator(data.gem, mutationIds);
    if (!Number.isFinite(effectiveRarity) || effectiveRarity < EFFECTIVE_CHAT_CHANCE_THRESHOLD) {
      return null;
    }

    // Base gems at/above 1 in 100,000 already have a persisted server
    // announcement. Do not create a second local copy for those rolls.
    // Local announcements are only for mutation combinations that become
    // rare enough while the base gem itself is still below the threshold.
    if (Number(data.gem.rarity ?? 0) >= 100_000) {
      return null;
    }

    const now = new Date().toISOString();

    return {
      id: `local-roll-${data.specimenId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
      source: "system",
      sender_id: null,
      username: "[SYSTEM]",
      avatar_url: null,
      roller_id: currentUserId,
      roller_username: "You",
      gem_name: data.gem.name,
      rarity: Number(data.gem.rarity ?? 0),
      effective_rarity: effectiveRarity,
      luckAtRoll: Number(data.luckAtRoll ?? data.luck_at_roll ?? data.luck ?? 0) || null,
      mutation_ids: mutationIds,
      created_at: now,
      local_only: true
    };
  }

  function receiveLocalRoll(data) {
    const announcement = localRollAnnouncement(data);
    if (!announcement) return;

    // Keep a durable browser-side copy as a last-resort recovery path. The
    // server announcement is authoritative, but this prevents a successful
    // rare mutation roll from vanishing from the player's chat after a reload
    // when an older/deployed Edge Function missed the persistence insert.
    persistLocalRareRoll(announcement);
    renderMessage(announcement, true);
  }

  function renderMessage(message, shouldScroll = true) {
    if (!message?.id) return false;

    const messageId = String(message.id);

    const existingItem = messagesEl.querySelector(
      `[data-message-id="${CSS.escape(messageId)}"]`
    );

    if (existingItem) {
      if (message.source === "system" || message.source === "announcement") {
        const textEl = existingItem.querySelector(".chat-message__text");
        if (textEl) {
          textEl.innerHTML = systemMessageHtml(message);
        }
        existingItem.classList.toggle(
          "chat-message--million",
          Number(message.rarity ?? 0) >= 1000000
        );
        existingItem.classList.toggle(
          "chat-message--hundredk",
          Number(message.rarity ?? 0) >= 100000 && Number(message.rarity ?? 0) < 1000000
        );
      }
      return false;
    }

    messagesEl.querySelector("#chatEmpty")?.remove();

    const isPrivate = message.source === "private";
    const isSystem =
      message.source === "system" || message.source === "announcement";
    const rareMessage = isRareMessage(message);

    if (
      rareMessage &&
      isSystem &&
      message.local_only &&
      (!message.roller_id || message.roller_id === currentUserId)
    ) {
      persistLocalRareRoll(message);
    }

    // Rare rolls are stored and rendered only in the Rare Rolls tab. They
    // never enter General chat.
    if (isSystem && message.gem_name && !rareMessage) return false;

    const mine = isPrivate && message.sender_id === currentUserId;

    // A roll can arrive locally first (so mutation-only rare rolls appear
    // immediately), followed by the persisted server announcement. Reuse the
    // local entry instead of displaying the same roll twice.
    if (isSystem && message.gem_name) {
      const mutationIds = chatMutationIds(message);
      const mutationKey = mutationIds.join("+");
      const now = new Date(message.created_at).getTime();
      const duplicate = [...messagesEl.querySelectorAll(".chat-message--system")]
        .find((candidate) => {
          if (candidate.dataset.gemName !== String(message.gem_name)) return false;
          const existingTime = new Date(
            candidate.querySelector("time")?.dateTime ?? 0
          ).getTime();
          return Number.isFinite(now) && Number.isFinite(existingTime)
            ? Math.abs(now - existingTime) <= 10_000
            : false;
        });

      if (duplicate) {
        const existingMutationKey = duplicate.dataset.mutationKey ?? "";
        const existingHasMutation = Boolean(existingMutationKey);
        const incomingHasMutation = Boolean(mutationKey);

        // A server INSERT can arrive before its later UPDATE containing
        // mutation_ids. If a local mutated announcement is already visible,
        // never replace it with the temporary unmutated server version.
        if (existingHasMutation && !incomingHasMutation) {
          return false;
        }

        duplicate.dataset.messageId = messageId;
        duplicate.dataset.gemName = String(message.gem_name);
        duplicate.dataset.mutationKey = mutationKey;
        const textEl = duplicate.querySelector(".chat-message__text");
        if (textEl) textEl.innerHTML = systemMessageHtml(message);
        return false;
      }
    }

    const item = document.createElement("div");

    item.className = [
      "chat-message",
      isPrivate ? "chat-message--private" : "",
      mine ? "chat-message--mine" : "",
      isSystem ? "chat-message--system" : "",
      rarityClass(message.effective_rarity ?? message.rarity),
      (!((activeTab === "rare") === rareMessage)) ? "chat-message--tab-hidden" : ""
    ]
      .filter(Boolean)
      .join(" ");

    item.dataset.messageId = messageId;
    item.dataset.messageSource = String(message.source ?? "global");
    item.dataset.rare = rareMessage ? "true" : "false";
    if (isSystem && message.gem_name) {
      item.dataset.gemName = String(message.gem_name);
      item.dataset.mutationKey = chatMutationIds(message).join("+");
    }

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
        ? `<span class="chat-system-tag">[SYSTEM]</span> · ${displayNameHtml(
            message.roller_id, message.roller_username, message.roller_title, message.roller_title_color
          )}`
        : `<span class="chat-system-tag">[SYSTEM]</span>`;
    } else {
      label = displayNameHtml(message.sender_id, message.username ?? "Unknown");
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

    if (shouldScroll && isMessageVisibleInTab(message)) {
      scrollChatToBottom();
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
      await cleanupPrivateMessages(30).catch((error) => {
        console.warn("[DM] Auto-clear skipped:", error);
      });

      const [globalMessages, privateMessages, privateUnreadCount] = await Promise.all([
        loadChatMessages(),
        loadRecentPrivateMessages(50),
        loadUnreadPrivateMessageCount()
      ]);

      clearLocalRareRollsOlderThan();

      // If the server has not yet recovered a mutation-only announcement,
      // restore the player's own qualifying local roll instead of losing it
      // simply because the page was refreshed.
      const persistedRareRolls = loadPersistedLocalRareRolls().filter(
        (row) => !row.roller_id || row.roller_id === currentUserId
      );

      messagesEl.innerHTML = "";

      const merged = [...globalMessages, ...persistedRareRolls, ...privateMessages]
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

        renderActiveTab();
        scrollChatToBottom(true);
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

  window.addEventListener("gem:roll-complete", (event) => {
    receiveLocalRoll(event.detail);
  });

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

  for (const tab of chatTabEls) {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.chatTab === "rare" ? "rare" : "general";
      if (activeTab === "rare") {
        unreadRare = 0;
      } else {
        unreadGlobal = 0;
        unreadPrivate = 0;
      }
      updateUnreadBadge();
      renderActiveTab();
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
