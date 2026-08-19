import { icons } from "./icons.js";
import { formatMoney, escapeHtml } from "./format.js";
import { notify, toast } from "./toast.js";
import { confirmDialog } from "./dialog.js";
import {
  MODES,
  ACCENTS,
  getMode,
  getAccent,
  setMode,
  setAccent
} from "./theme.js";

import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";
import { adminRequest } from "../backend/cloudAdmin.js";
import { loadActiveAdminEvent } from "../backend/cloudAdminEvents.js";
import {
  describeAccount,
  isGuest,
  isGoogleEnabled,
  signInWithGoogle,
  signOutAccount,
  onAccountChange,
  loadUsername
} from "../backend/account.js";
import { initDevPanel } from "./devpanel.js";


// =========================================================
// APPLICATION SHELL
//
// Every page calls mountShell() to get the same header,
// mobile tab bar, wallet, theme picker and account menu.
// =========================================================


// `short` is used on the mobile tab bar, where six full
// labels would not fit across a 375px screen.
// `short` is used on the mobile tab bar, where full labels would not
// fit across a narrow screen.
const PAGES = [
  { id: "roll", label: "Roll", short: "Roll", href: "", icon: icons.dice },
  { id: "inventory", label: "Inventory", short: "Items", href: "inventory/", icon: icons.bag },
  { id: "crafting", label: "Crafting", short: "Craft", href: "crafting/", icon: icons.anvil },
  { id: "boosts", label: "Shop", short: "Shop", href: "boosts/", icon: icons.potion },
  { id: "auctions", label: "Auction House", short: "Auction", href: "auctions/", icon: icons.gavel },
  { id: "gem-index", label: "Gem Index", short: "Index", href: "gem-index/", icon: icons.book },
  { id: "leaderboards", label: "Leaderboards", short: "Ranks", href: "leaderboards/", icon: icons.trophy },
  { id: "admin", label: "Admin", short: "Admin", href: "admin/", icon: icons.shield, adminOnly: true }
];

const PUBLIC_PAGES = PAGES.filter((item) => !item.adminOnly);


const MODE_ICONS = {
  system: icons.monitor,
  light: icons.sun,
  dark: icons.moon,
  neon: icons.bolt,
  gradient: icons.sparkle,
  ocean: icons.cloud,
  forest: icons.sparkle,
  sunset: icons.sun,
  ice: icons.sparkle
};


