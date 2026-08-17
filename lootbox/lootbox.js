import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  loadLootBoxes,
  loadWallet,
  openLootBox
} from "../src/backend/cloudLootboxes.js";
import { loadMarket, revertedPrice } from "../src/backend/cloudMarket.js";

import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import {
  rarityTier,
  formatMoney,
  formatCount,
  formatWeight,
  escapeHtml
} from "../src/ui/format.js";


const shell = mountShell({ page: "lootbox", base: "../" });


// =========================================================
// DOM
// =========================================================

const subtitle = document.getElementById("lootSubtitle");
const coinCount = document.getElementById("coinCount");
const coinMoney = document.getElementById("coinMoney");
const boxList = document.getElementById("boxList");

const contentsModal = document.getElementById("contentsModal");
const contentsTitle = document.getElementById("contentsTitle");
const contentsBody = document.getElementById("contentsBody");
const contentsClose = document.getElementById("contentsClose");

const wheelOverlay = document.getElementById("wheelOverlay");
const wheelTitle = document.getElementById("wheelTitle");
const openingState = document.getElementById("openingState");
const openingIcon = document.getElementById("openingIcon");
const openingMessage = document.getElementById("openingMessage");
const wheelResult = document.getElementById("wheelResult");
const wheelClose = document.getElementById("wheelClose");
const wheelAgain = document.getElementById("wheelAgain");

document.getElementById("coinIcon").innerHTML = icons.coins;
openingIcon.innerHTML = icons.box;


// =========================================================
// STATE
// =========================================================

const state = {
  boxes: [],
  wallet: { coins: 0, money: 0 },
  coinValue: null,
  spinning: false
};


// =========================================================
// REWARD PRESENTATION
// =========================================================

function poolTotal(pool) {
  return pool.reduce((sum, entry) => sum + Number(entry.weight ?? 0), 0);
}

function chance(entry, pool) {
  const total = poolTotal(pool);
  return total > 0 ? (Number(entry.weight ?? 0) / total) * 100 : 0;
}

// A colour for an entry so the wheel and drop-rate list read at a glance.
function entryColor(entry) {
  if (entry.type === "gem") {
    return `var(--rarity-${rarityTier(entry.rarity).id})`;
  }
  if (entry.type === "money") return "var(--positive)";
  if (entry.type === "slots") return "var(--accent)";
  if (entry.type === "potion") return "#c98cf8";
  return "var(--text-muted)";
}

function entryIcon(entry) {
  if (entry.type === "gem") return icons.gem;
  if (entry.type === "money") return icons.coins;
  if (entry.type === "slots") return icons.bag;
  if (entry.type === "potion") return icons.potion;
  return icons.sparkle;
}

function entryLabel(entry) {
  return entry.label ?? entry.type;
}


// =========================================================
// COIN BAR
// =========================================================

function renderWallet() {
  coinCount.textContent = formatCount(state.wallet.coins);
  const liveValue = Number.isFinite(state.coinValue)
    ? formatMoney(state.coinValue)
    : "—";
  coinMoney.textContent = `Live value: ${liveValue} per coin · Cash: ${formatMoney(
    state.wallet.money,
    { compact: true }
  )}`;
  shell.setWallet(state.wallet.money);

  for (const button of boxList.querySelectorAll("[data-open]")) {
    const cost = Number(button.dataset.cost);
    button.disabled = state.spinning || state.wallet.coins < cost;
  }
}


// =========================================================
// BOX CARDS
// =========================================================

