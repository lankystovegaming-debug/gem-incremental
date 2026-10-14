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
import {
  ensurePlayerAuth,
  isSignInRequired,
  SIGN_IN_REQUIRED_MESSAGE
} from "../backend/auth.js";
import { loadCloudPlayerState } from "../backend/cloudInventory.js";
import { adminRequest } from "../backend/cloudAdmin.js";
import {
  acknowledgeBanAppealDecision,
  loadMyBanAppeal,
  submitBanAppeal
} from "../backend/cloudBanAppeals.js";
import { loadActiveAdminEvent } from "../backend/cloudAdminEvents.js";
import { loadActiveGlobalEvent } from "../backend/cloudGlobalEvents.js";
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
import { initPlayerCli, togglePlayerCli } from "./cli/playerCli.js";
import { mountTour } from "./tour.js";
import { mountDailyLogin } from "./dailyLogin.js";
import { mountReferralPromo } from "./referralPromo.js";
import { initGlobalCash } from "./globalCash.js";
import { startActivityHeartbeat } from "./activityHeartbeat.js";
import { getSettings, onSettingsChange } from "./settings.js";
import { initGlobalCutscenes } from "./globalCutscenes.js";
import { mountMonthTwoAnniversary } from "./monthTwoAnniversary.js";
import { mountMaintenanceMode } from "./maintenanceMode.js";
import { mountMobileSheet } from "./mobileSheet.js";


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
  { id: "expeditions", label: "Expeditions", short: "Exped.", href: "expeditions/", icon: icons.map },
  { id: "gem-index", label: "Gem Index", short: "Index", href: "gem-index/", icon: icons.book },
  { id: "mutation-index", label: "Mutation Index", short: "Mutations", href: "mutation-index/", icon: icons.sparkle },
  { id: "month-two", label: "Month Two", short: "Month 2", href: "recap/month-2/", icon: icons.sparkle },
  { id: "month-one", label: "Month One", short: "Month 1", href: "recap/month-1/", icon: icons.trophy },
  { id: "limited-events", label: "Limited Events", short: "Events", href: "limited-events/", icon: icons.calendar },
  { id: "leaderboards", label: "Leaderboards", short: "Ranks", href: "leaderboards/", icon: icons.trophy },
  { id: "roll-counts", label: "Roll Counts", short: "Rolls", href: "roll-counts/", icon: icons.dice },
  { id: "admin", label: "Admin", short: "Admin", href: "admin/", icon: icons.shield, adminOnly: true },
  { id: "achievements", label: "Achievements", short: "Achieve", href: "achievements/", icon: icons.trophy, sectionId: "achievements" },
  { id: "quests", label: "Quests", short: "Quests", href: "quests/", icon: icons.quest, sectionId: "quests" },
  { id: "guilds", label: "Guilds", short: "Guilds", href: "guilds/", icon: icons.users, sectionId: "guilds" },
  { id: "islands", label: "Islands", short: "Islands", href: "islands/", icon: icons.island, sectionId: "islands" },
  { id: "workbench", label: "Workbench [BETA]", short: "Workbench", href: "workbench/", icon: icons.anvil, sectionId: "workbench" },
  { id: "dungeons", label: "Dungeons", short: "Dungeons", href: "dungeons/", icon: icons.castle, sectionId: "dungeons" },
  { id: "minigames", label: "Minigames", short: "Games", href: "minigames/", icon: icons.dice },
  { id: "gemdle", label: "Gemdle", short: "Gemdle", href: "gemdle/", icon: icons.dice },
  { id: "wars", label: "Player Wars", short: "Wars", href: "wars/", icon: icons.swords, sectionId: "wars" },
  { id: "pvp", label: "PvP", short: "PvP", href: "pvp/", icon: icons.swords, sectionId: "pvp" },
  { id: "world-bosses", label: "World Bosses", short: "Bosses", href: "world-bosses/", icon: icons.skull, sectionId: "world-bosses" },
  { id: "relic-vault", label: "Relic Vault", short: "Relics", href: "relic-vault/", icon: icons.vault, sectionId: "relic-vault" },
  { id: "bank", label: "Bank", short: "Bank", href: "bank/", icon: icons.coins, sectionId: "bank" },
  { id: "lottery", label: "Daily Lottery", short: "Lottery", href: "lottery/", icon: icons.dice, sectionId: "lottery" },
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
  // setting is on.
  { id: "global-cash-graph", label: "Cash Market", short: "Market", href: "global-cash-graph/", icon: icons.chart, settingGated: "cashGraph" },
  { id: "store", label: "Store", short: "Store", href: "store/", icon: icons.sparkle }
];

const CORE_PAGE_IDS = new Set(["roll", "inventory", "crafting", "boosts", "auctions", "expeditions", "minigames"]);
const DEFAULT_TOP_BAR_IDS = [...CORE_PAGE_IDS];
const DESKTOP_PRIMARY_LIMIT = 7;
const MOBILE_PRIMARY_LIMIT = 4;
let enabledSectionMap = new Map();
let shellIsAdmin = false;

function configuredNavigationPage(item) {
  const section = item.sectionId ? enabledSectionMap.get(item.sectionId) : null;
  if (!section) return item;
  return {
    ...item,
    label: section.label || item.label,
    short: section.short_label || section.label || item.short
  };
}

function isNavigationPageAvailable(item, settings) {
  if (item.adminOnly) return shellIsAdmin;
  if (item.privateOnly) return false;
  if (item.sectionId) return enabledSectionMap.get(item.sectionId)?.enabled === true;
  if (item.settingGated) return Boolean(settings[item.settingGated]);
  return true;
}

function getConfiguredNavigationPages(){
  const settings=getSettings();
  const configured=Array.isArray(settings.topBarMain) && settings.topBarMain.length ? settings.topBarMain : DEFAULT_TOP_BAR_IDS;
  const wanted=new Set(configured);
  if(shellIsAdmin && configured.length===DEFAULT_TOP_BAR_IDS.length && DEFAULT_TOP_BAR_IDS.every((id,i)=>configured[i]===id)) wanted.add("admin");
  return PAGES
    .filter(item=>item.id!=="limited-events" && !item.settingGated && wanted.has(item.id) && isNavigationPageAvailable(item,settings))
    .map(configuredNavigationPage);
}
function getNavigationPages(){
  return getConfiguredNavigationPages().slice(0, DESKTOP_PRIMARY_LIMIT);
}
function getMobileNavigationPages(){
  return getConfiguredNavigationPages().slice(0, MOBILE_PRIMARY_LIMIT);
}
function getExplorePages(){
  const settings=getSettings();
  const main=new Set(getNavigationPages().map(x=>x.id));
  return PAGES
    .filter(item=>isNavigationPageAvailable(item,settings))
    .filter(item=>!main.has(item.id) || item.id==="limited-events")
    .map(configuredNavigationPage);
}
function getMobileMorePages(){
  const settings=getSettings();
  const main=new Set(getMobileNavigationPages().map(x=>x.id));
  return PAGES
    .filter(item=>isNavigationPageAvailable(item,settings))
    .filter(item=>!main.has(item.id))
    .map(configuredNavigationPage);
}

