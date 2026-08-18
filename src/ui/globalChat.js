// Shared global/private chat mounted by the application shell so every page
// has the same chat dock. The chat controller itself remains in chat-ui.js.

let mounted = false;

const CHAT_MARKUP = `
  <button class="chat-fab" id="chatFab" type="button" aria-label="Open chat"
          aria-expanded="false" title="Chat">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.7A8.38 8.38 0 0 1 4.1 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z" />
    </svg>
    <span class="chat-fab__badge hidden" id="chatFabBadge" aria-live="polite" aria-atomic="true"></span>
  </button>

  <div class="chat-dock hidden" id="chatDock" data-layout="floating" aria-hidden="true">
    <div class="chat-dock__resize-width" id="chatDockResizeWidth" aria-hidden="true"></div>
    <div class="chat-dock__resize-height" id="chatDockResizeHeight" aria-hidden="true"></div>

    <div class="chat-dock__settings hidden" id="chatDockSettingsPanel" aria-label="Chat settings">
      <p class="chat-dock__settings-title">Chat layout</p>
      <div class="chat-dock__layout-options" role="group" aria-label="Chat layout">
        <button class="chat-dock__layout-option" data-chat-layout="floating" type="button">Floating</button>
        <button class="chat-dock__layout-option" data-chat-layout="side-right" type="button">Right panel</button>
        <button class="chat-dock__layout-option" data-chat-layout="side-left" type="button">Left panel</button>
      </div>
      <button class="chat-dock__reset-size" id="chatDockResetSize" type="button">Reset size</button>
      <p class="chat-dock__settings-hint">Drag the chat edges to resize. Your setup is saved.</p>
    </div>

    <section class="card chat-card" aria-labelledby="chatHeading">
      <div class="chat-card__head">
        <h2 class="chat-card__title" id="chatHeading">Chat</h2>
        <span class="chat-card__status" id="chatStatus">Connecting…</span>
        <div class="chat-card__actions">
          <button class="chat-dock__settings-toggle" id="chatDockSettings" type="button" aria-label="Chat settings" aria-expanded="false" title="Chat settings">⚙</button>
          <button class="chat-dock__close" id="chatDockClose" type="button" aria-label="Close chat">×</button>
        </div>
      </div>

      <div class="chat-messages" id="chatMessages" role="log" aria-live="polite"
           aria-label="Global and private chat messages">
        <div class="chat-empty" id="chatEmpty">Loading chat…</div>
      </div>

      <form class="chat-form" id="chatForm">
        <input class="field chat-input" id="chatInput" type="text" maxlength="500"
               autocomplete="off" placeholder="Message globally, or /msg username message…"
               aria-label="Chat message">
        <button class="btn btn--primary chat-send" id="chatSend" type="submit">Send</button>
      </form>

      <div class="chat-hint" id="chatHint" aria-live="polite">
        Global chat is public. Use /msg username message for a private message.
      </div>
    </section>
  </div>
`;

export function mountGlobalChat() {
  if (mounted || document.getElementById("chatDock")) {
    mounted = true;
    return;
  }

  const stylesheetHref = new URL("../styles/chat.css", import.meta.url).href;
  if (!document.querySelector(`link[data-global-chat-style="true"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheetHref;
    link.dataset.globalChatStyle = "true";
    document.head.appendChild(link);
  }

  document.body.insertAdjacentHTML("beforeend", CHAT_MARKUP);
  mounted = true;

  // chat-ui.js expects the DOM above to exist at module evaluation time.
  void import("../../chat-ui.js").catch((error) => {
    console.error("[CHAT] Could not load chat controller:", error);
  });
}