export function mountShell({ page, base = "./" }) {
  const header = document.createElement("header");

  header.className = "topbar";

  header.innerHTML = `
    <div class="topbar__inner">
      <a class="brand" href="${base}" aria-label="Gem Incremental home">
        <span class="brand__mark">${icons.gem}</span>
        <span>Gem Incremental</span>
      </a>

      <nav class="nav" aria-label="Primary">
        ${PUBLIC_PAGES.map((item) => navLink(item, page, base, "nav__link")).join("")}
      </nav>

      <div class="topbar__spacer"></div>

      <div class="topbar__tools">
        <span class="wallet wallet--loading" id="shellWallet" title="Money">
          ${icons.coins}
          <span id="shellWalletValue">—</span>
        </span>

        <a
          class="btn btn--ghost btn--icon"
          href="${base}settings/"
          title="Settings"
          aria-label="Settings"
          ${page === "settings" ? 'aria-current="page"' : ""}
        >
          ${icons.settings}
        </a>

        <div class="menu-anchor" id="shellThemeAnchor">
          <button
            class="btn btn--ghost btn--icon"
            id="shellThemeButton"
            type="button"
            aria-haspopup="true"
            aria-expanded="false"
            aria-label="Appearance settings"
            title="Appearance"
          >
            ${icons.palette}
          </button>
        </div>

        <div class="menu-anchor" id="shellAccountAnchor">
          <button
            class="account-btn"
            id="shellAccountButton"
            type="button"
            aria-haspopup="true"
            aria-expanded="false"
          >
            <span class="avatar" id="shellAvatar">?</span>
            <span class="account-btn__name" id="shellAccountName">Guest</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.prepend(header);


  const tabbar = document.createElement("nav");

  tabbar.className = "tabbar";
  tabbar.setAttribute("aria-label", "Primary");

  tabbar.innerHTML = PUBLIC_PAGES.map((item) =>
    navLink(item, page, base, "tabbar__link", true)
  ).join("");

  document.body.appendChild(tabbar);


  // Shared chat lives in the application shell so it is present on every
  // game page, not just the Roll page.
  mountGlobalChat();

  // Automation is page-independent. The Roll page owns its rich roll-stage
  // renderer; every other page gets the same server-authoritative auto-roll
  // loop through this shell service.
  if (page !== "roll") {
    import("../../src/ui/globalAutomation.js").catch((error) => {
      console.error("[AUTOMATION] Failed to load global automation:", error);
    });
  }


  // Announcement banner (admins post these; everyone sees them).
  renderAnnouncements(header);
  renderActiveAdminEvent(header);


  // Bottom-left dock: contribute on GitHub / report a bug.
  mountContributeDock(base);


  const walletPill = header.querySelector("#shellWallet");
  const walletValue = header.querySelector("#shellWalletValue");
  const avatar = header.querySelector("#shellAvatar");
  const accountName = header.querySelector("#shellAccountName");

  const themeAnchor = header.querySelector("#shellThemeAnchor");
  const themeButton = header.querySelector("#shellThemeButton");
  const accountAnchor = header.querySelector("#shellAccountAnchor");
  const accountButton = header.querySelector("#shellAccountButton");


  const menus = createMenuController();

  themeButton.addEventListener("click", () => {
    menus.toggle(themeAnchor, themeButton, renderThemeMenu);
  });

  accountButton.addEventListener("click", () => {
    menus.toggle(accountAnchor, accountButton, renderAccountMenu);
  });


  // -------------------------------------------------------
  // ACCOUNT DISPLAY
  // -------------------------------------------------------

  let currentUser = null;
  let currentUsername = null;
  let googleEnabled = false;

  function paintAccount(user) {
    currentUser = user;

    const account = describeAccount(user, currentUsername);

    accountName.textContent = account.name;

    accountButton.setAttribute("aria-label", `Account: ${account.name}`);

    if (account.avatarUrl) {
      avatar.innerHTML = `<img src="${escapeHtml(
        account.avatarUrl
      )}" alt="" referrerpolicy="no-referrer">`;
    } else {
      avatar.textContent = account.initials;
    }
  }

  paintAccount(null);

  supabase.auth.getSession().then(async ({ data }) => {
    const user = data.session?.user ?? null;

    paintAccount(user);

    if (user) {
      // Ask the server whether this account is an admin, so the link
      // appears without any admin id baked into the client bundle.
      adminRequest("whoami").then(({ data }) => {
        if (!data?.isAdmin) {
          return;
        }

        const adminPage = PAGES.find((item) => item.id === "admin");

        if (!adminPage) {
          return;
        }

        header.querySelector(".nav")?.insertAdjacentHTML(
          "beforeend",
          navLink(adminPage, page, base, "nav__link")
        );

        tabbar.insertAdjacentHTML(
          "beforeend",
          navLink(adminPage, page, base, "tabbar__link", true)
        );
      });
    }

    if (user) {
      currentUsername = await loadUsername(user.id);

      paintAccount(user);
    }
  });

  isGoogleEnabled().then((enabled) => {
    googleEnabled = enabled;
  });


  function renderAccountMenu() {
    const account = describeAccount(currentUser, currentUsername);

    const menu = document.createElement("div");

    menu.className = "menu";
    menu.setAttribute("role", "menu");

    menu.innerHTML = `
      <div class="menu__identity">
        <span class="avatar">${
          account.avatarUrl
            ? `<img src="${escapeHtml(
                account.avatarUrl
              )}" alt="" referrerpolicy="no-referrer">`
            : escapeHtml(account.initials)
        }</span>

        <div class="menu__identity-text">
          <div class="menu__identity-name">${escapeHtml(account.name)}</div>
          <div class="menu__identity-sub">${escapeHtml(account.detail)}</div>
        </div>
      </div>

      ${
        account.guest
          ? `
            <div class="menu__note">
              Create an account to keep your gems if you clear this
              browser or switch device.
            </div>

            <a class="btn btn--primary btn--block" href="${base}account/">
              ${icons.user}
              Create an account
            </a>

            ${
              googleEnabled
                ? `<button class="btn btn--google btn--block" data-action="google" type="button" style="margin-top:8px">
                     ${icons.google}
                     Continue with Google
                   </button>`
                : ""
            }
          `
          : `
            <a class="menu__item" href="${base}account/" role="menuitem">
              ${icons.user}
              Manage account
            </a>

            <button class="menu__item" data-action="signout" type="button" role="menuitem">
              ${icons.logout}
              Sign out
            </button>
          `
      }
    `;

    menu.querySelector('[data-action="google"]')?.addEventListener(
      "click",
      async (event) => {
        const button = event.currentTarget;

        button.disabled = true;
        button.innerHTML = `<span class="btn__spinner"></span> Redirecting...`;

        await startGoogleSignIn(base);

        button.disabled = false;
      }
    );

    menu.querySelector('[data-action="signout"]')?.addEventListener(
      "click",
      async () => {
        menus.close();

        const choice = await confirmDialog({
          title: "Sign out?",
          body: `
            <p>
              Your save stays on your account. Signing back in
              restores it on any device.
            </p>
          `,
          confirmLabel: "Sign out",
          tone: "danger"
        });

        if (choice !== "confirm") {
          return;
        }

        const result = await signOutAccount();

        if (!result.ok) {
          notify.error("Could not sign out", result.message);

          return;
        }

        window.location.reload();
      }
    );

    return menu;
  }


  function renderThemeMenu() {
    const menu = document.createElement("div");

    menu.className = "menu";
    menu.setAttribute("role", "menu");

    const mode = getMode();
    const accent = getAccent();

    menu.innerHTML = `
      <div class="menu__label">Appearance</div>

      ${MODES.map(
        (entry) => `
          <button
            class="menu__item"
            role="menuitemradio"
            type="button"
            aria-checked="${entry.id === mode}"
            data-mode="${entry.id}"
          >
            ${MODE_ICONS[entry.id] ?? icons.palette}
            ${entry.label}
            ${entry.id === mode ? icons.check : ""}
          </button>
        `
      ).join("")}

      <div class="menu__sep"></div>

      <div class="menu__label">Accent</div>

      <div class="swatches" role="radiogroup" aria-label="Accent colour">
        ${ACCENTS.map(
          (entry) => `
            <button
              class="swatch"
              type="button"
              role="radio"
              aria-checked="${entry.id === accent}"
              aria-label="${entry.label}"
              title="${entry.label}"
              data-accent="${entry.id}"
              style="background-color:${entry.swatch}"
            ></button>
          `
        ).join("")}
      </div>
    `;

    for (const button of menu.querySelectorAll("[data-mode]")) {
      button.addEventListener("click", () => {
        setMode(button.dataset.mode);

        menus.refresh(renderThemeMenu);
      });
    }

    for (const button of menu.querySelectorAll("[data-accent]")) {
      button.addEventListener("click", () => {
        setAccent(button.dataset.accent);

        menus.refresh(renderThemeMenu);
      });
    }

    return menu;
  }


  // -------------------------------------------------------
  // SESSION EVENTS
  // -------------------------------------------------------

  onAccountChange((event, user) => {
    paintAccount(user);

    if (event === "SIGNED_IN" && user && !isGuest(user)) {
      const account = describeAccount(user, currentUsername);

      toast("Signed in", { text: `Welcome back, ${account.name}.`, type: "success", duration: 1800 });
    }
  });

  reportOAuthErrorFromUrl();

  initDevPanel();


  return {
    setWallet(amount) {
      if (amount == null) {
        walletPill.classList.add("wallet--loading");

        walletValue.textContent = "—";

        return;
      }

      walletPill.classList.remove("wallet--loading");

      walletValue.textContent = formatMoney(amount, { compact: true });

      walletPill.title = `Money: ${formatMoney(amount)}`;
    },

    get user() {
      return currentUser;
    }
  };
}


// =========================================================
// GOOGLE SIGN-IN FLOW
// =========================================================

async function startGoogleSignIn(base) {
  const result = await signInWithGoogle();

  if (result.started) {
    return;
  }

  // Linking is unavailable and this guest has a save. Signing in
  // normally would swap the session and leave that save with no
  // way back, so it is not offered — the email route on the
  // Account page keeps the same player id.
  if (result.blocked === "would_lose_progress") {
    await confirmDialog({
      title: "Google cannot be linked right now",
      body: `
        <p>${escapeHtml(result.message)}</p>
        <p style="margin-top:12px">
          Signing in with Google from here would start a different
          account and leave this guest save unreachable, so it has
          been stopped.
        </p>
        <p style="margin-top:12px">
          Use <strong>Create an account</strong> on the Account page
          instead — it attaches an email to this save and keeps every
          gem you already have.
        </p>
      `,
      confirmLabel: "Open Account page",
      cancelLabel: "Not now"
    }).then((choice) => {
      if (choice === "confirm") {
        window.location.href = `${base}account/`;
      }
    });

    return;
  }

  notify.error("Could not sign in", result.message);
}


// Supabase reports OAuth failures on the URL rather than
// through the client, so surface them instead of failing silently.
function reportOAuthErrorFromUrl() {
  const sources = [
    new URLSearchParams(window.location.search),
    new URLSearchParams(window.location.hash.replace(/^#/, ""))
  ];

  for (const params of sources) {
    const error = params.get("error_description") ?? params.get("error");

    if (error) {
      notify.error(
        "Sign-in failed",
        decodeURIComponent(error).replace(/\+/g, " ")
      );

      history.replaceState(null, "", window.location.pathname);

      return;
    }
  }
}


// =========================================================
// ANNOUNCEMENTS
//
// Admins post short messages (post_announcement RPC); the active
// ones are a public read. Each is dismissible per-device, and a
// dismissed id is remembered so it does not return until an admin
// posts a new one.
// =========================================================

const DISMISSED_KEY = "gemIncremental.dismissedAnnouncements";

// The game's public issue tracker (upstream repo).
const CONTRIBUTE_URL =
  "https://github.com/lankystovegaming-debug/gem-incremental/issues";


// Fixed bottom-left links so players can contribute or flag a bug
// from any page without cluttering the header.
function mountContributeDock(base) {
  if (document.querySelector(".contribute-dock")) {
    return;
  }

  const dock = document.createElement("div");

  dock.className = "contribute-dock";

  dock.innerHTML = `
    <a
      class="contribute-dock__link"
      href="${CONTRIBUTE_URL}"
      target="_blank"
      rel="noopener noreferrer"
      title="Contribute on GitHub"
    >
      ${icons.github}
      <span>Contribute</span>
    </a>

    <a
      class="contribute-dock__link"
      href="${base}bugs/"
      title="Report a bug"
    >
      ${icons.bug}
      <span>Report a bug</span>
    </a>

    <a
      class="contribute-dock__link"
      href="${base}codes/"
      title="Redeem a code"
    >
      ${icons.sparkle}
      <span>Codes</span>
    </a>

    <a
      class="contribute-dock__link"
      href="${base}updates/"
      title="View the update log"
    >
      ${icons.sparkle}
      <span>Update log</span>
    </a>

    <a
      class="contribute-dock__link"
      href="${base}support/"
      title="Support Gem Incremental"
    >
      ${icons.heart}
      <span>Support the game</span>
    </a>
  `;

  document.body.appendChild(dock);
}


function mountGlobalChat() {
  if (document.getElementById("chatDock")) return;

  if (!document.querySelector('link[data-global-chat-style]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL("../../src/styles/chat.css", import.meta.url).href;
    stylesheet.dataset.globalChatStyle = "true";
    document.head.appendChild(stylesheet);
  }

  const chat = document.createElement("div");
  chat.innerHTML = `
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

        <div class="chat-tabs" role="tablist" aria-label="Chat channels">
          <button class="chat-tab is-active" id="chatTabGeneral" type="button" role="tab" aria-selected="true" data-chat-tab="general">General <span class="chat-tab__badge hidden" id="chatGeneralBadge"></span></button>
          <button class="chat-tab" id="chatTabRare" type="button" role="tab" aria-selected="false" data-chat-tab="rare">Rare Rolls <span class="chat-tab__badge hidden" id="chatRareBadge"></span></button>
        </div>

        <div class="chat-messages" id="chatMessages" role="log" aria-live="polite" aria-label="Chat messages">
          <div class="chat-empty" id="chatEmpty">Loading chat…</div>
        </div>

        <form class="chat-form" id="chatForm">
          <input class="field chat-input" id="chatInput" type="text" maxlength="500" autocomplete="off"
                 placeholder="Message globally, or /msg username message…" aria-label="Chat message">
          <button class="btn btn--primary chat-send" id="chatSend" type="submit">Send</button>
        </form>
        <div class="chat-hint" id="chatHint" aria-live="polite">General chat is public. Use /msg username message for a private message.</div>
      </section>
    </div>
  `;

  while (chat.firstElementChild) {
    document.body.appendChild(chat.firstElementChild);
  }

  if (!window.__gemChatUiLoaded) {
    window.__gemChatUiLoaded = true;
    import("../../chat-ui.js").catch((error) => {
      window.__gemChatUiLoaded = false;
      console.error("[CHAT] Failed to load chat UI:", error);
    });
  }
}

async function renderAnnouncements(header) {
  // mountShell() runs before each page's own startup routine. Wait for the
  // shared auth bootstrap so this request is covered by the RLS policy.
  const user = await ensurePlayerAuth();

  if (!user) {
    return;
  }

  let dismissed = [];

  try {
    dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
  } catch {
    dismissed = [];
  }

  const { data, error } = await supabase
    .from("announcements")
    .select("id, body, tone, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error || !Array.isArray(data)) {
    return;
  }

  const visible = data.filter((entry) => !dismissed.includes(entry.id));

  if (visible.length === 0) {
    return;
  }

  const bar = document.createElement("div");

  bar.className = "announce-bar";

  bar.innerHTML = visible
    .map(
      (entry) => `
        <div class="announce announce--${
          ["info", "warning", "positive"].includes(entry.tone)
            ? entry.tone
            : "info"
        }" data-id="${entry.id}">
          <span class="announce__icon">${icons.megaphone}</span>
          <span class="announce__body">${escapeHtml(entry.body)}</span>
          <button class="announce__close" type="button" aria-label="Dismiss">×</button>
        </div>
      `
    )
    .join("");

  header.after(bar);

  for (const item of bar.querySelectorAll(".announce")) {
    item.querySelector(".announce__close").addEventListener("click", () => {
      const id = Number(item.dataset.id);

      try {
        const set = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");

        if (!set.includes(id)) {
          set.push(id);
        }

        // Keep the list bounded.
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(set.slice(-100)));
      } catch {
        /* localStorage unavailable — the dismissal is not remembered. */
      }

      item.remove();

      if (!bar.querySelector(".announce")) {
        bar.remove();
      }
    });
  }
}

async function renderActiveAdminEvent(header) {
  const user = await ensurePlayerAuth();
  if (!user) return;

  const { data, error } = await loadActiveAdminEvent();
  const event = Array.isArray(data) ? data[0] : data;
  if (error || !event) return;

  const boosts = [
    Number(event.luck_bonus) > 0 ? `+${eventPercent(event.luck_bonus)} Luck` : null,
    Number(event.roll_speed_bonus) > 0 ? `+${eventPercent(event.roll_speed_bonus)} Roll speed` : null,
    Number(event.weight_luck_bonus) > 0 ? `+${eventPercent(event.weight_luck_bonus)} Weight luck` : null,
    Number(event.weight_multiplier_bonus) > 0 ? `+${eventPercent(event.weight_multiplier_bonus)} Weight multiplier` : null,
    Number(event.luck_multiplier) !== 1 ? `${eventMultiplier(event.luck_multiplier)} Luck` : null,
    Number(event.roll_speed_multiplier) !== 1 ? `${eventMultiplier(event.roll_speed_multiplier)} Roll speed` : null,
    Number(event.weight_luck_multiplier) !== 1 ? `${eventMultiplier(event.weight_luck_multiplier)} Weight luck` : null,
    Number(event.weight_multiplier_multiplier) !== 1 ? `${eventMultiplier(event.weight_multiplier_multiplier)} Weight multiplier` : null
  ].filter(Boolean);

  const banner = document.createElement("div");
  banner.className = "admin-event-banner";
  banner.innerHTML = `
    <span class="admin-event-banner__icon">${icons.sparkle}</span>
    <span class="admin-event-banner__content">
      <strong>${escapeHtml(event.name)}</strong>
      <span>${escapeHtml(boosts.join(" · "))}</span>
    </span>
    <strong class="admin-event-banner__timer" aria-label="Time remaining"></strong>
  `;

  const existingAnnouncements = document.querySelector(".announce-bar");
  if (existingAnnouncements) existingAnnouncements.after(banner);
  else header.after(banner);

  const timer = banner.querySelector(".admin-event-banner__timer");
  const endsAt = new Date(event.ends_at).getTime();

  const update = () => {
    const remaining = endsAt - Date.now();
    if (remaining <= 0) {
      banner.remove();
      clearInterval(interval);
      return;
    }
    timer.textContent = eventTime(remaining);
  };

  const interval = setInterval(update, 1000);
  update();
}

function eventPercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function eventMultiplier(value) {
  return `×${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function eventTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}