// Explore stays useful as the game grows by grouping related destinations
// instead of presenting one long, flat list. Feature-switched pages use the
// same groups when they are enabled later in mountShell().
const EXPLORE_GROUPS = [
  {
    id: "play",
    label: "Play",
    icon: icons.dice,
    pageIds: ["roll", "inventory", "crafting", "boosts", "auctions", "expeditions", "minigames"],
    defaultOpen: true
  },
  {
    id: "indexes",
    label: "Indexes",
    icon: icons.book,
    pageIds: ["gem-index", "mutation-index", "collection-hall", "artifact-archives", "relic-vault"],
    defaultOpen: true
  },
  {
    id: "progress",
    label: "Progress",
    icon: icons.branch || icons.trophy,
    pageIds: ["achievements", "quests", "bounties", "seasons", "research-tree"],
    defaultOpen: true
  },
  {
    id: "community",
    label: "Community",
    icon: icons.users,
    pageIds: ["leaderboards", "roll-counts", "month-two", "month-one", "guilds", "wars", "pvp", "world-bosses"],
    defaultOpen: true
  },
  {
    id: "activities",
    label: "Activities",
    icon: icons.dice,
    pageIds: ["gemdle", "islands", "dungeons", "treasure-expeditions", "mining-events", "limited-events"],
    defaultOpen: true
  },
  {
    id: "labs-economy",
    label: "Labs & Economy",
    icon: icons.flask || icons.coins,
    pageIds: ["workbench", "bank", "lottery", "gem-fusion", "enchanting-lab", "merchant-caravan", "global-cash-graph"],
    defaultOpen: true
  },
  {
    id: "store",
    label: "Store",
    icon: icons.sparkle,
    pageIds: ["store"],
    direct: true
  },
  {
    id: "admin",
    label: "Admin",
    icon: icons.shield,
    pageIds: ["admin"]
  },
  {
    id: "other",
    label: "More",
    icon: icons.compass || icons.sparkle,
    pageIds: []
  }
];

