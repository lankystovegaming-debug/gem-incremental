import { icons } from "./icons.js";
import { formatMoney, escapeHtml } from "./format.js";
import { notify } from "./toast.js";
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
  describeAccount,
  isGuest,
  isGoogleEnabled,
  signInWithGoogle,
  signOutAccount,
  onAccountChange,
  loadUsername
} from "../backend/account.js";


// =========================================================
// APPLICATION SHELL
//
// Every page calls mountShell() to get the same header,
// mobile tab bar, wallet, theme picker and account menu.
// =========================================================


// `short` is used on the mobile tab bar, where six full
// labels would not fit across a 375px screen.
const PAGES = [
  { id: "roll", label: "Roll", short: "Roll", href: "", icon: icons.dice },
  { id: "inventory", label: "Inventory", short: "Items", href: "inventory/", icon: icons.bag },
  { id: "crafting", label: "Crafting", short: "Craft", href: "crafting/", icon: icons.anvil },
  { id: "gem-index", label: "Gem Index", short: "Index", href: "gem-index/", icon: icons.book },
  { id: "leaderboards", label: "Leaderboards", short: "Ranks", href: "leaderboards/", icon: icons.trophy },
  { id: "stats", label: "Stats", short: "Stats", href: "debug/", icon: icons.chart }
];


const MODE_ICONS = {
  system: icons.monitor,
  light: icons.sun,
  dark: icons.moon,
  neon: icons.bolt
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
        ${PAGES.map((item) => navLink(item, page, base, "nav__link")).join("")}
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

  tabbar.innerHTML = PAGES.map((item) =>
    navLink(item, page, base, "tabbar__link", true)
  ).join("");

  document.body.appendChild(tabbar);


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
            ${MODE_ICONS[entry.id]}
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

      notify.success("Signed in", `Welcome back, ${account.name}.`);
    }
  });

  reportOAuthErrorFromUrl();


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
// HELPERS
// =========================================================

function navLink(item, activePage, base, className, short = false) {
  const active = item.id === activePage;

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

    anchor.appendChild(openMenu);

    button.setAttribute("aria-expanded", "true");
  }

  document.addEventListener("click", (event) => {
    if (!openMenu) {
      return;
    }

    if (!openAnchor.contains(event.target)) {
      close();
    }
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

      anchor.appendChild(openMenu);

      openAnchor = anchor;
      openButton = button;
    }
  };
}
