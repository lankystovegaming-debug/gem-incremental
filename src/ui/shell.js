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
import { loadCloudPlayerState } from "../backend/cloudInventory.js";
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
import { mountTour } from "./tour.js";
import { mountDailyLogin } from "./dailyLogin.js";
import { initGlobalCash } from "./globalCash.js";
import { startActivityHeartbeat } from "./activityHeartbeat.js";
import { getSettings, onSettingsChange } from "./settings.js";


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
  { id: "auctions", label: "Market", short: "Market", href: "auctions/", icon: icons.gavel },
  { id: "gem-index", label: "Gem Index", short: "Index", href: "gem-index/", icon: icons.book },
  { id: "leaderboards", label: "Leaderboards", short: "Ranks", href: "leaderboards/", icon: icons.trophy },
  { id: "admin", label: "Admin", short: "Admin", href: "admin/", icon: icons.shield, adminOnly: true },
  { id: "achievements", label: "Achievements", short: "Achieve", href: "achievements/", icon: icons.trophy, sectionId: "achievements" },
  { id: "quests", label: "Quests", short: "Quests", href: "quests/", icon: icons.quest, sectionId: "quests" },
  { id: "guilds", label: "Guilds", short: "Guilds", href: "guilds/", icon: icons.users, sectionId: "guilds" },
  { id: "islands", label: "Islands", short: "Islands", href: "islands/", icon: icons.island, sectionId: "islands" },
  { id: "workbench", label: "Workbench [BETA]", short: "Workbench", href: "workbench/", icon: icons.anvil, sectionId: "workbench" },
  { id: "dungeons", label: "Dungeons", short: "Dungeons", href: "dungeons/", icon: icons.castle, sectionId: "dungeons" },
  { id: "daily-spin", label: "Daily Spin", short: "Spin", href: "daily-spin/", icon: icons.wheel, sectionId: "daily-spin" },
  { id: "wars", label: "Player Wars", short: "Wars", href: "wars/", icon: icons.swords, sectionId: "wars" },
  { id: "pvp", label: "PvP", short: "PvP", href: "pvp/", icon: icons.swords, sectionId: "pvp" },
  { id: "world-bosses", label: "World Bosses", short: "Bosses", href: "world-bosses/", icon: icons.skull, sectionId: "world-bosses" },
  { id: "relic-vault", label: "Relic Vault", short: "Relics", href: "relic-vault/", icon: icons.vault, sectionId: "relic-vault" },
  { id: "seasons", label: "Seasons", short: "Season", href: "seasons/", icon: icons.calendar, sectionId: "seasons" },
  { id: "bounties", label: "Bounty Board", short: "Bounties", href: "bounties/", icon: icons.quest, sectionId: "bounties" },
  { id: "treasure-expeditions", label: "Treasure Expeditions", short: "Expeditions", href: "treasure-expeditions/", icon: icons.map, sectionId: "treasure-expeditions" },
  { id: "artifact-archives", label: "Artifact Archives", short: "Artifacts", href: "artifact-archives/", icon: icons.archive, sectionId: "artifact-archives" },
  { id: "gem-fusion", label: "Gem Fusion Lab", short: "Fusion", href: "gem-fusion/", icon: icons.flask, sectionId: "gem-fusion" },
  { id: "enchanting-lab", label: "Enchanting Lab", short: "Enchant", href: "enchanting-lab/", icon: icons.wand, sectionId: "enchanting-lab" },
  { id: "collection-hall", label: "Collection Hall", short: "Collections", href: "collection-hall/", icon: icons.book, sectionId: "collection-hall" },
  { id: "mining-events", label: "Mining Events", short: "Events", href: "mining-events/", icon: icons.pickaxe, sectionId: "mining-events" },
  { id: "merchant-caravan", label: "Merchant Caravan", short: "Caravan", href: "merchant-caravan/", icon: icons.caravan, sectionId: "merchant-caravan" },
  { id: "research-tree", label: "Research Tree", short: "Research", href: "research-tree/", icon: icons.branch, sectionId: "research-tree" },
  // Client-only page: shown only when the "Global cash graph" device
  // setting is on. Not server-gated, so it lives outside PUBLIC_PAGES
  // and the section loader.
  { id: "global-cash-graph", label: "Cash Market", short: "Market", href: "global-cash-graph/", icon: icons.chart, settingGated: "cashGraph" }
];

