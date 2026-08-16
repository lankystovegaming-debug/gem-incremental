import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  loadLootBoxes,
  loadWallet,
  buyCoins,
  openLootBox
} from "../src/backend/cloudLootboxes.js";

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
const coinBuyQty = document.getElementById("coinBuyQty");
const coinBuyButton = document.getElementById("coinBuyButton");
const coinBuyRealButton = document.getElementById("coinBuyRealButton");
const coinStatus = document.getElementById("coinStatus");
const boxList = document.getElementById("boxList");

const contentsModal = document.getElementById("contentsModal");
const contentsTitle = document.getElementById("contentsTitle");
const contentsBody = document.getElementById("contentsBody");
const contentsClose = document.getElementById("contentsClose");

const wheelOverlay = document.getElementById("wheelOverlay");
const wheelTitle = document.getElementById("wheelTitle");
const wheel = document.getElementById("wheel");
const wheelTrack = document.getElementById("wheelTrack");
const wheelResult = document.getElementById("wheelResult");
const wheelClose = document.getElementById("wheelClose");
const wheelAgain = document.getElementById("wheelAgain");

document.getElementById("coinIcon").innerHTML = icons.coins;


// =========================================================
// STATE
// =========================================================

const state = {
  boxes: [],
  wallet: { coins: 0, money: 0 },
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
  coinMoney.textContent = `1 coin = $100,000 · you have ${formatMoney(
    state.wallet.money,
    { compact: true }
  )}`;
  shell.setWallet(state.wallet.money);

  for (const button of boxList.querySelectorAll("[data-open]")) {
    const cost = Number(button.dataset.cost);
    button.disabled = state.spinning || state.wallet.coins < cost;
  }
}


coinBuyButton.addEventListener("click", async () => {
  const count = Math.max(1, Math.floor(Number(coinBuyQty.value) || 0));

  coinBuyButton.disabled = true;
  coinStatus.classList.remove("error");
  coinStatus.textContent = "";

  const { data, error } = await buyCoins(count);

  coinBuyButton.disabled = false;

  if (error) {
    coinStatus.classList.add("error");
    coinStatus.textContent = error.message;
    notify.error("Could not buy coins", error.message);
    return;
  }

  await refreshWallet();
  notify.success(
    "Coins added",
    `Bought ${formatCount(count)} coin${count === 1 ? "" : "s"}.`
  );
});


// Real-money purchases need a payment provider; not wired up yet.
coinBuyRealButton.addEventListener("click", () => {
  notify.info(
    "Coming soon",
    "Buying coins with real money isn't available yet."
  );
});


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
// OPEN + WHEEL
// =========================================================

function weightedPick(pool) {
  const total = poolTotal(pool);
  let roll = Math.random() * total;
  for (const entry of pool) {
    roll -= Number(entry.weight ?? 0);
    if (roll < 0) return entry;
  }
  return pool[pool.length - 1];
}

function wheelItemHtml(entry) {
  return `
    <div class="wheel-item" style="--item-color:${entryColor(entry)}">
      <span class="wheel-item__icon">${entryIcon(entry)}</span>
      <span class="wheel-item__label">${escapeHtml(entryLabel(entry))}</span>
    </div>
  `;
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

  // Open overlay in its resting state.
  wheelOverlay.classList.remove("hidden");
  wheelTitle.textContent = `Opening ${box.name}…`;
  wheelResult.classList.add("hidden");
  wheelResult.innerHTML = "";
  wheelClose.hidden = true;
  wheelAgain.hidden = true;

  // Ask the server for the outcome (authoritative).
  const { data, error } = await openLootBox(boxId);

  if (error) {
    wheelOverlay.classList.add("hidden");
    state.spinning = false;
    renderWallet();
    notify.error("Could not open", error.message);
    return;
  }

  const won = data.reward;

  // Build the strip: filler items + the won item near the end.
  const WON_INDEX = 52;
  const TOTAL = 60;
  const items = [];
  for (let i = 0; i < TOTAL; i += 1) {
    items.push(i === WON_INDEX ? won : weightedPick(box.pool));
  }

  wheelTrack.style.transition = "none";
  wheelTrack.style.transform = "translateX(0)";
  wheelTrack.innerHTML = items.map(wheelItemHtml).join("");

  // Measure the true step (item width + gap). Reading layout here also
  // flushes the reset transform above.
  const first = wheelTrack.children[0];
  const second = wheelTrack.children[1];
  const step =
    second && first ? second.offsetLeft - first.offsetLeft : 128;
  const itemWidth = first ? first.offsetWidth : 120;

  const jitter = (Math.random() - 0.5) * itemWidth * 0.6;
  const target =
    WON_INDEX * step + itemWidth / 2 - wheel.clientWidth / 2 + jitter;

  // Force the browser to commit translateX(0) with no transition, then
  // animate to the target on the next frame so the transition runs
  // reliably (the two-step reset/animate pattern).
  void wheelTrack.offsetWidth;

  requestAnimationFrame(() => {
    wheelTrack.style.transition =
      "transform 4.6s cubic-bezier(0.08, 0.82, 0.16, 1)";
    wheelTrack.style.transform = `translateX(${-target}px)`;
  });

  const finish = () => {
    wheelTrack.removeEventListener("transitionend", finish);
    showResult(won, data);

    // Reflect the new balance the server reported.
    state.wallet.coins = Number(data.coins ?? state.wallet.coins);
    refreshWallet();

    state.spinning = false;
    wheelClose.hidden = false;
    wheelAgain.hidden = false;
    wheelAgain.dataset.box = boxId;
  };

  wheelTrack.addEventListener("transitionend", finish, { once: true });

  // Safety net in case transitionend doesn't fire.
  setTimeout(() => {
    if (state.spinning) finish();
  }, 5200);
}


function showResult(won, data) {
  wheelTitle.textContent = "You got";

  let detail = "";
  if (won.type === "gem") {
    detail = `${formatWeight(data.result?.final_weight ?? won.base_weight)} · ${formatMoney(
      data.result?.value ?? 0
    )}`;
  } else if (won.type === "money") {
    detail = "added to your balance";
  } else if (won.type === "slots") {
    detail = "storage expanded";
  } else if (won.type === "potion") {
    detail = "added to your potions";
  }

  wheelResult.innerHTML = `
    <div class="lb-result__card" style="--item-color:${entryColor(won)}">
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


function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}


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


async function start() {
  const user = await ensurePlayerAuth();

  if (!user) {
    subtitle.textContent = "Could not sign you in. Refresh to try again.";
    notify.error("Sign-in failed", "The game could not reach your account.");
    return;
  }

  const [boxes] = await Promise.all([loadLootBoxes(), refreshWallet()]);

  if (boxes) {
    state.boxes = boxes;
  }

  renderBoxes();
}


start();
