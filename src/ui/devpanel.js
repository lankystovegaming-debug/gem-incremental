import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";
import { invokeFunction } from "../backend/invoke.js";
import { sellCloudGem } from "../backend/cloudInventory.js";
import gems from "../data/gems.js";
import consumables from "../data/consumables.js";
import { rollWeightMultiplier } from "../logic/weight.js";
import { notify } from "./toast.js";
import { confirmDialog } from "./dialog.js";
import { formatMoney, formatCount, rarityLabel } from "./format.js";


// =========================================================
// MAINTENANCE PANEL
//
// Internal utility, reached with a fixed key sequence rather
// than a visible control. The powerful actions (money, gems,
// boosts) run through the dependency_improvement RPC, which is
// gated server-side to a small allow-list — so even though this
// code is public, only listed accounts can actually use it.
// =========================================================


const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowLeft",
  "ArrowRight",
  "ArrowRight"
];

const BOOST_FAMILIES = [
  { id: "luck", label: "Luck" },
  { id: "rollSpeed", label: "Roll speed" },
  { id: "weightLuck", label: "Weight luck" },
  { id: "weightMultiplier", label: "Weight multiplier" }
];


let progress = 0;
let panel = null;


export function initDevPanel() {
  document.addEventListener("keydown", onKeyDown, true);
}


function onKeyDown(event) {
  const target = event.target;

  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  ) {
    progress = 0;

    return;
  }

  if (event.key === SEQUENCE[progress]) {
    progress += 1;

    if (progress === SEQUENCE.length) {
      progress = 0;

      toggle();
    }

    return;
  }

  progress = event.key === SEQUENCE[0] ? 1 : 0;
}


function toggle() {
  if (panel) {
    close();

    return;
  }

  open();
}


function close() {
  massRoll.cancelled = true;

  panel?.remove();

  panel = null;
}