async function loadEnabledSections() {
  try {
    const { data } = await supabase.functions.invoke("features", { body: { action: "sections" } });
    const sections = data?.sections ?? [];
    // The features endpoint already filters admin-only sections for normal
    // players. Keep the explicit flag here too so the shell never exposes a
    // private section if a stale/older endpoint returns it.
    const isAdmin = data?.isAdmin === true;
    const map = new Map(
      sections
        .filter((section) => section.admin_only !== true || isAdmin)
        .map((section) => [section.id, section])
    );
    map.__isAdmin = isAdmin;
    return map;
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


// Tab strips (.segmented) scroll sideways on phones. Bring a tapped tab
// fully into view, and on load reveal the selected tab if it starts
// off-screen, so players can always see where they are.
let segmentedTabsBound = false;

function scrollTabIntoView(tab) {
  const strip = tab.closest(".segmented");

  if (!strip || strip.scrollWidth <= strip.clientWidth) {
    return;
  }

  const stripBox = strip.getBoundingClientRect();
  const tabBox = tab.getBoundingClientRect();
  const edge = 24;

  if (tabBox.left < stripBox.left + edge) {
    strip.scrollBy({ left: tabBox.left - stripBox.left - edge, behavior: "smooth" });
  } else if (tabBox.right > stripBox.right - edge) {
    strip.scrollBy({ left: tabBox.right - stripBox.right + edge, behavior: "smooth" });
  }
}

function revealSelectedTabs() {
  const selected = document.querySelectorAll(
    ".segmented [aria-selected=\"true\"], .segmented [aria-current=\"page\"], .segmented .active, .segmented .is-active"
  );

  selected.forEach((tab) => scrollTabIntoView(tab));
}

function keepSegmentedTabsInView() {
  if (segmentedTabsBound) {
    return;
  }

  segmentedTabsBound = true;

  document.addEventListener("click", (event) => {
    const tab = event.target.closest?.(".segmented > *");

    if (tab) {
      scrollTabIntoView(tab);
    }
  });

  window.addEventListener("load", () => {
    requestAnimationFrame(revealSelectedTabs);
  }, { once: true });
}

export function mountShell({ page, base = "./" }) {
  // Start presence reporting once for the entire application. It is silent
  // when the account is not authenticated and never blocks page rendering.
  startActivityHeartbeat();
  // Rare reveals are an application-shell concern: rolls can complete while
  // the player is on any page, so every route mounts the same durable queue.
  initGlobalCutscenes();
  mountMonthTwoAnniversary({ base });
  mountMaintenanceMode({ page });
  keepSegmentedTabsInView();

  const header = document.createElement("header");

  header.className = "topbar";

  header.innerHTML = `
    <div class="topbar__inner">
      <a class="brand" href="${base}" aria-label="Gem Incremental home">
        <span class="brand__mark">${icons.gem}</span>
        <span>Gem Incremental</span>
      </a>

      <nav class="nav" aria-label="Primary">
        ${getNavigationPages().map((item) => navLink(item, page, base, "nav__link")).join("")}
      </nav>

      <div class="topbar-explore" id="shellExploreAnchor">
        <button
          class="nav__link topbar-explore__button"
          id="shellExploreButton"
          type="button"
          aria-label="Explore destinations"
          title="Explore destinations"
          aria-haspopup="true"
          aria-expanded="false"
          aria-controls="shellExploreMenu"
          ${getExplorePages().some((item) => item.id === page) ? 'aria-current="page"' : ""}
        >
          ${icons.compass || icons.sparkle}
          <span>Explore</span>
          ${icons.chevronDown || ""}
        </button>
        <div class="menu topbar-explore__menu" id="shellExploreMenu" hidden>
          <div class="menu__label">Explore</div>
          ${renderExploreGroups(getExplorePages(), page, base)}
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
            aria-label="Utilities"
            title="Utilities"
            aria-haspopup="true"
            aria-expanded="false"
            aria-controls="shellMoreMenu"
          >
            ${icons.sparkle}
            <span>Utilities</span>
            ${icons.chevronDown || ""}
          </button>
          <div class="menu topbar-more__menu" id="shellMoreMenu" hidden>
            <div class="menu__label">Quick links</div>
            <a class="menu__item" href="${base}info/" ${page === "info" ? 'aria-current="page"' : ""}><span aria-hidden="true">ℹ️</span><span>Info</span></a>
            <button class="menu__item shell-quick-nav-trigger" type="button" data-more-action="quicknav">
              ${icons.compass || icons.sparkle}<span>Quick navigation</span><kbd>Ctrl K</kbd>
            </button>
            <a class="menu__item" href="${base}referral/">${icons.users}<span>Invite friends</span></a>
            <button class="menu__item" type="button" data-more-action="howto">
              ${icons.book}<span>How to play</span>
            </button>
            <button class="menu__item" type="button" data-more-action="console">
              <span aria-hidden="true">⌨</span><span>Player console</span><kbd>&#96;</kbd>
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
          class="btn btn--ghost btn--icon topbar-settings"
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

  // The primary links share the bar with the wallet, menus and account
  // chip, whose widths change per player (username, money, admin links,
  // a custom top bar). Fixed breakpoints could not know that, so the last
  // links were clipped behind a scrollbar on common 1366-1920px screens.
  // Measure instead: drop the wordmark first, then the Explore/More
  // labels, then the link labels, only when the labelled links really do
  // not fit. Every link keeps its title and aria-label, so icon-only
  // links stay named.
  let navFitFrame = 0;

  function navigationOverflows() {
    const nav = header.querySelector(".nav");

    return Boolean(nav) && nav.clientWidth > 0 && nav.scrollWidth > nav.clientWidth + 1;
  }

  function fitPrimaryNavigation() {
    navFitFrame = 0;
    const steps = ["topbar--no-wordmark", "topbar--tight", "topbar--compact"];

    header.classList.remove(...steps);

    for (const step of steps) {
      if (!navigationOverflows()) return;
      header.classList.add(step);
    }
  }

  function scheduleNavigationFit() {
    if (navFitFrame) return;
    navFitFrame = requestAnimationFrame(fitPrimaryNavigation);
  }

  scheduleNavigationFit();
  window.addEventListener("resize", scheduleNavigationFit, { passive: true });
  document.fonts?.ready.then(scheduleNavigationFit);


  const tabbar = document.createElement("nav");

  tabbar.className = "tabbar";
  tabbar.setAttribute("aria-label", "Primary");
  tabbar.innerHTML = `
    <div class="tabbar__destinations" data-mobile-primary></div>
    <button
      class="tabbar__link tabbar__more"
      id="mobileNavigationTrigger"
      type="button"
      aria-label="More destinations"
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-controls="mobileNavigationSheet"
      data-mobile-navigation-trigger
    >
      ${icons.compass || icons.sparkle}
      <span>More</span>
    </button>
  `;

  document.body.appendChild(tabbar);

  const mobileNavigationTrigger = tabbar.querySelector("#mobileNavigationTrigger");
  const mobileNavigationBackdrop = document.createElement("button");
  mobileNavigationBackdrop.className = "mobile-navigation-backdrop mobile-sheet-backdrop";
  mobileNavigationBackdrop.type = "button";
  mobileNavigationBackdrop.hidden = true;
  mobileNavigationBackdrop.setAttribute("aria-label", "Close navigation");

  const mobileNavigationSheet = document.createElement("section");
  mobileNavigationSheet.className = "mobile-navigation-sheet mobile-sheet";
  mobileNavigationSheet.id = "mobileNavigationSheet";
  mobileNavigationSheet.setAttribute("aria-labelledby", "mobileNavigationTitle");
  mobileNavigationSheet.innerHTML = `
    <div class="mobile-sheet__header mobile-navigation-sheet__header">
      <div>
        <span class="mobile-navigation-sheet__eyebrow">Navigation</span>
        <h2 id="mobileNavigationTitle">Explore Gem Incremental</h2>
      </div>
      <button class="btn btn--ghost btn--icon" type="button" data-mobile-navigation-close aria-label="Close navigation">×</button>
    </div>
    <label class="mobile-navigation-search" for="mobileNavigationSearch">
      ${icons.compass || icons.sparkle}
      <span class="visually-hidden">Find a destination</span>
      <input id="mobileNavigationSearch" type="search" autocomplete="off" placeholder="Find a destination…">
    </label>
    <div class="mobile-navigation-groups" data-mobile-navigation-groups></div>
    <section class="mobile-navigation-utilities" aria-labelledby="mobileUtilitiesTitle">
      <h3 id="mobileUtilitiesTitle">Settings &amp; help</h3>
      <div class="mobile-navigation-grid">
        <a class="mobile-navigation-row" href="${base}settings/" ${page === "settings" ? 'aria-current="page"' : ""}>${icons.settings}<span>Settings</span></a>
        <a class="mobile-navigation-row" href="${base}settings/#appearanceHeading">${icons.palette}<span>Appearance</span></a>
        <a class="mobile-navigation-row" href="${base}info/" ${page === "info" ? 'aria-current="page"' : ""}><span aria-hidden="true">ℹ️</span><span>Info</span></a>
        <button class="mobile-navigation-row" type="button" data-more-action="howto">${icons.book}<span>How to play</span></button>
        <button class="mobile-navigation-row" type="button" data-more-action="console"><span aria-hidden="true">⌨</span><span>Player console</span></button>
        <a class="mobile-navigation-row" href="${base}referral/">${icons.users}<span>Invite friends</span></a>
        <a class="mobile-navigation-row" href="${base}codes/">${icons.sparkle}<span>Codes</span></a>
        <a class="mobile-navigation-row" href="${base}updates/">${icons.sparkle}<span>Update log</span></a>
        <a class="mobile-navigation-row" href="${base}bugs/">${icons.bug}<span>Report a bug</span></a>
        <a class="mobile-navigation-row" href="${base}support/">${icons.heart}<span>Support the game</span></a>
      </div>
    </section>
    <p class="mobile-navigation-empty" data-mobile-navigation-empty hidden>No destinations match that search.</p>
  `;
  document.body.append(mobileNavigationBackdrop, mobileNavigationSheet);

  const mobileNavigationController = mountMobileSheet({
    sheet: mobileNavigationSheet,
    trigger: mobileNavigationTrigger,
    closeButton: mobileNavigationSheet.querySelector("[data-mobile-navigation-close]"),
    backdrop: mobileNavigationBackdrop,
    breakpoint: "(max-width: 780px)",
    modalOnly: true
  });

  const renderMobileNavigation = () => {
    const primary = getMobileNavigationPages();
    const primaryMount = tabbar.querySelector("[data-mobile-primary]");
    if (primaryMount) {
      primaryMount.innerHTML = primary.map((item) => navLink(item, page, base, "tabbar__link", true)).join("");
    }
    const moreActive = getMobileMorePages().some((item) => item.id === page || item.match?.includes(page))
      || ["settings", "info", "referral", "codes", "updates", "bugs", "support"].includes(page);
    mobileNavigationTrigger?.toggleAttribute("aria-current", moreActive);
    const groupsMount = mobileNavigationSheet.querySelector("[data-mobile-navigation-groups]");
    if (groupsMount) groupsMount.innerHTML = renderMobileNavigationGroups(getMobileMorePages(), page, base);
  };

  renderMobileNavigation();

  const mobileNavigationSearch = mobileNavigationSheet.querySelector("#mobileNavigationSearch");
  mobileNavigationSearch?.addEventListener("input", () => {
    const term = mobileNavigationSearch.value.trim().toLocaleLowerCase();
    let visibleRows = 0;
    mobileNavigationSheet.querySelectorAll("[data-mobile-navigation-row]").forEach((row) => {
      const visible = !term || row.dataset.searchText.includes(term);
      row.hidden = !visible;
      if (visible) visibleRows += 1;
    });
    mobileNavigationSheet.querySelectorAll("[data-mobile-navigation-group]").forEach((group) => {
      group.hidden = !group.querySelector("[data-mobile-navigation-row]:not([hidden])");
    });
    const empty = mobileNavigationSheet.querySelector("[data-mobile-navigation-empty]");
    if (empty) empty.hidden = visibleRows > 0;
  });

  mobileNavigationSheet.addEventListener("click", (event) => {
    if (event.target.closest("a")) mobileNavigationController?.close();
    if (event.target.closest('[data-more-action="console"]')) {
      mobileNavigationController?.close();
      togglePlayerCli();
    }
  });

  const rerenderPrimaryNavigation=()=>{
    const nav=header.querySelector(".nav");
    if(nav) nav.innerHTML=getNavigationPages().map((item)=>navLink(item,page,base,"nav__link")).join("");
    renderMobileNavigation();
    // The menu is portaled to <body> later in mountShell, so settings and
    // feature updates must resolve it from the document rather than header.
    const exploreMenu=document.getElementById("shellExploreMenu");
    if(exploreMenu) exploreMenu.innerHTML=`<div class="menu__label">Explore</div>${renderExploreGroups(getExplorePages(),page,base)}`;
    scheduleNavigationFit();
  };
  onSettingsChange(rerenderPrimaryNavigation);

  // Site feature switches are controlled from Upcoming. Feature pages and
  // their top-bar links remain hidden until an authorized user enables them.
  loadEnabledSections().then((sectionMap) => {
    enabledSectionMap = sectionMap;
    shellIsAdmin = sectionMap?.__isAdmin === true;
    rerenderPrimaryNavigation();
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
  renderActiveEvents(header, base);


  // Bottom-left dock: contribute on GitHub / report a bug.
  // Utility links are now mounted in the top bar under More.

  // First-run guided tour: spotlights the roll button, wallet and nav for new
  // players (shows once), and reopenable from More -> How to play.
  mountTour({ base, page });
  mountQuickNavigation({ base, page });

  // Daily login streak: prompts once a day when a reward is claimable.
  mountDailyLogin();

  // Referral promo: once-a-day popup about the limited-time invite bonus.
  mountReferralPromo(base);

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
      requestAnimationFrame(() => exploreMenu.querySelector("summary, a, button")?.focus({ preventScroll: true }));
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
    if (open) {
      closeExplore();
      requestAnimationFrame(() => moreMenu.querySelector("a, button")?.focus({ preventScroll: true }));
    }
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

  moreMenu?.querySelector('[data-more-action="console"]')?.addEventListener("click", () => {
    closeMore();
    togglePlayerCli();
  });

  document.addEventListener("click", (event) => {
    // The menus are portaled to <body>, so a click inside a menu is outside its
    // anchor — check the menu too, or clicking inside would close it.
    if (exploreAnchor && !exploreAnchor.contains(event.target) && !exploreMenu?.contains(event.target)) closeExplore();
    if (moreAnchor && !moreAnchor.contains(event.target) && !moreMenu?.contains(event.target)) closeMore();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const restoreExplore = exploreMenu && !exploreMenu.hidden;
      const restoreMore = moreMenu && !moreMenu.hidden;
      closeExplore();
      closeMore();
      if (restoreExplore) exploreButton?.focus({ preventScroll: true });
      else if (restoreMore) moreButton?.focus({ preventScroll: true });
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
  let signedOut = false;

  function paintAccount(user) {
    currentUser = user;

    const account = describeAccount(user, currentUsername, { signedOut });

    accountName.textContent = account.name;

    accountButton.setAttribute("aria-label", `Account: ${account.name}`);

    if (account.avatarUrl) {
      avatar.innerHTML = `<img src="${escapeHtml(
        account.avatarUrl
      )}" alt="" referrerpolicy="no-referrer">`;
    } else {
      avatar.textContent = account.initials;
    }

    scheduleNavigationFit();
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

        shellIsAdmin = true;
        rerenderPrimaryNavigation();
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
    const account = describeAccount(currentUser, currentUsername, { signedOut });

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
              ${
                account.signedOut
                  ? "Log in to continue your save, or create a free account to start playing."
                  : "Create an account to keep your gems if you clear this browser or switch device."
              }
            </div>

            <a class="btn btn--primary btn--block" href="${base}account/">
              ${icons.user}
              ${account.signedOut ? "Log in or sign up" : "Create an account"}
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
  initPlayerCli();


  function applyWallet(amount) {
    if (amount == null) {
      walletPill.classList.add("wallet--loading");
      walletValue.textContent = "—";
      return;
    }

    walletPill.classList.remove("wallet--loading");
    walletValue.textContent = formatMoney(amount, { exact: true });
    walletPill.title = `Money: ${formatMoney(amount, { exact: true })}`;
    scheduleNavigationFit();
  }


  // Populate the wallet from the shell itself so EVERY page shows the
  // player's money — including pages that never call setWallet (guilds,
  // seasons, and any future page). Pages that also set it just override
  // with the same value.
  ensurePlayerAuth()
    .then(async (user) => {
      if (!user) {
        if (isSignInRequired()) showSignInRequired();
        return { state: null, appeal: null };
      }
      const [stateResult, appealResult] = await Promise.allSettled([
        loadCloudPlayerState(),
        loadMyBanAppeal()
      ]);
      return {
        state: stateResult.status === "fulfilled" ? stateResult.value : null,
        appeal: appealResult.status === "fulfilled" && !appealResult.value?.error
          ? appealResult.value?.data ?? null
          : null
      };
    })
    .then(({ state, appeal }) => {
      if (state && state.money != null) {
        applyWallet(state.money);
      }
      // A banned player is stopped at the door on every page. The server
      // (roll and other actions) rejects them too; this is the visible half.
      if (state && state.ban_until && new Date(state.ban_until) > new Date()) {
        showBanScreen(state.ban_until, state.ban_reason, appeal);
      } else if (appeal && ["accepted", "rejected"].includes(appeal.status)) {
        showBanAppealDecision(appeal);
      }
    })
    .catch(() => {
      /* Non-fatal: the wallet stays in its loading state. */
    });


  // Guest sign-ins can be switched off on the backend. The visitor then
  // has no session at all, so point them at the account page instead of
  // leaving the header on "Signing in..." forever.
  function showSignInRequired() {
    signedOut = true;
    paintAccount(null);
    applyWallet(null);

    if (page === "account" || document.getElementById("shellSignInBanner")) {
      return;
    }

    const banner = document.createElement("div");

    banner.className = "announce announce--info signin-banner";
    banner.id = "shellSignInBanner";
    banner.setAttribute("role", "status");
    banner.innerHTML = `
      <span class="announce__icon">${icons.user}</span>
      <span class="announce__body">${escapeHtml(SIGN_IN_REQUIRED_MESSAGE)}</span>
      <a class="btn btn--primary btn--sm signin-banner__action" href="${base}account/">
        Log in or sign up
      </a>
    `;

    header.after(banner);
  }


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
function appealErrorMessage(error) {
  const message = String(error?.message ?? "");
  if (message.includes("appeal_reason_too_short")) return "Please enter at least 3 characters.";
  if (message.includes("appeal_reason_too_long")) return "Keep your appeal under 2,000 characters.";
  if (message.includes("active_ban_required")) return "This account is no longer banned. Refresh the page.";
  return message || "The appeal could not be submitted. Please try again.";
}