const PUBLIC_PAGES = PAGES.filter((item) => !item.adminOnly && !item.privateOnly && !item.sectionId && !item.settingGated);
const CORE_PAGE_IDS = new Set(["roll", "inventory", "crafting", "boosts", "auctions"]);
const CORE_PAGES = PUBLIC_PAGES.filter((item) => CORE_PAGE_IDS.has(item.id));
const EXPLORE_PAGES = PUBLIC_PAGES.filter((item) => !CORE_PAGE_IDS.has(item.id));

async function loadEnabledSections() {
  try {
    const { data } = await supabase.functions.invoke("features", { body: { action: "sections" } });
    const sections = data?.sections ?? [];
    // The features endpoint already filters admin-only sections for normal
    // players. Keep the explicit flag here too so the shell never exposes a
    // private section if a stale/older endpoint returns it.
    const isAdmin = data?.isAdmin === true;
    return new Map(
      sections
        .filter((section) => section.admin_only !== true || isAdmin)
        .map((section) => [section.id, section])
    );
  } catch {
    return new Map();
  }
}


const MODE_ICONS = {
  system: icons.monitor,
  light: icons.sun,
  dark: icons.moon,
  neon: icons.bolt,
  gradient: icons.sparkle,
  ocean: icons.cloud,
  forest: icons.sparkle,
  sunset: icons.sun,
  ice: icons.sparkle,
  aurora: icons.sparkle,
  graphite: icons.sparkle,
  midnight: icons.moon,
  mist: icons.cloud
};