// =========================================================
// HELPERS
// =========================================================

function navLink(item, activePage, base, className, short = false) {
  const active =
    item.id === activePage || (item.match?.includes(activePage) ?? false);

  const label = short ? item.short : item.label;

  // The label is hidden on narrow screens, so the link carries
  // its own accessible name.
  return `
    <a
      class="${className}"
      href="${base}${item.href}"
      aria-label="${item.label}"
      title="${item.label}"
      ${active ? 'aria-current="page"' : ""}
    >
      ${item.icon}
      <span>${label}</span>
    </a>
  `;
}


function positionMenu(anchor, button, menu) {
  const rect = button.getBoundingClientRect();
  const width = Math.max(230, menu.offsetWidth || 230);
  const margin = 8;
  const left = Math.min(Math.max(margin, rect.right - width), Math.max(margin, window.innerWidth - width - margin));
  const top = Math.min(rect.bottom + margin, Math.max(margin, window.innerHeight - menu.offsetHeight - margin));
  menu.style.position = "fixed";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.right = "auto";
}

function createMenuController() {
  let openMenu = null;
  let openAnchor = null;
  let openButton = null;

  function close() {
    if (!openMenu) {
      return;
    }

    openMenu.remove();

    openButton?.setAttribute("aria-expanded", "false");

    openMenu = null;
    openAnchor = null;
    openButton = null;
  }

  function open(anchor, button, render) {
    close();

    openMenu = render();
    openAnchor = anchor;
    openButton = button;

    document.body.appendChild(openMenu);
    positionMenu(anchor, button, openMenu);

    button.setAttribute("aria-expanded", "true");
  }

  document.addEventListener("click", (event) => {
    if (!openMenu) {
      return;
    }

    if (!openAnchor.contains(event.target) && !openMenu.contains(event.target)) {
      close();
    }
  });

  window.addEventListener("resize", () => {
    if (openMenu && openButton && openAnchor) positionMenu(openAnchor, openButton, openMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openMenu) {
      close();

      openButton?.focus();
    }
  });

  return {
    close,

    toggle(anchor, button, render) {
      if (openAnchor === anchor) {
        close();

        return;
      }

      open(anchor, button, render);
    },

    // Re-render in place after a setting changes.
    refresh(render) {
      if (!openAnchor) {
        return;
      }

      const anchor = openAnchor;
      const button = openButton;

      openMenu.remove();
      openMenu = render();

      document.body.appendChild(openMenu);
      positionMenu(anchor, button, openMenu);

      openAnchor = anchor;
      openButton = button;
    }
  };
}
