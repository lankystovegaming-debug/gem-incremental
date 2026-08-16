import { supabase } from "../src/backend/supabase.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  describeAccount,
  isGoogleEnabled,
  signInWithGoogle,
  onAccountChange,
  loadUsername
} from "../src/backend/account.js";

import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import { confirmDialog } from "../src/ui/dialog.js";
import { escapeHtml } from "../src/ui/format.js";
import {
  MODES,
  ACCENTS,
  FONTS,
  getMode,
  getAccent,
  getFont,
  setMode,
  setAccent,
  setFont,
  onThemeChange
} from "../src/ui/theme.js";
import {
  SELL_TIERS,
  getSettings,
  updateSettings,
  onSettingsChange
} from "../src/ui/settings.js";


mountShell({ page: "settings", base: "../" });


document.getElementById("appearanceIcon").innerHTML = icons.palette;
document.getElementById("automationIcon").innerHTML = icons.bolt;
document.getElementById("accountIcon").innerHTML = icons.user;
document.getElementById("aboutIcon").innerHTML = icons.keyboard;


// =========================================================
// APPEARANCE
// =========================================================

const modePicker = document.getElementById("modePicker");
const accentPicker = document.getElementById("accentPicker");
const fontPicker = document.getElementById("fontPicker");


function renderAppearance() {
  const mode = getMode();
  const accent = getAccent();
  const font = getFont();

  modePicker.innerHTML = MODES.map(
    (entry) => `
      <button
        class="segmented__item"
        type="button"
        role="radio"
        aria-checked="${entry.id === mode}"
        aria-selected="${entry.id === mode}"
        data-mode="${entry.id}"
      >${entry.label}</button>
    `
  ).join("");

  accentPicker.innerHTML = ACCENTS.map(
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
  ).join("");

  fontPicker.innerHTML = FONTS.map(
    (entry) => `
      <button
        class="segmented__item"
        type="button"
        role="radio"
        aria-checked="${entry.id === font}"
        aria-selected="${entry.id === font}"
        data-font="${entry.id}"
      >${entry.label}</button>
    `
  ).join("");
}


modePicker.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mode]");

  if (button) {
    setMode(button.dataset.mode);
  }
});


accentPicker.addEventListener("click", (event) => {
  const button = event.target.closest("[data-accent]");

  if (button) {
    setAccent(button.dataset.accent);
  }
});


fontPicker.addEventListener("click", (event) => {
  const button = event.target.closest("[data-font]");

  if (button) {
    setFont(button.dataset.font);
  }
});


onThemeChange(renderAppearance);

renderAppearance();


// =========================================================
// AUTOMATION
// =========================================================

const autoRollToggle = document.getElementById("autoRollToggle");
const autoSellToggle = document.getElementById("autoSellToggle");
const autoSellTier = document.getElementById("autoSellTier");
const autoSellTierRow = document.getElementById("autoSellTierRow");
const animationsToggle = document.getElementById("animationsToggle");


autoSellTier.innerHTML = SELL_TIERS.map(
  (tier) => `<option value="${tier.id}">${tier.label}</option>`
).join("");


function paintSettings(settings) {
  autoRollToggle.checked = settings.autoRoll;
  autoSellToggle.checked = settings.autoSell;
  autoSellTier.value = settings.autoSellTier;
  animationsToggle.checked = settings.rollAnimations;

  autoSellTierRow.classList.toggle("setting--muted", !settings.autoSell);
}


autoRollToggle.addEventListener("change", () =>
  updateSettings({ autoRoll: autoRollToggle.checked })
);

autoSellToggle.addEventListener("change", () =>
  updateSettings({ autoSell: autoSellToggle.checked })
);

autoSellTier.addEventListener("change", () =>
  updateSettings({ autoSellTier: autoSellTier.value })
);

animationsToggle.addEventListener("change", () =>
  updateSettings({ rollAnimations: animationsToggle.checked })
);


onSettingsChange(paintSettings);

paintSettings(getSettings());


// =========================================================
// ACCOUNT
//
// Full account management (email, password, username) lives on
// the Account page. This panel shows the current state and
// links there, rather than keeping a second copy of the flows.
// =========================================================

const accountPanel = document.getElementById("accountPanel");

let googleEnabled = false;


function renderAccount(user, username) {
  const account = describeAccount(user, username);

  accountPanel.innerHTML = `
    <span class="avatar">${
      account.avatarUrl
        ? `<img src="${escapeHtml(
            account.avatarUrl
          )}" alt="" referrerpolicy="no-referrer">`
        : escapeHtml(account.initials)
    }</span>

    <div class="account-panel__text">
      <div class="account-panel__name">${escapeHtml(account.name)}</div>
      <div class="account-panel__sub">${escapeHtml(
        account.guest
          ? "Guest save. It lives in this browser only — create an account to keep it."
          : account.detail
      )}</div>
    </div>

    <div class="account-panel__actions">
      <a class="btn ${account.guest ? "btn--primary" : ""}" href="../account/">
        ${account.guest ? "Create an account" : "Manage account"}
      </a>

      ${
        account.guest && googleEnabled
          ? `<button class="btn btn--google" data-action="google" type="button">
               ${icons.google}
               Google
             </button>`
          : ""
      }
    </div>
  `;

  accountPanel
    .querySelector('[data-action="google"]')
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      button.disabled = true;

      const result = await signInWithGoogle();

      if (result.started) {
        return;
      }

      button.disabled = false;

      // Refused because linking is unavailable and this save has
      // progress: signing in would strand it. See account.js.
      if (result.blocked === "would_lose_progress") {
        const choice = await confirmDialog({
          title: "Google cannot be linked right now",
          body: `
            <p>${escapeHtml(result.message)}</p>
            <p style="margin-top:12px">
              Signing in with Google would start a different account
              and leave this guest save unreachable, so it has been
              stopped.
            </p>
            <p style="margin-top:12px">
              Use the Account page instead — attaching an email keeps
              the same player and every gem on it.
            </p>
          `,
          confirmLabel: "Open Account page",
          cancelLabel: "Not now"
        });

        if (choice === "confirm") {
          window.location.href = "../account/";
        }

        return;
      }

      notify.error("Could not sign in", result.message);
    });
}


onAccountChange((event, user) => renderAccount(user, null));


async function loadAccount() {
  googleEnabled = await isGoogleEnabled();

  const { data } = await supabase.auth.getSession();

  let user = data.session?.user ?? null;

  renderAccount(user, null);

  // A player who lands straight on Settings still needs a guest
  // account, otherwise the rest of the game has nothing to read.
  if (!user) {
    user = await ensurePlayerAuth();
  }

  if (!user) {
    return;
  }

  renderAccount(user, await loadUsername(user.id));
}


renderAccount(null, null);
loadAccount();