export function mountShell({ page, base = "./" }) {
  // Start presence reporting once for the entire application. It is silent
  // when the account is not authenticated and never blocks page rendering.
  startActivityHeartbeat();

  const header = document.createElement("header");

  header.className = "topbar";

  header.innerHTML = `
    <div class="topbar__inner">
      <a class="brand" href="${base}" aria-label="Gem Incremental home">
        <span class="brand__mark">${icons.gem}</span>
        <span>Gem Incremental</span>
      </a>

      <nav class="nav" aria-label="Primary">
        ${CORE_PAGES.map((item) => navLink(item, page, base, "nav__link")).join("")}
      </nav>

      <div class="topbar-explore" id="shellExploreAnchor">
        <button
          class="nav__link topbar-explore__button"
          id="shellExploreButton"
          type="button"
          aria-haspopup="true"
          aria-expanded="false"
          aria-controls="shellExploreMenu"
          ${EXPLORE_PAGES.some((item) => item.id === page) ? 'aria-current="page"' : ""}
        >
          ${icons.compass || icons.sparkle}
          <span>Explore</span>
          ${icons.chevronDown || ""}
        </button>
        <div class="menu topbar-explore__menu" id="shellExploreMenu" hidden>
          <div class="menu__label">Explore</div>
          ${EXPLORE_PAGES.map((item) => menuNavLink(item, page, base)).join("")}
        </div>
      </div>

      <div class="topbar__spacer"></div>

      <div class="topbar__tools">
        <span class="wallet wallet--loading" id="shellWallet" title="Money">
          ${icons.coins}
          <span id="shellWalletValue">—</span>
        </span>

        <div class="topbar-more" id="shellMoreAnchor">
          <button
            class="btn btn--ghost topbar-more__button"
            id="shellMoreButton"
            type="button"
            aria-haspopup="true"
            aria-expanded="false"
            aria-controls="shellMoreMenu"
          >
            ${icons.sparkle}
            <span>More</span>
            ${icons.chevronDown || ""}
          </button>
          <div class="menu topbar-more__menu" id="shellMoreMenu" hidden>
            <div class="menu__label">Quick links</div>
            <button class="menu__item" type="button" data-more-action="howto">
              ${icons.book}<span>How to play</span>
            </button>
            <a class="menu__item" href="${base}codes/">${icons.sparkle}<span>Codes</span></a>
            <a class="menu__item" href="${base}updates/">${icons.sparkle}<span>Update log</span></a>
            <a class="menu__item" href="${base}bugs/">${icons.bug}<span>Report a bug</span></a>
            <a class="menu__item" href="${base}support/">${icons.heart}<span>Support the game</span></a>
            <a class="menu__item" href="${CONTRIBUTE_URL}" target="_blank" rel="noopener noreferrer">${icons.github}<span>Contribute</span></a>
            <a class="menu__item" href="${base}legal/">${icons.shield}<span>Privacy &amp; Terms</span></a>
          </div>
        </div>

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

  tabbar.innerHTML = CORE_PAGES.map((item) =>
    navLink(item, page, base, "tabbar__link", true)
  ).join("");

  document.body.appendChild(tabbar);

  // Client-setting-gated pages (e.g. the Cash Market graph) are shown or
  // hidden purely from the device settings, with no server round-trip, and
  // update live when the toggle changes on this or another tab.
  const syncSettingGatedNav = () => {
    const settings = getSettings();
    for (const item of PAGES.filter((page) => page.settingGated)) {
      const enabled = Boolean(settings[item.settingGated]);
      // The Explore menu is portaled to <body> (see below), so it is no longer
      // inside <header>. Query it globally — scoping to `header` here would make
      // the "already present?" check always miss and append a duplicate on every
      // settings change.
      const existingLink = document.querySelector(`#shellExploreMenu [data-setting-link="${item.id}"]`);
      if (enabled) {
        if (!existingLink) {
          document.getElementById("shellExploreMenu")?.insertAdjacentHTML("beforeend", menuNavLink(item, page, base));
          const link = document.querySelector("#shellExploreMenu .menu__item:last-child");
          if (link) link.dataset.settingLink = item.id;
          if (item.id === page) header.querySelector("#shellExploreButton")?.setAttribute("aria-current", "page");
        }
      } else {
        existingLink?.remove();
      }
    }
  };
  syncSettingGatedNav();
  onSettingsChange(syncSettingGatedNav);

  // Site feature switches are controlled from Upcoming. Feature pages and
  // their top-bar links remain hidden until an authorized user enables them.
  loadEnabledSections().then((sectionMap) => {
    const add = (item) => {
      const section = sectionMap.get(item.sectionId);
      if (!section?.enabled) return;
      const configured = {
        ...item,
        label: section.label || item.label,
        short: section.short_label || section.label || item.short,
        // Section configuration controls availability and wording, but uses the
        // purpose-built navigation icon. This prevents a generic configured gem
        // symbol from making every Explore destination look identical.
        icon: item.icon
      };
      if (document.querySelector(`[data-section-link="${item.id}"]`)) return;
      document.getElementById("shellExploreMenu")?.insertAdjacentHTML("beforeend", menuNavLink(configured, page, base));
      const link = document.querySelector("#shellExploreMenu .menu__item:last-child");
      if (link) link.dataset.sectionLink = item.id;
      if (item.id === page) header.querySelector("#shellExploreButton")?.setAttribute("aria-current", "page");
    };
    PAGES.filter(x => x.sectionId).forEach(add);
    const mainSections = {"roll-stage":"section-roll-stage","summary":"section-summary","automation":"section-automation","session-history":"section-session-history"};
    for (const [settingId, elementId] of Object.entries(mainSections)) {
      if (sectionMap.has(settingId) && sectionMap.get(settingId)?.enabled === false) {
        document.getElementById(elementId)?.setAttribute("hidden", "");
      }
    }
  });


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
  // Utility links are now mounted in the top bar under More.

  // First-run guided tour: spotlights the roll button, wallet and nav for new
  // players (shows once), and reopenable from More -> How to play.
  mountTour({ base, page });

  // Daily login streak: prompts once a day when a reward is claimable.
  mountDailyLogin();

  // Optional global-cash side counter (off by default; toggled in Settings).
  initGlobalCash();


  const walletPill = header.querySelector("#shellWallet");
  const walletValue = header.querySelector("#shellWalletValue");
  const avatar = header.querySelector("#shellAvatar");
  const accountName = header.querySelector("#shellAccountName");

  const themeAnchor = header.querySelector("#shellThemeAnchor");
  const themeButton = header.querySelector("#shellThemeButton");
  const accountAnchor = header.querySelector("#shellAccountAnchor");
  const accountButton = header.querySelector("#shellAccountButton");

  // Compact wallets stay icon-only on narrow layouts. A click expands the
  // value without changing the header width permanently.
  walletPill?.setAttribute("role", "button");
  walletPill?.setAttribute("tabindex", "0");
  const toggleWallet = () => walletPill?.classList.toggle("wallet--expanded");
  walletPill?.addEventListener("click", toggleWallet);
  walletPill?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleWallet();
    }
  });

  const menus = createMenuController();

  const exploreAnchor = header.querySelector("#shellExploreAnchor");
  const exploreButton = header.querySelector("#shellExploreButton");
  const exploreMenu = document.getElementById("shellExploreMenu");

  const closeExplore = () => {
    if (!exploreMenu) return;
    exploreMenu.hidden = true;
    exploreButton?.setAttribute("aria-expanded", "false");
  };

  const toggleExplore = () => {
    if (!exploreMenu || !exploreButton) return;
    const open = exploreMenu.hidden;
    exploreMenu.hidden = !open;
    exploreButton.setAttribute("aria-expanded", String(open));
    if (open) {
      closeMore();
      const rect = exploreButton.getBoundingClientRect();
      const width = Math.max(270, exploreMenu.offsetWidth || 270);
      exploreMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
      exploreMenu.style.top = `${rect.bottom + 8}px`;
    }
  };

  // The utility links belong in the top bar so they remain discoverable on
  // desktop and mobile instead of living in a floating corner dock.
  const moreAnchor = header.querySelector("#shellMoreAnchor");
  const moreButton = header.querySelector("#shellMoreButton");
  const moreMenu = header.querySelector("#shellMoreMenu");

  // Portal the dropdowns out of the topbar. The topbar uses backdrop-filter,
  // which traps position:fixed descendants inside its (low) stacking context,
  // so page cards and overlays could paint over the menus. As direct children
  // of <body> their z-index competes at the document root and they sit on top.
  if (exploreMenu) document.body.appendChild(exploreMenu);
  if (moreMenu) document.body.appendChild(moreMenu);

  const closeMore = () => {
    if (!moreMenu) return;
    moreMenu.hidden = true;
    moreButton?.setAttribute("aria-expanded", "false");
  };

  const toggleMore = () => {
    if (!moreMenu) return;
    const open = moreMenu.hidden;
    moreMenu.hidden = !open;
    moreButton?.setAttribute("aria-expanded", String(open));
    if (open) closeExplore();
  };

  exploreButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleExplore();
  });

  exploreMenu?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeExplore();
  });

  moreButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMore();
  });

  moreMenu?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMore();
  });

  document.addEventListener("click", (event) => {
    // The menus are portaled to <body>, so a click inside a menu is outside its
    // anchor — check the menu too, or clicking inside would close it.
    if (exploreAnchor && !exploreAnchor.contains(event.target) && !exploreMenu?.contains(event.target)) closeExplore();
    if (moreAnchor && !moreAnchor.contains(event.target) && !moreMenu?.contains(event.target)) closeMore();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeExplore();
      closeMore();
    }
  });

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

        document.getElementById("shellExploreMenu")?.insertAdjacentHTML(
          "beforeend",
          menuNavLink(adminPage, page, base)
        );
        if (page === "admin") header.querySelector("#shellExploreButton")?.setAttribute("aria-current", "page");
      });

      // Upcoming Features is intentionally not a separate navigation item.
      // Authorized administrators open the Feature Lab directly from the
      // Admin Panel, keeping the main navigation compact and consistent.
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


  function applyWallet(amount) {
    if (amount == null) {
      walletPill.classList.add("wallet--loading");
      walletValue.textContent = "—";
      return;
    }

    walletPill.classList.remove("wallet--loading");
    walletValue.textContent = formatMoney(amount, { compact: true });
    walletPill.title = `Money: ${formatMoney(amount)}`;
  }


  // Populate the wallet from the shell itself so EVERY page shows the
  // player's money — including pages that never call setWallet (guilds,
  // seasons, and any future page). Pages that also set it just override
  // with the same value.
  ensurePlayerAuth()
    .then((user) => (user ? loadCloudPlayerState() : null))
    .then((state) => {
      if (state && state.money != null) {
        applyWallet(state.money);
      }
      // A banned player is stopped at the door on every page. The server
      // (roll and other actions) rejects them too; this is the visible half.
      if (state && state.ban_until && new Date(state.ban_until) > new Date()) {
        showBanScreen(state.ban_until, state.ban_reason);
      }
    })
    .catch(() => {
      /* Non-fatal: the wallet stays in its loading state. */
    });


  return {
    setWallet: applyWallet,

    get user() {
      return currentUser;
    }
  };
}