function renderBanAppealControls(overlay, initialAppeal) {
  const host = overlay.querySelector("[data-ban-appeal-host]");
  if (!host) return;

  function render(appeal) {
    if (appeal?.status === "pending") {
      host.innerHTML = `
        <div class="ban-screen__appeal-status ban-screen__appeal-status--pending">
          <strong>Appeal submitted</strong>
          <span>Your username was saved with your reason. The team will review it here in the game.</span>
        </div>`;
      return;
    }

    if (appeal?.status === "rejected") {
      host.innerHTML = `
        <div class="ban-screen__appeal-status ban-screen__appeal-status--rejected" role="status">
          <strong>Your ban appeal was rejected.</strong>
          ${appeal.decision_message
            ? `<span>${escapeHtml(appeal.decision_message)}</span>`
            : ""}
        </div>`;
      return;
    }

    host.innerHTML = `
      <form class="ban-screen__appeal-form" data-ban-appeal-form>
        <label for="banAppealReason">Why should this ban be reconsidered?</label>
        <textarea id="banAppealReason" rows="4" minlength="3" maxlength="2000" required
          placeholder="Explain your reason for appealing..."></textarea>
        <small>Your current username is attached automatically. You can submit one appeal for this ban.</small>
        <button class="btn btn--primary" type="submit">Submit appeal</button>
        <p class="ban-screen__appeal-feedback" data-ban-appeal-feedback aria-live="polite"></p>
      </form>`;

    const form = host.querySelector("[data-ban-appeal-form]");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const textarea = form.querySelector("textarea");
      const button = form.querySelector("button");
      const feedback = form.querySelector("[data-ban-appeal-feedback]");
      const appealReason = textarea?.value.trim() ?? "";
      if (appealReason.length < 3) {
        feedback.textContent = "Please enter at least 3 characters.";
        return;
      }

      button.disabled = true;
      button.textContent = "Submitting…";
      feedback.textContent = "";
      const { data, error } = await submitBanAppeal(appealReason);
      if (error) {
        feedback.textContent = appealErrorMessage(error);
        button.disabled = false;
        button.textContent = "Submit appeal";
        return;
      }
      render(data);
    });
  }

  render(initialAppeal);

  // Keep the locked screen current while it is open. An accepted appeal
  // removes the ban on the server, so a reload enters the game and displays
  // the administrator's warning immediately.
  const poll = window.setInterval(async () => {
    if (!overlay.isConnected) {
      window.clearInterval(poll);
      return;
    }
    const { data, error } = await loadMyBanAppeal();
    if (error || !data) return;
    if (data.status === "accepted") {
      window.clearInterval(poll);
      window.location.reload();
      return;
    }
    if (data.status !== initialAppeal?.status) {
      initialAppeal = data;
      render(data);
    }
  }, 15000);
}