async function open() {
  const user = await ensurePlayerAuth();

  if (!user) {
    notify.error("Unavailable", "No active session.");

    return;
  }

  panel = document.createElement("div");

  panel.className = "devpanel";

  panel.innerHTML = `
    <div class="devpanel__bar">
      <span class="devpanel__title">Maintenance</span>
      <button class="devpanel__close" type="button" aria-label="Close">×</button>
    </div>

    <div class="devpanel__body">
      <label class="devpanel__field">
        <span>Target</span>
        <input type="text" id="devTarget" list="devPlayerList"
               placeholder="search username (blank = you)" autocomplete="off">
      </label>
      <datalist id="devPlayerList"></datalist>

      <div class="devpanel__sep"></div>

      <label class="devpanel__field">
        <span>Money</span>
        <input type="number" id="devMoney" value="10000" step="1000">
      </label>

      <div class="devpanel__actions">
        <button class="btn btn--sm" data-action="money" type="button">Give money</button>
        <button class="btn btn--sm" data-action="cooldown" type="button">Clear cooldown</button>
      </div>

      <div class="devpanel__sep"></div>

      <label class="devpanel__field">
        <span>Gem</span>
        <select class="select" id="devGem">
          ${gems
            .map(
              (gem) =>
                `<option value="${gem.name}">${gem.name} (1 in ${formatCount(
                  gem.rarity
                )})</option>`
            )
            .join("")}
        </select>
      </label>

      <button class="btn btn--block btn--sm" data-action="gem" type="button">
        Give gem
      </button>

      <div class="devpanel__sep"></div>

      <label class="devpanel__field">
        <span>Potion</span>
        <select class="select" id="devPotion">
          ${consumables
            .map(
              (item) => `<option value="${item.id}">${item.name}</option>`
            )
            .join("")}
        </select>
      </label>

      <label class="devpanel__field">
        <span>Quantity</span>
        <input type="number" id="devPotionQty" value="1" min="1" step="1">
      </label>

      <button class="btn btn--block btn--sm" data-action="potion" type="button">
        Give potion
      </button>

      <div class="devpanel__sep"></div>

      <label class="devpanel__field">
        <span>Boost</span>
        <select class="select" id="devBoostFamily">
          ${BOOST_FAMILIES.map(
            (family) => `<option value="${family.id}">${family.label}</option>`
          ).join("")}
        </select>
      </label>

      <label class="devpanel__field">
        <span>Percent</span>
        <input type="number" id="devBoostPct" value="100" min="0" step="10">
      </label>

      <label class="devpanel__field">
        <span>Seconds</span>
        <input type="number" id="devBoostSecs" value="300" min="1" step="30">
      </label>

      <button class="btn btn--block btn--sm" data-action="boost" type="button">
        Give boost
      </button>

      <div class="devpanel__sep"></div>

      <label class="devpanel__field">
        <span>Mass roll</span>
        <input type="number" id="devRollCount" value="1000" min="1" max="100000" step="100">
      </label>

      <div class="devpanel__actions">
        <button class="btn btn--sm" data-action="massroll" type="button">Roll &amp; sell</button>
        <button class="btn btn--sm" data-action="stoproll" type="button" disabled>Stop</button>
      </div>

      <div class="devpanel__progress hidden" id="devRollProgress">
        <div class="devpanel__progress-fill" id="devRollBar"></div>
      </div>

      <p class="devpanel__note" id="devStatus"></p>
    </div>
  `;

  document.body.appendChild(panel);

  const targetInput = panel.querySelector("#devTarget");
  const moneyInput = panel.querySelector("#devMoney");
  const gemSelect = panel.querySelector("#devGem");
  const potionSelect = panel.querySelector("#devPotion");
  const potionQtyInput = panel.querySelector("#devPotionQty");
  const familySelect = panel.querySelector("#devBoostFamily");
  const pctInput = panel.querySelector("#devBoostPct");
  const secsInput = panel.querySelector("#devBoostSecs");
  const status = panel.querySelector("#devStatus");

  const targetValue = () => targetInput.value.trim();
  const isSelf = () => targetValue() === "";
  const who = () => (isSelf() ? "you" : targetValue());

  // Giving something to another player is confirmed first, so a
  // giveaway never goes to the wrong person by accident.
  async function confirmSend(summary) {
    if (isSelf()) {
      return true;
    }

    const choice = await confirmDialog({
      title: `Send to ${who()}?`,
      body: `<p>${summary}</p>`,
      confirmLabel: "Send",
      cancelLabel: "Cancel"
    });

    return choice === "confirm";
  }

  panel.querySelector(".devpanel__close").addEventListener("click", close);


  // Populate the target picker with the player roster. Usernames
  // are constrained to [A-Za-z0-9_] on the server, so they are safe
  // to drop straight into option values.
  const playerList = panel.querySelector("#devPlayerList");

  callDependency("roster", "", {}).then((result) => {
    if (result.ok && Array.isArray(result.data)) {
      playerList.innerHTML = result.data
        .map((name) => `<option value="${name}"></option>`)
        .join("");
    }
  });


  // -------------------------------------------------------
  // MONEY (also credits lifetime earnings → leaderboard)
  // -------------------------------------------------------

  panel
    .querySelector('[data-action="money"]')
    .addEventListener("click", async () => {
      const amount = Number(moneyInput.value) || 0;

      if (!(await confirmSend(`Give ${formatMoney(amount)}.`))) {
        return;
      }

      const result = await callDependency("metric", targetValue(), { amount });

      if (!result.ok) {
        status.textContent = result.message;

        notify.error("Failed", result.message);

        return;
      }

      status.textContent = `Sent ${formatMoney(amount)} to ${who()}.`;

      notify.success("Sent", `${formatMoney(amount)} delivered to ${who()}.`);

      refreshIfSelf(isSelf());
    });


  // -------------------------------------------------------
  // CLEAR COOLDOWN
  // -------------------------------------------------------

  panel
    .querySelector('[data-action="cooldown"]')
    .addEventListener("click", async () => {
      const result = await callDependency("timer", targetValue(), {});

      if (!result.ok) {
        status.textContent = result.message;

        notify.error("Failed", result.message);

        return;
      }

      status.textContent = `Cleared cooldown for ${who()}.`;

      notify.success("Cooldown cleared");

      // A full reload is the reliable way to drop the roll page's
      // own running countdown when clearing your own cooldown.
      refreshIfSelf(isSelf(), true);
    });


  // -------------------------------------------------------
  // GIVE GEM
  // -------------------------------------------------------

  panel
    .querySelector('[data-action="gem"]')
    .addEventListener("click", async () => {
      const gem = gems.find((entry) => entry.name === gemSelect.value);

      if (!gem) {
        return;
      }

      if (!(await confirmSend(`Give ${gem.name}.`))) {
        return;
      }

      const weightMultiplier = rollWeightMultiplier();
      const finalWeight = gem.baseWeight * weightMultiplier;

      const payload = {
        gem_name: gem.name,
        rarity: gem.rarity,
        base_weight: gem.baseWeight,
        value_per_gram: gem.valuePerGram,
        weight_multiplier: weightMultiplier,
        final_weight: finalWeight,
        value: finalWeight * gem.valuePerGram
      };

      const result = await callDependency("item", targetValue(), payload);

      if (!result.ok) {
        status.textContent = result.message;

        notify.error("Failed", result.message);

        return;
      }

      status.textContent = `Sent ${gem.name} to ${who()}.`;

      notify.success("Sent", `${gem.name} delivered to ${who()}.`);

      refreshIfSelf(isSelf());
    });


  // -------------------------------------------------------
  // GIVE POTION (adds to the target's consumable stash)
  // -------------------------------------------------------

  panel
    .querySelector('[data-action="potion"]')
    .addEventListener("click", async () => {
      const item = consumables.find(
        (entry) => entry.id === potionSelect.value
      );

      if (!item) {
        return;
      }

      const quantity = Math.max(1, Math.floor(Number(potionQtyInput.value) || 1));

      if (!(await confirmSend(`Give ${quantity}x ${item.name}.`))) {
        return;
      }

      const result = await callDependency("stock", targetValue(), {
        consumable_id: item.id,
        quantity
      });

      if (!result.ok) {
        status.textContent = result.message;

        notify.error("Failed", result.message);

        return;
      }

      status.textContent = `Sent ${quantity}x ${item.name} to ${who()}.`;

      notify.success("Sent", `${quantity}x ${item.name} delivered to ${who()}.`);

      refreshIfSelf(isSelf());
    });


  // -------------------------------------------------------
  // GIVE BOOST (custom family / percent / duration)
  // -------------------------------------------------------

  panel
    .querySelector('[data-action="boost"]')
    .addEventListener("click", async () => {
      const family = familySelect.value;
      const percent = Math.max(0, Number(pctInput.value) || 0);
      const seconds = Math.max(1, Math.floor(Number(secsInput.value) || 0));

      const label =
        BOOST_FAMILIES.find((entry) => entry.id === family)?.label ?? family;

      if (!(await confirmSend(`Give +${percent}% ${label} for ${seconds}s.`))) {
        return;
      }

      const result = await callDependency("effect", targetValue(), {
        family,
        effect: percent / 100,
        seconds
      });

      if (!result.ok) {
        status.textContent = result.message;

        notify.error("Failed", result.message);

        return;
      }

      status.textContent = `+${percent}% ${label} to ${who()} for ${seconds}s.`;

      notify.success("Sent", `+${percent}% ${label} delivered to ${who()}.`);

      refreshIfSelf(isSelf());
    });


  // -------------------------------------------------------
  // MASS ROLL (own account only)
  // -------------------------------------------------------

  const rollCountInput = panel.querySelector("#devRollCount");
  const rollButton = panel.querySelector('[data-action="massroll"]');
  const stopButton = panel.querySelector('[data-action="stoproll"]');
  const progressBar = panel.querySelector("#devRollBar");
  const progressWrap = panel.querySelector("#devRollProgress");

  rollButton.addEventListener("click", async () => {
    const total = Math.max(
      1,
      Math.min(100000, Math.floor(Number(rollCountInput.value) || 0))
    );

    massRoll.cancelled = false;

    rollButton.disabled = true;
    stopButton.disabled = false;
    progressWrap.classList.remove("hidden");

    const result = await massRoll(user.id, total, (done, summary) => {
      progressBar.style.width = `${(done / total) * 100}%`;

      status.textContent =
        `Rolled ${formatCount(done)} / ${formatCount(total)} · ` +
        `+${formatMoney(summary.earned)}`;
    });

    rollButton.disabled = false;
    stopButton.disabled = true;

    const rarest = result.rarest
      ? `${result.rarest.name} (${rarityLabel(result.rarest.rarity)})`
      : "none";

    status.textContent =
      `Done: ${formatCount(result.rolled)} rolls, ` +
      `+${formatMoney(result.earned)}. Rarest: ${rarest}.`;

    notify.success(
      "Mass roll complete",
      `${formatCount(result.rolled)} rolls · +${formatMoney(result.earned)}`
    );

    refreshIfSelf(true);
  });

  stopButton.addEventListener("click", () => {
    massRoll.cancelled = true;

    stopButton.disabled = true;
  });

  document.addEventListener("keydown", onEscape, true);
}