// =========================================================
// BAN / SUSPENSION SCREEN
// =========================================================
// A full-screen block shown on every page while the player is banned. The
// server rejects banned players independently, so bypassing this overlay in
// devtools only leaves an unplayable game behind it.
function showBanScreen(banUntil, reason) {
  if (document.getElementById("banScreen")) return;

  const until = new Date(banUntil);
  const permanent = until.getTime() - Date.now() > 50 * 365 * 24 * 3600 * 1000;

  if (!document.getElementById("banScreenStyles")) {
    const style = document.createElement("style");
    style.id = "banScreenStyles";
    style.textContent = `
      .ban-screen{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;
        font-family:"Exo 2",system-ui,-apple-system,"Segoe UI",sans-serif;
        background:radial-gradient(120% 120% at 50% -10%, color-mix(in srgb, var(--danger,#ef4444) 16%, transparent), transparent 60%),
          color-mix(in srgb, var(--bg,#0b0e14) 86%, #000);
        backdrop-filter:blur(14px) saturate(120%);-webkit-backdrop-filter:blur(14px) saturate(120%)}
      .ban-screen__card{position:relative;max-width:460px;width:100%;text-align:center;overflow:hidden;
        background:linear-gradient(180deg, color-mix(in srgb,var(--danger,#ef4444) 6%, var(--surface-raised,#161b22)), var(--surface-raised,#161b22));
        border:1px solid var(--border,#2a2f3a);border-radius:var(--radius-lg,20px);
        box-shadow:var(--shadow-lg,0 30px 80px -24px rgba(0,0,0,.8)), 0 0 0 1px color-mix(in srgb,var(--danger,#ef4444) 18%, transparent);
        padding:38px 34px 26px;animation:banIn .42s cubic-bezier(.2,.8,.2,1)}
      .ban-screen__card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;
        background:linear-gradient(90deg,transparent,var(--danger,#ef4444),transparent);opacity:.95}
      .ban-screen__badge{width:64px;height:64px;margin:2px auto 18px;border-radius:50%;display:grid;place-items:center;
        color:var(--danger,#ef4444);background:color-mix(in srgb,var(--danger,#ef4444) 15%,transparent);
        box-shadow:0 0 0 7px color-mix(in srgb,var(--danger,#ef4444) 7%,transparent)}
      .ban-screen__badge svg{width:32px;height:32px}
      .ban-screen__eyebrow{display:inline-block;font-size:.66rem;font-weight:700;letter-spacing:.22em;
        text-transform:uppercase;color:var(--danger,#ef4444);margin-bottom:11px}
      .ban-screen__title{margin:0 0 12px;font-size:1.75rem;line-height:1.08;font-weight:800;
        letter-spacing:-.015em;color:var(--text,#f4f6fb)}
      .ban-screen__reason{margin:0 auto 22px;max-width:36ch;color:var(--text-muted,#9aa4b2);font-size:1.02rem;line-height:1.55}
      .ban-screen__label{display:block;font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;
        color:var(--text-faint,#6b7280);margin-bottom:11px}
      .ban-screen__timer{display:flex;justify-content:center;gap:9px}
      .ban-screen__seg{min-width:60px;padding:11px 8px;border-radius:14px;
        background:color-mix(in srgb,var(--danger,#ef4444) 9%, var(--surface,#0f1319));
        border:1px solid color-mix(in srgb,var(--danger,#ef4444) 22%,transparent)}
      .ban-screen__seg b{display:block;font-size:1.6rem;font-weight:800;line-height:1;color:var(--text,#f4f6fb);font-variant-numeric:tabular-nums}
      .ban-screen__seg span{display:block;margin-top:7px;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted,#9aa4b2)}
      .ban-screen__perm{font-size:1.02rem;font-weight:700;color:var(--danger,#ef4444);
        background:color-mix(in srgb,var(--danger,#ef4444) 10%,transparent);
        border:1px solid color-mix(in srgb,var(--danger,#ef4444) 26%,transparent);border-radius:12px;padding:13px 16px}
      .ban-screen__foot{margin:20px 0 0;font-size:.82rem;color:var(--text-muted,#9aa4b2)}
      @keyframes banIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
      @media (prefers-reduced-motion:reduce){.ban-screen__card{animation:none}}
    `;
    document.head.appendChild(style);
  }

  const pad = (n) => String(n).padStart(2, "0");
  const overlay = document.createElement("div");
  overlay.id = "banScreen";
  overlay.className = "ban-screen";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", permanent ? "You have been banned" : "You have been suspended");
  overlay.innerHTML = `
    <div class="ban-screen__card">
      <div class="ban-screen__badge">${icons.shield ?? "&#9940;"}</div>
      <span class="ban-screen__eyebrow">Account restricted</span>
      <h1 class="ban-screen__title">${permanent ? "You&rsquo;ve been banned" : "You&rsquo;ve been suspended"}</h1>
      <p class="ban-screen__reason"></p>
      ${permanent
        ? `<div class="ban-screen__perm">This restriction is permanent.</div>`
        : `<span class="ban-screen__label">Access returns in</span>
           <div class="ban-screen__timer">
             <div class="ban-screen__seg" data-seg-d hidden><b data-d>0</b><span>days</span></div>
             <div class="ban-screen__seg"><b data-h>00</b><span>hrs</span></div>
             <div class="ban-screen__seg"><b data-m>00</b><span>min</span></div>
             <div class="ban-screen__seg"><b data-s>00</b><span>sec</span></div>
           </div>`}
      <p class="ban-screen__foot">Think this is a mistake? Reach out through Support.</p>
    </div>`;

  // Reason is set as text, never markup, so it can't inject anything.
  overlay.querySelector(".ban-screen__reason").textContent =
    reason || "No reason was provided.";

  document.body.appendChild(overlay);
  document.documentElement.style.overflow = "hidden";

  if (!permanent) {
    const segD = overlay.querySelector("[data-seg-d]");
    const elD = overlay.querySelector("[data-d]");
    const elH = overlay.querySelector("[data-h]");
    const elM = overlay.querySelector("[data-m]");
    const elS = overlay.querySelector("[data-s]");
    const tick = () => {
      const ms = until.getTime() - Date.now();
      if (ms <= 0) { window.location.reload(); return; }
      let s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      if (d > 0) { segD.hidden = false; elD.textContent = String(d); }
      elH.textContent = pad(h);
      elM.textContent = pad(m);
      elS.textContent = pad(s);
    };
    tick();
    setInterval(tick, 1000);
  }
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
      const errorCode = params.get("error_code") ?? params.get("error");
      const decodedError = decodeURIComponent(error).replace(/\+/g, " ");
      const expiredEmailLink =
        errorCode === "otp_expired" ||
        /email link is invalid|expired|otp_expired/i.test(decodedError);

      notify.error(
        "Sign-in failed",
        expiredEmailLink
          ? "This email link has expired or was already opened. Request a new link from the Account page and use only the newest email."
          : decodedError
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
    <div class="more-menu-anchor">
      <button
        class="contribute-dock__more"
        id="moreMenuButton"
        type="button"
        aria-haspopup="true"
        aria-expanded="false"
        aria-controls="moreMenu"
      >
        ${icons.sparkle}
        <span>More</span>
      </button>

      <div class="more-menu" id="moreMenu" hidden>
        <div class="more-menu__head">
          <span class="more-menu__eyebrow">QUICK LINKS</span>
          <strong>More</strong>
        </div>

        <a class="contribute-dock__link" href="${base}bugs/" title="Report a bug">
          ${icons.bug}<span>Report a bug</span>
        </a>

        <a class="contribute-dock__link" href="${base}codes/" title="Redeem a code">
          ${icons.sparkle}<span>Codes</span>
        </a>

        <a class="contribute-dock__link" href="${base}updates/" title="View the update log">
          ${icons.sparkle}<span>Update log</span>
        </a>

        <a class="contribute-dock__link" href="${base}support/" title="Support Gem Incremental">
          ${icons.heart}<span>Support the game</span>
        </a>

        <a
          class="contribute-dock__link"
          href="${CONTRIBUTE_URL}"
          target="_blank"
          rel="noopener noreferrer"
          title="Contribute on GitHub"
        >
          ${icons.github}<span>Contribute</span>
        </a>

      </div>
    </div>
  `;

  document.body.appendChild(dock);

  const button = dock.querySelector("#moreMenuButton");
  const menu = dock.querySelector("#moreMenu");

  const close = () => {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = menu.hidden;
    menu.hidden = !next;
    button.setAttribute("aria-expanded", String(next));
  });

  document.addEventListener("click", (event) => {
    if (!dock.contains(event.target)) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
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
  const safeLabel = escapeHtml(label);
  const safeAria = escapeHtml(item.label);

  // The label is hidden on narrow screens, so the link carries
  // its own accessible name.
  return `
    <a
      class="${className}"
      href="${base}${item.href}"
      aria-label="${safeAria}"
      title="${safeAria}"
      ${active ? 'aria-current="page"' : ""}
    >
      ${item.icon}
      <span>${safeLabel}</span>
    </a>
  `;
}

function menuNavLink(item, activePage, base) {
  const active = item.id === activePage || (item.match?.includes(activePage) ?? false);
  const safeLabel = escapeHtml(item.label);
  return `
    <a
      class="menu__item topbar-explore__item"
      href="${base}${item.href}"
      aria-label="${safeLabel}"
      title="${safeLabel}"
      ${active ? 'aria-current="page"' : ""}
    >
      ${item.icon}
      <span>${safeLabel}</span>
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