function renderBoxes() {
  if (state.boxes.length === 0) {
    boxList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.box}
        <p class="empty__title">No loot boxes yet</p>
        <p>Check back soon.</p>
      </div>
    `;
    return;
  }

  boxList.innerHTML = state.boxes
    .map((box) => {
      const cost = Number(box.coin_cost ?? 0);
      const best = [...box.pool].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))[0];

      return `
        <article class="lb-box">
          <div class="lb-box__head">
            <span class="lb-box__icon">${icons.box}</span>
            <div>
              <div class="lb-box__name">${escapeHtml(box.name)}</div>
              <div class="lb-box__cost">${formatCount(cost)} coin${
        cost === 1 ? "" : "s"
      }</div>
            </div>
          </div>

          <p class="lb-box__blurb">${escapeHtml(box.blurb ?? "")}</p>

          <div class="lb-box__rarest">
            Rarest: <strong style="color:${entryColor(best)}">${escapeHtml(
        entryLabel(best)
      )}</strong> · ${chance(best, box.pool).toFixed(chance(best, box.pool) < 1 ? 1 : 0)}%
          </div>

          <div class="lb-box__actions">
            <button class="btn" data-contents="${escapeHtml(box.id)}" type="button">
              View contents
            </button>
            <button
              class="btn btn--primary"
              data-open="${escapeHtml(box.id)}"
              data-cost="${cost}"
              type="button"
            >Open</button>
          </div>
        </article>
      `;
    })
    .join("");

  for (const button of boxList.querySelectorAll("[data-contents]")) {
    button.addEventListener("click", () => showContents(button.dataset.contents));
  }
  for (const button of boxList.querySelectorAll("[data-open]")) {
    button.addEventListener("click", () => openBox(button.dataset.open));
  }

  renderWallet();
}


// =========================================================
// CONTENTS / DROP RATES
// =========================================================

function showContents(boxId) {
  const box = state.boxes.find((entry) => entry.id === boxId);
  if (!box) return;

  contentsTitle.textContent = `${box.name} — drop rates`;

  const rows = [...box.pool]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .map((entry) => {
      const pct = chance(entry, box.pool);
      return `
        <div class="lb-drop">
          <span class="lb-drop__icon" style="color:${entryColor(entry)}">${entryIcon(
        entry
      )}</span>
          <span class="lb-drop__label">${escapeHtml(entryLabel(entry))}</span>
          <span class="lb-drop__pct">${pct.toFixed(pct < 1 ? 2 : pct < 10 ? 1 : 0)}%</span>
          <span class="lb-drop__bar"><span style="width:${pct}%;background:${entryColor(
        entry
      )}"></span></span>
        </div>
      `;
    })
    .join("");

  contentsBody.innerHTML = rows;
  contentsModal.classList.remove("hidden");
}

contentsClose.addEventListener("click", () =>
  contentsModal.classList.add("hidden")
);
contentsModal.addEventListener("click", (event) => {
  if (event.target === contentsModal) contentsModal.classList.add("hidden");
});


// =========================================================
// OPEN + REWARD REVEAL
// =========================================================

// A short pause makes the reveal feel deliberate without tying the reward to
// a CSS transition. The server result is always shown after this delay.
const REVEAL_DELAY_MS = 320;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function showOpening(box) {
  wheelTitle.textContent = `Opening ${box.name}…`;
  openingMessage.textContent = "Finding your reward…";
  openingState.classList.remove("hidden");
}


async function openBox(boxId) {
  if (state.spinning) return;

  const box = state.boxes.find((entry) => entry.id === boxId);
  if (!box) return;

  const cost = Number(box.coin_cost ?? 0);
  if (state.wallet.coins < cost) {
    notify.error("Not enough coins", `You need ${formatCount(cost)} coins.`);
    return;
  }

  state.spinning = true;
  renderWallet();

  // Open the overlay in its resting state.
  wheelOverlay.classList.remove("hidden");
  showOpening(box);
  wheelResult.classList.add("hidden");
  wheelResult.innerHTML = "";
  wheelClose.hidden = true;
  wheelAgain.hidden = true;

  let data = null;
  let error = null;

  try {
    ({ data, error } = await openLootBox(boxId));
  } catch (thrown) {
    console.error("open_loot_box threw:", thrown);
    error = { message: "Network error — please try again." };
  }

  // Any failure: close the overlay cleanly (never leave it stuck open).
  if (error || !data || !data.reward) {
    state.spinning = false;
    wheelOverlay.classList.add("hidden");
    renderWallet();
    notify.error("Could not open", error?.message ?? "Please try again.");
    return;
  }

  const won = data.reward;

  await delay(REVEAL_DELAY_MS);

  openingState.classList.add("hidden");
  showResult(won, data);

  state.wallet.coins = Number(data.coins ?? state.wallet.coins);
  refreshWallet();

  state.spinning = false;
  wheelClose.hidden = false;
  wheelAgain.hidden = false;
  wheelAgain.dataset.box = boxId;
}


function showResult(won, data) {
  wheelTitle.textContent = "You got";

  let detail = "";
  if (won.type === "gem") {
    detail = `${formatWeight(data.result?.final_weight ?? won.base_weight)} · ${formatMoney(
      data.result?.value ?? 0
    )}`;
  } else if (won.type === "money") {
    detail = `${formatMoney(won.amount ?? 0)} added to your balance`;
  } else if (won.type === "slots") {
    detail = `Storage expanded by ${formatCount(won.slots ?? 0)} slot${
      Number(won.slots) === 1 ? "" : "s"
    }`;
  } else if (won.type === "potion") {
    detail = `${formatCount(data.result?.quantity ?? won.quantity ?? 1)} added to your potions`;
  }

  wheelResult.innerHTML = `
    <div class="lb-result__card" style="--item-color:${entryColor(won)}" role="status">
      <span class="lb-result__icon">${entryIcon(won)}</span>
      <div class="lb-result__name">${escapeHtml(entryLabel(won))}</div>
      <div class="lb-result__detail">${escapeHtml(detail)}</div>
    </div>
  `;
  wheelResult.classList.remove("hidden");

  notify.success("Loot box opened", entryLabel(won));
}


wheelClose.addEventListener("click", () => {
  wheelOverlay.classList.add("hidden");
});

wheelAgain.addEventListener("click", () => {
  const boxId = wheelAgain.dataset.box;
  if (boxId) openBox(boxId);
});


// =========================================================
// LOAD
// =========================================================

async function refreshWallet() {
  const wallet = await loadWallet();
  if (wallet) {
    state.wallet = wallet;
  }
  renderWallet();
}


async function refreshCoinValue() {
  const market = await loadMarket();
  if (!market) return;

  state.coinValue = revertedPrice(
    market.price,
    market.decayUpdatedAt,
    market.holderCount
  ) * 10000;
  renderWallet();
}


async function start() {
  // Box definitions are public. Start loading them immediately so a temporary
  // account connection problem never makes the catalogue disappear.
  const boxesPromise = loadLootBoxes();
  const marketPromise = loadMarket();
  const user = await ensurePlayerAuth();
  const [boxes, market] = await Promise.all([boxesPromise, marketPromise]);

  if (boxes) {
    state.boxes = boxes;
  }
  if (market) {
    state.coinValue = revertedPrice(
      market.price,
      market.decayUpdatedAt,
      market.holderCount
    ) * 10000;
  }

  // The value is public market data, so keep it live even if the account
  // connection is temporarily unavailable.
  setInterval(refreshCoinValue, 20000);

  if (!user) {
    subtitle.textContent = "Could not sign you in. Refresh to try again.";
    renderBoxes();
    notify.error("Sign-in failed", "The game could not reach your account.");
    return;
  }

  await refreshWallet();
  renderBoxes();
}


start();