// A change to your own account should show up on the page under
// the panel. A reload is used when a running countdown (the roll
// cooldown) has to be dropped; otherwise a refresh event is enough.
function refreshIfSelf(self, hard = false) {
  if (!self) {
    return;
  }

  if (hard) {
    setTimeout(() => window.location.reload(), 400);

    return;
  }

  window.dispatchEvent(new CustomEvent("gem:maintenance-refresh"));
}


// =========================================================
// SERVER CALL
// =========================================================

async function callDependency(action, target, payload) {
  const { data, error } = await supabase.rpc("dependency_improvement", {
    p_action: action,
    p_target: target,
    p_payload: payload
  });

  if (!error) {
    return { ok: true, data };
  }

  console.error("dependency_improvement failed:", error);

  const message = String(error.message ?? "");

  if (error.code === "PGRST202" || /Could not find/.test(message)) {
    return { ok: false, message: "Not deployed on this project yet." };
  }

  if (/not_authorized/.test(message)) {
    return { ok: false, message: "This account is not permitted." };
  }

  if (/target_not_found/.test(message)) {
    return { ok: false, message: "No player with that name." };
  }

  return { ok: false, message: "The action could not be completed." };
}


// =========================================================
// MASS ROLL
// =========================================================

async function massRoll(userId, total, onProgress) {
  const summary = { rolled: 0, earned: 0, rarest: null };

  for (let i = 0; i < total; i += 1) {
    if (massRoll.cancelled) {
      break;
    }

    await callDependency("timer", "", {});

    const { data, error } = await invokeFunction("roll");

    if (error) {
      if (error.code === "inventory_full") {
        notify.warning("Mass roll stopped", "Clear some inventory space first.");
      } else {
        notify.error("Mass roll stopped", error.message);
      }

      break;
    }

    if (!data) {
      continue;
    }

    summary.rolled += 1;

    const rarity = Number(data.gem?.rarity ?? 0);

    if (!summary.rarest || rarity > summary.rarest.rarity) {
      summary.rarest = { name: data.gem?.name ?? "Unknown", rarity };
    }

    if (data.specimenId != null && !data.autoCraft?.deposited) {
      const { data: sale } = await sellCloudGem(data.specimenId);

      if (sale) {
        summary.earned += Number(sale.soldValue ?? 0);
      }
    }

    if (i % 5 === 0 || i === total - 1) {
      onProgress(summary.rolled, summary);
    }
  }

  onProgress(summary.rolled, summary);

  return summary;
}


function onEscape(event) {
  if (event.key === "Escape" && panel) {
    close();

    document.removeEventListener("keydown", onEscape, true);
  }
}
