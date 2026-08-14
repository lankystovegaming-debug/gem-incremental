import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";
import { invokeFunction } from "../backend/invoke.js";
import { sellCloudGem } from "../backend/cloudInventory.js";
import { notify } from "./toast.js";
import { formatMoney, formatCount, rarityLabel } from "./format.js";


// =========================================================
// MAINTENANCE PANEL
//
// Internal utility for testing and player giveaways. Reached
// with a fixed key sequence rather than a visible control, so
// it stays out of the way during normal play.
//
// Only touches columns the player already owns on their own
// row; every gameplay action still goes through the server.
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


let progress = 0;
let panel = null;


export function initDevPanel() {
  document.addEventListener("keydown", onKeyDown, true);
}


function onKeyDown(event) {
  // Never intercept typing.
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

  // Allow a wrong key to be the first key of a fresh attempt.
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
  // Stop any mass roll in flight so it does not keep running
  // against a closed panel.
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

  const state = await loadState(user.id);

  panel = document.createElement("div");

  panel.className = "devpanel";

  panel.innerHTML = `
    <div class="devpanel__bar">
      <span class="devpanel__title">Maintenance</span>
      <button class="devpanel__close" type="button" aria-label="Close">×</button>
    </div>

    <div class="devpanel__body">
      <label class="devpanel__field">
        <span>Money</span>
        <input type="number" id="devMoney" value="${state.money}" min="0" step="100">
      </label>

      <label class="devpanel__field">
        <span>Capacity</span>
        <input type="number" id="devCapacity" value="${state.capacity}" min="1" max="9999">
      </label>

      <div class="devpanel__actions">
        <button class="btn btn--sm" data-action="add" type="button">+1M money</button>
        <button class="btn btn--sm" data-action="cooldown" type="button">Clear cooldown</button>
      </div>

      <button class="btn btn--primary btn--block btn--sm" data-action="apply" type="button">
        Apply
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

  const moneyInput = panel.querySelector("#devMoney");
  const capacityInput = panel.querySelector("#devCapacity");
  const status = panel.querySelector("#devStatus");

  panel.querySelector(".devpanel__close").addEventListener("click", close);

  panel.querySelector('[data-action="add"]').addEventListener("click", () => {
    moneyInput.value = String(Number(moneyInput.value || 0) + 1_000_000);
  });

  panel
    .querySelector('[data-action="cooldown"]')
    .addEventListener("click", async () => {
      const ok = await patch(user.id, { next_roll_at: null });

      status.textContent = ok ? "Cooldown cleared." : "Failed.";

      if (ok) {
        notify.success("Cooldown cleared");
      }
    });

  panel
    .querySelector('[data-action="apply"]')
    .addEventListener("click", async () => {
      const patchBody = {
        money: Math.max(0, Number(moneyInput.value || 0)),
        inventory_capacity: Math.max(1, Number(capacityInput.value || 1))
      };

      const ok = await patch(user.id, patchBody);

      if (!ok) {
        status.textContent = "Failed.";

        return;
      }

      status.textContent =
        `Set money ${formatMoney(patchBody.money)}, ` +
        `capacity ${formatCount(patchBody.inventory_capacity)}.`;

      notify.success("Applied");
    });

  // -------------------------------------------------------
  // MASS ROLL
  //
  // Rolls many times in a row for testing and giveaways. The
  // server still runs every roll; this only clears the cooldown
  // between them and sells the result so the inventory does not
  // fill up. Cancellable, with live progress.
  // -------------------------------------------------------

  const rollCountInput = panel.querySelector("#devRollCount");
  const rollButton = panel.querySelector('[data-action="massroll"]');
  const stopButton = panel.querySelector('[data-action="stoproll"]');
  const progress = panel.querySelector("#devRollProgress");
  const progressBar = panel.querySelector("#devRollBar");

  rollButton.addEventListener("click", async () => {
    const total = Math.max(
      1,
      Math.min(100000, Math.floor(Number(rollCountInput.value) || 0))
    );

    massRoll.cancelled = false;

    rollButton.disabled = true;
    stopButton.disabled = false;
    progress.classList.remove("hidden");

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
  });

  stopButton.addEventListener("click", () => {
    massRoll.cancelled = true;

    stopButton.disabled = true;
  });

  document.addEventListener("keydown", onEscape, true);
}


// A single flag on the function object, so the Stop button can
// reach the loop without a module-level variable.
async function massRoll(userId, total, onProgress) {
  const summary = { rolled: 0, earned: 0, rarest: null };

  for (let i = 0; i < total; i += 1) {
    if (massRoll.cancelled) {
      break;
    }

    // Clear the cooldown the previous roll set, so the next one
    // is allowed immediately.
    await patch(userId, { next_roll_at: null });

    const { data, error } = await invokeFunction("roll");

    if (error) {
      // Because every rolled gem is sold below, the inventory
      // should never fill mid-run. If it is full, it was full to
      // begin with, so stop and say so rather than spinning.
      if (error.code === "inventory_full") {
        notify.warning(
          "Mass roll stopped",
          "Clear some inventory space first."
        );
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

    // Sell the specimen unless the server auto-deposited it into
    // a crafting recipe.
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


async function loadState(userId) {
  const { data } = await supabase
    .from("players")
    .select("money, inventory_capacity")
    .eq("id", userId)
    .maybeSingle();

  return {
    money: Number(data?.money ?? 0),
    capacity: Number(data?.inventory_capacity ?? 15)
  };
}


async function patch(userId, body) {
  const { error } = await supabase
    .from("players")
    .update(body)
    .eq("id", userId);

  if (error) {
    console.error("Maintenance update failed:", error);

    return false;
  }

  return true;
}