async function showBanAppealDecision(appeal) {
  if (!appeal?.id || document.getElementById("banScreen")) return;
  const accepted = appeal.status === "accepted";
  const message = appeal.decision_message || (accepted
    ? "Your account has been unbanned. Any further rule violation may result in a permanent ban."
    : "Your ban appeal was rejected.");

  const choice = await confirmDialog({
    title: accepted ? "Your ban has been lifted" : "Your ban appeal was rejected",
    body: `<p>${escapeHtml(message)}</p>`,
    confirmLabel: "I understand",
    cancelLabel: "Read later",
    tone: accepted ? "default" : "danger"
  });

  if (choice === "confirm") {
    await acknowledgeBanAppealDecision(appeal.id);
  }
}

function showBanScreen(banUntil, reason, appeal = null) {
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
      .ban-screen__card{position:relative;max-width:500px;width:100%;max-height:calc(100vh - 48px);text-align:center;overflow-y:auto;
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
      .ban-screen__appeal-host{margin-top:22px;padding-top:20px;border-top:1px solid var(--border,#2a2f3a);text-align:left}
      .ban-screen__appeal-form{display:grid;gap:10px}
      .ban-screen__appeal-form label{font-weight:700;color:var(--text,#f4f6fb)}
      .ban-screen__appeal-form textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:96px;padding:11px 12px;
        color:var(--text,#f4f6fb);background:var(--surface,#0f1319);border:1px solid var(--border,#2a2f3a);border-radius:10px;font:inherit}
      .ban-screen__appeal-form textarea:focus{outline:2px solid color-mix(in srgb,var(--accent,#8ab4ff) 50%,transparent);border-color:var(--accent,#8ab4ff)}
      .ban-screen__appeal-form small{color:var(--text-muted,#9aa4b2);line-height:1.4}
      .ban-screen__appeal-form .btn{justify-self:start}
      .ban-screen__appeal-feedback{min-height:1.2em;margin:0;color:var(--danger,#ef4444);font-size:.82rem}
      .ban-screen__appeal-status{display:grid;gap:7px;padding:14px 16px;border-radius:12px;line-height:1.45}
      .ban-screen__appeal-status span{color:var(--text-muted,#9aa4b2);font-size:.9rem}
      .ban-screen__appeal-status--pending{background:color-mix(in srgb,var(--accent,#8ab4ff) 10%,transparent);border:1px solid color-mix(in srgb,var(--accent,#8ab4ff) 28%,transparent)}
      .ban-screen__appeal-status--rejected{background:color-mix(in srgb,var(--danger,#ef4444) 10%,transparent);border:1px solid color-mix(in srgb,var(--danger,#ef4444) 28%,transparent)}
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
      <div class="ban-screen__appeal-host" data-ban-appeal-host></div>
    </div>`;

  overlay.querySelector(".ban-screen__reason").textContent =
    reason || "No reason was provided.";

  document.body.appendChild(overlay);
  document.documentElement.style.overflow = "hidden";
  renderBanAppealControls(overlay, appeal);

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

function announcementHtml(body) {
  const source = String(body ?? "");
  const urlPattern = /https?:\/\/[^\s<]+/gi;
  let cursor = 0;
  let output = "";
  for (const match of source.matchAll(urlPattern)) {
    const matched = match[0];
    const raw = matched.replace(/[),.;!?]+$/, "");
    const trailing = matched.slice(raw.length);
    const index = match.index ?? 0;
    output += escapeHtml(source.slice(cursor, index));
    let label = "Open link →";
    try {
      const host = new URL(raw).hostname.replace(/^www\./, "");
      if (host === "discord.gg" || host.endsWith("discord.com")) label = "Join Discord →";
      else if (host === "github.com") label = "View on GitHub →";
      else label = `Open ${host} →`;
    } catch {}
    output += `<a class="announce__link" href="${escapeHtml(raw)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    output += escapeHtml(trailing);
    cursor = index + matched.length;
  }
  return output + escapeHtml(source.slice(cursor));
}


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
          <span class="announce__body">${announcementHtml(entry.body)}</span>
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

async function renderActiveEvents(header, base = "./") {
  const user = await ensurePlayerAuth();
  if (!user) return;

  let activeAdminEvent = null;
  let activeGlobalEvent = null;
  let activeAdminEventSignature = "";
  let serverClockOffsetMs = 0;
  let adminRefreshInFlight = false;
  let globalRefreshInFlight = false;

  const card = document.createElement("details");
  card.className = "active-events-card";
  card.innerHTML = `
    <summary class="active-events-card__summary">
      <span>Active events</span>
      <span class="active-events-card__meta">
        <strong class="active-events-card__count" aria-label="0 active events">0</strong>
        <span class="active-events-card__arrow" aria-hidden="true">${icons.chevronDown}</span>
      </span>
    </summary>
    <div class="active-events-card__list">
      <p class="active-events-card__empty">no active events</p>
    </div>`;

  const existingAnnouncements = document.querySelector(".announce-bar");
  if (existingAnnouncements) existingAnnouncements.after(card);
  else header.after(card);

  const eventCount = card.querySelector(".active-events-card__count");
  const eventList = card.querySelector(".active-events-card__list");

  const adminEventHtml = (event) => {
    const boosts = [
      Number(event.luck_bonus) > 0 ? `+${eventPercent(event.luck_bonus)} Luck` : null,
      Number(event.roll_speed_bonus) > 0 ? `+${eventPercent(event.roll_speed_bonus)} Roll speed` : null,
      Number(event.weight_luck_bonus) > 0 ? `+${eventPercent(event.weight_luck_bonus)} Weight luck` : null,
      Number(event.weight_multiplier_bonus) > 0 ? `+${eventPercent(event.weight_multiplier_bonus)} Weight multiplier` : null,
      Number(event.luck_multiplier ?? 1) !== 1 ? `${eventMultiplier(event.luck_multiplier)} Luck` : null,
      Number(event.roll_speed_multiplier ?? 1) !== 1 ? `${eventMultiplier(event.roll_speed_multiplier)} Roll speed` : null,
      Number(event.weight_luck_multiplier ?? 1) !== 1 ? `${eventMultiplier(event.weight_luck_multiplier)} Weight luck` : null,
      Number(event.weight_multiplier_multiplier ?? 1) !== 1 ? `${eventMultiplier(event.weight_multiplier_multiplier)} Weight multiplier` : null
    ].filter(Boolean);

    return `
      <div class="active-events-card__event active-events-card__event--admin">
        <span class="active-events-card__icon" aria-hidden="true">${icons.sparkle}</span>
        <span class="active-events-card__content">
          <strong>${escapeHtml(event.name || "Admin event")}</strong>
          <span>${escapeHtml(boosts.join(" · ") || "Admin event active")}</span>
        </span>
        <strong class="active-events-card__timer" data-ends-at="${escapeHtml(event.ends_at)}" aria-label="Time remaining"></strong>
      </div>`;
  };

  const globalEventHtml = (event) => {
    const config = event.config || {};
    const now = Date.now() + serverClockOffsetMs;
    const startsAt = new Date(event.startsAt).getTime();
    const elapsedSeconds = Math.max(0, (now - startsAt) / 1000);
    const details = [];
    if (event.eventKey === "unstable_luck") {
      const phase = Math.floor(elapsedSeconds / Number(config.phaseSeconds || 30));
      const value = config.phaseValues?.[phase];
      if (value) details.push(`Current Luck ×${Number(value).toFixed(2)}`);
    }
    if (event.eventKey === "singularity" && event.massTarget) {
      details.push(`Mass ${Math.min(100, event.mass / event.massTarget * 100).toFixed(1)}%`);
      if (event.collapsedAt) details.push("Collapsed");
    }
    if (event.eventKey === "falling_stars") {
      const active = (config.windows || []).some(window => elapsedSeconds >= Number(window.offsetSeconds)
        && elapsedSeconds < Number(window.offsetSeconds) + Number(window.durationSeconds));
      if (active) details.push("Starfall active");
    }
    const description = details.length ? `${event.description} · ${details.join(" · ")}` : event.description;

    return `
      <div class="active-events-card__event active-events-card__event--global active-events-card__event--${escapeHtml(event.tier)}">
        <span class="active-events-card__icon" aria-hidden="true">${escapeHtml(event.icon || "✦")}</span>
        <span class="active-events-card__content">
          <strong>${escapeHtml(event.name)} · ${escapeHtml(event.tier)}</strong>
          <a href="${escapeHtml(base)}info/#random-events" aria-label="Read about Random Events">Event info ↗</a>
          <span>${escapeHtml(description || "Random event active")}</span>
        </span>
        <strong class="active-events-card__timer" data-ends-at="${escapeHtml(event.endsAt)}" data-server-clock="true" aria-label="Time remaining"></strong>
      </div>`;
  };

  const updateTimer = () => {
    for (const timer of card.querySelectorAll(".active-events-card__timer")) {
      const endsAt = new Date(timer.dataset.endsAt).getTime();
      const clockOffset = timer.dataset.serverClock === "true" ? serverClockOffsetMs : 0;
      timer.textContent = eventTime(endsAt - (Date.now() + clockOffset));
    }
  };

  const render = () => {
    const events = [];
    if (activeAdminEvent) events.push(adminEventHtml(activeAdminEvent));
    if (activeGlobalEvent?.id) events.push(globalEventHtml(activeGlobalEvent));
    const count = events.length;
    eventCount.textContent = String(count);
    eventCount.setAttribute("aria-label", `${count} active event${count === 1 ? "" : "s"}`);
    eventList.innerHTML = count
      ? events.join("")
      : '<p class="active-events-card__empty">no active events</p>';
    updateTimer();
  };

  const refreshAdminEvent = async () => {
    if (adminRefreshInFlight) return;
    adminRefreshInFlight = true;
    try {
      const { data, error } = await loadActiveAdminEvent();
      if (error) return;
      const nextEvent = (Array.isArray(data) ? data[0] : data) || null;
      const nextSignature = JSON.stringify(nextEvent);
      if (nextSignature !== activeAdminEventSignature) {
        activeAdminEvent = nextEvent;
        activeAdminEventSignature = nextSignature;
        render();
      }
    } finally {
      adminRefreshInFlight = false;
    }
  };

  const refreshGlobalEvent = async () => {
    if (globalRefreshInFlight) return;
    globalRefreshInFlight = true;
    try {
      const { data, error } = await loadActiveGlobalEvent();
      if (error) return;
      activeGlobalEvent = data && typeof data === "object" && data.id ? data : null;
      if (activeGlobalEvent) {
        const parsedServerNow = new Date(activeGlobalEvent.serverNow).getTime();
        serverClockOffsetMs = Number.isFinite(parsedServerNow) ? parsedServerNow - Date.now() : 0;
      }
      render();
    } finally {
      globalRefreshInFlight = false;
    }
  };

  await Promise.all([refreshAdminEvent(), refreshGlobalEvent()]);
  const globalRefreshInterval = setInterval(refreshGlobalEvent, 15_000);
  const timerInterval = setInterval(async () => {
    if (activeAdminEvent) await refreshAdminEvent();
    const globalEndsAt = new Date(activeGlobalEvent?.endsAt).getTime();
    if (activeGlobalEvent && globalEndsAt <= Date.now() + serverClockOffsetMs) {
      activeGlobalEvent = null;
      render();
      return;
    }
    updateTimer();
  }, 1_000);
  window.addEventListener("pagehide", () => {
    clearInterval(globalRefreshInterval);
    clearInterval(timerInterval);
  }, { once: true });
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

function exploreGroupFor(item) {
  return EXPLORE_GROUPS.find((group) => group.pageIds.includes(item.id))
    ?? EXPLORE_GROUPS.find((group) => group.id === "other");
}

function renderExploreGroups(items, activePage, base) {
  const hasActiveGroup = items.some((item) =>
    item.id === activePage || item.match?.includes(activePage)
  );

  return EXPLORE_GROUPS.map((group) => {
    const groupItems = items.filter((item) => exploreGroupFor(item)?.id === group.id);
    const active = groupItems.some((item) => item.id === activePage || item.match?.includes(activePage));
    const open = active || (group.defaultOpen && !hasActiveGroup);

    if (group.direct) {
      return groupItems.map((item) => menuNavLink(item, activePage, base)).join("");
    }

    return `
      <details
        class="topbar-explore__group"
        data-explore-group="${group.id}"
        ${groupItems.length ? "" : "hidden"}
        ${open ? "open" : ""}
      >
        <summary class="topbar-explore__group-toggle">
          ${group.icon}
          <span>${escapeHtml(group.label)}</span>
          <span class="topbar-explore__group-count" aria-label="${groupItems.length} destination${groupItems.length === 1 ? "" : "s"}">${groupItems.length}</span>
          ${icons.chevronDown || ""}
        </summary>
        <div class="topbar-explore__group-items" data-explore-group-items="${group.id}">
          ${groupItems.map((item) => menuNavLink(item, activePage, base)).join("")}
        </div>
      </details>
    `;
  }).join("");
}

function menuNavLink(item, activePage, base) {
  const active = item.id === activePage || (item.match?.includes(activePage) ?? false);
  const safeLabel = escapeHtml(item.label);
  return `
    <a
      class="menu__item topbar-explore__item"
      data-page-id="${escapeHtml(item.id)}"
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

function renderMobileNavigationGroups(items, activePage, base) {
  return EXPLORE_GROUPS.map((group) => {
    const groupItems = items.filter((item) => exploreGroupFor(item)?.id === group.id);
    if (!groupItems.length) return "";

    return `
      <section class="mobile-navigation-group" data-mobile-navigation-group>
        <h3>${group.icon}<span>${escapeHtml(group.label)}</span></h3>
        <div class="mobile-navigation-grid">
          ${groupItems.map((item) => {
            const active = item.id === activePage || item.match?.includes(activePage);
            const label = escapeHtml(item.label);
            const searchText = escapeHtml(`${item.label} ${item.short} ${group.label}`.toLocaleLowerCase());
            return `
              <a
                class="mobile-navigation-row"
                href="${base}${item.href}"
                data-mobile-navigation-row
                data-search-text="${searchText}"
                ${active ? 'aria-current="page"' : ""}
              >
                ${item.icon}
                <span>${label}</span>
                ${active ? '<small>Here</small>' : ""}
              </a>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }).join("");
}

// =========================================================
// QUICK NAVIGATION
//
// The shell has many destinations, but a permanent mega-menu would make the
// play surface even busier. This is an on-demand, keyboard-friendly page
// finder that only includes destinations currently available to the player.
// =========================================================

function navigationDestinations() {
  const mainIds = new Set(getNavigationPages().map((item) => item.id));
  const destinations = new Map();

  for (const item of [...getNavigationPages(), ...getExplorePages()]) {
    destinations.set(item.id, {
      ...item,
      area: mainIds.has(item.id) ? "Main navigation" : (exploreGroupFor(item)?.label ?? "Explore")
    });
  }
  return [...destinations.values()];
}

function mountQuickNavigation({ base, page }) {
  let palette = null;
  let searchInput = null;
  let activeIndex = 0;
  let matching = [];
  let returnFocus = null;

  const close = () => {
    palette?.remove();
    palette = null;
    searchInput = null;
    document.body.classList.remove("quick-nav-open");
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  };

  const drawResults = () => {
    if (!palette || !searchInput) return;
    const term = searchInput.value.trim().toLocaleLowerCase();
    matching = navigationDestinations().filter((item) =>
      `${item.label} ${item.short} ${item.area}`.toLocaleLowerCase().includes(term)
    );
    activeIndex = Math.min(activeIndex, Math.max(0, matching.length - 1));
    const results = palette.querySelector("[data-quick-nav-results]");
    const empty = palette.querySelector("[data-quick-nav-empty]");
    if (!results || !empty) return;
    results.innerHTML = matching.map((item, index) => `
      <button class="quick-nav__item ${index === activeIndex ? "is-active" : ""}" type="button" data-quick-nav-index="${index}">
        <span class="quick-nav__item-icon" aria-hidden="true">${item.icon}</span>
        <span class="quick-nav__item-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.area)}</small></span>
        ${item.id === page ? '<span class="quick-nav__current">Here</span>' : ""}
      </button>
    `).join("");
    empty.hidden = matching.length > 0;
  };

  const goTo = (item) => {
    if (!item) return;
    window.location.assign(`${base}${item.href}`);
  };

  const open = () => {
    if (palette) {
      searchInput?.focus();
      return;
    }
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeIndex = 0;
    palette = document.createElement("div");
    palette.className = "quick-nav";
    palette.innerHTML = `
      <div class="quick-nav__backdrop" data-quick-nav-close></div>
      <section class="quick-nav__dialog" role="dialog" aria-modal="true" aria-labelledby="quickNavTitle">
        <div class="quick-nav__head">
          <span class="quick-nav__icon">${icons.compass || icons.sparkle}</span>
          <label class="quick-nav__search-wrap" for="quickNavSearch">
            <span class="visually-hidden">Find a page</span>
            <input id="quickNavSearch" class="quick-nav__search" type="search" autocomplete="off" placeholder="Find a page…" />
          </label>
          <button class="btn btn--ghost btn--sm" type="button" data-quick-nav-close>Close <kbd>Esc</kbd></button>
        </div>
        <div class="quick-nav__title-row"><h2 id="quickNavTitle">Where do you want to go?</h2><span>Use ↑ ↓ then Enter</span></div>
        <div class="quick-nav__results" data-quick-nav-results></div>
        <p class="quick-nav__empty" data-quick-nav-empty hidden>No available pages match that search.</p>
      </section>
    `;
    document.body.append(palette);
    document.body.classList.add("quick-nav-open");
    searchInput = palette.querySelector("#quickNavSearch");
    drawResults();
    searchInput?.focus();

    palette.addEventListener("click", (event) => {
      if (event.target.closest("[data-quick-nav-close]")) {
        close();
        return;
      }
      const button = event.target.closest("[data-quick-nav-index]");
      if (button) goTo(matching[Number(button.dataset.quickNavIndex)]);
    });
    searchInput?.addEventListener("input", () => {
      activeIndex = 0;
      drawResults();
    });
    searchInput?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!matching.length) return;
        activeIndex = (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + matching.length) % matching.length;
        drawResults();
      } else if (event.key === "Enter") {
        event.preventDefault();
        goTo(matching[activeIndex]);
      }
    });
  };

  document.querySelectorAll('[data-more-action="quicknav"]').forEach((trigger) => {
    trigger.addEventListener("click", open);
  });
  document.addEventListener("keydown", (event) => {
    if (palette && event.key === "Tab") {
      const focusable = [...palette.querySelectorAll('input, button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && getComputedStyle(element).display !== "none");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first && event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (last && !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (palette && event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      open();
    }
  });
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


async function renderActiveMutationEffects(header){
  try{
    const {data,error}=await supabase.rpc("get_active_mutation_effects");
    if(error||!Array.isArray(data)||!data.length)return;
    let box=document.querySelector(".mutation-effects-banner");
    if(!box){box=document.createElement("div");box.className="mutation-effects-banner admin-event-banner";header.after(box);}
    box.innerHTML=data.map(e=>`<span class="admin-event-banner__content"><strong>${escapeHtml(e.name||"Mutation Effect")}</strong><span>×${Number(e.multiplier||1).toLocaleString(undefined,{maximumFractionDigits:3})} · ${Number(e.rollsRemaining||0)} roll${Number(e.rollsRemaining||0)===1?"":"s"} remaining</span></span>`).join("");
  }catch{}
}
